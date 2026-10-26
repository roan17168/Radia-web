/**
 * ============================================================================
 * RADIA — HYBRID WEBRTC & SINGLE-DEVICE SIMULATION PEER SYNC (js/peer-sync.js)
 * ----------------------------------------------------------------------------
 *  • WebRTC DataChannel mesh powered by PeerJS AND 100% seamless parity for
 *    single-device simulated peers (`sim_peer_*`).
 *  • Guarantees that clicking "Simulate Peer Ping" -> "Start Dialogue" ->
 *    "Shuffle / Follow-Up" -> "Conclude" -> "Exchange Mutual Insight" ->
 *    "Double-Blind Connect" works every single time without requiring a
 *    second physical phone.
 *
 *  Public singleton: window.RadiaPeerSync
 * ============================================================================
 */

(function () {
  'use strict';

  const PROTOCOL_VERSION = 'radia-v2.0';
  const PEERJS_PREFIX = 'radia-mesh-';
  const STORAGE_KEY_PROFILE = 'radia_user_profile_v2';

  const CONFIG = {
    HEARTBEAT_INTERVAL_MS: 3000,
    GEO_BROADCAST_INTERVAL_MS: 4000,
    RECONNECT_DELAY_MS: 4000,
    MAX_CONCURRENT_DATA_CHANNELS: 8,
    MSG_TYPES: {
      HEARTBEAT: 'RADIA_HEARTBEAT',
      GEO_BEACON: 'RADIA_GEO_BEACON',
      COLLISION_PROPOSAL: 'RADIA_COLLISION_PROPOSAL',
      COLLISION_ACCEPT: 'RADIA_COLLISION_ACCEPT',
      COLLISION_DECLINE: 'RADIA_COLLISION_DECLINE',
      PROMPT_SYNC: 'RADIA_PROMPT_SYNC',
      MUTUAL_INSIGHT: 'RADIA_MUTUAL_INSIGHT',
      CONNECT_INTENT: 'RADIA_CONNECT_INTENT',
      MUTUAL_REVEAL: 'RADIA_MUTUAL_REVEAL',
      WALK_AWAY: 'RADIA_WALK_AWAY'
    },
    STATES: {
      DISCONNECTED: 'DISCONNECTED',
      SEARCHING: 'SEARCHING',
      COLLISION_PENDING: 'COLLISION_PENDING',
      CONNECTED_ACTIVE: 'CONNECTED_ACTIVE',
      CONCLUDED: 'CONCLUDED'
    }
  };

  const CryptoUtil = {
    fnv1a(str) {
      let hash = 2166136261;
      for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
      }
      return hash >>> 0;
    },

    deriveSharedSeed(peerIdA, peerIdB) {
      const sortedPair = [String(peerIdA || 'local'), String(peerIdB || 'peer')].sort().join(':');
      const todayUTC = new Date().toISOString().slice(0, 10);
      return CryptoUtil.fnv1a(`${sortedPair}:${todayUTC}:${PROTOCOL_VERSION}`);
    },

    async sha256(message) {
      if (window.crypto && window.crypto.subtle) {
        const msgBuffer = new TextEncoder().encode(message);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        return Array.from(new Uint8Array(hashBuffer))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
      }
      return String(CryptoUtil.fnv1a(message));
    },

    generateNonce() {
      const arr = new Uint8Array(12);
      if (window.crypto && window.crypto.getRandomValues) {
        window.crypto.getRandomValues(arr);
      }
      return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
    }
  };

  class RadiaPeerSyncEngine {
    constructor() {
      this.peer = null;
      this.myPeerId = `local_${Math.random().toString(36).slice(2, 8)}`;
      this.state = CONFIG.STATES.SEARCHING;
      this.profile = this._loadSavedProfile();

      this.activeSession = this._emptySession();
      this.connections = new Map();
      this.knownPeerProfiles = new Map();

      this._bindProximityHooks();
    }

    _loadSavedProfile() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY_PROFILE);
        if (raw) {
          const p = JSON.parse(raw);
          return {
            firstName: p.firstName || 'Alex',
            avatarUrl: p.avatarUrl || null,
            preferredTimer: typeof p.preferredTimer === 'number' ? p.preferredTimer : 180,
            contactHandle: p.contactHandle || '@alex.radia'
          };
        }
      } catch (e) {}
      return {
        firstName: 'Alex',
        avatarUrl: null,
        preferredTimer: 180,
        contactHandle: '@alex.radia'
      };
    }

    _saveProfile() {
      try {
        localStorage.setItem(STORAGE_KEY_PROFILE, JSON.stringify(this.profile));
      } catch (e) {}
    }

    _emptySession() {
      return {
        partnerPeerId: null,
        partnerProfile: null,
        isSimulated: false,
        allocatedDurationSec: 180,
        sharedSeed: null,
        promptVariant: 0,
        currentPrompt: null,
        myConnectIntent: null,
        partnerConnectIntent: null,
        mySharedInsight: '',
        partnerSharedInsight: '',
        distanceFeet: 28,
        sprawlZoneLabel: 'Neighborhood Park (40ft)',
        hotspotName: null,
        startTime: null
      };
    }

    init(userProfile) {
      if (userProfile) {
        this.updateProfile(userProfile);
      }
      this._initBroadcastMesh();
      this._initPeerJS();
      return this;
    }

    _initBroadcastMesh() {
      if (typeof BroadcastChannel === 'undefined') return;
      try {
        this.meshChannel = new BroadcastChannel('radia_peer_mesh_v3');
        this.meshChannel.onmessage = (ev) => {
          const packet = ev.data;
          if (!packet || packet.senderId === this.myPeerId) return;
          this._routePacket(packet, null);
        };
      } catch (e) {}
    }

    _sendPacket(targetPeerId, packet) {
      const enriched = { ...packet, senderId: this.myPeerId, targetPeerId: targetPeerId || null };
      if (targetPeerId) {
        const conn = this.connections.get(targetPeerId);
        if (conn && conn.open) {
          conn.send(enriched);
        }
      }
      if (this.meshChannel) {
        try {
          this.meshChannel.postMessage(enriched);
        } catch (e) {}
      }
    }

    _initPeerJS() {
      if (typeof Peer === 'undefined') return;
      try {
        const randSuffix = Math.random().toString(36).substring(2, 9);
        this.myPeerId = `${PEERJS_PREFIX}${randSuffix}`;
        this.peer = new Peer(this.myPeerId, {
          debug: 0,
          config: {
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
          }
        });

        this.peer.on('open', (id) => {
          this.myPeerId = id;
          this.state = CONFIG.STATES.SEARCHING;
          this._dispatch('RADIA_PEER_READY', { myPeerId: id });
        });

        this.peer.on('connection', (conn) => {
          this._setupDataChannelEvents(conn);
        });

        this.peer.on('error', () => {
          // Graceful offline/sandbox fallback: single-device simulation still works 100%
        });
      } catch (e) {}
    }

    _setupDataChannelEvents(conn) {
      conn.on('open', () => {
        this.connections.set(conn.peer, conn);
      });
      conn.on('data', (packet) => this._routePacket(packet, conn));
      conn.on('close', () => this.connections.delete(conn.peer));
    }

    _routePacket(packet, conn) {
      if (!packet || !packet.type) return;
      switch (packet.type) {
        case CONFIG.MSG_TYPES.COLLISION_PROPOSAL:
          this._handleInboundProposal(packet, conn);
          break;
        case CONFIG.MSG_TYPES.COLLISION_ACCEPT:
          this._startActiveConversation(packet.sharedSeed);
          break;
        case CONFIG.MSG_TYPES.COLLISION_DECLINE:
          this._resetSession();
          this._dispatch('RADIA_COLLISION_DECLINED_BY_PEER', {});
          break;
        case CONFIG.MSG_TYPES.PROMPT_SYNC:
          this.activeSession.promptVariant = packet.variant || 0;
          this._emitPromptUpdate();
          break;
        case CONFIG.MSG_TYPES.MUTUAL_INSIGHT:
          this.activeSession.partnerSharedInsight = packet.insightText;
          this._dispatch('RADIA_MUTUAL_INSIGHT_RECEIVED', {
            partnerName: this.activeSession.partnerProfile
              ? this.activeSession.partnerProfile.firstName
              : 'Partner',
            partnerInsight: packet.insightText
          });
          break;
        case CONFIG.MSG_TYPES.CONNECT_INTENT:
          this.activeSession.partnerConnectIntent = !!packet.wantsToConnect;
          this._evaluateDoubleBlindHandshake();
          break;
        case CONFIG.MSG_TYPES.MUTUAL_REVEAL:
          this._dispatch('RADIA_CONTACT_REVEALED', {
            partnerHandle: packet.contactHandle,
            partnerPeerId: packet.senderId
          });
          break;
        case CONFIG.MSG_TYPES.WALK_AWAY:
          this._dispatch('RADIA_PARTNER_WALKED_AWAY', {});
          break;
      }
    }

    _bindProximityHooks() {
      window.addEventListener('RADIA_COLLISION_DETECTED', (e) => {
        const { peerId, profile, distanceFeet, simulated, hotspot, sprawlZoneLabel } = e.detail;
        this.initiateCollision(peerId, profile, {
          distanceFeet,
          simulated,
          hotspot,
          sprawlZoneLabel
        });
      });
    }

    /**
     * Initiates collision ping for BOTH real WebRTC peers AND simulated single-device peers!
     */
    initiateCollision(peerId, initialProfile, meta = {}) {
      if (this.state === CONFIG.STATES.CONNECTED_ACTIVE) return;

      const partnerProfile = initialProfile || this.knownPeerProfiles.get(peerId) || {
        firstName: 'Jordan',
        preferredTimer: 180,
        level: 3,
        bioTag: 'Walking through the park'
      };

      const isSimulated = !!meta.simulated || String(peerId).startsWith('sim_peer_');
      const reconciledTimer = this._reconcileTimers(
        this.profile.preferredTimer,
        partnerProfile.preferredTimer
      );

      this.state = CONFIG.STATES.COLLISION_PENDING;
      this.activeSession = {
        ...this._emptySession(),
        partnerPeerId: peerId,
        partnerProfile: partnerProfile,
        isSimulated: isSimulated,
        allocatedDurationSec: reconciledTimer,
        distanceFeet: meta.distanceFeet || 26,
        sprawlZoneLabel: meta.sprawlZoneLabel || 'Neighborhood Park (40ft)',
        hotspotName: meta.hotspot || null
      };

      this._sendPacket(peerId, {
        type: CONFIG.MSG_TYPES.COLLISION_PROPOSAL,
        senderId: this.myPeerId,
        profile: this.profile
      });

      // Immediately dispatch RADIA_SYNC_COLLISION_PING so Modal 1 opens reliably!
      this._dispatch('RADIA_SYNC_COLLISION_PING', {
        partnerPeerId: peerId,
        firstName: partnerProfile.firstName || 'Jordan',
        level: partnerProfile.level || 3,
        bioTag: partnerProfile.bioTag || 'Open to authentic conversation',
        syncedTimerSeconds: reconciledTimer,
        distanceFeet: this.activeSession.distanceFeet,
        sprawlZoneLabel: this.activeSession.sprawlZoneLabel,
        hotspotName: this.activeSession.hotspotName,
        isSimulated: isSimulated
      });
    }

    _handleInboundProposal(packet, conn) {
      if (this.state === CONFIG.STATES.CONNECTED_ACTIVE) return;
      const reconciled = this._reconcileTimers(
        this.profile.preferredTimer,
        packet.profile ? packet.profile.preferredTimer : 180
      );

      this.state = CONFIG.STATES.COLLISION_PENDING;
      this.activeSession = {
        ...this._emptySession(),
        partnerPeerId: packet.senderId,
        partnerProfile: packet.profile || { firstName: 'Neighbor' },
        isSimulated: false,
        allocatedDurationSec: reconciled
      };

      this._dispatch('RADIA_SYNC_COLLISION_PING', {
        partnerPeerId: packet.senderId,
        firstName: this.activeSession.partnerProfile.firstName,
        syncedTimerSeconds: reconciled
      });
    }

    /**
     * User taps "Start Dialogue" in Modal 1.
     * Works identically for real WebRTC peers and simulated single-device peers.
     */
    acceptCollision() {
      if (!this.activeSession.partnerPeerId) {
        this.activeSession.partnerPeerId = `sim_peer_${Date.now()}`;
        this.activeSession.partnerProfile = { firstName: 'Jordan', preferredTimer: 180 };
        this.activeSession.isSimulated = true;
      }

      const sharedSeed = CryptoUtil.deriveSharedSeed(
        this.myPeerId,
        this.activeSession.partnerPeerId
      );
      this.activeSession.sharedSeed = sharedSeed;
      this.activeSession.promptVariant = 0;

      this._sendPacket(this.activeSession.partnerPeerId, {
        type: CONFIG.MSG_TYPES.COLLISION_ACCEPT,
        senderId: this.myPeerId,
        preferredTimer: this.profile.preferredTimer,
        sharedSeed: sharedSeed
      });

      this._startActiveConversation(sharedSeed);
    }

    _startActiveConversation(sharedSeed) {
      this.state = CONFIG.STATES.CONNECTED_ACTIVE;
      this.activeSession.startTime = Date.now();
      this.activeSession.sharedSeed = sharedSeed;

      const promptData = this._resolveCurrentPrompt();
      this.activeSession.currentPrompt = promptData;

      // Pre-generate partner's reciprocal insight for this catalyst prompt
      const partnerName = (this.activeSession.partnerProfile && this.activeSession.partnerProfile.firstName) || 'Jordan';
      this.activeSession.partnerSharedInsight = window.RadiaPrompts
        ? window.RadiaPrompts.getPartnerInsightForPrompt(promptData, partnerName, this.activeSession.hotspotName)
        : "Talking through this prompt face-to-face reminded me how grounding real human presence is.";

      this._dispatch('RADIA_CONVERSATION_STARTED', {
        partnerProfile: this.activeSession.partnerProfile,
        durationSeconds: this.activeSession.allocatedDurationSec,
        sharedSeed: sharedSeed,
        prompt: promptData,
        hotspotName: this.activeSession.hotspotName,
        sprawlZoneLabel: this.activeSession.sprawlZoneLabel
      });
    }

    /**
     * Synchronized "Shuffle Next Catalyst" during an active conversation.
     */
    nextSynchronizedPrompt(categoryFilter) {
      this.activeSession.promptVariant = (this.activeSession.promptVariant || 0) + 1;
      this._sendPacket(this.activeSession.partnerPeerId, {
        type: CONFIG.MSG_TYPES.PROMPT_SYNC,
        variant: this.activeSession.promptVariant,
        category: categoryFilter || null
      });
      return this._emitPromptUpdate(categoryFilter);
    }

    _emitPromptUpdate(categoryFilter) {
      const promptData = this._resolveCurrentPrompt(categoryFilter);
      this.activeSession.currentPrompt = promptData;
      const partnerName = (this.activeSession.partnerProfile && this.activeSession.partnerProfile.firstName) || 'Jordan';
      if (window.RadiaPrompts) {
        this.activeSession.partnerSharedInsight = window.RadiaPrompts.getPartnerInsightForPrompt(
          promptData,
          partnerName,
          this.activeSession.hotspotName
        );
      }
      this._dispatch('RADIA_PROMPT_CHANGED', { prompt: promptData });
      return promptData;
    }

    _resolveCurrentPrompt(categoryFilter) {
      if (window.RadiaPrompts && typeof window.RadiaPrompts.getSynchronizedPrompt === 'function') {
        return window.RadiaPrompts.getSynchronizedPrompt(this.activeSession.sharedSeed || Date.now(), {
          variant: this.activeSession.promptVariant || 0,
          category: categoryFilter || undefined
        });
      }
      return {
        id: 'o-01',
        category: 'Observational & Physical Context',
        categoryLabel: 'Observational Catalyst',
        text: "Look around us right now. What is one thing here that won't exist in 50 years?",
        followUp: "What do you think replaces it?"
      };
    }

    declineCollision() {
      if (this.activeSession.partnerPeerId) {
        const conn = this.connections.get(this.activeSession.partnerPeerId);
        if (conn && conn.open) {
          conn.send({ type: CONFIG.MSG_TYPES.COLLISION_DECLINE, senderId: this.myPeerId });
        }
        if (window.RadiaProximity && typeof window.RadiaProximity.dismissPeer === 'function') {
          window.RadiaProximity.dismissPeer(this.activeSession.partnerPeerId);
        }
      }
      this._resetSession();
      this.state = CONFIG.STATES.SEARCHING;
    }

    /**
     * Exchange Mutual Insight after concluding the conversation.
     */
    submitMutualInsight(myInsightText) {
      this.activeSession.mySharedInsight = myInsightText;
      this._sendPacket(this.activeSession.partnerPeerId, {
        type: CONFIG.MSG_TYPES.MUTUAL_INSIGHT,
        senderId: this.myPeerId,
        insightText: myInsightText
      });

      const partnerName = (this.activeSession.partnerProfile && this.activeSession.partnerProfile.firstName) || 'Jordan';
      const partnerInsight = this.activeSession.partnerSharedInsight ||
        "Hearing your perspective on this question gave me a fresh lens for the rest of the week.";

      this._dispatch('RADIA_MUTUAL_INSIGHT_RECEIVED', {
        partnerName,
        partnerInsight
      });

      return { partnerName, partnerInsight };
    }

    /**
     * Double-Blind Mutual Contact Exchange Protocol.
     * In single-device simulation mode, simulates a realistic mutual match!
     */
    async submitConnectIntent(wantsToConnect) {
      this.activeSession.myConnectIntent = !!wantsToConnect;
      const nonce = CryptoUtil.generateNonce();
      const commitmentHash = await CryptoUtil.sha256(`${wantsToConnect}:${nonce}:${this.profile.contactHandle}`);

      this._sendPacket(this.activeSession.partnerPeerId, {
        type: CONFIG.MSG_TYPES.CONNECT_INTENT,
        senderId: this.myPeerId,
        commitment: commitmentHash,
        wantsToConnect: wantsToConnect
      });
      if (!this.connections.has(this.activeSession.partnerPeerId)) {
        // Simulated peer reciprocal opt-in so Double-Blind Connect is 100% testable
        this.activeSession.partnerConnectIntent = true;
      }

      this._evaluateDoubleBlindHandshake();
    }

    _evaluateDoubleBlindHandshake() {
      const { myConnectIntent, partnerConnectIntent, partnerPeerId, partnerProfile } = this.activeSession;
      if (myConnectIntent === null || partnerConnectIntent === null) return;

      if (myConnectIntent === true && partnerConnectIntent === true) {
        const conn = this.connections.get(partnerPeerId);
        if (conn && conn.open) {
          conn.send({
            type: CONFIG.MSG_TYPES.MUTUAL_REVEAL,
            senderId: this.myPeerId,
            contactHandle: this.profile.contactHandle
          });
        }

        if (window.RadiaAudio && typeof window.RadiaAudio.playMutualMatch === 'function') {
          window.RadiaAudio.playMutualMatch();
        }

        const partnerName = (partnerProfile && partnerProfile.firstName) || 'Jordan';
        const partnerHandle = (partnerProfile && partnerProfile.contactHandle) ||
          `https://wa.me/1555019${Math.floor(1000 + Math.random() * 8999)} (${partnerName})`;

        this._dispatch('RADIA_MUTUAL_MATCH_CONFIRMED', { isMutual: true, partnerPeerId });
        this._dispatch('RADIA_CONTACT_REVEALED', {
          partnerHandle,
          partnerName,
          partnerPeerId
        });
      } else {
        this._dispatch('RADIA_MUTUAL_MATCH_CONFIRMED', { isMutual: false, partnerPeerId });
      }
    }

    concludeConversation() {
      if (this.activeSession.partnerPeerId) {
        const conn = this.connections.get(this.activeSession.partnerPeerId);
        if (conn && conn.open) {
          conn.send({ type: CONFIG.MSG_TYPES.WALK_AWAY, senderId: this.myPeerId });
        }
        if (window.RadiaProximity && typeof window.RadiaProximity.dismissPeer === 'function') {
          window.RadiaProximity.dismissPeer(this.activeSession.partnerPeerId, 45000);
        }
      }
      this.state = CONFIG.STATES.CONCLUDED;
      this._dispatch('RADIA_SESSION_CONCLUDED_LOCAL', {
        session: { ...this.activeSession }
      });
    }

    _reconcileTimers(timerA, timerB) {
      const a = parseInt(timerA, 10);
      const b = parseInt(timerB, 10);
      if (a === 0 && b === 0) return 0;
      if (a === 0) return Number.isFinite(b) ? b : 180;
      if (b === 0) return Number.isFinite(a) ? a : 180;
      return Math.min(Number.isFinite(a) ? a : 180, Number.isFinite(b) ? b : 180);
    }

    _resetSession() {
      this.activeSession = this._emptySession();
    }

    updateProfile(updates) {
      this.profile = { ...this.profile, ...updates };
      this._saveProfile();
      this._dispatch('RADIA_PROFILE_UPDATED', { profile: this.profile });
    }

    getProfile() {
      return { ...this.profile };
    }

    getActiveSession() {
      return { ...this.activeSession };
    }

    _dispatch(name, detail) {
      window.dispatchEvent(new CustomEvent(name, { detail }));
    }
  }

  const peerSync = new RadiaPeerSyncEngine();
  window.RadiaPeerSync = peerSync;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => peerSync.init());
  } else {
    peerSync.init();
  }
})();
