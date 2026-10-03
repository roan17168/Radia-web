/**
 * ============================================================================
 * RADIA — GEOSPATIAL PROXIMITY & FOG-OF-WAR RADAR ENGINE (js/proximity.js)
 * ----------------------------------------------------------------------------
 *  • Leaflet dark-vector exploration map anchored to the user's avatar
 *  • True-to-scale 40ft (12.192m) illuminated bubble + canvas fog-of-war shader
 *  • Zero positional markers for other humans (strict anti-stalking contract)
 *  • High-accuracy watchPosition tracking + Haversine walking distance for XP
 *  • Dev/Demo simulator so 40ft collisions are testable on one device
 *  • Event bus: RADIA_COLLISION_DETECTED / _LOST, RADIA_DISTANCE_UPDATED, etc.
 *
 *  Public singleton: window.RadiaProximity
 * ============================================================================
 */

(function () {
  'use strict';

  /* ==========================================================================
     CONSTANTS & CONFIGURATION
     ========================================================================== */

  const CONFIG = {
    // Core proximity physics
    ENCOUNTER_RADIUS_M: 12.192,        // 40 feet exactly
    EXIT_HYSTERESIS_M: 18.0,           // Must drift past this to break a collision
    MAX_USABLE_ACCURACY_M: 45,         // Discard fixes worse than this
    MIN_STEP_M: 1.2,                   // Jitter floor for distance accrual
    MAX_PLAUSIBLE_SPEED_MS: 12,        // ~27mph — reject vehicle/GPS teleports

    // Map
    DEFAULT_ZOOM: 19,
    MIN_ZOOM: 16,
    MAX_ZOOM: 21,
    FALLBACK_CENTER: [40.730823, -73.997332], // Washington Square Park, NYC

    // Collision governance
    COLLISION_COOLDOWN_MS: 90 * 1000,  // Re-ping suppression after dismissal
    PEER_STALE_MS: 25 * 1000,          // Drop peers we stopped hearing from

    // Simulator
    SIM_TICK_MS: 1000,
    SIM_WALK_SPEED_MS: 1.45,           // Average human walking pace
    SIM_PEER_APPROACH_SPEED_MS: 1.9,

    // Persistence keys
    KEY_TOTAL_DISTANCE: 'radia_total_distance_m',
    KEY_BLOCKED_PEERS: 'radia_blocked_peers',
    KEY_LAST_POSITION: 'radia_last_position',

    // Rendering
    FOG_FPS: 30,
    MAX_DPR: 2
  };

  /** Hotspot zones — public gathering spaces that grant bonus Climb XP. */
  const HOTSPOTS = [
    { id: 'hs_campus_quad',  name: 'University Quad',   lat: 40.729513, lng: -73.996533, radius: 140, multiplier: 2 },
    { id: 'hs_wsp',          name: 'Washington Square', lat: 40.730823, lng: -73.997332, radius: 160, multiplier: 2 },
    { id: 'hs_union_sq',     name: 'Union Square Park', lat: 40.735863, lng: -73.991084, radius: 150, multiplier: 2 }
  ];

  const EARTH_RADIUS_M = 6371008.8;
  const M_PER_FOOT = 0.3048;

  /* ==========================================================================
     PURE GEODESIC MATH UTILITIES
     ========================================================================== */

  const Geo = {
    toRad: (deg) => (deg * Math.PI) / 180,
    toDeg: (rad) => (rad * 180) / Math.PI,

    /** Haversine great-circle distance in metres. */
    haversine(lat1, lon1, lat2, lon2) {
      const dLat = Geo.toRad(lat2 - lat1);
      const dLon = Geo.toRad(lon2 - lon1);
      const p1 = Geo.toRad(lat1);
      const p2 = Geo.toRad(lat2);
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(p1) * Math.cos(p2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
      return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
    },

    /** Initial bearing (degrees from true north) between two coordinates. */
    bearing(lat1, lon1, lat2, lon2) {
      const p1 = Geo.toRad(lat1);
      const p2 = Geo.toRad(lat2);
      const dLon = Geo.toRad(lon2 - lon1);
      const y = Math.sin(dLon) * Math.cos(p2);
      const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dLon);
      return (Geo.toDeg(Math.atan2(y, x)) + 360) % 360;
    },

    /** Project a coordinate forward along a bearing by a distance in metres. */
    destination(lat, lng, bearingDeg, distanceM) {
      const d = distanceM / EARTH_RADIUS_M;
      const b = Geo.toRad(bearingDeg);
      const p1 = Geo.toRad(lat);
      const l1 = Geo.toRad(lng);
      const p2 = Math.asin(
        Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b)
      );
      const l2 =
        l1 +
        Math.atan2(
          Math.sin(b) * Math.sin(d) * Math.cos(p1),
          Math.cos(d) - Math.sin(p1) * Math.sin(p2)
        );
      return { lat: Geo.toDeg(p2), lng: ((Geo.toDeg(l2) + 540) % 360) - 180 };
    },

    metersToFeet: (m) => m / M_PER_FOOT
  };

  /* ==========================================================================
     RADIA PROXIMITY ENGINE
     ========================================================================== */

  class RadiaProximityEngine {
    constructor() {
      /* ---- Core state ---- */
      this.map = null;
      this.mapReady = false;
      this.mode = 'gps';                 // 'gps' | 'simulate'
      this.isAvailable = true;           // "Open to Talk" toggle
      this.watchId = null;
      this.followMode = true;

      /* ---- Position state ---- */
      this.position = null;              // { lat, lng, accuracy, timestamp }
      this.lastAccruedPosition = null;
      this.heading = null;
      this.totalDistanceM = this._readNumber(CONFIG.KEY_TOTAL_DISTANCE, 0);
      this.sessionDistanceM = 0;

      /* ---- Peer registry (positions NEVER rendered to the map) ---- */
      this.peers = new Map();            // peerId -> { profile, lat, lng, accuracy, lastSeen, inRange, cooldownUntil }
      this.activeCollisionId = null;
      this.blockedPeers = new Set(this._readJSON(CONFIG.KEY_BLOCKED_PEERS, []));

      /* ---- Hotspots ---- */
      this.activeHotspot = null;
      this.xpMultiplier = 1;

      /* ---- Simulator ---- */
      this.sim = {
        timer: null,
        lat: null,
        lng: null,
        heading: Math.random() * 360,
        peerCounter: 0
      };

      /* ---- Fog rendering ---- */
      this.fogCanvas = null;
      this.fogCtx = null;
      this.fogRaf = null;
      this.fogLastDraw = 0;
      this.mistBlobs = [];

      /* ---- DOM refs ---- */
      this.dom = {};

      this._boundResize = this._handleResize.bind(this);
    }

    /* ======================================================================
       LIFECYCLE
       ====================================================================== */

    /** Boot the entire radar subsystem. Safe to call once after DOM ready. */
    init() {
      this.dom.mapEl = document.getElementById('leaflet-radar-map');
      if (!this.dom.mapEl) {
        console.warn('[Radia Proximity] #leaflet-radar-map not found. Aborting init.');
        return this;
      }
      if (typeof L === 'undefined') {
        console.error('[Radia Proximity] Leaflet is not loaded.');
        return this;
      }

      this.dom.wrapper = this.dom.mapEl.parentElement;
      this.dom.overlay = document.getElementById('proximity-circle-overlay');
      this.dom.avatar = document.getElementById('radar-avatar-center');
      this.dom.hotspotBadge = document.getElementById('hotspot-badge');
      this.dom.headerDistance = document.getElementById('header-user-distance');

      this._buildMap();
      this._buildRingStack();
      this._buildFogLayer();
      this._buildControls();
      this._bindExternalButtons();

      window.addEventListener('resize', this._boundResize, { passive: true });
      window.addEventListener('orientationchange', this._boundResize, { passive: true });

      // Restore last known position for an instant, non-blank first paint.
      const cached = this._readJSON(CONFIG.KEY_LAST_POSITION, null);
      if (cached && typeof cached.lat === 'number') {
        this.map.setView([cached.lat, cached.lng], CONFIG.DEFAULT_ZOOM, { animate: false });
      }

      this._emitDistance(0);
      this.startGPS();
      this._startFogLoop();
      this._startPeerJanitor();

      return this;
    }

    destroy() {
      this.stopGPS();
      this.stopSimulation();
      if (this.fogRaf) cancelAnimationFrame(this.fogRaf);
      if (this.janitorTimer) clearInterval(this.janitorTimer);
      window.removeEventListener('resize', this._boundResize);
      if (this.map) this.map.remove();
    }

    /* ======================================================================
       MAP CONSTRUCTION
       ====================================================================== */

    _buildMap() {
      this.map = L.map(this.dom.mapEl, {
        zoomControl: false,
        attributionControl: false,
        dragging: true,
        doubleClickZoom: false,
        scrollWheelZoom: true,
        touchZoom: true,
        inertia: true,
        zoomSnap: 0.25,
        minZoom: CONFIG.MIN_ZOOM,
        maxZoom: CONFIG.MAX_ZOOM,
        preferCanvas: true
      }).setView(CONFIG.FALLBACK_CENTER, CONFIG.DEFAULT_ZOOM);

      // Primary: CartoDB Dark Matter. Fallback: Stadia Alidade Smooth Dark.
      const primary = L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        {
          subdomains: 'abcd',
          maxZoom: CONFIG.MAX_ZOOM,
          maxNativeZoom: 20,
          detectRetina: true,
          crossOrigin: true,
          keepBuffer: 3
        }
      );

      let fallbackApplied = false;
      primary.on('tileerror', () => {
        if (fallbackApplied) return;
        fallbackApplied = true;
        console.warn('[Radia Proximity] CartoDB tiles unavailable — switching to Stadia.');
        this.map.removeLayer(primary);
        L.tileLayer(
          'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png',
          { maxZoom: CONFIG.MAX_ZOOM, maxNativeZoom: 20, detectRetina: true, crossOrigin: true }
        ).addTo(this.map);
      });

      primary.addTo(this.map);

      // Minimal legally-required attribution, rendered as an unobtrusive pill.
      const attrib = document.createElement('div');
      attrib.className = 'radar-attribution';
      attrib.textContent = '© OpenStreetMap · CARTO';
      this.dom.wrapper.appendChild(attrib);

      // Vignette above fog for cinematic depth.
      const vignette = document.createElement('div');
      vignette.className = 'radar-vignette';
      this.dom.wrapper.appendChild(vignette);

      // Keep ring scale honest at every zoom level.
      this.map.on('zoom zoomend move moveend resize', () => {
        this._syncRingScale();
        this._drawFog(true);
      });

      // Dragging breaks follow-lock and surfaces the recenter control.
      this.map.on('dragstart', () => {
        this.followMode = false;
        if (this.dom.recenterBtn) this.dom.recenterBtn.classList.add('control-visible');
      });

      this.mapReady = true;
      setTimeout(() => this.map.invalidateSize(), 120);
    }

    /* ======================================================================
       RING STACK (true-to-scale 40ft bubble)
       ====================================================================== */

    _buildRingStack() {
      if (!this.dom.overlay) return;

      // Replace Batch-1 static placeholder rings with scale-accurate geometry.
      const placeholder = this.dom.overlay.querySelector('.relative');
      if (placeholder) {
        Array.from(placeholder.children).forEach((child) => {
          if (child.id !== 'radar-avatar-center') child.remove();
        });
      }

      const stack = document.createElement('div');
      stack.className = 'radar-ring-stack';
      stack.innerHTML = `
        <div class="radar-sweep"></div>
        <div class="radar-pulse"></div>
        <div class="radar-pulse"></div>
        <div class="radar-pulse"></div>
        <div class="radar-ring-inner"></div>
        <div class="radar-ring-boundary"></div>
      `;
      this.dom.overlay.appendChild(stack);
      this.dom.ringStack = stack;
      this.dom.ringBoundary = stack.querySelector('.radar-ring-boundary');
      this.dom.ringInner = stack.querySelector('.radar-ring-inner');
      this.dom.ringSweep = stack.querySelector('.radar-sweep');
      this.dom.ringPulses = Array.from(stack.querySelectorAll('.radar-pulse'));

      // Directional heading cone.
      const cone = document.createElement('div');
      cone.className = 'radar-heading-cone';
      this.dom.overlay.appendChild(cone);
      this.dom.headingCone = cone;

      // Ambient presence chip (count only — never a position).
      const chip = document.createElement('div');
      chip.id = 'radar-presence-chip';
      chip.setAttribute('aria-live', 'polite');
      chip.innerHTML = `<span class="presence-dot"></span><span id="presence-chip-text">1 person nearby</span>`;
      this.dom.overlay.appendChild(chip);
      this.dom.presenceChip = chip;
      this.dom.presenceText = chip.querySelector('#presence-chip-text');

      if (this.dom.avatar) this.dom.avatar.classList.add('radar-avatar-breathe');

      this._syncRingScale();
    }

    /** Convert the 40ft radius into live screen pixels at the current zoom. */
    _syncRingScale() {
      if (!this.map || !this.dom.ringBoundary) return;

      const size = this.map.getSize();
      const y = Math.round(size.y / 2);
      const a = this.map.containerPointToLatLng([0, y]);
      const b = this.map.containerPointToLatLng([100, y]);
      const metersPer100px = this.map.distance(a, b) || 1;
      const pxPerMeter = 100 / metersPer100px;

      const boundaryPx = Math.max(56, CONFIG.ENCOUNTER_RADIUS_M * pxPerMeter * 2);
      const innerPx = boundaryPx * 0.62;

      this.pxPerMeter = pxPerMeter;
      this.boundaryRadiusPx = boundaryPx / 2;

      this.dom.ringStack.style.width = `${boundaryPx}px`;
      this.dom.ringStack.style.height = `${boundaryPx}px`;

      const setSize = (el, px) => {
        if (!el) return;
        el.style.width = `${px}px`;
        el.style.height = `${px}px`;
      };

      setSize(this.dom.ringBoundary, boundaryPx);
      setSize(this.dom.ringInner, innerPx);
      setSize(this.dom.ringSweep, boundaryPx * 0.96);
      this.dom.ringPulses.forEach((p) => setSize(p, boundaryPx));
    }

    /* ======================================================================
       FOG-OF-WAR CANVAS SHADER
       ====================================================================== */

    _buildFogLayer() {
      const canvas = document.createElement('canvas');
      canvas.id = 'radar-fog-canvas';
      canvas.setAttribute('aria-hidden', 'true');
      this.dom.wrapper.insertBefore(canvas, this.dom.overlay || null);

      this.fogCanvas = canvas;
      this.fogCtx = canvas.getContext('2d', { alpha: true });

      // Seed drifting mist blobs for organic atmosphere.
      for (let i = 0; i < 9; i++) {
        this.mistBlobs.push({
          x: Math.random(),
          y: Math.random(),
          r: 0.18 + Math.random() * 0.3,
          vx: (Math.random() - 0.5) * 0.000085,
          vy: (Math.random() - 0.5) * 0.000085,
          alpha: 0.05 + Math.random() * 0.07,
          phase: Math.random() * Math.PI * 2
        });
      }

      this._resizeFogCanvas();
      requestAnimationFrame(() => canvas.classList.add('fog-ready'));
    }

    _resizeFogCanvas() {
      if (!this.fogCanvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, CONFIG.MAX_DPR);
      const rect = this.dom.wrapper.getBoundingClientRect();
      this.fogCanvas.width = Math.max(1, Math.floor(rect.width * dpr));
      this.fogCanvas.height = Math.max(1, Math.floor(rect.height * dpr));
      this.fogCanvas.style.width = `${rect.width}px`;
      this.fogCanvas.style.height = `${rect.height}px`;
      this.fogDpr = dpr;
      this.fogW = rect.width;
      this.fogH = rect.height;
    }

    _startFogLoop() {
      const frameInterval = 1000 / CONFIG.FOG_FPS;
      const loop = (ts) => {
        this.fogRaf = requestAnimationFrame(loop);
        if (ts - this.fogLastDraw < frameInterval) return;
        this.fogLastDraw = ts;
        this._drawFog();
      };
      this.fogRaf = requestAnimationFrame(loop);
    }

    _drawFog(force) {
      const ctx = this.fogCtx;
      if (!ctx || !this.fogW) return;
      if (document.hidden && !force) return;

      const dpr = this.fogDpr;
      const W = this.fogW;
      const H = this.fogH;
      const t = performance.now();

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      /* --- Layer A: base fog mass --- */
      const density = this.isAvailable ? CONFIG.radarDensity || 0.93 : 0.96;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = `rgba(8, 9, 12, ${density})`;
      ctx.fillRect(0, 0, W, H);

      /* --- Layer B: drifting luminous mist --- */
      this.mistBlobs.forEach((blob) => {
        blob.x += blob.vx * 16;
        blob.y += blob.vy * 16;
        if (blob.x < -0.3) blob.x = 1.3;
        if (blob.x > 1.3) blob.x = -0.3;
        if (blob.y < -0.3) blob.y = 1.3;
        if (blob.y > 1.3) blob.y = -0.3;

        const breathe = 0.82 + 0.18 * Math.sin(t / 3600 + blob.phase);
        const cx = blob.x * W;
        const cy = blob.y * H;
        const r = blob.r * Math.max(W, H) * breathe;

        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        const tint = this.activeHotspot ? '245, 158, 11' : '30, 41, 59';
        g.addColorStop(0, `rgba(${tint}, ${blob.alpha})`);
        g.addColorStop(1, `rgba(${tint}, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      });

      /* --- Layer C: punch the illuminated 40ft viewport --- */
      const center = this._getAvatarScreenPoint();
      const clearR = Math.max(42, this.boundaryRadiusPx || 90);
      const featherR = clearR * 1.75;

      ctx.globalCompositeOperation = 'destination-out';
      const hole = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, featherR);
      hole.addColorStop(0, 'rgba(0,0,0,1)');
      hole.addColorStop(clearR / featherR, 'rgba(0,0,0,0.97)');
      hole.addColorStop(Math.min(0.99, (clearR / featherR) * 1.22), 'rgba(0,0,0,0.42)');
      hole.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = hole;
      ctx.beginPath();
      ctx.arc(center.x, center.y, featherR, 0, Math.PI * 2);
      ctx.fill();

      /* --- Layer D: bioluminescent rim bloom --- */
      ctx.globalCompositeOperation = 'lighter';
      const rimColor = this.activeHotspot ? '245, 158, 11' : '16, 185, 129';
      const rimPulse = 0.1 + 0.05 * Math.sin(t / 900);
      const rim = ctx.createRadialGradient(
        center.x, center.y, clearR * 0.82,
        center.x, center.y, clearR * 1.25
      );
      rim.addColorStop(0, `rgba(${rimColor}, 0)`);
      rim.addColorStop(0.55, `rgba(${rimColor}, ${this.isAvailable ? rimPulse : 0.02})`);
      rim.addColorStop(1, `rgba(${rimColor}, 0)`);
      ctx.fillStyle = rim;
      ctx.beginPath();
      ctx.arc(center.x, center.y, clearR * 1.25, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalCompositeOperation = 'source-over';
    }

    /** Screen-space centre of the avatar (follows map pan when unlocked). */
    _getAvatarScreenPoint() {
      if (this.map && this.position && !this.followMode) {
        const p = this.map.latLngToContainerPoint([this.position.lat, this.position.lng]);
        return { x: p.x, y: p.y };
      }
      return { x: this.fogW / 2, y: this.fogH / 2 };
    }

    /* ======================================================================
       FLOATING CONTROLS + DEV/DEMO TOGGLE
       ====================================================================== */

    _buildControls() {
      const wrap = this.dom.wrapper;

      /* --- GPS accuracy chip --- */
      const acc = document.createElement('div');
      acc.id = 'radar-accuracy-chip';
      acc.className = 'radar-float-control';
      acc.dataset.quality = 'offline';
      acc.innerHTML = `<span class="accuracy-dot"></span><span id="accuracy-chip-text">Acquiring GPS…</span>`;
      wrap.appendChild(acc);
      this.dom.accuracyChip = acc;
      this.dom.accuracyText = acc.querySelector('#accuracy-chip-text');

      /* --- Recenter control --- */
      const recenter = document.createElement('button');
      recenter.id = 'radar-recenter-btn';
      recenter.className = 'radar-float-control';
      recenter.type = 'button';
      recenter.setAttribute('aria-label', 'Recenter map on my position');
      recenter.innerHTML = `<i data-lucide="locate-fixed" style="width:13px;height:13px"></i><span>Recenter</span>`;
      wrap.appendChild(recenter);
      this.dom.recenterBtn = recenter;
      recenter.addEventListener('click', () => {
        this.followMode = true;
        recenter.classList.remove('control-visible');
        if (this.position) {
          this.map.setView([this.position.lat, this.position.lng], this.map.getZoom(), { animate: true });
        }
      });

      /* --- Simulation banner --- */
      const banner = document.createElement('div');
      banner.id = 'radar-sim-banner';
      banner.innerHTML = `<span>◉</span><span>Simulation Mode — Mock Walk Active</span>`;
      wrap.appendChild(banner);
      this.dom.simBanner = banner;

      /* --- Segmented [ Real GPS | Simulate Walk ] toggle --- */
      const toggle = document.createElement('div');
      toggle.id = 'radar-dev-toggle';
      toggle.setAttribute('role', 'group');
      toggle.setAttribute('aria-label', 'Location source mode');
      toggle.innerHTML = `
        <button type="button" class="dev-toggle-btn is-active" data-mode="gps" aria-pressed="true">
          <i data-lucide="satellite-dish"></i><span>Real GPS</span>
        </button>
        <button type="button" class="dev-toggle-btn" data-mode="simulate" aria-pressed="false">
          <i data-lucide="footprints"></i><span>Simulate Walk</span>
        </button>
      `;
      wrap.appendChild(toggle);
      this.dom.devToggle = toggle;

      toggle.querySelectorAll('.dev-toggle-btn').forEach((btn) => {
        btn.addEventListener('click', () => this.setMode(btn.dataset.mode));
      });

      /* --- Geolocation error toast --- */
      const toast = document.createElement('div');
      toast.id = 'radar-geo-toast';
      toast.setAttribute('role', 'alert');
      toast.innerHTML = `
        <i data-lucide="alert-triangle" class="toast-icon" style="width:16px;height:16px"></i>
        <div>
          <div class="toast-title" id="geo-toast-title">Location unavailable</div>
          <div class="toast-body" id="geo-toast-body">Enable location permissions, or switch to Simulate Walk to explore Radia.</div>
        </div>
        <button type="button" class="toast-close" aria-label="Dismiss">
          <i data-lucide="x" style="width:14px;height:14px"></i>
        </button>
      `;
      wrap.appendChild(toast);
      this.dom.geoToast = toast;
      toast.querySelector('.toast-close').addEventListener('click', () =>
        toast.classList.remove('toast-visible')
      );

      if (window.lucide) window.lucide.createIcons();
    }

    /** Hook the Batch-1 "Simulate Peer Ping" and availability buttons. */
    _bindExternalButtons() {
      const pingBtn = document.getElementById('btn-simulate-collision');
      if (pingBtn) {
        pingBtn.addEventListener('click', () => this.spawnMockPeer());
      }

      const availBtn = document.getElementById('btn-toggle-availability');
      if (availBtn) {
        availBtn.addEventListener('click', () => this.setAvailability(!this.isAvailable));
      }
    }

    /* ======================================================================
       MODE SWITCHING
       ====================================================================== */

    setMode(mode) {
      if (mode !== 'gps' && mode !== 'simulate') return;
      if (mode === this.mode) return;

      this.mode = mode;

      this.dom.devToggle.querySelectorAll('.dev-toggle-btn').forEach((btn) => {
        const on = btn.dataset.mode === mode;
        btn.classList.toggle('is-active', on);
        btn.setAttribute('aria-pressed', String(on));
      });

      if (mode === 'simulate') {
        this.stopGPS();
        this.startSimulation();
        this.dom.simBanner.classList.add('banner-visible');
        this._setAccuracyChip('fair', 'Simulated position');
        this.dom.geoToast.classList.remove('toast-visible');
      } else {
        this.stopSimulation();
        this.dom.simBanner.classList.remove('banner-visible');
        this.startGPS();
      }

      this._dispatch('RADIA_MODE_CHANGED', { mode });
    }

    setAvailability(isAvailable) {
      this.isAvailable = !!isAvailable;
      if (this.dom.overlay) this.dom.overlay.classList.toggle('radar-dormant', !this.isAvailable);
      if (this.dom.wrapper) this.dom.wrapper.classList.toggle('radar-dormant', !this.isAvailable);

      // Reflect state on the Batch-1 availability pill.
      const label = document.getElementById('label-availability');
      const btn = document.getElementById('btn-toggle-availability');
      if (label) {
        label.textContent = this.isAvailable ? 'Open to Talk' : 'In My Zone';
        label.className = this.isAvailable
          ? 'text-xs font-semibold text-emerald-300'
          : 'text-xs font-semibold text-slate-400';
      }
      if (btn) {
        const dot = btn.querySelector('span');
        if (dot) dot.className = this.isAvailable
          ? 'w-2 h-2 rounded-full bg-emerald-400'
          : 'w-2 h-2 rounded-full bg-slate-500';
        btn.className = this.isAvailable
          ? 'glass-panel px-3 py-1.5 rounded-full flex items-center gap-2 border border-emerald-500/30'
          : 'glass-panel px-3 py-1.5 rounded-full flex items-center gap-2 border border-white/10';
      }

      if (!this.isAvailable) this._clearAllRangeStates();
      this._dispatch('RADIA_AVAILABILITY_CHANGED', { isAvailable: this.isAvailable });
      return this.isAvailable;
    }

    /* ======================================================================
       REAL GPS TRACKING
       ====================================================================== */

    startGPS() {
      if (!('geolocation' in navigator)) {
        this._showGeoToast('Geolocation unsupported', 'This browser cannot access location. Use Simulate Walk to explore Radia.');
        this._setAccuracyChip('offline', 'No GPS');
        return;
      }
      if (this.watchId !== null) return;

      this._setAccuracyChip('offline', 'Acquiring GPS…');

      this.watchId = navigator.geolocation.watchPosition(
        (pos) => this._onGeoSuccess(pos),
        (err) => this._onGeoError(err),
        { enableHighAccuracy: true, maximumAge: 1500, timeout: 20000 }
      );
    }

    stopGPS() {
      if (this.watchId !== null) {
        navigator.geolocation.clearWatch(this.watchId);
        this.watchId = null;
      }
    }

    _onGeoSuccess(pos) {
      if (this.mode !== 'gps') return;

      const { latitude, longitude, accuracy, heading } = pos.coords;
      if (typeof accuracy === 'number' && accuracy > CONFIG.MAX_USABLE_ACCURACY_M) {
        this._setAccuracyChip('poor', `±${Math.round(accuracy)}m — weak signal`);
        return;
      }

      if (typeof heading === 'number' && !Number.isNaN(heading)) this.heading = heading;

      const quality = accuracy <= 12 ? 'good' : accuracy <= 28 ? 'fair' : 'poor';
      this._setAccuracyChip(quality, `±${Math.round(accuracy)}m accuracy`);
      this.dom.geoToast.classList.remove('toast-visible');

      this._ingestPosition({
        lat: latitude,
        lng: longitude,
        accuracy: accuracy || 999,
        timestamp: pos.timestamp || Date.now(),
        simulated: false
      });
    }

    _onGeoError(err) {
      const map = {
        1: ['Location permission denied', 'Radia needs location to find your 40ft radius. Enable it in browser settings, or switch to Simulate Walk.'],
        2: ['Position unavailable', 'Your device could not obtain a fix. Move to open sky, or switch to Simulate Walk.'],
        3: ['Location timed out', 'The GPS fix took too long. Retrying automatically — or switch to Simulate Walk.']
      };
      const [title, body] = map[err.code] || ['Location error', err.message || 'Unknown geolocation failure.'];
      this._showGeoToast(title, body);
      this._setAccuracyChip('offline', 'No GPS');
      this._dispatch('RADIA_GEO_ERROR', { code: err.code, message: err.message });
    }

    /* ======================================================================
       POSITION INGESTION, HAVERSINE ACCRUAL & XP EMISSION
       ====================================================================== */

    _ingestPosition(fix) {
      const prev = this.position;
      this.position = fix;

      /* --- Compute walking distance with jitter + teleport rejection --- */
      let delta = 0;
      const ref = this.lastAccruedPosition;
      if (ref) {
        const raw = Geo.haversine(ref.lat, ref.lng, fix.lat, fix.lng);
        const dt = Math.max(0.001, (fix.timestamp - ref.timestamp) / 1000);
        const speed = raw / dt;

        if (raw >= CONFIG.MIN_STEP_M && speed <= CONFIG.MAX_PLAUSIBLE_SPEED_MS) {
          delta = raw;
          this.totalDistanceM += delta;
          this.sessionDistanceM += delta;
          this.lastAccruedPosition = fix;
          this._writeNumber(CONFIG.KEY_TOTAL_DISTANCE, this.totalDistanceM);
        }

        // Derive heading from movement when the device gives us none.
        if (raw >= CONFIG.MIN_STEP_M && (this.heading === null || !Number.isFinite(this.heading))) {
          this.heading = Geo.bearing(ref.lat, ref.lng, fix.lat, fix.lng);
        }
      } else {
        this.lastAccruedPosition = fix;
      }

      /* --- Map follow --- */
      if (this.map && this.followMode) {
        const target = [fix.lat, fix.lng];
        if (!prev) {
          this.map.setView(target, CONFIG.DEFAULT_ZOOM, { animate: false });
        } else {
          this.map.panTo(target, { animate: true, duration: 0.65, easeLinearity: 0.3 });
        }
      }

      this._writeJSON(CONFIG.KEY_LAST_POSITION, { lat: fix.lat, lng: fix.lng });
      this._updateHeadingCone();
      this._evaluateHotspots();
      if (delta > 0) this._emitDistance(delta);

      this._dispatch('RADIA_POSITION_UPDATED', {
        lat: fix.lat,
        lng: fix.lng,
        accuracy: fix.accuracy,
        heading: this.heading,
        simulated: !!fix.simulated,
        timestamp: fix.timestamp
      });

      this._evaluateAllPeers();
      this._syncRingScale();
    }

    _emitDistance(deltaM) {
      const totalKm = this.totalDistanceM / 1000;

      if (this.dom.headerDistance) {
        this.dom.headerDistance.textContent = `${totalKm.toFixed(2)} km walked`;
      }
      const climbStat = document.getElementById('stats-total-distance');
      if (climbStat) climbStat.textContent = `${totalKm.toFixed(1)} km`;

      this._dispatch('RADIA_DISTANCE_UPDATED', {
        deltaMeters: deltaM,
        totalMeters: this.totalDistanceM,
        totalKm,
        sessionMeters: this.sessionDistanceM,
        xpMultiplier: this.xpMultiplier,
        hotspot: this.activeHotspot ? this.activeHotspot.name : null
      });
    }

    _updateHeadingCone() {
      const cone = this.dom.headingCone;
      if (!cone) return;
      if (this.heading === null || !Number.isFinite(this.heading)) {
        cone.classList.remove('cone-visible');
        return;
      }
      cone.classList.add('cone-visible');
      cone.style.transform = `rotate(${this.heading}deg)`;
    }

    /* ======================================================================
       HOTSPOT ZONES (bonus Climb XP in public gathering spaces)
       ====================================================================== */

    _evaluateHotspots() {
      if (!this.position) return;

      let found = null;
      for (const hs of HOTSPOTS) {
        const d = Geo.haversine(this.position.lat, this.position.lng, hs.lat, hs.lng);
        if (d <= hs.radius) { found = hs; break; }
      }

      const prevId = this.activeHotspot ? this.activeHotspot.id : null;
      const nextId = found ? found.id : null;
      if (prevId === nextId) return;

      this.activeHotspot = found;
      this.xpMultiplier = found ? found.multiplier : 1;

      if (this.dom.wrapper) this.dom.wrapper.classList.toggle('radar-hotspot-active', !!found);
      if (this.dom.overlay) this.dom.overlay.classList.toggle('radar-hotspot-active', !!found);

      if (this.dom.hotspotBadge) {
        if (found) {
          this.dom.hotspotBadge.classList.remove('hidden');
          requestAnimationFrame(() => this.dom.hotspotBadge.classList.add('badge-visible'));
          const label = this.dom.hotspotBadge.querySelector('span:last-child');
          if (label) label.textContent = `${found.name} Hotspot (${found.multiplier}x Climb XP)`;
        } else {
          this.dom.hotspotBadge.classList.remove('badge-visible');
          setTimeout(() => this.dom.hotspotBadge.classList.add('hidden'), 400);
        }
      }

      this._dispatch('RADIA_HOTSPOT_CHANGED', {
        hotspot: found ? { id: found.id, name: found.name, multiplier: found.multiplier } : null,
        xpMultiplier: this.xpMultiplier
      });
    }

    /* ======================================================================
       PEER REGISTRY & 40FT COLLISION DETECTION
       (Peer coordinates are evaluated in memory ONLY — never drawn.)
       ====================================================================== */

    /** Register/update a peer broadcast received from peer-sync.js. */
    updatePeer(peerId, data) {
      if (!peerId || this.blockedPeers.has(peerId)) return;

      const existing = this.peers.get(peerId) || {
        inRange: false,
        cooldownUntil: 0,
        profile: {}
      };

      const peer = {
        ...existing,
        peerId,
        profile: data.profile ? { ...existing.profile, ...data.profile } : existing.profile,
        lat: typeof data.lat === 'number' ? data.lat : existing.lat,
        lng: typeof data.lng === 'number' ? data.lng : existing.lng,
        accuracy: typeof data.accuracy === 'number' ? data.accuracy : (existing.accuracy || 20),
        simulated: !!data.simulated,
        lastSeen: Date.now()
      };

      this.peers.set(peerId, peer);
      this._evaluatePeer(peer);
      this._updatePresenceChip();
    }

    removePeer(peerId) {
      const peer = this.peers.get(peerId);
      if (peer && peer.inRange) {
        this._dispatch('RADIA_COLLISION_LOST', { peerId, reason: 'peer_disconnected' });
        if (this.activeCollisionId === peerId) this.activeCollisionId = null;
      }
      this.peers.delete(peerId);
      this._updatePresenceChip();
    }

    /** Temporarily suppress re-pings after a user walks away / declines. */
    dismissPeer(peerId, cooldownMs) {
      const peer = this.peers.get(peerId);
      if (!peer) return;
      peer.inRange = false;
      peer.cooldownUntil = Date.now() + (cooldownMs || CONFIG.COLLISION_COOLDOWN_MS);
      this.peers.set(peerId, peer);
      if (this.activeCollisionId === peerId) this.activeCollisionId = null;
    }

    /** Permanently block a peer (mirrors the Settings > Blocked List). */
    blockPeer(peerId) {
      if (!peerId) return;
      this.blockedPeers.add(peerId);
      this._writeJSON(CONFIG.KEY_BLOCKED_PEERS, Array.from(this.blockedPeers));
      this.removePeer(peerId);
      this._dispatch('RADIA_PEER_BLOCKED', { peerId });
    }

    unblockPeer(peerId) {
      this.blockedPeers.delete(peerId);
      this._writeJSON(CONFIG.KEY_BLOCKED_PEERS, Array.from(this.blockedPeers));
    }

    getBlockedPeers() {
      return Array.from(this.blockedPeers);
    }

    _evaluateAllPeers() {
      this.peers.forEach((peer) => this._evaluatePeer(peer));
      this._updatePresenceChip();
    }

    _evaluatePeer(peer) {
      if (!this.position || !peer || typeof peer.lat !== 'number') return;

      const distanceM = Geo.haversine(this.position.lat, this.position.lng, peer.lat, peer.lng);
      peer.distanceM = distanceM;

      // Combined positional uncertainty — be generous so real encounters aren't missed.
      const uncertainty = Math.min(20, ((this.position.accuracy || 15) + (peer.accuracy || 15)) * 0.25);
      const enterThreshold = CONFIG.ENCOUNTER_RADIUS_M + uncertainty;

      const now = Date.now();
      const gated = !this.isAvailable || now < (peer.cooldownUntil || 0) || this.blockedPeers.has(peer.peerId);

      /* --- ENTER --- */
      if (!peer.inRange && !gated && distanceM <= enterThreshold) {
        peer.inRange = true;
        this.activeCollisionId = peer.peerId;
        this._fireCollision(peer, distanceM);
      }

      /* --- EXIT (hysteresis prevents flicker at the boundary) --- */
      else if (peer.inRange && distanceM > CONFIG.EXIT_HYSTERESIS_M) {
        peer.inRange = false;
        if (this.activeCollisionId === peer.peerId) this.activeCollisionId = null;
        this._dispatch('RADIA_COLLISION_LOST', {
          peerId: peer.peerId,
          distanceMeters: distanceM,
          distanceFeet: Geo.metersToFeet(distanceM),
          reason: 'out_of_range'
        });
      }

      this.peers.set(peer.peerId, peer);
    }

    _fireCollision(peer, distanceM) {
      // Visual flare on the bubble.
      if (this.dom.overlay) {
        this.dom.overlay.classList.add('radar-collision-flare');
        setTimeout(() => this.dom.overlay.classList.remove('radar-collision-flare'), 2400);
      }

      // Audio + haptics from Batch 2.
      if (window.RadiaAudio && typeof window.RadiaAudio.playCollisionPing === 'function') {
        window.RadiaAudio.playCollisionPing();
      }

      this._dispatch('RADIA_COLLISION_DETECTED', {
        peerId: peer.peerId,
        profile: peer.profile || {},
        distanceMeters: Number(distanceM.toFixed(2)),
        distanceFeet: Number(Geo.metersToFeet(distanceM).toFixed(1)),
        myAccuracy: this.position ? this.position.accuracy : null,
        peerAccuracy: peer.accuracy,
        simulated: !!peer.simulated,
        hotspot: this.activeHotspot ? this.activeHotspot.name : null,
        timestamp: Date.now()
      });
    }

    _updatePresenceChip() {
      if (!this.dom.presenceChip) return;
      let count = 0;
      this.peers.forEach((p) => {
        if (typeof p.distanceM === 'number' && p.distanceM <= CONFIG.EXIT_HYSTERESIS_M * 3) count++;
      });

      if (count > 0 && this.isAvailable) {
        this.dom.presenceText.textContent =
          count === 1 ? '1 person nearby' : `${count} people nearby`;
        this.dom.presenceChip.classList.add('chip-visible');
      } else {
        this.dom.presenceChip.classList.remove('chip-visible');
      }
    }

    _clearAllRangeStates() {
      this.peers.forEach((peer) => {
        if (peer.inRange) {
          peer.inRange = false;
          this._dispatch('RADIA_COLLISION_LOST', { peerId: peer.peerId, reason: 'availability_off' });
        }
      });
      this.activeCollisionId = null;
      this._updatePresenceChip();
    }

    /** Purge peers whose broadcasts have gone silent. */
    _startPeerJanitor() {
      this.janitorTimer = setInterval(() => {
        const now = Date.now();
        this.peers.forEach((peer, id) => {
          if (now - peer.lastSeen > CONFIG.PEER_STALE_MS) this.removePeer(id);
        });
      }, 5000);
    }

    /* ======================================================================
       SIMULATION / DEMO MODE
       ====================================================================== */

    startSimulation() {
      // Seed from the real position if we have one, otherwise a known hotspot.
      const seed = this.position || this._readJSON(CONFIG.KEY_LAST_POSITION, null);
      this.sim.lat = seed ? seed.lat : CONFIG.FALLBACK_CENTER[0];
      this.sim.lng = seed ? seed.lng : CONFIG.FALLBACK_CENTER[1];
      this.sim.heading = Math.random() * 360;

      this.followMode = true;
      if (this.dom.recenterBtn) this.dom.recenterBtn.classList.remove('control-visible');

      if (this.sim.timer) clearInterval(this.sim.timer);
      this.sim.timer = setInterval(() => this._simTick(), CONFIG.SIM_TICK_MS);
      this._simTick();
    }

    stopSimulation() {
      if (this.sim.timer) {
        clearInterval(this.sim.timer);
        this.sim.timer = null;
      }
      // Clear simulated peers so real GPS mode starts clean.
      Array.from(this.peers.keys()).forEach((id) => {
        if (this.peers.get(id).simulated) this.removePeer(id);
      });
    }

    _simTick() {
      // Gentle random-walk wander so the path feels human, not robotic.
      this.sim.heading = (this.sim.heading + (Math.random() - 0.5) * 34 + 360) % 360;
      const step = CONFIG.SIM_WALK_SPEED_MS * (CONFIG.SIM_TICK_MS / 1000);
      const next = Geo.destination(this.sim.lat, this.sim.lng, this.sim.heading, step);

      this.sim.lat = next.lat;
      this.sim.lng = next.lng;
      this.heading = this.sim.heading;

      this._ingestPosition({
        lat: next.lat,
        lng: next.lng,
        accuracy: 6,
        timestamp: Date.now(),
        simulated: true
      });

      this._advanceMockPeers();
    }

    /**
     * Spawn a mock peer ~60ft away that walks toward you and trips the
     * 40ft threshold in a few seconds. Works in BOTH gps and simulate modes.
     */
    spawnMockPeer(overrides) {
      const origin = this.position || {
        lat: CONFIG.FALLBACK_CENTER[0],
        lng: CONFIG.FALLBACK_CENTER[1]
      };

      const names = ['Jordan', 'Mina', 'Theo', 'Sasha', 'Rumi', 'Elias', 'Noor', 'Kai', 'Isla', 'Dev'];
      const timers = [180, 300, 0];
      const id = `sim_peer_${++this.sim.peerCounter}_${Date.now().toString(36)}`;

      const bearing = Math.random() * 360;
      const spawn = Geo.destination(origin.lat, origin.lng, bearing, 18 + Math.random() * 6);

      const peerRecord = {
        peerId: id,
        profile: {
          firstName: names[Math.floor(Math.random() * names.length)],
          avatarUrl: null,
          preferredTimer: timers[Math.floor(Math.random() * timers.length)],
          level: 1 + Math.floor(Math.random() * 8),
          ...(overrides && overrides.profile ? overrides.profile : {})
        },
        lat: spawn.lat,
        lng: spawn.lng,
        accuracy: 6,
        simulated: true,
        lastSeen: Date.now(),
        inRange: false,
        cooldownUntil: 0,
        _approaching: true
      };

      this.peers.set(id, peerRecord);
      this._updatePresenceChip();

      // If simulation ticks aren't running (real GPS mode), drive the approach here.
      if (this.mode !== 'simulate') {
        const approach = setInterval(() => {
          const p = this.peers.get(id);
          if (!p || !p._approaching) { clearInterval(approach); return; }
          this._stepMockPeer(p);
          if (p.inRange || Date.now() - p.lastSeen > 60000) clearInterval(approach);
        }, 700);
      }

      this._dispatch('RADIA_MOCK_PEER_SPAWNED', { peerId: id, profile: peerRecord.profile });
      return id;
    }

    _advanceMockPeers() {
      this.peers.forEach((peer) => {
        if (peer.simulated && peer._approaching) this._stepMockPeer(peer);
      });
    }

    _stepMockPeer(peer) {
      if (!this.position) return;
      const brg = Geo.bearing(peer.lat, peer.lng, this.position.lat, this.position.lng);
      const step = CONFIG.SIM_PEER_APPROACH_SPEED_MS * 0.7;
      const next = Geo.destination(peer.lat, peer.lng, brg + (Math.random() - 0.5) * 18, step);

      peer.lat = next.lat;
      peer.lng = next.lng;
      peer.lastSeen = Date.now();

      this.peers.set(peer.peerId, peer);
      this._evaluatePeer(peer);
      this._updatePresenceChip();
    }

    /* ======================================================================
       UI HELPERS, PERSISTENCE & EVENT BUS
       ====================================================================== */

    _setAccuracyChip(quality, text) {
      if (!this.dom.accuracyChip) return;
      this.dom.accuracyChip.dataset.quality = quality;
      if (this.dom.accuracyText) this.dom.accuracyText.textContent = text;
    }

    _showGeoToast(title, body) {
      if (!this.dom.geoToast) return;
      this.dom.geoToast.querySelector('#geo-toast-title').textContent = title;
      this.dom.geoToast.querySelector('#geo-toast-body').textContent = body;
      this.dom.geoToast.classList.add('toast-visible');
    }

    _handleResize() {
      this._resizeFogCanvas();
      if (this.map) this.map.invalidateSize();
      this._syncRingScale();
      this._drawFog(true);
    }

    _dispatch(name, detail) {
      window.dispatchEvent(new CustomEvent(name, { detail }));
    }

    _readNumber(key, fallback) {
      try {
        const v = parseFloat(localStorage.getItem(key));
        return Number.isFinite(v) ? v : fallback;
      } catch (e) { return fallback; }
    }

    _writeNumber(key, value) {
      try { localStorage.setItem(key, String(value)); } catch (e) {}
    }

    _readJSON(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (e) { return fallback; }
    }

    _writeJSON(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
    }

    /* ======================================================================
       PUBLIC READ API (consumed by peer-sync.js, gamification.js, app.js)
       ====================================================================== */

    getState() {
      return {
        mode: this.mode,
        isAvailable: this.isAvailable,
        position: this.position ? { ...this.position } : null,
        heading: this.heading,
        totalDistanceM: this.totalDistanceM,
        totalDistanceKm: this.totalDistanceM / 1000,
        sessionDistanceM: this.sessionDistanceM,
        xpMultiplier: this.xpMultiplier,
        hotspot: this.activeHotspot,
        peerCount: this.peers.size,
        activeCollisionId: this.activeCollisionId,
        encounterRadiusM: CONFIG.ENCOUNTER_RADIUS_M,
        encounterRadiusFt: 40
      };
    }

    /** Broadcast payload for peer-sync.js (coarse + exact fix). */
    getBroadcastPayload() {
      if (!this.position) return null;
      return {
        lat: this.position.lat,
        lng: this.position.lng,
        accuracy: this.position.accuracy,
        available: this.isAvailable,
        timestamp: Date.now()
      };
    }

    resetDistance() {
      this.totalDistanceM = 0;
      this.sessionDistanceM = 0;
      this._writeNumber(CONFIG.KEY_TOTAL_DISTANCE, 0);
      this._emitDistance(0);
    }

    static get Geo() { return Geo; }
    static get CONFIG() { return CONFIG; }
  }

  /* ==========================================================================
     SINGLETON EXPORT & AUTO-BOOT
     ========================================================================== */

  const engine = new RadiaProximityEngine();
  window.RadiaProximity = engine;
  window.RadiaGeo = Geo;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => engine.init());
  } else {
    engine.init();
  }
})();