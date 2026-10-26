/**
 * ============================================================================
 * RADIA — NEARBY PRESENCE TRANSPORT (js/presence.js)
 * ----------------------------------------------------------------------------
 * One interface, two swappable transports:
 *
 *   local    BroadcastChannel — real presence between windows/tabs on the same
 *            machine. No account, no network, no cost. Ideal for demos and for
 *            seeing the product behave correctly before a backend exists.
 *
 *   supabase Hosted realtime presence (free tier). Presence is keyed by a
 *            geohash cell, so only people physically in the same ~1.2km cell
 *            share a channel. Credentials live in RadiaConfig and are supplied
 *            by the user in Settings; the anon key is public by design.
 *
 * Contract: every transport emits RADIA_PRESENCE_PEERS with an array of
 *   { id, name, lat, lng, ts }
 * and the proximity engine owns all rendering. Adding a third transport (Ably,
 * Liveblocks, your own WebSocket) means implementing the same four lines.
 * ============================================================================
 */

(function () {
  'use strict';

  const CELL_PRECISION = 6; // ~1.2km x 0.6km
  const HEARTBEAT_MS = 4000;
  const STALE_MS = 15000;
  const CHANNEL_NAME = 'radia-presence-v1';

  const GEOHASH_BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

  /** Standard geohash encode. Used to shard presence into local cells. */
  function geohash(lat, lng, precision) {
    let idx = 0;
    let bit = 0;
    let evenBit = true;
    let hash = '';
    let latMin = -90, latMax = 90, lngMin = -180, lngMax = 180;

    while (hash.length < precision) {
      if (evenBit) {
        const mid = (lngMin + lngMax) / 2;
        if (lng >= mid) { idx = idx * 2 + 1; lngMin = mid; } else { idx *= 2; lngMax = mid; }
      } else {
        const mid = (latMin + latMax) / 2;
        if (lat >= mid) { idx = idx * 2 + 1; latMin = mid; } else { idx *= 2; latMax = mid; }
      }
      evenBit = !evenBit;
      if (++bit === 5) {
        hash += GEOHASH_BASE32[idx];
        bit = 0;
        idx = 0;
      }
    }
    return hash;
  }

  const state = {
    driver: 'off',
    status: 'idle', // idle | connecting | live | error
    error: null,
    peers: new Map(),
    bc: null,
    supabase: null,
    channel: null,
    cell: null,
    heartbeat: null,
    prune: null,
    selfId: `p_${Math.random().toString(36).slice(2, 10)}`,
    startedAt: 0
  };

  function cfg(key) {
    return window.RadiaConfig ? window.RadiaConfig.get(key) : undefined;
  }

  function currentPosition() {
    const p = window.RadiaProximity && window.RadiaProximity.position;
    if (!p || typeof p.lat !== 'number') return null;
    return p;
  }

  function displayName() {
    if (window.RadiaPeerSync && typeof window.RadiaPeerSync.getProfile === 'function') {
      const profile = window.RadiaPeerSync.getProfile();
      if (profile && profile.firstName) return profile.firstName;
    }
    return cfg('displayName') || 'Someone nearby';
  }

  function payload() {
    const pos = currentPosition();
    if (!pos) return null;
    return {
      id: state.selfId,
      name: displayName(),
      lat: pos.lat,
      lng: pos.lng,
      ts: Date.now()
    };
  }

  function emitStatus() {
    window.dispatchEvent(new CustomEvent('RADIA_PRESENCE_STATUS', {
      detail: { driver: state.driver, status: state.status, error: state.error, cell: state.cell }
    }));
  }

  function emitPeers() {
    // Drop stale entries, then hand the list to the map.
    const now = Date.now();
    state.peers.forEach((peer, id) => {
      if (now - peer.ts > STALE_MS) state.peers.delete(id);
    });
    window.dispatchEvent(new CustomEvent('RADIA_PRESENCE_PEERS', {
      detail: { peers: Array.from(state.peers.values()) }
    }));
  }

  function upsert(peer) {
    if (!peer || !peer.id || peer.id === state.selfId) return;
    if (typeof peer.lat !== 'number' || typeof peer.lng !== 'number') return;
    if (!Number.isFinite(peer.lat) || !Number.isFinite(peer.lng)) return;
    state.peers.set(peer.id, peer);
  }

  function broadcast() {
    const data = payload();
    if (!data) return;

    if (state.driver === 'local' && state.bc) {
      try { state.bc.postMessage({ type: 'presence', peer: data }); } catch (e) { /* channel closed */ }
    }

    if (state.driver === 'supabase' && state.channel && state.status === 'live') {
      const cell = geohash(data.lat, data.lng, CELL_PRECISION);
      // Crossing a cell boundary needs a re-subscribe; otherwise just track.
      if (cell !== state.cell) {
        startSupabase();
        return;
      }
      state.channel.track(data).catch(() => {});
    }
  }

  /* ------------------------------------------------------------------------
     LOCAL TRANSPORT
     ------------------------------------------------------------------------ */

  function startLocal() {
    stopTransports();
    state.driver = 'local';
    state.status = 'connecting';
    state.error = null;
    emitStatus();

    if (typeof BroadcastChannel === 'undefined') {
      state.status = 'error';
      state.error = 'BroadcastChannel unavailable in this browser';
      emitStatus();
      return;
    }

    state.bc = new BroadcastChannel(CHANNEL_NAME);
    state.bc.onmessage = (event) => {
      const msg = event.data;
      if (!msg || msg.type !== 'presence' || !msg.peer) return;
      upsert(msg.peer);
      emitPeers();
    };

    state.status = 'live';
    state.startedAt = Date.now();
    broadcast();
    startTimers();
    emitStatus();
  }

  /* ------------------------------------------------------------------------
     SUPABASE TRANSPORT
     ------------------------------------------------------------------------ */

  function loadSupabaseSdk() {
    if (window.supabase && typeof window.supabase.createClient === 'function') {
      return Promise.resolve(window.supabase);
    }
    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-radia-supabase]');
      if (existing) {
        existing.addEventListener('load', () => resolve(window.supabase));
        existing.addEventListener('error', () => reject(new Error('Failed to load Supabase SDK')));
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';
      script.async = true;
      script.setAttribute('data-radia-supabase', 'true');
      script.onload = () => resolve(window.supabase);
      script.onerror = () => reject(new Error('Failed to load Supabase SDK'));
      document.head.appendChild(script);
    });
  }

  async function startSupabase() {
    stopTransports();
    state.driver = 'supabase';
    state.status = 'connecting';
    state.error = null;
    emitStatus();

    const url = String(cfg('supabaseUrl') || '').trim();
    const key = String(cfg('supabaseAnonKey') || '').trim();
    const pos = currentPosition();

    if (!url || !key) {
      state.status = 'error';
      state.error = 'Add your Supabase URL and anon key first';
      emitStatus();
      return;
    }
    if (!pos) {
      state.status = 'error';
      state.error = 'Waiting for your location before joining the channel';
      emitStatus();
      return;
    }

    try {
      const sdk = await loadSupabaseSdk();
      if (!sdk || typeof sdk.createClient !== 'function') throw new Error('Supabase SDK unavailable');

      state.supabase = sdk.createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false }
      });

      state.cell = geohash(pos.lat, pos.lng, CELL_PRECISION);

      state.channel = state.supabase.channel(`radia-cell-${state.cell}`, {
        config: { presence: { key: state.selfId } }
      });

      state.channel.on('presence', { event: 'sync' }, () => {
        const presenceState = state.channel.presenceState() || {};
        Object.keys(presenceState).forEach((keyId) => {
          const entries = presenceState[keyId] || [];
          entries.forEach((entry) => upsert(entry));
        });
        emitPeers();
      });

      state.channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          state.status = 'live';
          state.startedAt = Date.now();
          const data = payload();
          if (data) {
            try { await state.channel.track(data); } catch (e) { /* retried by heartbeat */ }
          }
          startTimers();
          emitStatus();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          state.status = 'error';
          state.error = status === 'TIMED_OUT' ? 'Realtime timed out' : 'Realtime channel error';
          emitStatus();
        }
      });
    } catch (err) {
      state.status = 'error';
      state.error = String(err && err.message ? err.message : err).slice(0, 120);
      emitStatus();
    }
  }

  /* ------------------------------------------------------------------------
     LIFECYCLE
     ------------------------------------------------------------------------ */

  function startTimers() {
    clearInterval(state.heartbeat);
    clearInterval(state.prune);
    state.heartbeat = setInterval(broadcast, HEARTBEAT_MS);
    state.prune = setInterval(emitPeers, 3000);
  }

  function stopTransports() {
    clearInterval(state.heartbeat);
    clearInterval(state.prune);
    state.heartbeat = null;
    state.prune = null;

    if (state.bc) {
      try { state.bc.close(); } catch (e) {}
      state.bc = null;
    }
    if (state.channel) {
      try { state.channel.unsubscribe(); } catch (e) {}
      try { state.supabase.removeChannel(state.channel); } catch (e) {}
      state.channel = null;
    }
    state.supabase = null;
    state.cell = null;
    state.peers.clear();
    emitPeers();
  }

  function start(driver) {
    const next = driver || cfg('presenceDriver') || 'off';
    if (next === 'local') return startLocal();
    if (next === 'supabase') return startSupabase();
    stop();
    return undefined;
  }

  function stop() {
    stopTransports();
    state.driver = 'off';
    state.status = 'idle';
    state.error = null;
    emitStatus();
  }

  function refresh() {
    if (state.driver === 'off') return;
    broadcast();
  }

  // Republish when the user actually moves.
  window.addEventListener('RADIA_POSITION_UPDATED', () => {
    if (state.driver !== 'off') broadcast();
  });

  window.RadiaPresence = {
    start,
    stop,
    refresh,
    geohash,
    get status() {
      return state.status;
    },
    get driver() {
      return state.driver;
    },
    get error() {
      return state.error;
    },
    get peers() {
      return Array.from(state.peers.values());
    },
    selfId: state.selfId
  };
})();
