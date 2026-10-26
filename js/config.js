/**
 * ============================================================================
 * RADIA — RUNTIME CONFIGURATION (js/config.js)
 * ----------------------------------------------------------------------------
 * This is the ONE place to configure the app. Loaded before every other script.
 *
 *  MAP TILES — no API key is required.
 *  ---------------------------------------------------------------------------
 *  Radia ships with free, keyless tile sources that really render:
 *    • Esri World Street Map   (default — soft, warm, game-like)
 *    • OpenStreetMap standard  (vivid, maximal street detail)
 *    • Esri World Topographic  (terrain / parks / contour)
 *    • OpenStreetMap + CSS tint (soft gray morning / evening dark)
 *
 *  You do NOT need an API key to see the map. Paste one below ONLY if you want
 *  MapTiler's vector-quality raster styles instead. Keys pasted here are
 *  client-side and public by definition — never put a secret in this file.
 *
 *  Users can also paste a key in Settings → Map without touching this file;
 *  that is stored in their own browser via localStorage and overrides this.
 * ============================================================================
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'radia.runtime.config.v1';

  const DEFAULTS = {
    /** Default map style key: voyager | osm | positron | topo | dark */
    mapProvider: 'voyager',

    /**
     * Optional MapTiler key. Leave empty to use the free keyless tiles.
     * A key from https://cloud.maptiler.com/account/keys/ unlocks:
     *   voyager | osm | positron | topo | dark  →  MapTiler equivalents
     * Existing style names keep working, so nothing else needs to change.
     */
    maptilerKey: '',

    /**
     * Demo mode paints a believable but entirely synthetic world: invented
     * neighbours walking nearby, invented community hubs and insights.
     * OFF by default — a real product must never show fake people.
     */
    demoMode: false,

    /**
     * Nearby presence transport.
     *   'off'      — nobody beyond your own device
     *   'local'    — BroadcastChannel: real presence between tabs/windows on
     *                this machine. Free, instant, no account. For demos/testing.
     *   'supabase' — hosted realtime presence across devices (free tier).
     *                Set supabaseUrl + supabaseAnonKey below.
     */
    presenceDriver: 'off',
    supabaseUrl: '',
    supabaseAnonKey: '',
    displayName: '',

    /** Field Credits granted per 100 m actually walked with GPS. */
    creditsPer100m: 8,

    /** Minimum GPS distance (m) before a step is credited. */
    minStepM: 3
  };

  function readOverrides() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  const config = Object.assign({}, DEFAULTS, readOverrides());

  window.RadiaConfig = {
    get(key) {
      return config[key];
    },
    set(key, value) {
      config[key] = value;
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
      } catch (e) {
        /* private mode / quota — config stays in memory for this session */
      }
      return config[key];
    },
    all() {
      return Object.assign({}, config);
    },
    defaults() {
      return Object.assign({}, DEFAULTS);
    },
    /** True when the user has pasted a MapTiler key. */
    hasMapKey() {
      return !!(config.maptilerKey && String(config.maptilerKey).trim());
    }
  };
})();
