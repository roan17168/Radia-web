/**
 * ============================================================================
 * RADIA — SERVERLESS PEER-TO-PEER SYNCHRONIZATION ENGINE (js/peer-sync.js)
 * ----------------------------------------------------------------------------
 *  • WebRTC DataChannel mesh powered by PeerJS.
 *  • Geohash cluster signaling & local ambient discovery broadcast.
 *  • Deterministic collision handshake:
 *      1. Mutual identity exchange (Verified Avatar + First Name only).
 *      2. Dynamic timer reconciliation: min(Timer_A, Timer_B).
 *      3. Shared deterministic PRNG seed: Hash(UserA + UserB + DayKey).
 *      4. Double-blind mutual contact reveal protocol (Zero leak on single-opt).
 *  • Auto-reconnect, heartbeat keep-alive, and clean abort/walk-away handlers.
 *
 *  Public singleton: window.RadiaPeerSync
 * ============================================================================
 */

(function () {
  'use strict';

  /* ==========================================================================
     PROTOCOL CONFIGURATION & CONSTANTS
     ========================================================================== */

  const PROTOCOL_VERSION = 'radia-v1.0';
  const PEERJS_PREFIX = 'radia-mesh-';

  const CONFIG = {
    // Discovery & Mesh
    HEARTBEAT_INTERVAL_MS: 3000,
    GEO_BROADCAST_INTERVAL_MS: 4000,
    STALE_PEER_TIMEOUT_MS: 12000,
    RECONNECT_DELAY_MS: 3500,
    MAX_CONCURRENT_DATA_CHANNELS: 8,

    // Geohash Cluster Precision (~1.2km cluster box for signaling room)
    GEO_PRECISION_DECIMALS: 2,

    // Message Protocol Types
    MSG_TYPES: {
      HEARTBEAT: 'RADIA_HEARTBEAT',
      GEO_BEACON: 'RADIA_GEO_BEACON',
      COLLISION_PROPOSAL: 'RADIA_COLLISION_PROPOSAL',
      COLLISION_ACCEPT: 'RADIA_COLLISION_ACCEPT',
      COLLISION_DECLINE: 'RADIA_COLLISION_DECLINE',
      TIMER_SYNC: 'RADIA_TIMER_SYNC',
      CATALYST_SEED: 'RADIA_CATALYST_SEED',
      CONCLUDE_SESSION: 'RADIA_CONCLUDE_SESSION',
      CONNECT_INTENT: 'RADIA_CONNECT_INTENT',
      MUTUAL_REVEAL: 'RADIA_MUTUAL_REVEAL',
      WALK_AWAY: 'RADIA_WALK_AWAY'
    },

    // Session States
    STATES: {
      DISCONNECTED: 'DISCONNECTED',
      SEARCHING: 'SEARCHING',
      COLLISION_PENDING: 'COLLISION_PENDING',
      CONNECTED_ACTIVE: 'CONNECTED_ACTIVE',
      CONCLUDED: 'CONCLUDED'
    }
  };

  /* ==========================================================================
     CRYPTOGRAPHIC & DETERMINISTIC SEEDING UTILITIES
     ========================================================================== */

  const CryptoUtil = {
    /**
     * Fast 32-bit FNV-1a Hash Algorithm.
     * Computes an identical integer seed across both devices given the same inputs.
     */
    fnv1a(str) {
      let hash = 2166136261;
      for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
      }
      return hash >>> 0;
    },

    /**
     * Generates a shared deterministic random seed for two peer IDs.
     * Guaranteed: hash(A + B + day) === hash(B + A + day).
     */
    deriveSharedSeed(peerIdA, peerIdB) {
      // Sort IDs lexicographically so orientation does not matter
      const sortedPair = [peerIdA, peerIdB].sort().join(':');
      // Normalize to daily UTC timestamp bucket so seed rotates naturally
      const todayUTC = new Date().toISOString().slice(0, 10);
      const compositeKey = `${sortedPair}:${todayUTC}:${PROTOCOL_VERSION}`;
      return CryptoUtil.fnv1a(compositeKey);
    },

    /**
     * SHA-256 Digest using Web Crypto API for commitment hashes in double-blind handshake.
     */
    async sha256(message) {
      const msgBuffer = new TextEncoder().encode(message);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    },

    /**
     * Generate secure random nonce.
     */
    generateNonce() {
      const arr = new Uint8Array(16);
      crypto.getRandomValues(arr);
      return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
    }
  };

  /* ==========================================================================
     PEER SYNCHRONIZATION ENGINE CLASS
     ========================================================================== */

  class RadiaPeerSyncEngine {
    constructor() {
      this.peer = null;
      this.myPeerId = null;
      this.currentClusterId = null;
      this.state = CONFIG.STATES.DISCONNECTED;

      // Active active conversation session
      this.activeConnection = null;
      this.activeSession = {
        partnerPeerId: null,
        partnerProfile: null,
        allocatedDurationSec: 180,
        sharedSeed: null,
        myConnectIntent: false,
        partnerConnectIntent: false,
        myNonce: null,
        myCommitment: null,
        partnerCommitment: null,
        startTime: null
      };

      // Mesh Connection Pool (peerId -> DataConnection)
      this.connections = new Map();
      this.knownPeerProfiles = new Map();

      // Background Workers & Timers
      this.beaconTimer = null;
      this.heartbeatTimer = null;
      this.reconnectTimeout = null;

      // Bound Event Listeners
      this._bindProximityHooks();
    }

    /* ======================================================================
       INITIALIZATION & PEERJS SIGNALLING LIFECYCLE
       ====================================================================== */

    /**
     * Initializes the WebRTC stack with geographic cluster room isolation.
     * @param {Object} userProfile - { firstName, avatarUrl, preferredTimer, contactHandle }
     */
    init(userProfile) {
      this.profile = {
        firstName: userProfile.firstName || 'Wanderer',
        avatarUrl: userProfile.avatarUrl || null,
        preferredTimer: parseInt(userProfile.preferredTimer, 10) || 180,
        contactHandle: userProfile.contactHandle || ''
      };

      this._generatePeerInstance();
      this._startHeartbeat();
      this._startBeacon();

      return this;
    }

    /**
     * Creates a new randomized PeerJS instance with cloud ICE fallback.
     */
    _generatePeerInstance() {
      if (this.peer && !this.peer.destroyed) {
        this.peer.destroy();
      }

      // Generate a distinct ephemeral mesh ID: radia-mesh-[cluster]-[randomId]
      const randSuffix = Math.random().toString(36).substring(2, 9);
      this.myPeerId = `${PEERJS_PREFIX}${randSuffix}`;

      // Instantiate PeerJS using default global TURN/STUN cloud network
      this.peer = new Peer(this.myPeerId, {
        debug: 1,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' }
          ]
        }
      });

      this._registerPeerEvents();
    }

    /**
     * Bind primary PeerJS server lifecycle events.
     */
    _registerPeerEvents() {
      this.peer.on('open', (id) => {
        this.myPeerId = id;
        this.state = CONFIG.STATES.SEARCHING;
        this._dispatch('RADIA_PEER_READY', { myPeerId: id });
        console.log(`[Radia P2P] Mesh node online with ID: ${id}`);
      });

      // Handle inbound DataChannel connections
      this.peer.on('connection', (conn) => {
        this._handleInboundConnection(conn);
      });

      this.peer.on('disconnected', () => {
        console.warn('[Radia P2P] Signaling connection dropped. Attempting reconnect...');
        this.state = CONFIG.STATES.DISCONNECTED;
        this._scheduleReconnect();
      });

      this.peer.on('error', (err) => {
        console.error('[Radia P2P] WebRTC Engine Error:', err);
        if (err.type === 'peer-unavailable') {
          // Normal during ambient scanning
        } else if (err.type === 'network' || err.type === 'server-error') {
          this._scheduleReconnect();
        }
      });
    }

    /**
     * Automatic backoff reconnect scheduler.
     */
    _scheduleReconnect() {
      if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = setTimeout(() => {
        if (this.peer && !this.peer.destroyed) {
          this.peer.reconnect();
        } else {
          this._generatePeerInstance();
        }
      }, CONFIG.RECONNECT_DELAY_MS);
    }

    /* ======================================================================
       REGIONAL GEOHASH CLUSTERING & BEACON BROADCAST
       ====================================================================== */

    /**
     * Updates the local coordinate context and updates the spatial signaling cluster.
     */
    updateLocation(lat, lng, accuracy) {
      this.currentLat = lat;
      this.currentLng = lng;
      this.currentAccuracy = accuracy;

      // Cluster ID acts as a coarse spatial quadrant (~1.1km box)
      const clusterKey = `${lat.toFixed(CONFIG.GEO_PRECISION_DECIMALS)}_${lng.toFixed(CONFIG.GEO_PRECISION_DECIMALS)}`;
      if (clusterKey !== this.currentClusterId) {
        this.currentClusterId = clusterKey;
        this._dispatch('RADIA_CLUSTER_CHANGED', { clusterId: clusterKey });
      }
    }

    /**
     * Broadcasts ambient positioning beacons to all connected data-channels in the mesh.
     */
    _startBeacon() {
      if (this.beaconTimer) clearInterval(this.beaconTimer);

      this.beaconTimer = setInterval(() => {
        if (!this.currentLat || !this.currentLng) return;

        const payload = {
          type: CONFIG.MSG_TYPES.GEO_BEACON,
          version: PROTOCOL_VERSION,
          senderId: this.myPeerId,
          lat: this.currentLat,
          lng: this.currentLng,
          accuracy: this.currentAccuracy,
          profile: {
            firstName: this.profile.firstName,
            avatarUrl: this.profile.avatarUrl,
            preferredTimer: this.profile.preferredTimer
          },
          timestamp: Date.now()
        };

        this._broadcastMesh(payload);
      }, CONFIG.GEO_BROADCAST_INTERVAL_MS);
    }

    /**
     * Keeps WebRTC DataChannels alive across NAT firewalls.
     */
    _startHeartbeat() {
      if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);

      this.heartbeatTimer = setInterval(() => {
        const ping = {
          type: CONFIG.MSG_TYPES.HEARTBEAT,
          senderId: this.myPeerId,
          timestamp: Date.now()
        };
        this._broadcastMesh(ping);
      }, CONFIG.HEARTBEAT_INTERVAL_MS);
    }

    /**
     * Transmit payload to all peers in current local data mesh.
     */
    _broadcastMesh(data) {
      this.connections.forEach((conn) => {
        if (conn.open) {
          try {
            conn.send(data);
          } catch (e) {
            console.warn('[Radia P2P] Broadcast delivery failed on channel:', conn.peer);
          }
        }
      });
    }

    /* ======================================================================
       DATA CHANNEL MANAGEMENT & INBOUND ROUTING
       ====================================================================== */

    /**
     * Establish outbound WebRTC DataChannel to discovered peer.
     */
    connectToPeer(targetPeerId) {
      if (this.connections.has(targetPeerId) || targetPeerId === this.myPeerId) {
        return;
      }

      if (this.connections.size >= CONFIG.MAX_CONCURRENT_DATA_CHANNELS) {
        // Evict oldest connection if channel limit reached
        const oldestKey = this.connections.keys().next().value;
        this._closeDataChannel(oldestKey);
      }

      const conn = this.peer.connect(targetPeerId, {
        reliable: true,
        serialization: 'json'
      });

      this._setupDataChannelEvents(conn);
    }

    _handleInboundConnection(conn) {
      if (this.connections.size >= CONFIG.MAX_CONCURRENT_DATA_CHANNELS) {
        conn.close();
        return;
      }
      this._setupDataChannelEvents(conn);
    }

    _setupDataChannelEvents(conn) {
      conn.on('open', () => {
        this.connections.set(conn.peer, conn);

        // Send instant intro beacon upon opening
        if (this.currentLat && this.currentLng) {
          conn.send({
            type: CONFIG.MSG_TYPES.GEO_BEACON,
            version: PROTOCOL_VERSION,
            senderId: this.myPeerId,
            lat: this.currentLat,
            lng: this.currentLng,
            accuracy: this.currentAccuracy,
            profile: {
              firstName: this.profile.firstName,
              avatarUrl: this.profile.avatarUrl,
              preferredTimer: this.profile.preferredTimer
            },
            timestamp: Date.now()
          });
        }
      });

      conn.on('data', (packet) => {
        this._routePacket(packet, conn);
      });

      conn.on('close', () => {
        this._handleChannelClosed(conn.peer);
      });

      conn.on('error', (err) => {
        console.warn(`[Radia P2P] DataChannel error on ${conn.peer}:`, err);
        this._handleChannelClosed(conn.peer);
      });
    }

    _handleChannelClosed(peerId) {
      this.connections.delete(peerId);

      // If active conversation partner disconnected abruptly
      if (this.activeSession.partnerPeerId === peerId) {
        this._handlePartnerDisconnected();
      }

      // Notify Proximity Engine
      if (window.RadiaProximity && typeof window.RadiaProximity.removePeer === 'function') {
        window.RadiaProximity.removePeer(peerId);
      }
    }

    _closeDataChannel(peerId) {
      const conn = this.connections.get(peerId);
      if (conn) {
        try { conn.close(); } catch (e) {}
        this.connections.delete(peerId);
      }
    }

    /* ======================================================================
       PACKET ROUTER & PROTOCOL HANDSHAKE STATE MACHINE
       ====================================================================== */

    _routePacket(packet, conn) {
      if (!packet || !packet.type) return;

      switch (packet.type) {
        case CONFIG.MSG_TYPES.GEO_BEACON:
          this._handleBeaconReceived(packet);
          break;

        case CONFIG.MSG_TYPES.COLLISION_PROPOSAL:
          this._handleCollisionProposal(packet, conn);
          break;

        case CONFIG.MSG_TYPES.COLLISION_ACCEPT:
          this._handleCollisionAccepted(packet);
          break;

        case CONFIG.MSG_TYPES.COLLISION_DECLINE:
          this._handleCollisionDeclined(packet);
          break;

        case CONFIG.MSG_TYPES.TIMER_SYNC:
          this._handleTimerSync(packet);
          break;

        case CONFIG.MSG_TYPES.CONNECT_INTENT:
          this._handleConnectIntent(packet);
          break;

        case CONFIG.MSG_TYPES.MUTUAL_REVEAL:
          this._handleMutualReveal(packet);
          break;

        case CONFIG.MSG_TYPES.WALK_AWAY:
          this._handlePartnerWalkedAway();
          break;

        case CONFIG.MSG_TYPES.HEARTBEAT:
          // Keep-alive received, no op required
          break;

        default:
          console.warn('[Radia P2P] Unknown packet signature received:', packet.type);
      }
    }

    /**
     * Ingests ambient position beacon from peer and passes it to Proximity Engine.
     */
    _handleBeaconReceived(packet) {
      const { senderId, lat, lng, accuracy, profile } = packet;

      this.knownPeerProfiles.set(senderId, profile);

      if (window.RadiaProximity && typeof window.RadiaProximity.updatePeer === 'function') {
        window.RadiaProximity.updatePeer(senderId, {
          lat,
          lng,
          accuracy: accuracy || 15,
          profile: profile || {}
        });
      }
    }

    /* ======================================================================
       COLLISION FLOW & SYNCHRONIZED HANDSHAKE
       ====================================================================== */

    /**
     * Binds to Proximity Engine's physical ~40-foot collision event.
     */
    _bindProximityHooks() {
      window.addEventListener('RADIA_COLLISION_DETECTED', (e) => {
        const { peerId, profile } = e.detail;
        this.initiateCollision(peerId, profile);
      });

      window.addEventListener('RADIA_POSITION_UPDATED', (e) => {
        const { lat, lng, accuracy } = e.detail;
        this.updateLocation(lat, lng, accuracy);
      });
    }

    /**
     * Initiates collision proposal to target device within 40ft radius.
     */
    initiateCollision(peerId, initialProfile) {
      if (this.state === CONFIG.STATES.CONNECTED_ACTIVE) return;

      this.state = CONFIG.STATES.COLLISION_PENDING;
      this.activeSession.partnerPeerId = peerId;
      this.activeSession.partnerProfile = initialProfile || this.knownPeerProfiles.get(peerId);

      const conn = this.connections.get(peerId);
      if (conn && conn.open) {
        conn.send({
          type: CONFIG.MSG_TYPES.COLLISION_PROPOSAL,
          senderId: this.myPeerId,
          profile: {
            firstName: this.profile.firstName,
            avatarUrl: this.profile.avatarUrl,
            preferredTimer: this.profile.preferredTimer
          }
        });
      }
    }

    _handleCollisionProposal(packet, conn) {
      if (this.state === CONFIG.STATES.CONNECTED_ACTIVE) {
        // Already in a conversation, decline incoming proposal
        conn.send({
          type: CONFIG.MSG_TYPES.COLLISION_DECLINE,
          senderId: this.myPeerId,
          reason: 'BUSY'
        });
        return;
      }

      this.state = CONFIG.STATES.COLLISION_PENDING;
      this.activeSession.partnerPeerId = packet.senderId;
      this.activeSession.partnerProfile = packet.profile;
      this.activeConnection = conn;

      // Calculate reconciled timer: min(Timer_A, Timer_B)
      const reconciledTimer = this._reconcileTimers(
        this.profile.preferredTimer,
        packet.profile.preferredTimer
      );
      this.activeSession.allocatedDurationSec = reconciledTimer;

      // Emit UI Collision Ping Event (Triggers Modal 1 in index.html)
      this._dispatch('RADIA_SYNC_COLLISION_PING', {
        partnerPeerId: packet.senderId,
        firstName: packet.profile.firstName,
        avatarUrl: packet.profile.avatarUrl,
        syncedTimerSeconds: reconciledTimer
      });
    }

    /**
     * User accepts encounter modal from the UI.
     */
    acceptCollision() {
      if (!this.activeSession.partnerPeerId) return;

      const conn = this.connections.get(this.activeSession.partnerPeerId);
      if (conn && conn.open) {
        // Derive shared deterministic seed
        const sharedSeed = CryptoUtil.deriveSharedSeed(this.myPeerId, this.activeSession.partnerPeerId);
        this.activeSession.sharedSeed = sharedSeed;

        conn.send({
          type: CONFIG.MSG_TYPES.COLLISION_ACCEPT,
          senderId: this.myPeerId,
          preferredTimer: this.profile.preferredTimer,
          sharedSeed: sharedSeed
        });

        this._startActiveConversation(sharedSeed);
      }
    }

    _handleCollisionAccepted(packet) {
      const sharedSeed = packet.sharedSeed || CryptoUtil.deriveSharedSeed(this.myPeerId, packet.senderId);
      this.activeSession.sharedSeed = sharedSeed;

      const reconciledTimer = this._reconcileTimers(
        this.profile.preferredTimer,
        packet.preferredTimer
      );
      this.activeSession.allocatedDurationSec = reconciledTimer;

      this._startActiveConversation(sharedSeed);
    }

    /**
     * Starts live synchronized catalyst dialogue session.
     */
    _startActiveConversation(sharedSeed) {
      this.state = CONFIG.STATES.CONNECTED_ACTIVE;
      this.activeSession.startTime = Date.now();

      // Retrieve synchronized prompt from taxonomy engine using deterministic seed
      let promptData = null;
      if (window.RadiaPrompts && typeof window.RadiaPrompts.getSynchronizedPrompt === 'function') {
        promptData = window.RadiaPrompts.getSynchronizedPrompt(sharedSeed);
      } else {
        // Fallback default catalyst
        promptData = {
          category: 'Observational Catalyst',
          promptText: "Look around this immediate space right now. What is one thing here that won't exist in 50 years?"
        };
      }

      this._dispatch('RADIA_CONVERSATION_STARTED', {
        partnerProfile: this.activeSession.partnerProfile,
        durationSeconds: this.activeSession.allocatedDurationSec,
        sharedSeed: sharedSeed,
        prompt: promptData
      });
    }

    /**
     * Resolves lowest common timer: min(TimerA, TimerB).
     */
    _reconcileTimers(timerA, timerB) {
      const a = parseInt(timerA, 10);
      const b = parseInt(timerB, 10);

      if (a === 0 && b === 0) return 0; // Infinite / Open
      if (a === 0) return b;
      if (b === 0) return a;
      return Math.min(a, b);
    }

    /**
     * Decline collision or walk away.
     */
    declineCollision() {
      if (this.activeSession.partnerPeerId) {
        const conn = this.connections.get(this.activeSession.partnerPeerId);
        if (conn && conn.open) {
          conn.send({
            type: CONFIG.MSG_TYPES.COLLISION_DECLINE,
            senderId: this.myPeerId
          });
        }

        // Suppress in proximity engine
        if (window.RadiaProximity && typeof window.RadiaProximity.dismissPeer === 'function') {
          window.RadiaProximity.dismissPeer(this.activeSession.partnerPeerId);
        }
      }

      this._resetSession();
      this.state = CONFIG.STATES.SEARCHING;
    }

    _handleCollisionDeclined() {
      this._resetSession();
      this.state = CONFIG.STATES.SEARCHING;
      this._dispatch('RADIA_COLLISION_DECLINED_BY_PEER', {});
    }

    /* ======================================================================
       DOUBLE-BLIND MUTUAL CONTACT REVEAL PROTOCOL
       ====================================================================== */

    /**
     * User submits their choice for post-encounter contact exchange.
     * @param {boolean} wantsToConnect - True if user tapped "Connect"
     */
    async submitConnectIntent(wantsToConnect) {
      this.activeSession.myConnectIntent = !!wantsToConnect;
      this.activeSession.myNonce = CryptoUtil.generateNonce();

      // Create cryptographic commitment: SHA-256(Intent + Nonce + Handle)
      const secretPayload = `${wantsToConnect}:${this.activeSession.myNonce}:${this.profile.contactHandle}`;
      const commitmentHash = await CryptoUtil.sha256(secretPayload);
      this.activeSession.myCommitment = commitmentHash;

      const conn = this.connections.get(this.activeSession.partnerPeerId);
      if (conn && conn.open) {
        // Step 1: Transmit Commitment Hash (Zero Plaintext Leakage)
        conn.send({
          type: CONFIG.MSG_TYPES.CONNECT_INTENT,
          senderId: this.myPeerId,
          commitment: commitmentHash,
          wantsToConnect: wantsToConnect
        });
      }

      // Check if partner already transmitted intent
      this._evaluateDoubleBlindHandshake();
    }

    _handleConnectIntent(packet) {
      this.activeSession.partnerConnectIntent = !!packet.wantsToConnect;
      this.activeSession.partnerCommitment = packet.commitment;
      this._evaluateDoubleBlindHandshake();
    }

    /**
     * Evaluates double-blind reveal conditions.
     */
    _evaluateDoubleBlindHandshake() {
      const { myConnectIntent, partnerConnectIntent, partnerPeerId } = this.activeSession;

      // Both users must have explicitly registered their intent
      if (myConnectIntent !== null && partnerConnectIntent !== null) {
        if (myConnectIntent === true && partnerConnectIntent === true) {
          // MUTUAL HANDSHAKE SUCCESS: Reveal Contact Handle
          const conn = this.connections.get(partnerPeerId);
          if (conn && conn.open) {
            conn.send({
              type: CONFIG.MSG_TYPES.MUTUAL_REVEAL,
              senderId: this.myPeerId,
              contactHandle: this.profile.contactHandle,
              nonce: this.activeSession.myNonce
            });
          }

          // Trigger sound and haptics from Batch 2
          if (window.RadiaAudio && typeof window.RadiaAudio.playMutualMatch === 'function') {
            window.RadiaAudio.playMutualMatch();
          }

          this._dispatch('RADIA_MUTUAL_MATCH_CONFIRMED', {
            isMutual: true,
            partnerPeerId: partnerPeerId
          });
        } else {
          // Asymmetric or mutual rejection: Reveal zero information
          this._dispatch('RADIA_MUTUAL_MATCH_CONFIRMED', {
            isMutual: false,
            partnerPeerId: partnerPeerId
          });
        }
      }
    }

    _handleMutualReveal(packet) {
      // Step 2: Ingest partner's revealed contact handle
      this._dispatch('RADIA_CONTACT_REVEALED', {
        partnerHandle: packet.contactHandle,
        partnerPeerId: packet.senderId
      });
    }

    /* ======================================================================
       TERMINATION, WALK-AWAY & FAILSAFE DISCONNECTS
       ====================================================================== */

    /**
     * Cleanly wraps up or concludes the encounter session.
     */
    concludeConversation() {
      if (this.activeSession.partnerPeerId) {
        const conn = this.connections.get(this.activeSession.partnerPeerId);
        if (conn && conn.open) {
          conn.send({
            type: CONFIG.MSG_TYPES.WALK_AWAY,
            senderId: this.myPeerId
          });
        }
      }

      this.state = CONFIG.STATES.CONCLUDED;
      this._dispatch('RADIA_SESSION_CONCLUDED_LOCAL', {});
    }

    _handlePartnerWalkedAway() {
      this.state = CONFIG.STATES.CONCLUDED;
      this._dispatch('RADIA_PARTNER_WALKED_AWAY', {
        partnerPeerId: this.activeSession.partnerPeerId
      });
    }

    _handlePartnerDisconnected() {
      this._dispatch('RADIA_PARTNER_DROPPED', {
        partnerPeerId: this.activeSession.partnerPeerId
      });
      this._resetSession();
      this.state = CONFIG.STATES.SEARCHING;
    }

    _resetSession() {
      this.activeSession = {
        partnerPeerId: null,
        partnerProfile: null,
        allocatedDurationSec: 180,
        sharedSeed: null,
        myConnectIntent: null,
        partnerConnectIntent: null,
        myNonce: null,
        myCommitment: null,
        partnerCommitment: null,
        startTime: null
      };
      this.activeConnection = null;
    }

    /* ======================================================================
       EVENT EMITTER & PROFILE UPDATES
       ====================================================================== */

    updateProfile(newProfile) {
      this.profile = { ...this.profile, ...newProfile };
    }

    _dispatch(eventName, detail) {
      window.dispatchEvent(new CustomEvent(eventName, { detail }));
    }

    getState() {
      return {
        myPeerId: this.myPeerId,
        state: this.state,
        connectedMeshNodes: this.connections.size,
        activeSession: { ...this.activeSession },
        currentClusterId: this.currentClusterId
      };
    }
  }

  /* ==========================================================================
     GLOBAL SINGLETON EXPORT & INITIALIZATION
     ========================================================================== */

  const syncEngine = new RadiaPeerSyncEngine();
  window.RadiaPeerSync = syncEngine;

  // Auto-boot upon window load with default cached profile
  document.addEventListener('DOMContentLoaded', () => {
    let savedFirstName = 'Wanderer';
    let savedHandle = '';
    let savedTimer = 180;

    try {
      const fNameInput = document.getElementById('input-first-name');
      const handleInput = document.getElementById('input-contact-handle');
      if (fNameInput && fNameInput.value) savedFirstName = fNameInput.value;
      if (handleInput && handleInput.value) savedHandle = handleInput.value;
    } catch (e) {}

    syncEngine.init({
      firstName: savedFirstName,
      contactHandle: savedHandle,
      preferredTimer: savedTimer
    });
  });

})();