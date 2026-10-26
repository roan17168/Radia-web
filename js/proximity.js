/**
 * ============================================================================
 * RADIA — REAL-WORLD PROXIMITY & WORLD MAP ENGINE (js/proximity.js)
 * ----------------------------------------------------------------------------
 *  • Bulletproof Multi-Provider World Map Engine (Leaflet 1.9.4):
 *      - Supports 5 free global tile repositories with automatic failover:
 *          1. 'voyager'  : CartoDB Voyager (Warm Architectural Street & Park)
 *          2. 'osm'      : OpenStreetMap Standard (Global Street Detail)
 *          3. 'positron' : CartoDB Positron (Editorial Minimalist Light)
 *          4. 'topo'     : Esri World Topographic (Terrain & Park Contours)
 *          5. 'dark'     : CartoDB Dark Matter (High-Contrast Evening Map)
 *      - Uses strict integer zoom levels (DEFAULT_ZOOM: 16, zoomSnap: 1,
 *        detectRetina: false, no crossOrigin header block) and ResizeObserver
 *        invalidation so world map tiles load 100% reliably on every device.
 *      - Includes a synchronized Vector Street & Park Basemap fallback underneath
 *        the tile pane so the viewport is never blank even while tiles stream.
 *  • True Geodesic Leaflet Layers:
 *      - Native L.circle proximity boundary + inner ring calibrated to local
 *        Urban Sprawl density (18ft Urban Core, 28ft Campus/Plaza,
 *        40ft Neighborhood Park, 65ft Open Trail).
 *      - Native L.marker Apple-Maps-style Location Beacon Puck with heading cone.
 *      - Native L.polyline walking path & click-to-walk destination marker.
 *      - Clean Airbnb/Strava-style Community Hub pill pins & Nearby Member pins.
 *
 *  Public singleton: window.RadiaProximity
 * ============================================================================
 */

(function () {
  'use strict';

  const EARTH_RADIUS_M = 6371008.8;
  const M_PER_FOOT = 0.3048;

  /* ==========================================================================
     MAP TILE SOURCES
     --------------------------------------------------------------------------
     Every provider here is KEYLESS and verified to return real imagery.
     (CartoDB basemaps are intentionally NOT used: their raster endpoints now
     answer HTTP 200 with an "API KEY REQUIRED" watermark tile, which paints a
     blank grey field. That was the cause of the "map doesn't work" bug.)

     Provider keys are kept stable (voyager/osm/positron/topo/dark) because they
     are persisted in localStorage and referenced by the UI.

     If a MapTiler key is present in RadiaConfig, its matching vector-raster
     style is used instead — same keys, no other code changes.
     ========================================================================== */
  const TILE_PROVIDERS = {
    voyager: {
      id: 'voyager',
      name: 'Daylight Street',
      shortLabel: 'Daylight',
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
      maptiler: 'https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.jpg?key={key}',
      subdomains: [],
      maxNativeZoom: 19,
      attribution: 'Tiles © Esri',
      tileClass: 'radia-tiles-soft',
      isDark: false
    },
    osm: {
      id: 'osm',
      name: 'OpenStreetMap',
      shortLabel: 'Vivid',
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      maptiler: 'https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.jpg?key={key}',
      subdomains: ['a', 'b', 'c'],
      maxNativeZoom: 19,
      attribution: '© OpenStreetMap contributors',
      tileClass: 'radia-tiles-vivid',
      isDark: false
    },
    positron: {
      id: 'positron',
      name: 'Morning Gray',
      shortLabel: 'Calm',
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      maptiler: 'https://api.maptiler.com/maps/basic-v2/{z}/{x}/{y}.jpg?key={key}',
      subdomains: ['a', 'b', 'c'],
      maxNativeZoom: 19,
      attribution: '© OpenStreetMap contributors',
      tileClass: 'radia-tiles-gray',
      isDark: false
    },
    topo: {
      id: 'topo',
      name: 'Terrain',
      shortLabel: 'Terrain',
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
      maptiler: 'https://api.maptiler.com/maps/topo-v2/{z}/{x}/{y}.jpg?key={key}',
      subdomains: [],
      maxNativeZoom: 18,
      attribution: 'Tiles © Esri',
      tileClass: 'radia-tiles-terrain',
      isDark: false
    },
    dark: {
      id: 'dark',
      name: 'Evening',
      shortLabel: 'Evening',
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      maptiler: 'https://api.maptiler.com/maps/basic-v2-dark/{z}/{x}/{y}.jpg?key={key}',
      subdomains: ['a', 'b', 'c'],
      maxNativeZoom: 19,
      attribution: '© OpenStreetMap contributors',
      tileClass: 'radia-tiles-dark',
      isDark: true
    }
  };

  /** Global City Presets for Instant World Map Verification & Exploration */
  const CITY_PRESETS = {
    nyc: {
      id: 'nyc',
      name: 'New York • Washington Sq',
      shortLabel: 'NYC',
      lat: 40.730823,
      lng: -73.997332,
      sprawl: 'park_neighborhood'
    },
    sf: {
      id: 'sf',
      name: 'San Francisco • Dolores Park',
      shortLabel: 'SF',
      lat: 37.759617,
      lng: -122.426904,
      sprawl: 'campus_plaza'
    },
    london: {
      id: 'london',
      name: 'London • Regent’s Park',
      shortLabel: 'London',
      lat: 51.526535,
      lng: -0.151715,
      sprawl: 'park_neighborhood'
    },
    austin: {
      id: 'austin',
      name: 'Austin • Barton Springs',
      shortLabel: 'Austin',
      lat: 30.263911,
      lng: -97.770981,
      sprawl: 'open_trail'
    },
    tokyo: {
      id: 'tokyo',
      name: 'Tokyo • Yoyogi Park',
      shortLabel: 'Tokyo',
      lat: 35.671736,
      lng: 139.694945,
      sprawl: 'urban_core'
    }
  };

  /** Adaptive Urban Sprawl Calibration Tiers */
  const SPRAWL_ZONES = {
    urban_core: {
      id: 'urban_core',
      name: 'Dense Urban Core',
      shortLabel: 'Urban Core • 18ft',
      feet: 18,
      meters: 18 * M_PER_FOOT,
      densityPerAcre: 48,
      populationDesc: 'High Density (~48 people/block) • Tightened 18ft radius prevents sidewalk noise',
      accent: '#0284c7'
    },
    campus_plaza: {
      id: 'campus_plaza',
      name: 'Campus / Bustling Plaza',
      shortLabel: 'Campus Plaza • 28ft',
      feet: 28,
      meters: 28 * M_PER_FOOT,
      densityPerAcre: 22,
      populationDesc: 'Moderate-High Density (~22 people/plaza) • Tuned 28ft radius for quads & cafes',
      accent: '#d97706'
    },
    park_neighborhood: {
      id: 'park_neighborhood',
      name: 'Neighborhood Park',
      shortLabel: 'Park Balance • 40ft',
      feet: 40,
      meters: 40 * M_PER_FOOT,
      densityPerAcre: 8,
      populationDesc: 'Balanced Density (~8 people/acre) • Standard 40ft proximity horizon',
      accent: '#0d9488'
    },
    open_trail: {
      id: 'open_trail',
      name: 'Open Trail & Greenbelt',
      shortLabel: 'Open Trail • 65ft',
      feet: 65,
      meters: 65 * M_PER_FOOT,
      densityPerAcre: 2,
      populationDesc: 'Low Density (~2 people/trail) • Expanded 65ft discovery horizon',
      accent: '#7c3aed'
    }
  };

  const CONFIG = {
    DEFAULT_SPRAWL_ZONE: 'park_neighborhood',
    DEFAULT_PROVIDER: 'voyager',
    MAX_USABLE_ACCURACY_M: 80,
    MIN_STEP_M: 0.8,
    MAX_PLAUSIBLE_SPEED_MS: 16,
    DEFAULT_ZOOM: 17,
    MIN_ZOOM: 3,
    MAX_ZOOM: 19,
    FALLBACK_CENTER: [40.730823, -73.997332], // Washington Square Park, NYC
    COLLISION_COOLDOWN_MS: 35 * 1000,
    SIM_TICK_MS: 750,
    SIM_WALK_SPEED_MS: 2.8,
    CLICK_WALK_TICK_MS: 120,
    CLICK_WALK_SPEED_MS: 5.8,
    KEY_TOTAL_DISTANCE: 'radia_total_distance_m',
    KEY_BLOCKED_PEERS: 'radia_blocked_peers',
    KEY_LAST_POSITION: 'radia_last_position_v3',
    KEY_MAP_THEME: 'radia_map_provider_v3',
    KEY_SPRAWL_MODE: 'radia_sprawl_mode_v2',
    KEY_CITY_PRESET: 'radia_city_preset_v3',
    MAX_DPR: 2
  };

  /* Geodesic Math */
  const Geo = {
    toRad: (deg) => (deg * Math.PI) / 180,
    toDeg: (rad) => (rad * 180) / Math.PI,

    haversine(lat1, lon1, lat2, lon2) {
      const dLat = Geo.toRad(lat2 - lat1);
      const dLon = Geo.toRad(lon2 - lon1);
      const p1 = Geo.toRad(lat1);
      const p2 = Geo.toRad(lat2);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(p1) * Math.cos(p2) * Math.sin(dLon / 2) ** 2;
      return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
    },

    bearing(lat1, lon1, lat2, lon2) {
      const p1 = Geo.toRad(lat1);
      const p2 = Geo.toRad(lat2);
      const dLon = Geo.toRad(lon2 - lon1);
      const y = Math.sin(dLon) * Math.cos(p2);
      const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dLon);
      return (Geo.toDeg(Math.atan2(y, x)) + 360) % 360;
    },

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
     RADIA PROXIMITY & WORLD MAP ENGINE
     ========================================================================== */

  class RadiaProximityEngine {
    constructor() {
      this.map = null;
      this.tileLayer = null;
      this.mapReady = false;
      this.mode = 'gps'; // 'gps' | 'simulate'
      this.isAvailable = true;
      // Demo world (invented neighbours, hubs, insights) is opt-in only.
      this.demoMode = !!(window.RadiaConfig && window.RadiaConfig.get('demoMode'));
      this.watchId = null;
      this.followMode = true;

      // Map Provider & City State
      const savedProvider = localStorage.getItem(CONFIG.KEY_MAP_THEME);
      this.mapTheme = TILE_PROVIDERS[savedProvider] ? savedProvider : CONFIG.DEFAULT_PROVIDER;
      this.currentCityKey = localStorage.getItem(CONFIG.KEY_CITY_PRESET) || 'nyc';
      this.is25dTilt = false; // Always 2D crisp orthographic for 100% tile reliability
      this.tilesLoadedCount = 0;
      this.tileErrorCount = 0;

      // Sprawl Calibration State
      this.autoSprawlCalibration = true;
      this.currentSprawlKey = localStorage.getItem(CONFIG.KEY_SPRAWL_MODE) || CONFIG.DEFAULT_SPRAWL_ZONE;
      if (!SPRAWL_ZONES[this.currentSprawlKey]) {
        this.currentSprawlKey = CONFIG.DEFAULT_SPRAWL_ZONE;
      }

      // Immediate Position Initialization
      const cachedPos = this._readJSON(CONFIG.KEY_LAST_POSITION, null);
      const preset = CITY_PRESETS[this.currentCityKey] || CITY_PRESETS.nyc;
      // Only a genuine GPS fix may be restored. A cached sample location used to
      // come back as if it were the user's position, which is exactly how you end
      // up "spawning" in New York while standing in London.
      const cachedIsReal = !!(cachedPos && cachedPos.real === true && typeof cachedPos.lat === 'number');
      this.position = {
        lat: cachedIsReal ? cachedPos.lat : preset.lat,
        lng: cachedIsReal ? cachedPos.lng : preset.lng,
        accuracy: 8,
        timestamp: Date.now(),
        simulated: !cachedIsReal
      };
      this.hasRealFix = cachedIsReal;
      this.gpsError = null;
      this.lastAccruedPosition = { ...this.position };
      this.heading = 45;
      this.isWalking = false;
      this.walkStopTimeout = null;

      // Tap-to-Walk Destination Target
      this.walkTarget = null;
      this.walkTargetTimer = null;

      this.totalDistanceM = this._readNumber(CONFIG.KEY_TOTAL_DISTANCE, 340);
      this.sessionDistanceM = 0;
      this.stepToastAccumulatorM = 0;

      // Walking Path Coordinates
      this.userTrailPoints = [
        Geo.destination(this.position.lat, this.position.lng, 225, 32),
        Geo.destination(this.position.lat, this.position.lng, 225, 20),
        Geo.destination(this.position.lat, this.position.lng, 225, 9),
        { lat: this.position.lat, lng: this.position.lng }
      ];

      // Native Leaflet Layers
      this.userPuckMarker = null;
      this.sprawlOuterCircle = null;
      this.cosmeticTrail = null;
      this.cosmeticRadius = null;
      this.radiusClassName = '';
      this.sprawlInnerCircle = null;
      this.walkingPolyline = null;
      this.walkTargetLine = null;
      this.walkTargetMarker = null;

      // Community Hubs & Nearby Members
      this.landmarks = [];
      this.landmarkMarkers = [];
      this.roamingPeerMarkers = new Map();
      this.peers = new Map();
      this.activeCollisionId = null;
      this.blockedPeers = new Set(this._readJSON(CONFIG.KEY_BLOCKED_PEERS, []));

      // Hotspots
      this.activeHotspot = null;
      this.xpMultiplier = 1;

      // Simulator
      this.sim = {
        timer: null,
        roamTimer: null,
        lat: this.position.lat,
        lng: this.position.lng,
        heading: 48,
        peerCounter: 0
      };

      // Vector Fallback Basemap Canvas
      this.worldCanvas = null;
      this.worldCtx = null;
      this.resizeObserver = null;

      this.dom = {};
      this._boundResize = this._handleResize.bind(this);
    }

    get currentSprawl() {
      return SPRAWL_ZONES[this.currentSprawlKey] || SPRAWL_ZONES.park_neighborhood;
    }

    get currentProvider() {
      return TILE_PROVIDERS[this.mapTheme] || TILE_PROVIDERS.voyager;
    }

    /**
     * The bubble breathes with the crowd.
     *
     * The calibrated zone sets the floor (a dense core stays tight, an open
     * trail stays generous). When people are actually present, the bubble
     * expands just enough to contain the farthest opted-in neighbour, capped
     * at 3x the calibrated radius so proximity still means something.
     *
     * With no one nearby — the normal state of a young network — this returns
     * exactly the calibrated radius. Population drives size, not decoration.
     */
    _effectiveRadiusM() {
      const base = this.currentSprawl.meters;
      if (!this.peers || this.peers.size === 0 || !this.position) return base;

      let farthest = 0;
      this.peers.forEach((peer) => {
        if (!peer || typeof peer.lat !== 'number') return;
        const d = Geo.haversine(this.position.lat, this.position.lng, peer.lat, peer.lng);
        if (d > farthest) farthest = d;
      });

      return Math.min(base * 3, Math.max(base, farthest + 4));
    }

    init() {
      this.dom.mapEl = document.getElementById('leaflet-radar-map');
      this.dom.stage = document.getElementById('radar-world-stage') || (this.dom.mapEl && this.dom.mapEl.parentElement);
      if (!this.dom.mapEl || typeof L === 'undefined') return this;

      this.dom.overlay = document.getElementById('proximity-circle-overlay');
      this.dom.avatar = document.getElementById('radar-avatar-center');
      this.dom.hotspotBadge = document.getElementById('hotspot-badge');
      this.dom.headerDistance = document.getElementById('header-user-distance');

      this._buildFallbackBasemapCanvas();
      this._buildMap();
      this._buildNativeLeafletUserLayers();
      if (this.demoMode) {
        this._seedWorldEnvironment(this.position.lat, this.position.lng);      this._renderLandmarkMarkers();
      this._seedRoamingExplorers();
      }
      window.addEventListener('RADIA_PRESENCE_PEERS', (event) => {
        this._ingestPresencePeers(event && event.detail ? event.detail.peers : []);
      });
      this._bindExternalButtons();
      this._setupResizeObserver();

      this.setMapTheme(this.mapTheme);
      this.setSprawlZone(this.currentSprawlKey, this.autoSprawlCalibration);

      window.addEventListener('resize', this._boundResize, { passive: true });
      window.addEventListener('orientationchange', this._boundResize, { passive: true });

      this._evaluateHotspots();
      this._emitDistance(0);
      this._updatePaceAndCoordsHUD(false);
      this.startGPS();
      this._startRoamingExplorersLoop();

      return this;
    }

    /* ======================================================================
       VECTOR FALLBACK BASEMAP CANVAS (UNDERNEATH LEAFLET TILES)
       Ensures rich street/park grid is immediately visible while tiles load
       ====================================================================== */

    _buildFallbackBasemapCanvas() {
      if (!this.dom.stage) return;
      let canvas = document.getElementById('radar-world-canvas');
      if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.id = 'radar-world-canvas';
        canvas.setAttribute('aria-hidden', 'true');
        this.dom.stage.insertBefore(canvas, this.dom.mapEl);
      }
      this.worldCanvas = canvas;
      this.worldCtx = canvas.getContext('2d');
      this._resizeCanvases();
      this._drawFallbackBasemap();
    }

    _resizeCanvases() {
      if (!this.dom.stage || !this.worldCanvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, CONFIG.MAX_DPR);
      const rect = this.dom.stage.getBoundingClientRect();
      const w = Math.max(320, rect.width || window.innerWidth);
      const h = Math.max(480, rect.height || window.innerHeight);

      this.worldCanvas.width = Math.floor(w * dpr);
      this.worldCanvas.height = Math.floor(h * dpr);
      this.worldCanvas.style.width = `${w}px`;
      this.worldCanvas.style.height = `${h}px`;

      this.canvasDpr = dpr;
      this.canvasW = w;
      this.canvasH = h;
    }

    _drawFallbackBasemap() {
      if (!this.worldCtx || !this.canvasW) return;
      const ctx = this.worldCtx;
      const dpr = this.canvasDpr || 1;
      const W = this.canvasW;
      const H = this.canvasH;
      const isDark = this.currentProvider.isDark || document.documentElement.classList.contains('theme-dark');

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = isDark ? '#0f172a' : '#eef2f6';
      ctx.fillRect(0, 0, W, H);

      // Park & Greenbelt polygons
      ctx.fillStyle = isDark ? 'rgba(16, 185, 129, 0.08)' : 'rgba(187, 247, 208, 0.45)';
      ctx.beginPath();
      ctx.roundRect(W * 0.14, H * 0.18, W * 0.72, H * 0.64, 28);
      ctx.fill();

      // Architectural street grid lines
      ctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.12)' : 'rgba(255, 255, 255, 0.85)';
      ctx.lineWidth = 10;
      const step = 95;
      for (let x = (W % step) / 2; x < W; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
      for (let y = (H % step) / 2; y < H; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }

      // Diagonal pedestrian promenade
      ctx.strokeStyle = isDark ? 'rgba(45, 212, 191, 0.14)' : 'rgba(13, 148, 136, 0.14)';
      ctx.lineWidth = 4;
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.moveTo(W * 0.15, H * 0.82);
      ctx.lineTo(W * 0.85, H * 0.18);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    _setupResizeObserver() {
      if (typeof ResizeObserver === 'undefined' || !this.dom.stage) return;
      this.resizeObserver = new ResizeObserver(() => {
        this._resizeCanvases();
        this._drawFallbackBasemap();
        if (this.map) {
          this.map.invalidateSize({ pan: false });
        }
      });
      this.resizeObserver.observe(this.dom.stage);
    }

    /* ======================================================================
       SEED COMMUNITY HUBS & NEARBY MEMBERS
       ====================================================================== */

    _seedWorldEnvironment(centerLat, centerLng) {
      this.landmarks = [
        {
          id: 'spot_fountain',
          name: 'Central Fountain Plaza',
          archetype: 'water',
          badge: 'Community Hub • 2x Points',
          multiplier: 2,
          radius: 48,
          color: '#0284c7',
          ...Geo.destination(centerLat, centerLng, 42, 46)
        },
        {
          id: 'spot_grove',
          name: 'Founders Oak Grove',
          archetype: 'park',
          badge: 'Park Hub • 2x Credits',
          multiplier: 2,
          radius: 52,
          color: '#0d9488',
          ...Geo.destination(centerLat, centerLng, 132, 54)
        },
        {
          id: 'spot_bench',
          name: 'West Park Overlook',
          archetype: 'overlook',
          badge: 'Quiet Overlook • 2.5x Credits',
          multiplier: 2.5,
          radius: 48,
          color: '#7c3aed',
          ...Geo.destination(centerLat, centerLng, 228, 48)
        },
        {
          id: 'spot_plaza',
          name: 'Solar Commons Terrace',
          archetype: 'plaza',
          badge: 'Commons Hub • 2x Points',
          multiplier: 2,
          radius: 55,
          color: '#d97706',
          ...Geo.destination(centerLat, centerLng, 315, 52)
        }
      ];
    }

    _seedRoamingExplorers() {
      // Clear old markers when re-seeding for a new city
      this.roamingPeerMarkers.forEach((m) => m.remove());
      this.roamingPeerMarkers.clear();
      this.peers.clear();

      const seeds = [
        {
          peerId: 'sim_peer_jordan',
          firstName: 'Jordan',
          preferredTimer: 180,
          level: 3,
          bioTag: 'Walking near Central Fountain Plaza',
          contactHandle: '@jordan.radia',
          color: '#0d9488',
          bearing: 68,
          distM: 95,
          walkHeading: 155
        },
        {
          peerId: 'sim_peer_mina',
          firstName: 'Mina',
          preferredTimer: 300,
          level: 4,
          bioTag: 'Strolling through Founders Oak Grove',
          contactHandle: '@mina.radia',
          color: '#0284c7',
          bearing: 160,
          distM: 165,
          walkHeading: 250
        },
        {
          peerId: 'sim_peer_theo',
          firstName: 'Theo',
          preferredTimer: 180,
          level: 2,
          bioTag: 'Reading by West Park Overlook',
          contactHandle: '@theo.radia',
          color: '#d97706',
          bearing: 252,
          distM: 235,
          walkHeading: 40
        },
        {
          peerId: 'sim_peer_sasha',
          firstName: 'Sasha',
          preferredTimer: 300,
          level: 5,
          bioTag: 'Walking the Solar Commons loop',
          contactHandle: '@sasha.radia',
          color: '#7c3aed',
          bearing: 335,
          distM: 310,
          walkHeading: 120
        }
      ];

      seeds.forEach((s) => {
        const coords = Geo.destination(this.position.lat, this.position.lng, s.bearing, s.distM);
        const peerObj = {
          peerId: s.peerId,
          profile: {
            firstName: s.firstName,
            preferredTimer: s.preferredTimer,
            level: s.level,
            bioTag: s.bioTag,
            contactHandle: s.contactHandle
          },
          color: s.color,
          lat: coords.lat,
          lng: coords.lng,
          walkHeading: s.walkHeading,
          accuracy: 5,
          simulated: true,
          roaming: true,
          lastSeen: Date.now(),
          inRange: false,
          cooldownUntil: Date.now() + 4000
        };
        this.peers.set(s.peerId, peerObj);
      });

      this._renderRoamingExplorerMarkers();
      this._updatePresenceChip();
    }

    /* ======================================================================
       LEAFLET WORLD MAP CONSTRUCTION & MULTI-PROVIDER AUTO-FAILOVER
       ====================================================================== */

    _buildMap() {
      this.map = L.map(this.dom.mapEl, {
        zoomControl: false,
        attributionControl: false,
        dragging: true,
        doubleClickZoom: true,
        scrollWheelZoom: true,
        touchZoom: true,
        inertia: true,
        zoomSnap: 1,
        zoomDelta: 1,
        minZoom: CONFIG.MIN_ZOOM,
        maxZoom: CONFIG.MAX_ZOOM,
        preferCanvas: true
      }).setView([this.position.lat, this.position.lng], CONFIG.DEFAULT_ZOOM);

      this._applyTileProvider(this.mapTheme);
      this._updateMapLayersDisplayLabel();

      this.map.on('dragstart', () => {
        this.followMode = false;
        const recenterBtn = document.getElementById('btn-recenter-map');
        if (recenterBtn) recenterBtn.classList.add('active');
      });

      // Click anywhere on the map to walk smoothly to that coordinate
      this.map.on('click', (e) => {
        if (!e || !e.latlng) return;
        this.walkToCoordinates(e.latlng.lat, e.latlng.lng);
      });

      this.mapReady = true;
      setTimeout(() => {
        if (this.map) this.map.invalidateSize();
      }, 80);
      setTimeout(() => {
        if (this.map) this.map.invalidateSize();
      }, 350);
    }

    _applyTileProvider(providerKey) {
      if (!this.map) return;
      const provider = TILE_PROVIDERS[providerKey] || TILE_PROVIDERS.voyager;

      if (this.tileLayer) {
        this.map.removeLayer(this.tileLayer);
        this.tileLayer = null;
      }

      this.tilesLoadedCount = 0;
      this.tileErrorCount = 0;
      this._updateTileStatusUI('loading', provider);

      const opts = {
        maxZoom: CONFIG.MAX_ZOOM,
        maxNativeZoom: provider.maxNativeZoom || 19,
        detectRetina: false,
        updateWhenIdle: false,
        keepBuffer: 4,
        crossOrigin: false
      };
      if (provider.subdomains && provider.subdomains.length) {
        opts.subdomains = provider.subdomains;
      }
      if (provider.tileClass) {
        opts.className = provider.tileClass;
      }

      // MapTiler is used only when the user supplies their own key.
      const hasKey = window.RadiaConfig && window.RadiaConfig.hasMapKey();
      const tileUrl = hasKey && provider.maptiler
        ? provider.maptiler.replace('{key}', encodeURIComponent(window.RadiaConfig.get('maptilerKey')))
        : provider.url;

      const layer = L.tileLayer(tileUrl, opts);

      layer.on('tileload', () => {
        this.tilesLoadedCount++;
        if (this.tilesLoadedCount === 1) {
          this._updateTileStatusUI('live', provider);
        }
      });

      layer.on('load', () => {
        this._updateTileStatusUI('live', provider);
      });

      // No silent failover: a dead CDN must be reported, not papered over with
      // another provider the user did not choose.
      layer.on('tileerror', () => {
        this.tileErrorCount++;
        if (this.tilesLoadedCount === 0 && this.tileErrorCount === 6) {
          this._updateTileStatusUI('error', provider);
        }
      });

      layer.addTo(this.map);
      this.tileLayer = layer;
      this._drawFallbackBasemap();
      this._markActiveProvider();
    }

    _markActiveProvider() {
      document.querySelectorAll('.map-provider-btn').forEach((btn) => {
        btn.classList.toggle('is-active', btn.getAttribute('data-provider') === this.mapTheme);
      });
    }

    _updateTileStatusUI(state, provider) {
      const pill = document.getElementById('map-tile-status-pill');
      const p = provider || this.currentProvider;
      if (pill) {
        if (state === 'live') {
          pill.innerHTML = `<span class="w-2 h-2 rounded-full bg-teal-500"></span><span>${p.shortLabel}</span>`;
          pill.dataset.state = 'live';
        } else if (state === 'error') {
          pill.innerHTML = `<span class="w-2 h-2 rounded-full bg-rose-500"></span><span>Map tiles unavailable</span>`;
          pill.dataset.state = 'error';
        } else {
          pill.innerHTML = `<span class="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span><span>Loading ${p.shortLabel}...</span>`;
          pill.dataset.state = 'loading';
        }
      }
      this._updateMapLayersDisplayLabel();
    }

    _updateMapLayersDisplayLabel() {
      const labelEl = document.getElementById('map-layers-display-label');
      if (!labelEl) return;
      const cityShortMap = {
        nyc: 'NYC',
        sf: 'SF',
        london: 'LDN',
        austin: 'ATX',
        tokyo: 'TYO'
      };
      const cityShort = cityShortMap[this.currentCityKey] || 'NYC';
      const p = this.currentProvider;
      labelEl.textContent = `${cityShort} · ${p.shortLabel}`;
      const attr = document.getElementById('map-attribution-text');
      if (attr) attr.textContent = p.attribution || '';
    }

    /**
     * People have no photo in a fresh network, so a person is an initial on a
     * disc — never an invented cartoon face.
     */
    _getNeighborAvatarSVG(name, accentColor = '#0b4f3f') {
      const initials = String(name || '?')
        .replace(/[^\p{L}\s'-]/gu, '')
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((word) => (word ? word[0].toUpperCase() : ''))
        .join('') || '?';

      return `<svg viewBox="0 0 48 48" class="w-full h-full" aria-hidden="true">
        <circle cx="24" cy="24" r="24" fill="${accentColor}" />
        <text x="24" y="25" text-anchor="middle" dominant-baseline="central"
          font-family="Instrument Sans, sans-serif" font-size="17" font-weight="600"
          fill="#FCFBF7">${initials}</text>
      </svg>`;
    }

    _legacyNeighborAvatarSVG(name, accentColor = '#0d9488') {
      const key = String(name || '').toLowerCase();
      if (key.includes('mina')) {
        return `<svg viewBox="0 0 24 24" class="w-full h-full"><circle cx="12" cy="12" r="12" fill="${accentColor}"/><path d="M5 12 C5 6, 19 6, 19 12 L19 16 L5 16 Z" fill="#1e293b"/><circle cx="12" cy="12.5" r="5.5" fill="#fde68a"/><path d="M6.5 11 C8 7.5, 16 7.5, 17.5 11" fill="#1e293b"/><circle cx="10" cy="12.5" r="0.9" fill="#0f172a"/><circle cx="14" cy="12.5" r="0.9" fill="#0f172a"/><path d="M10.5 15 Q12 16.3 13.5 15" fill="none" stroke="#0f172a" stroke-width="1.1" stroke-linecap="round"/></svg>`;
      }
      if (key.includes('theo')) {
        return `<svg viewBox="0 0 24 24" class="w-full h-full"><circle cx="12" cy="12" r="12" fill="${accentColor}"/><circle cx="12" cy="13" r="5.5" fill="#fed7aa"/><path d="M6.5 10.5 C6.5 6, 17.5 6, 17.5 10.5 Z" fill="#78350f"/><rect x="8" y="11.2" width="3.2" height="2.4" rx="0.8" fill="none" stroke="#0f172a" stroke-width="1"/><rect x="12.8" y="11.2" width="3.2" height="2.4" rx="0.8" fill="none" stroke="#0f172a" stroke-width="1"/><line x1="11.2" y1="12.2" x2="12.8" y2="12.2" stroke="#0f172a" stroke-width="1"/><path d="M10.5 15.5 Q12 16.6 13.5 15.5" fill="none" stroke="#0f172a" stroke-width="1.1" stroke-linecap="round"/></svg>`;
      }
      if (key.includes('sasha')) {
        return `<svg viewBox="0 0 24 24" class="w-full h-full"><circle cx="12" cy="12" r="12" fill="${accentColor}"/><circle cx="12" cy="6" r="3" fill="#31102f"/><circle cx="12" cy="13" r="5.5" fill="#fcd34d"/><path d="M6.5 11.5 C7.5 7.5, 16.5 7.5, 17.5 11.5" fill="#31102f"/><circle cx="10" cy="12.8" r="0.9" fill="#0f172a"/><circle cx="14" cy="12.8" r="0.9" fill="#0f172a"/><path d="M10.4 15.2 Q12 16.6 13.6 15.2" fill="none" stroke="#0f172a" stroke-width="1.1" stroke-linecap="round"/></svg>`;
      }
      return `<svg viewBox="0 0 24 24" class="w-full h-full"><circle cx="12" cy="12" r="12" fill="${accentColor}"/><circle cx="12" cy="13" r="5.5" fill="#ffedd5"/><path d="M6.5 11 C6.5 6.2, 17.5 6.2, 17.5 11 Z" fill="#0f172a"/><path d="M6 10.5 H19" stroke="#f59e0b" stroke-width="1.6" stroke-linecap="round"/><circle cx="10" cy="12.8" r="0.9" fill="#0f172a"/><circle cx="14" cy="12.8" r="0.9" fill="#0f172a"/><path d="M10.4 15.2 Q12 16.5 13.6 15.2" fill="none" stroke="#0f172a" stroke-width="1.1" stroke-linecap="round"/></svg>`;
    }

    /* ======================================================================
       NATIVE LEAFLET GEODESIC LAYERS (USER PUCK, SPRAWL CIRCLE, WALK TRAIL)
       ====================================================================== */

    _buildNativeLeafletUserLayers() {
      if (!this.map) return;

      const zone = this.currentSprawl;

      // 1 & 2. The radius bubble, painted by the equipped radius cosmetic.
      this._buildRadiusCircles();

      // 3. Walking Trail Polyline
      const trailStyle = this.cosmeticTrail || {};
      this.walkingPolyline = L.polyline(
        this.userTrailPoints.map((p) => [p.lat, p.lng]),
        {
          color: trailStyle.color || '#0d9488',
          weight: trailStyle.weight || 3,
          opacity: trailStyle.opacity || 0.6,
          lineCap: 'round',
          lineJoin: 'round',
          dashArray: trailStyle.dashArray || '1, 7',
          interactive: false
        }
      ).addTo(this.map);

      // 4. Your wayfinder beacon: a glass compass disc that carries a light.
      const puckHtml = `
        <div class="user-puck-container" id="radia-strider-puck" title="Your location · ${zone.feet} ft radius" aria-label="Your location">
          <div class="user-puck-pulse"></div>
          <div class="user-puck-pulse user-puck-pulse--delay"></div>
          <div class="beacon-aura" aria-hidden="true">
            <span></span><span></span><span></span><span></span><span></span><span></span>
          </div>
          <div class="user-puck-heading" id="leaflet-puck-heading" style="transform: rotate(${this.heading || 0}deg)">
            <span class="user-puck-heading-arrow"></span>
          </div>
          <div class="user-dot">
            <span class="user-beacon-star" aria-hidden="true"></span>
            <span class="user-dot-core" aria-hidden="true"></span>
          </div>
        </div>
      `;

      this.userPuckMarker = L.marker([this.position.lat, this.position.lng], {
        icon: L.divIcon({
          className: 'radia-user-puck-marker',
          html: puckHtml,
          iconSize: [68, 68],
          iconAnchor: [34, 34]
        }),
        zIndexOffset: 1000
      }).addTo(this.map);

      this.userPuckMarker.on('click', (ev) => {
        if (ev && ev.originalEvent) ev.originalEvent.stopPropagation();
        this.spawnFloatingReward(`Active Radius: ${this.currentSprawl.feet}ft (${this.currentSprawl.name})`);
      });

      this.applyCosmetics();
    }

    /* ------------------------------------------------------------------
       COSMETICS — radius + trail are real map layers, not just colour.
       ------------------------------------------------------------------ */

    _equippedCosmetic(slot) {
      const g = window.RadiaGamification;
      if (!g || typeof g.getEquippedCosmetic !== 'function') return null;
      return g.getEquippedCosmetic(slot) || null;
    }

    _buildRadiusCircles() {
      if (!this.map || !this.position) return;
      const zone = this.currentSprawl;
      const radiusM = this._effectiveRadiusM();
      const s = this.cosmeticRadius;

      this.radiusClassName = (s && s.className) || '';

      if (this.sprawlOuterCircle) {
        this.map.removeLayer(this.sprawlOuterCircle);
        this.sprawlOuterCircle = null;
      }
      if (this.sprawlInnerCircle) {
        this.map.removeLayer(this.sprawlInnerCircle);
        this.sprawlInnerCircle = null;
      }

      this.sprawlOuterCircle = L.circle([this.position.lat, this.position.lng], {
        radius: radiusM,
        color: (s && s.color) || zone.accent,
        weight: (s && s.weight) || 1.5,
        opacity: (s && typeof s.opacity === 'number') ? s.opacity : 0.72,
        fillColor: (s && (s.fillColor || s.color)) || zone.accent,
        fillOpacity: (s && typeof s.fillOpacity === 'number') ? s.fillOpacity : 0.075,
        dashArray: (s && s.dashArray) || null,
        className: this.radiusClassName,
        interactive: false
      }).addTo(this.map);

      const inner = (s && s.inner) || {};
      this.sprawlInnerCircle = L.circle([this.position.lat, this.position.lng], {
        radius: radiusM * 0.52,
        color: inner.color || (s && s.color) || zone.accent,
        weight: typeof inner.weight === 'number' ? inner.weight : 1,
        opacity: typeof inner.opacity === 'number' ? inner.opacity : 0.45,
        dashArray: inner.dashArray || null,
        fillOpacity: 0,
        interactive: false
      }).addTo(this.map);
    }

    _applyRadiusStyle() {
      if (!this.sprawlOuterCircle && !this.sprawlInnerCircle) return;
      const zone = this.currentSprawl;
      const s = this.cosmeticRadius;
      const inner = (s && s.inner) || {};

      if (this.sprawlOuterCircle) {
        this.sprawlOuterCircle.setStyle(s ? {
          color: s.color,
          weight: s.weight,
          opacity: typeof s.opacity === 'number' ? s.opacity : 0.72,
          fillColor: s.fillColor || s.color,
          fillOpacity: typeof s.fillOpacity === 'number' ? s.fillOpacity : 0.075,
          dashArray: s.dashArray || null
        } : {
          color: zone.accent, weight: 1.5, opacity: 0.72,
          fillColor: zone.accent, fillOpacity: 0.075, dashArray: null
        });
      }

      if (this.sprawlInnerCircle) {
        this.sprawlInnerCircle.setStyle(s ? {
          color: inner.color || s.color,
          weight: typeof inner.weight === 'number' ? inner.weight : 1,
          opacity: typeof inner.opacity === 'number' ? inner.opacity : 0.4,
          dashArray: inner.dashArray || null
        } : {
          color: zone.accent, weight: 1, opacity: 0.45, dashArray: '4, 7'
        });
      }
    }

    /* Called by the gamification engine on load and after every equip. */
    applyCosmetics() {
      const trail = this._equippedCosmetic('trail');
      const radius = this._equippedCosmetic('radius');
      this.cosmeticTrail = (trail && trail.style) || null;
      this.cosmeticRadius = (radius && radius.style) || null;

      if (this.walkingPolyline && this.cosmeticTrail) {
        const t = this.cosmeticTrail;
        this.walkingPolyline.setStyle({
          color: t.color,
          weight: t.weight,
          opacity: t.opacity,
          dashArray: t.dashArray || null,
          lineCap: 'round',
          lineJoin: 'round'
        });
      }

      if (this.sprawlOuterCircle || this.sprawlInnerCircle) {
        const nextClass = (this.cosmeticRadius && this.cosmeticRadius.className) || '';
        if (nextClass !== this.radiusClassName) {
          this._buildRadiusCircles();
        } else {
          this._applyRadiusStyle();
        }
      }

      return this;
    }

    _syncNativeLeafletUserLayers() {
      if (!this.map || !this.position) return;
      const latlng = [this.position.lat, this.position.lng];
      const zone = this.currentSprawl;

      if (this.userPuckMarker) {
        this.userPuckMarker.setLatLng(latlng);
        const el = this.userPuckMarker.getElement();
        if (el) {
          const headingEl = el.querySelector('.user-puck-heading');
          if (headingEl) {
            headingEl.style.transform = `rotate(${this.heading || 0}deg)`;
          }
          const puckContainer = el.querySelector('.user-puck-container');
          if (puckContainer) {
            puckContainer.classList.toggle('is-walking', !!(this.walkTarget || this.mode === 'simulate' || this.isWalking));
          }
        }
      }

      if (this.sprawlOuterCircle) {
        this.sprawlOuterCircle.setLatLng(latlng);
        this.sprawlOuterCircle.setRadius(this._effectiveRadiusM());
      }

      if (this.sprawlInnerCircle) {
        this.sprawlInnerCircle.setLatLng(latlng);
        this.sprawlInnerCircle.setRadius(this._effectiveRadiusM() * 0.52);
      }

      // The equipped radius cosmetic owns the stroke; fall back to the zone.
      this._applyRadiusStyle();

      if (this.walkingPolyline) {
        this.walkingPolyline.setLatLngs(this.userTrailPoints.map((p) => [p.lat, p.lng]));
      }

      if (this.walkTarget) {
        const destLatLng = [this.walkTarget.lat, this.walkTarget.lng];
        if (!this.walkTargetLine) {
          this.walkTargetLine = L.polyline([latlng, destLatLng], {
            color: '#d97706',
            weight: 3,
            dashArray: '6, 6',
            opacity: 0.85,
            interactive: false
          }).addTo(this.map);
        } else {
          this.walkTargetLine.setLatLngs([latlng, destLatLng]);
        }

        if (!this.walkTargetMarker) {
          this.walkTargetMarker = L.circleMarker(destLatLng, {
            radius: 6,
            color: '#ffffff',
            weight: 2,
            fillColor: '#d97706',
            fillOpacity: 1,
            interactive: false
          }).addTo(this.map);
        } else {
          this.walkTargetMarker.setLatLng(destLatLng);
        }
      } else {
        if (this.walkTargetLine) {
          this.walkTargetLine.remove();
          this.walkTargetLine = null;
        }
        if (this.walkTargetMarker) {
          this.walkTargetMarker.remove();
          this.walkTargetMarker = null;
        }
      }
    }

    /* ======================================================================
       POKÉSTOP-STYLE FLOATING HUB BEACONS & COMPACT NEIGHBOR RADAR ORBS
       ====================================================================== */

    _renderLandmarkMarkers() {
      if (!this.map) return;
      this.landmarkMarkers.forEach((m) => m.remove());
      this.landmarkMarkers = [];

      this.landmarks.forEach((spot) => {
        const isInRange = this.activeHotspot && this.activeHotspot.id === spot.id;
        const primaryColor = spot.color || '#0d9488';
        const iconHtml = `
          <div class="pokestop-hub-beacon ${isInRange ? 'is-in-range' : ''}"
               data-spot-id="${spot.id}"
               style="--beacon-color: ${primaryColor};"
               title="Tap to inspect or check in at ${spot.name} (${spot.multiplier}x)"
               aria-label="${spot.name} (${spot.multiplier}x Credits)">
            <span class="pokestop-hover-label">${spot.name}</span>

            <svg class="pokestop-beacon-svg" viewBox="0 0 48 64" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="facetLight_${spot.id}" x1="12" y1="6" x2="24" y2="34" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stop-color="#ffffff" stop-opacity="0.92" />
                  <stop offset="100%" stop-color="${primaryColor}" />
                </linearGradient>
                <linearGradient id="facetDark_${spot.id}" x1="24" y1="6" x2="36" y2="34" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stop-color="${primaryColor}" />
                  <stop offset="100%" stop-color="#0f172a" stop-opacity="0.88" />
                </linearGradient>
              </defs>

              <!-- 1. Ground Pedestal Disc & Ripple (Anchored at 24, 56) -->
              <ellipse class="pokestop-ground-ripple" cx="24" cy="56" rx="15" ry="5.5" stroke="${primaryColor}" stroke-width="1.5" />
              <ellipse cx="24" cy="56" rx="10" ry="3.8" fill="#0f172a" fill-opacity="0.78" stroke="#ffffff" stroke-width="1.3" />
              <circle cx="24" cy="56" r="2.2" fill="${primaryColor}" />

              <!-- 2. Vertical Laser Tether Stem -->
              <line x1="24" y1="55" x2="24" y2="34" stroke="${primaryColor}" stroke-width="2.2" stroke-linecap="round" />
              <line x1="24" y1="55" x2="24" y2="34" stroke="#ffffff" stroke-width="0.9" stroke-dasharray="2 2" />

              <!-- 3. Floating Gyroscopic Ring + 3D Octahedron Crystal -->
              <g class="pokestop-floating-head">
                <ellipse class="pokestop-gyro-ring" cx="24" cy="20" rx="17" ry="6.8" stroke="${primaryColor}" stroke-width="1.8" stroke-dasharray="5 3" fill="rgba(255,255,255,0.18)" />
                <polygon points="24,5 13,20 24,24" fill="url(#facetLight_${spot.id})" />
                <polygon points="24,5 35,20 24,24" fill="url(#facetDark_${spot.id})" />
                <polygon points="13,20 24,35 24,24" fill="${primaryColor}" opacity="0.88" />
                <polygon points="35,20 24,35 24,24" fill="#0f172a" opacity="0.68" />
                <polygon points="24,5 35,20 24,35 13,20" stroke="#ffffff" stroke-width="1.2" fill="none" />
                <circle cx="24" cy="20" r="3.2" fill="#fef08a" stroke="#ffffff" stroke-width="1" />
              </g>
            </svg>

            <span class="pokestop-mult-chip">${spot.multiplier}x</span>
          </div>
        `;

        const marker = L.marker([spot.lat, spot.lng], {
          icon: L.divIcon({
            className: 'radia-landmark-marker',
            html: iconHtml,
            iconSize: [48, 64],
            iconAnchor: [24, 56]
          })
        }).addTo(this.map);

        marker.on('click', (ev) => {
          if (ev && ev.originalEvent) ev.originalEvent.stopPropagation();
          this.openEntityInspector({ type: 'hub', data: spot });
        });

        this.landmarkMarkers.push(marker);
      });
    }

    _renderRoamingExplorerMarkers() {
      if (!this.map) return;

      this.peers.forEach((peer) => {
        if (this.blockedPeers.has(peer.peerId)) {
          const old = this.roamingPeerMarkers.get(peer.peerId);
          if (old) old.remove();
          this.roamingPeerMarkers.delete(peer.peerId);
          return;
        }

        const distM = Geo.haversine(this.position.lat, this.position.lng, peer.lat, peer.lng);
        const distFt = Math.round(Geo.metersToFeet(distM));
        const name = (peer.profile && peer.profile.firstName) || 'Member';
        const color = peer.color || '#0d9488';
        const avatarSvg = this._getNeighborAvatarSVG(name, color);
        const inBubble = distM <= this._effectiveRadiusM();

        const html = `
          <div class="neighbor-orb-pin ${inBubble ? 'is-in-bubble' : ''}"
               style="--neighbor-color: ${color};"
               title="Tap to inspect or connect with ${name} (${distFt}ft away)"
               aria-label="${name} (${distFt}ft away)">
            <span class="neighbor-orb-hover-name">${name}</span>
            <div class="neighbor-orb-frame">
              <div class="neighbor-orb-avatar">${avatarSvg}</div>
              <span class="neighbor-orb-status-dot"></span>
            </div>
            <div class="neighbor-orb-pointer"></div>
            <span class="neighbor-orb-dist">${distFt}ft</span>
          </div>
        `;

        let marker = this.roamingPeerMarkers.get(peer.peerId);
        if (!marker) {
          marker = L.marker([peer.lat, peer.lng], {
            icon: L.divIcon({
              className: 'radia-roaming-peer-marker',
              html,
              iconSize: [44, 52],
              iconAnchor: [22, 48]
            })
          }).addTo(this.map);

          marker.on('click', (ev) => {
            if (ev && ev.originalEvent) ev.originalEvent.stopPropagation();
            this.openEntityInspector({ type: 'member', data: peer });
          });

          this.roamingPeerMarkers.set(peer.peerId, marker);
        } else {
          marker.setLatLng([peer.lat, peer.lng]);
          const el = marker.getElement();
          if (el) {
            const distEl = el.querySelector('.neighbor-orb-dist');
            if (distEl) distEl.textContent = `${distFt}ft`;
            const pinEl = el.querySelector('.neighbor-orb-pin');
            if (pinEl) pinEl.classList.toggle('is-in-bubble', inBubble);
          }
        }
      });
    }

    /**
     * Opens the floating Map Entity & Nearby Inspector Card above the bottom controls.
     */
    openEntityInspector(entity) {
      const box = document.getElementById('map-entity-inspector');
      if (!box || !entity) return;

      if (entity.type === 'hub') {
        const spot = entity.data;
        const distM = Geo.haversine(this.position.lat, this.position.lng, spot.lat, spot.lng);
        const distFt = Math.round(Geo.metersToFeet(distM));
        box.innerHTML = `
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2.5">
              <span class="w-3.5 h-3.5 rounded-full flex-shrink-0" style="background:${spot.color}"></span>
              <div>
                <div class="flex items-center gap-1.5">
                  <h4 class="text-xs font-extrabold text-slate-900">${spot.name}</h4>
                  <span class="px-2 py-0.2 rounded-full bg-teal-500/15 text-teal-700 text-[10px] font-mono-code font-bold">${spot.multiplier}x Credits</span>
                </div>
                <p class="text-[11px] text-slate-500">${distFt}ft (${Math.round(distM)}m) away • ${spot.badge}</p>
              </div>
            </div>
            <button type="button" id="btn-close-entity-inspector" class="btn-glass p-1 rounded-full text-slate-500">✕</button>
          </div>
          <div class="grid grid-cols-2 gap-2 pt-2">
            <button type="button" id="btn-inspector-walk-here" class="btn-glass py-1.5 px-3 rounded-xl text-xs font-bold text-slate-700">Walk Here (${distFt}ft)</button>
            <button type="button" id="btn-inspector-checkin" class="btn-emerald py-1.5 px-3 rounded-xl text-xs font-bold">Check In (+45 Credits)</button>
          </div>
        `;
        box.classList.remove('hidden');

        const closeBtn = box.querySelector('#btn-close-entity-inspector');
        if (closeBtn) closeBtn.addEventListener('click', () => this.closeEntityInspector());

        const walkBtn = box.querySelector('#btn-inspector-walk-here');
        if (walkBtn) {
          walkBtn.addEventListener('click', () => {
            this.walkToCoordinates(spot.lat, spot.lng);
            this.closeEntityInspector();
          });
        }

        const checkInBtn = box.querySelector('#btn-inspector-checkin');
        if (checkInBtn) {
          checkInBtn.addEventListener('click', () => {
            this.harvestSpot(spot);
            this.closeEntityInspector();
          });
        }
      } else if (entity.type === 'member') {
        const peer = entity.data;
        const distM = Geo.haversine(this.position.lat, this.position.lng, peer.lat, peer.lng);
        const distFt = Math.round(Geo.metersToFeet(distM));
        const name = (peer.profile && peer.profile.firstName) || 'Neighbor';
        const bio = (peer.profile && peer.profile.bioTag) || 'Walking nearby';
        const timerMin = peer.profile && peer.profile.preferredTimer ? Math.round(peer.profile.preferredTimer / 60) + 'm Comfort Limit' : '3m Comfort Limit';
        const avatarSvg = this._getNeighborAvatarSVG(name, peer.color || '#0d9488');

        box.innerHTML = `
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2.5">
              <span class="w-7 h-7 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0 shadow-sm">${avatarSvg}</span>
              <div>
                <div class="flex items-center gap-1.5">
                  <h4 class="text-xs font-extrabold text-slate-900">${name}</h4>
                  <span class="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 text-[10px] font-mono-code font-bold">${timerMin}</span>
                </div>
                <p class="text-[11px] text-slate-500">${distFt}ft (${Math.round(distM)}m) away • ${bio}</p>
              </div>
            </div>
            <button type="button" id="btn-close-entity-inspector" class="btn-glass p-1 rounded-full text-slate-500">✕</button>
          </div>
          <div class="grid grid-cols-2 gap-2 pt-2">
            <button type="button" id="btn-inspector-walk-here" class="btn-glass py-1.5 px-3 rounded-xl text-xs font-bold text-slate-700">Walk to ${name}</button>
            <button type="button" id="btn-inspector-connect" class="btn-emerald py-1.5 px-3 rounded-xl text-xs font-bold">Start Dialogue</button>
          </div>
        `;
        box.classList.remove('hidden');

        const closeBtn = box.querySelector('#btn-close-entity-inspector');
        if (closeBtn) closeBtn.addEventListener('click', () => this.closeEntityInspector());

        const walkBtn = box.querySelector('#btn-inspector-walk-here');
        if (walkBtn) {
          walkBtn.addEventListener('click', () => {
            this.walkToCoordinates(peer.lat, peer.lng);
            this.closeEntityInspector();
          });
        }

        const connectBtn = box.querySelector('#btn-inspector-connect');
        if (connectBtn) {
          connectBtn.addEventListener('click', () => {
            this.closeEntityInspector();
            this._fireCollision(peer, Math.min(distM, this.currentSprawl.meters * 0.85));
          });
        }
      }
    }

    openNearbyDirectory() {
      const box = document.getElementById('map-entity-inspector');
      if (!box) return;
      if (!box.classList.contains('hidden') && box.getAttribute('data-mode') === 'directory') {
        this.closeEntityInspector();
        return;
      }

      const peerItems = Array.from(this.peers.values()).slice(0, 4).map((peer) => {
        const distFt = Math.round(Geo.metersToFeet(Geo.haversine(this.position.lat, this.position.lng, peer.lat, peer.lng)));
        const name = (peer.profile && peer.profile.firstName) || 'Member';
        return `
          <button type="button" class="btn-glass px-2.5 py-1.5 rounded-xl flex items-center justify-between text-left nearby-dir-peer" data-peer-id="${peer.peerId}">
            <span class="text-xs font-bold text-slate-900">${name}</span>
            <span class="text-[10px] font-mono-code text-teal-700">${distFt}ft →</span>
          </button>
        `;
      }).join('');

      box.setAttribute('data-mode', 'directory');
      box.innerHTML = `
        <div class="flex items-center justify-between pb-1.5 border-b border-slate-200">
          <span class="text-xs font-extrabold text-slate-900">Nearby Members (${this.peers.size}) &amp; Community Hubs (${this.landmarks.length})</span>
          <button type="button" id="btn-close-entity-inspector" class="btn-glass px-2 py-0.5 rounded-lg text-[10px] font-bold text-slate-500">Close</button>
        </div>
        <div class="grid grid-cols-2 gap-1.5 pt-2">${peerItems}</div>
      `;
      box.classList.remove('hidden');

      const closeBtn = box.querySelector('#btn-close-entity-inspector');
      if (closeBtn) closeBtn.addEventListener('click', () => this.closeEntityInspector());

      box.querySelectorAll('.nearby-dir-peer').forEach((btn) => {
        btn.addEventListener('click', () => {
          const peer = this.peers.get(btn.getAttribute('data-peer-id'));
          if (peer) {
            box.removeAttribute('data-mode');
            this.openEntityInspector({ type: 'member', data: peer });
          }
        });
      });
    }

    closeEntityInspector() {
      const box = document.getElementById('map-entity-inspector');
      if (box) {
        box.classList.add('hidden');
        box.removeAttribute('data-mode');
      }
    }

    _startRoamingExplorersLoop() {
      if (this.sim.roamTimer) clearInterval(this.sim.roamTimer);
      this.sim.roamTimer = setInterval(() => {
        if (!this.position) return;
        this.peers.forEach((peer) => {
          if (!peer.roaming) return;
          const distFromUser = Geo.haversine(this.position.lat, this.position.lng, peer.lat, peer.lng);
          if (distFromUser > 62) {
            peer.walkHeading = Geo.bearing(peer.lat, peer.lng, this.position.lat, this.position.lng);
          } else if (distFromUser < 15) {
            peer.walkHeading = (Geo.bearing(this.position.lat, this.position.lng, peer.lat, peer.lng) + 35) % 360;
          } else {
            peer.walkHeading = (peer.walkHeading + (Math.random() - 0.5) * 32 + 360) % 360;
          }
          const next = Geo.destination(peer.lat, peer.lng, peer.walkHeading, 1.35);
          peer.lat = next.lat;
          peer.lng = next.lng;
          peer.lastSeen = Date.now();
        });
        this._renderRoamingExplorerMarkers();
        this._updatePresenceChip();
      }, 1400);
    }

    /* ======================================================================
       CITY & GPS QUICK-JUMP (INSTANT GLOBAL MAP VERIFICATION)
       ====================================================================== */

    jumpToCity(cityKey) {
      if (cityKey === 'gps') {
        if ('geolocation' in navigator) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              this._relocateWorldCenter(pos.coords.latitude, pos.coords.longitude, 'Live GPS Location');
            },
            () => {
              if (window.RadiaApp) {
                window.RadiaApp.showToast('Using Washington Square Park (GPS permission unavailable)', 'amber');
              }
              this.jumpToCity('nyc');
            },
            { enableHighAccuracy: true, timeout: 6000 }
          );
        }
        return;
      }

      const preset = CITY_PRESETS[cityKey];
      if (!preset) return;
      this.currentCityKey = cityKey;
      localStorage.setItem(CONFIG.KEY_CITY_PRESET, cityKey);

      document.querySelectorAll('.city-jump-btn').forEach((btn) => {
        const active = btn.getAttribute('data-city') === cityKey;
        btn.classList.toggle('btn-emerald', active);
        btn.classList.toggle('btn-glass', !active);
      });

      this._updateMapLayersDisplayLabel();
      this._relocateWorldCenter(preset.lat, preset.lng, preset.name, preset.sprawl);
    }

    _relocateWorldCenter(lat, lng, label, recommendedSprawl) {
      this.walkTarget = null;
      this.isWalking = false;
      if (this.walkTargetTimer) {
        cancelAnimationFrame(this.walkTargetTimer);
        clearInterval(this.walkTargetTimer);
        this.walkTargetTimer = null;
      }

      this.position = {
        lat,
        lng,
        accuracy: 6,
        timestamp: Date.now(),
        simulated: true
      };
      this.lastAccruedPosition = { ...this.position };
      this.sim.lat = lat;
      this.sim.lng = lng;
      this.followMode = true;

      this.userTrailPoints = [
        Geo.destination(lat, lng, 225, 28),
        Geo.destination(lat, lng, 225, 16),
        { lat, lng }
      ];

      this._writeJSON(CONFIG.KEY_LAST_POSITION, { lat, lng });
      if (this.demoMode) {
        this._seedWorldEnvironment(lat, lng);
        this._renderLandmarkMarkers();
        this._seedRoamingExplorers();
      } else {
        this.landmarks = [];
        this._renderLandmarkMarkers();
        this._renderRoamingExplorerMarkers();
      }

      if (recommendedSprawl && SPRAWL_ZONES[recommendedSprawl]) {
        this.setSprawlZone(recommendedSprawl, true);
      }

      this._syncNativeLeafletUserLayers();

      if (this.map) {
        this.map.setView([lat, lng], CONFIG.DEFAULT_ZOOM, { animate: true });
        setTimeout(() => this.map.invalidateSize(), 150);
      }

      if (window.RadiaApp && label) {
        window.RadiaApp.showToast(`Map Centered: ${label}`, 'emerald');
      }
    }

    /* ======================================================================
       60FPS WALK TO COORDINATES, FOOTSTEP RIPPLES & HUB CHECK-INS
       ====================================================================== */

    walkToCoordinates(targetLat, targetLng) {
      this.walkTarget = { lat: targetLat, lng: targetLng, ts: performance.now() };
      this.followMode = true;
      this.isWalking = true;
      this._syncNativeLeafletUserLayers();

      if (this.walkTargetTimer) {
        cancelAnimationFrame(this.walkTargetTimer);
        clearInterval(this.walkTargetTimer);
        this.walkTargetTimer = null;
      }

      let lastFrameTs = performance.now();
      let stepRippleAccumM = 0;

      const stepFrame = (now) => {
        if (!this.walkTarget || !this.position) {
          this.isWalking = false;
          this._syncNativeLeafletUserLayers();
          return;
        }

        const dtSec = Math.min(0.1, Math.max(0.008, (now - lastFrameTs) / 1000));
        lastFrameTs = now;

        const remDist = Geo.haversine(
          this.position.lat,
          this.position.lng,
          this.walkTarget.lat,
          this.walkTarget.lng
        );

        const stepM = CONFIG.CLICK_WALK_SPEED_MS * dtSec;
        if (remDist <= stepM + 0.35) {
          const finalLat = this.walkTarget.lat;
          const finalLng = this.walkTarget.lng;
          this.walkTarget = null;
          this.isWalking = false;
          this.walkTargetTimer = null;
          this._ingestPosition({
            lat: finalLat,
            lng: finalLng,
            accuracy: 5,
            timestamp: Date.now(),
            simulated: true
          });
          return;
        }

        const targetBrg = Geo.bearing(
          this.position.lat,
          this.position.lng,
          this.walkTarget.lat,
          this.walkTarget.lng
        );
        // Smooth angular slerp for heading
        const diff = ((targetBrg - (this.heading || 0) + 540) % 360) - 180;
        this.heading = ((this.heading || 0) + diff * Math.min(1, dtSec * 12) + 360) % 360;

        const next = Geo.destination(this.position.lat, this.position.lng, targetBrg, stepM);
        stepRippleAccumM += stepM;
        if (stepRippleAccumM >= 4.5) {
          stepRippleAccumM = 0;
          this._spawnGroundFootstepRipple(this.position.lat, this.position.lng);
        }

        this._ingestPosition({
          lat: next.lat,
          lng: next.lng,
          accuracy: 5,
          timestamp: Date.now(),
          simulated: true
        });

        this.walkTargetTimer = requestAnimationFrame(stepFrame);
      };

      this.walkTargetTimer = requestAnimationFrame(stepFrame);
    }

    _spawnGroundFootstepRipple(lat, lng) {
      if (!this.map) return;
      const ripple = L.circleMarker([lat, lng], {
        radius: 5,
        color: '#2dd4bf',
        weight: 1.5,
        opacity: 0.75,
        fillColor: '#0d9488',
        fillOpacity: 0.2,
        interactive: false
      }).addTo(this.map);

      setTimeout(() => {
        if (ripple) ripple.setRadius(9);
        if (ripple) ripple.setStyle({ opacity: 0.3, fillOpacity: 0.05 });
      }, 180);
      setTimeout(() => {
        if (ripple) ripple.remove();
      }, 420);
    }

    simulateStepBurst(meters = 200) {
      const steps = 8;
      const stepDist = meters / steps;
      let count = 0;
      const timer = setInterval(() => {
        count++;
        this.heading = (this.heading + 22) % 360;
        const next = Geo.destination(this.position.lat, this.position.lng, this.heading, stepDist);
        this._ingestPosition({
          lat: next.lat,
          lng: next.lng,
          accuracy: 5,
          timestamp: Date.now() + count * 2000,
          simulated: true
        });
        if (count >= steps) {
          clearInterval(timer);
          this.spawnFloatingReward(`+${meters}m Walk Logged • +64 Credits`);
        }
      }, 90);
    }

    spawnFloatingReward(text) {
      if (!this.dom.stage) return;
      const badge = document.createElement('div');
      badge.className = 'kinetic-float-reward';
      badge.textContent = text;
      this.dom.stage.appendChild(badge);
      setTimeout(() => badge.remove(), 1550);
    }

    harvestSpot(spot) {
      const targetSpot = spot || this.landmarks[Math.floor(Math.random() * this.landmarks.length)];
      if (!targetSpot) return;

      this.spawnFloatingReward(`Checked In: ${targetSpot.name.split(' ')[0]} • +45 Credits`);

      if (window.RadiaAudio && typeof window.RadiaAudio.playSpotHarvest === 'function') {
        window.RadiaAudio.playSpotHarvest();
      }

      this._dispatch('RADIA_LANDMARK_HARVESTED', { spot: targetSpot });

      if (window.RadiaApp && typeof window.RadiaApp.showToast === 'function') {
        window.RadiaApp.showToast(`Checked in at ${targetSpot.name} (+45 Credits • +60 XP)`, 'emerald');
      }
      return targetSpot;
    }

    harvestNearestSpot() {
      if (!this.landmarks.length) return;
      let nearest = this.landmarks[0];
      let minDist = Infinity;
      this.landmarks.forEach((s) => {
        const d = Geo.haversine(this.position.lat, this.position.lng, s.lat, s.lng);
        if (d < minDist) {
          minDist = d;
          nearest = s;
        }
      });
      return this.harvestSpot(nearest);
    }

    /* ======================================================================
       ADAPTIVE URBAN SPRAWL BUBBLE CALIBRATION
       ====================================================================== */

    setSprawlZone(zoneKey, isAuto = false) {
      if (!SPRAWL_ZONES[zoneKey]) return;
      this.currentSprawlKey = zoneKey;
      this.autoSprawlCalibration = !!isAuto;
      localStorage.setItem(CONFIG.KEY_SPRAWL_MODE, zoneKey);

      const zone = this.currentSprawl;
      if (this.dom.stage) {
        this.dom.stage.setAttribute('data-sprawl-zone', zoneKey);
      }

      const hudSprawlLabel = document.getElementById('hud-sprawl-label');
      if (hudSprawlLabel) {
        hudSprawlLabel.textContent = `${zone.feet}ft`;
      }
      const bottomSprawlLabel = document.getElementById('bottom-sprawl-label');
      if (bottomSprawlLabel) {
        bottomSprawlLabel.textContent = `${zone.name} • ${zone.feet}ft (${Math.round(zone.meters)}m)`;
      }
      const collisionRadiusBadge = document.getElementById('collision-radius-badge-text');
      if (collisionRadiusBadge) {
        collisionRadiusBadge.textContent = `${zone.feet}ft Radius (${zone.name})`;
      }

      document.querySelectorAll('.sprawl-zone-btn').forEach((btn) => {
        const active = btn.getAttribute('data-sprawl') === zoneKey;
        btn.classList.toggle('btn-emerald', active);
        btn.classList.toggle('btn-glass', !active);
      });

      this._syncNativeLeafletUserLayers();

      this._dispatch('RADIA_SPRAWL_CHANGED', {
        zoneKey,
        zone,
        autoCalibrated: this.autoSprawlCalibration
      });
    }

    cycleSprawlZone() {
      const keys = Object.keys(SPRAWL_ZONES);
      const idx = (keys.indexOf(this.currentSprawlKey) + 1) % keys.length;
      this.setSprawlZone(keys[idx], false);
      return this.currentSprawl;
    }

    /* ======================================================================
       MAP PROVIDER / STYLE CONTROLS
       ====================================================================== */

    setMapTheme(themeKey) {
      // Map legacy theme names smoothly if passed
      const legacyMap = {
        meadow: 'voyager',
        golden: 'osm',
        twilight: 'dark'
      };
      const normalized = legacyMap[themeKey] || themeKey;
      const chosen = TILE_PROVIDERS[normalized] ? normalized : CONFIG.DEFAULT_PROVIDER;

      this.mapTheme = chosen;
      localStorage.setItem(CONFIG.KEY_MAP_THEME, chosen);

      document.querySelectorAll('.theme-select-btn, .map-provider-btn').forEach((btn) => {
        const attr = btn.getAttribute('data-provider') || btn.getAttribute('data-theme');
        const on = attr === chosen;
        btn.classList.toggle('btn-emerald', on);
        btn.classList.toggle('btn-glass', !on);
      });

      this._applyTileProvider(chosen);
      this._dispatch('RADIA_THEME_CHANGED', { theme: chosen, provider: TILE_PROVIDERS[chosen] });
    }

    cycleMapTheme() {
      const order = Object.keys(TILE_PROVIDERS);
      const next = order[(order.indexOf(this.mapTheme) + 1) % order.length];
      this.setMapTheme(next);
      return next;
    }

    set25dPerspective(enabled) {
      this.is25dTilt = false;
      if (this.map) this.map.invalidateSize();
    }

    /* ======================================================================
       BUTTON HOOKS & WALK / COLLISION SIMULATION
       ====================================================================== */

    _bindExternalButtons() {
      const pingBtn = document.getElementById('btn-simulate-collision');
      if (pingBtn) {
        pingBtn.addEventListener('click', () => this.spawnMockPeer({ immediate: true }));
      }

      const simWalkBtn = document.getElementById('btn-toggle-sim-walk');
      if (simWalkBtn) {
        simWalkBtn.addEventListener('click', () => {
          this.setMode(this.mode === 'simulate' ? 'gps' : 'simulate');
        });
      }

      const harvestBtn = document.getElementById('btn-harvest-spot');
      if (harvestBtn) {
        harvestBtn.addEventListener('click', () => this.harvestNearestSpot());
      }

      const availBtn = document.getElementById('btn-toggle-availability');
      if (availBtn) {
        availBtn.addEventListener('click', () => this.setAvailability(!this.isAvailable));
      }

      const themeCycleBtn = document.getElementById('btn-cycle-map-theme');
      if (themeCycleBtn) {
        themeCycleBtn.addEventListener('click', () => {
          const next = this.cycleMapTheme();
          const p = TILE_PROVIDERS[next];
          if (window.RadiaApp && p) {
            window.RadiaApp.showToast(`Map Layer: ${p.name}`, 'emerald');
          }
        });
      }

      const recenterBtn = document.getElementById('btn-recenter-map');
      if (recenterBtn) {
        recenterBtn.addEventListener('click', () => {
          this.followMode = true;
          recenterBtn.classList.remove('active');
          if (this.map && this.position) {
            this.map.setView([this.position.lat, this.position.lng], CONFIG.DEFAULT_ZOOM, { animate: true });
          }
        });
      }

      const nearbyDirBtn = document.getElementById('btn-open-nearby-drawer');
      if (nearbyDirBtn) {
        nearbyDirBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.openNearbyDirectory();
        });
      }

      const walkBtn = document.getElementById('btn-track-walk');
      if (walkBtn) {
        walkBtn.addEventListener('click', () => this.toggleWalkTracking());
      }

      const coordsChip = document.getElementById('hud-pace-readout');
      if (coordsChip) {
        coordsChip.addEventListener('click', () => this.requestLocation());
      }

      const locateBtn = document.getElementById('btn-empty-locate');
      if (locateBtn) {
        locateBtn.addEventListener('click', () => this.requestLocation());
      }

      const widenBtn = document.getElementById('btn-empty-widen');
      if (widenBtn) {
        widenBtn.addEventListener('click', () => this.cycleSprawlZone(true));
      }

      const emptyHelpBtn = document.getElementById('btn-empty-help');
      if (emptyHelpBtn) {
        emptyHelpBtn.addEventListener('click', () => {
          const guide = document.getElementById('modal-quick-guide');
          if (guide) guide.classList.add('active');
        });
      }

      this._updatePresenceChip();
      this._refreshWalkHud();
      this._markActiveProvider();
    }

    setMode(mode) {
      if (mode !== 'gps' && mode !== 'simulate') return;
      this.mode = mode;

      const simWalkBtn = document.getElementById('btn-toggle-sim-walk');
      if (simWalkBtn) {
        const active = mode === 'simulate';
        simWalkBtn.classList.toggle('btn-amber', active);
        simWalkBtn.classList.toggle('btn-glass', !active);
        const span = simWalkBtn.querySelector('span');
        if (span) span.textContent = active ? 'Walking Active' : 'Auto-Walk';
      }

      if (mode === 'simulate') {
        this.stopGPS();
        this.startSimulation();
      } else {
        this.stopSimulation();
        this.startGPS();
      }

      this._dispatch('RADIA_MODE_CHANGED', { mode });
    }

    setAvailability(isAvailable) {
      this.isAvailable = !!isAvailable;
      if (this.dom.overlay) this.dom.overlay.classList.toggle('radar-dormant', !this.isAvailable);
      if (this.dom.stage) this.dom.stage.classList.toggle('radar-dormant', !this.isAvailable);

      const label = document.getElementById('label-availability');
      const btn = document.getElementById('btn-toggle-availability');
      if (label) {
        label.textContent = this.isAvailable ? 'Open to talk' : 'Paused';
      }
      if (btn) {
        btn.classList.toggle('is-paused', !this.isAvailable);
      }

      this._updatePresenceChip();
      this._dispatch('RADIA_AVAILABILITY_CHANGED', { isAvailable: this.isAvailable });
      return this.isAvailable;
    }

    startGPS() {
      if (!('geolocation' in navigator) || this.watchId !== null) return;
      this.watchId = navigator.geolocation.watchPosition(
        (pos) => {
          if (this.mode !== 'gps') return;
          const { latitude, longitude, accuracy, heading } = pos.coords;
          if (typeof accuracy === 'number' && accuracy > CONFIG.MAX_USABLE_ACCURACY_M) return;
          if (typeof heading === 'number' && !Number.isNaN(heading)) this.heading = heading;
          this._ingestPosition({
            lat: latitude,
            lng: longitude,
            accuracy: accuracy || 12,
            timestamp: pos.timestamp || Date.now(),
            simulated: false
          });
          if (!this._centredOnFirstFix) {
            this._centredOnFirstFix = true;
            this.followMode = true;
            if (this.map) this.map.setView([latitude, longitude], CONFIG.DEFAULT_ZOOM, { animate: true });
          }
        },
        (err) => this._handleGpsError(err),
        { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
      );
    }

    _handleGpsError(err) {
      const code = err && err.code;
      // 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT
      this.gpsError = code === 1 ? 'denied' : code === 3 ? 'timeout' : 'unavailable';
      this._updatePaceAndCoordsHUD(false);
      if (this._gpsErrorNotified === this.gpsError) return;
      this._gpsErrorNotified = this.gpsError;
      if (window.RadiaApp) {
        const msg = code === 1
          ? 'Location blocked — allow it in your browser to appear where you are'
          : 'Waiting for a GPS signal';
        window.RadiaApp.showToast(msg, 'amber');
      }
    }

    /** Explicit, user-initiated location request (used by the empty state). */
    requestLocation() {
      if (!('geolocation' in navigator)) {
        if (window.RadiaApp) window.RadiaApp.showToast('This browser has no location support', 'amber');
        return;
      }
      this.startGPS();
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude, accuracy } = pos.coords;
          this.hasRealFix = true;
          this.followMode = true;
          this._ingestPosition({
            lat: latitude,
            lng: longitude,
            accuracy: accuracy || 12,
            timestamp: pos.timestamp || Date.now(),
            simulated: false
          });
          if (this.map) this.map.setView([latitude, longitude], CONFIG.DEFAULT_ZOOM, { animate: true });
          if (window.RadiaApp) window.RadiaApp.showToast('You are on the map', 'emerald');
        },
        (err) => this._handleGpsError(err),
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
      );
    }

    stopGPS() {
      if (this.watchId !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(this.watchId);
        this.watchId = null;
      }
    }

    _ingestPosition(fix) {
      this.position = fix;
      if (fix && fix.simulated === false) this.hasRealFix = true;

      let delta = 0;
      const ref = this.lastAccruedPosition;
      if (ref) {
        const raw = Geo.haversine(ref.lat, ref.lng, fix.lat, fix.lng);
        const dt = Math.max(0.001, (fix.timestamp - ref.timestamp) / 1000);
        const speed = raw / dt;

        // Only genuine GPS movement (or an explicit demo session) earns
        // distance. Tapping the map must never mint credits.
        const eligible = this.demoMode ? true : !fix.simulated;
        if (raw >= CONFIG.MIN_STEP_M && eligible && speed <= CONFIG.MAX_PLAUSIBLE_SPEED_MS) {
          delta = raw;
          this.totalDistanceM += delta;
          this.sessionDistanceM += delta;
          this.stepToastAccumulatorM += delta;
          this.lastAccruedPosition = fix;
          this._writeNumber(CONFIG.KEY_TOTAL_DISTANCE, this.totalDistanceM);
          this.heading = Geo.bearing(ref.lat, ref.lng, fix.lat, fix.lng);

          this.userTrailPoints.push({ lat: fix.lat, lng: fix.lng });
          if (this.userTrailPoints.length > 60) this.userTrailPoints.shift();
        }
      } else {
        this.lastAccruedPosition = fix;
      }

      this._syncNativeLeafletUserLayers();

      if (this.map && this.followMode) {
        this.map.panTo([fix.lat, fix.lng], { animate: true, duration: 0.35 });
      }

      // Persist whether this was a real fix, so a sample location can never be
      // restored as the user's position on the next visit.
      this._writeJSON(CONFIG.KEY_LAST_POSITION, { lat: fix.lat, lng: fix.lng, real: fix.simulated === false });
      this._updatePaceAndCoordsHUD(delta > 0);
      this._evaluateHotspots();
      if (this.walkTracking) this._refreshWalkHud();
      if (delta > 0) this._emitDistance(delta);
      this._renderRoamingExplorerMarkers();
      this._evaluateAllPeers();

      // Presence transports listen for this to republish our whereabouts.
      this._dispatch('RADIA_POSITION_UPDATED', {
        lat: fix.lat,
        lng: fix.lng,
        simulated: !!fix.simulated
      });
    }

    /**
     * Accepts peers from any presence transport (local BroadcastChannel or a
     * hosted realtime channel). These are REAL people, so they are never marked
     * simulated and they carry no invented profile fields.
     */
    _ingestPresencePeers(list) {
      const seen = new Set();

      (list || []).forEach((entry) => {
        if (!entry || !entry.id) return;
        if (typeof entry.lat !== 'number' || typeof entry.lng !== 'number') return;
        seen.add(entry.id);

        const distM = Geo.haversine(this.position.lat, this.position.lng, entry.lat, entry.lng);
        const existing = this.peers.get(entry.id);

        this.peers.set(entry.id, {
          peerId: entry.id,
          profile: {
            firstName: entry.name || 'Someone nearby',
            preferredTimer: 300,
            level: 1,
            bioTag: `${Math.round(Geo.metersToFeet(distM))}ft away`,
            contactHandle: ''
          },
          color: '#0b4f3f',
          lat: entry.lat,
          lng: entry.lng,
          walkHeading: existing ? existing.walkHeading : 0,
          accuracy: 15,
          simulated: false,
          roaming: false,
          lastSeen: entry.ts || Date.now(),
          inRange: distM <= this._effectiveRadiusM(),
          cooldownUntil: existing ? existing.cooldownUntil : 0
        });
      });

      // Retire presence peers that left, and their markers.
      Array.from(this.peers.keys()).forEach((id) => {
        const peer = this.peers.get(id);
        if (!peer || peer.simulated) return;
        if (seen.has(id)) return;
        this.peers.delete(id);
        const marker = this.roamingPeerMarkers.get(id);
        if (marker) marker.remove();
        this.roamingPeerMarkers.delete(id);
      });

      this._renderRoamingExplorerMarkers();
      this._updatePresenceChip();
      this._syncNativeLeafletUserLayers();
    }

    _updatePaceAndCoordsHUD(isMoving) {
      const paceEl = document.getElementById('hud-pace-readout');
      if (!paceEl || !this.position) return;

      // Never imply a GPS fix we do not have.
      if (!this.hasRealFix) {
        paceEl.textContent = this.demoMode
          ? 'Preview location'
          : this.gpsError === 'denied'
            ? 'Location off · tap to retry'
            : 'Use my location';
        paceEl.title = 'Show your real position on the map';
        paceEl.classList.toggle('is-demo', this.demoMode);
        paceEl.classList.toggle('is-preview', !this.demoMode);
        return;
      }
      paceEl.classList.remove('is-preview', 'is-demo');

      if (isMoving || this.walkTarget || this.mode === 'simulate') {
        paceEl.textContent = `4.8 km/h • 112 spm`;
      } else {
        const latStr = `${Math.abs(this.position.lat).toFixed(4)}°${this.position.lat >= 0 ? 'N' : 'S'}`;
        const lngStr = `${Math.abs(this.position.lng).toFixed(4)}°${this.position.lng >= 0 ? 'E' : 'W'}`;
        paceEl.textContent = `${latStr}, ${lngStr}`;
      }
    }

    _emitDistance(deltaM) {
      const totalKm = this.totalDistanceM / 1000;
      const totalSteps = Math.round(this.totalDistanceM * 1.31);
      if (this.dom.headerDistance) {
        this.dom.headerDistance.textContent = `${totalKm.toFixed(2)} km`;
      }
      this._dispatch('RADIA_DISTANCE_UPDATED', {
        deltaMeters: deltaM,
        totalMeters: this.totalDistanceM,
        totalKm,
        totalSteps,
        sessionMeters: this.sessionDistanceM,
        xpMultiplier: this.xpMultiplier,
        hotspot: this.activeHotspot ? this.activeHotspot.name : null
      });
    }

    _evaluateHotspots() {
      if (!this.position) return;
      let found = null;
      for (const spot of this.landmarks) {
        const d = Geo.haversine(this.position.lat, this.position.lng, spot.lat, spot.lng);
        if (d <= (spot.radius || 55)) {
          found = spot;
          break;
        }
      }

      this.activeHotspot = found;
      this.xpMultiplier = found ? found.multiplier : 1;

      document.querySelectorAll('.pokestop-hub-beacon').forEach((el) => {
        const sid = el.getAttribute('data-spot-id');
        el.classList.toggle('is-in-range', !!(found && found.id === sid));
      });

      if (this.dom.hotspotBadge) {
        if (found) {
          this.dom.hotspotBadge.classList.remove('hidden');
          this.dom.hotspotBadge.classList.add('badge-visible');
          const label = this.dom.hotspotBadge.querySelector('#hotspot-badge-text');
          if (label) label.textContent = `${found.name} (${found.multiplier}x)`;
        } else {
          this.dom.hotspotBadge.classList.add('hidden');
          this.dom.hotspotBadge.classList.remove('badge-visible');
        }
      }
    }

    /* ======================================================================
       SIMULATION & PEER COLLISION TRIGGER
       ====================================================================== */

    startSimulation() {
      this.sim.lat = this.position.lat;
      this.sim.lng = this.position.lng;
      this.followMode = true;

      if (this.sim.timer) clearInterval(this.sim.timer);
      this.sim.timer = setInterval(() => this._simTick(), CONFIG.SIM_TICK_MS);
      this._simTick();
    }

    stopSimulation() {
      if (this.sim.timer) {
        clearInterval(this.sim.timer);
        this.sim.timer = null;
      }
    }

    _simTick() {
      this.sim.heading = (this.sim.heading + (Math.random() - 0.48) * 28 + 360) % 360;
      const step = CONFIG.SIM_WALK_SPEED_MS * (CONFIG.SIM_TICK_MS / 1000);
      const next = Geo.destination(this.sim.lat, this.sim.lng, this.sim.heading, step);

      this.sim.lat = next.lat;
      this.sim.lng = next.lng;
      this.heading = this.sim.heading;

      this._ingestPosition({
        lat: next.lat,
        lng: next.lng,
        accuracy: 5,
        timestamp: Date.now(),
        simulated: true
      });
    }

    spawnMockPeer() {
      if (!this.isAvailable) {
        this.setAvailability(true);
      }

      const names = ['Jordan', 'Mina', 'Theo', 'Sasha', 'Rumi', 'Elias', 'Noor', 'Kai', 'Isla', 'Dev'];
      const bios = [
        'Walking through the park plaza',
        'Taking an afternoon walk break',
        'Curious about neighborhood architecture',
        'Checking in at local Community Hubs'
      ];
      const timers = [180, 300, 180];
      const id = `sim_peer_${++this.sim.peerCounter}_${Date.now().toString(36)}`;

      const chosenName = names[this.sim.peerCounter % names.length];
      const peerRecord = {
        peerId: id,
        profile: {
          firstName: chosenName,
          preferredTimer: timers[this.sim.peerCounter % timers.length],
          level: 2 + (this.sim.peerCounter % 5),
          bioTag: bios[this.sim.peerCounter % bios.length],
          contactHandle: `@${chosenName.toLowerCase()}.radia`
        },
        lat: this.position.lat + 0.00004,
        lng: this.position.lng + 0.00004,
        accuracy: 5,
        simulated: true,
        lastSeen: Date.now(),
        inRange: true,
        cooldownUntil: 0
      };

      this.peers.set(id, peerRecord);
      this._updatePresenceChip();

      const distanceM = Math.min(8.2, this.currentSprawl.meters * 0.72);
      this._fireCollision(peerRecord, distanceM);
      return id;
    }

    _evaluateAllPeers() {
      this.peers.forEach((peer) => this._evaluatePeer(peer));
      this._updatePresenceChip();
    }

    _evaluatePeer(peer) {
      if (!this.position || !peer || typeof peer.lat !== 'number') return;
      const distanceM = Geo.haversine(this.position.lat, this.position.lng, peer.lat, peer.lng);
      peer.distanceM = distanceM;

      const enterThreshold = this.currentSprawl.meters + 2.5;
      const now = Date.now();
      const gated = !this.isAvailable || now < (peer.cooldownUntil || 0) || this.blockedPeers.has(peer.peerId);

      if (!peer.inRange && !gated && distanceM <= enterThreshold) {
        peer.inRange = true;
        peer.cooldownUntil = now + CONFIG.COLLISION_COOLDOWN_MS;
        this.activeCollisionId = peer.peerId;
        this._fireCollision(peer, distanceM);
      } else if (peer.inRange && distanceM > enterThreshold * 1.45) {
        peer.inRange = false;
      }
    }

    _fireCollision(peer, distanceM) {
      this._dispatch('RADIA_COLLISION_DETECTED', {
        peerId: peer.peerId,
        profile: peer.profile || {},
        distanceMeters: Number(distanceM.toFixed(1)),
        distanceFeet: Math.max(4, Number(Geo.metersToFeet(distanceM).toFixed(0))),
        sprawlZoneLabel: `${this.currentSprawl.name} (${this.currentSprawl.feet}ft)`,
        simulated: !!peer.simulated,
        hotspot: this.activeHotspot ? this.activeHotspot.name : (this.landmarks[0] && this.landmarks[0].name),
        timestamp: Date.now()
      });
    }

    _updatePresenceChip() {
      // Never inflate the count: a quiet radius is a real product state.
      const count = this.peers.size;
      const countEl = document.getElementById('nearby-member-count-text');
      if (countEl) {
        countEl.textContent = count === 1 ? '1 nearby' : `${count} nearby`;
      }
      const empty = document.getElementById('radar-empty-state');
      if (empty) empty.classList.toggle('hidden', count > 0);
    }

    /* ----------------------------------------------------------------
       WALK TRACKING — the only source of distance credit is a real GPS fix
       ---------------------------------------------------------------- */

    toggleWalkTracking() {
      if (this.walkTracking) {
        this.stopWalkTracking();
      } else {
        this.startWalkTracking();
      }
      return this.walkTracking;
    }

    startWalkTracking() {
      this.walkTracking = true;
      this.walkSessionStartM = this.totalDistanceM;
      this.followMode = true;
      this.startGPS();
      const btn = document.getElementById('btn-track-walk');
      if (btn) btn.classList.add('is-recording');
      this._refreshWalkHud();
      if (window.RadiaApp) {
        window.RadiaApp.showToast('Walk tracking on', 'emerald');
      }
    }

    stopWalkTracking() {
      this.walkTracking = false;
      const btn = document.getElementById('btn-track-walk');
      if (btn) btn.classList.remove('is-recording');
      this._refreshWalkHud();
      if (window.RadiaApp) {
        const km = ((this.totalDistanceM - (this.walkSessionStartM || 0)) / 1000).toFixed(2);
        window.RadiaApp.showToast(`Walk saved · ${km} km`, 'emerald');
      }
    }

    _refreshWalkHud() {
      const label = document.getElementById('walk-status-label');
      if (!label) return;
      if (this.walkTracking) {
        const km = Math.max(0, (this.totalDistanceM - (this.walkSessionStartM || 0)) / 1000);
        label.textContent = `${km.toFixed(2)} km`;
      } else {
        label.textContent = 'Start walk';
      }
    }

    dismissPeer(peerId, cooldownMs) {
      const peer = this.peers.get(peerId);
      if (!peer) return;
      peer.inRange = false;
      peer.cooldownUntil = Date.now() + (cooldownMs || CONFIG.COLLISION_COOLDOWN_MS);
    }

    blockPeer(peerId) {
      if (!peerId) return;
      this.blockedPeers.add(peerId);
      this._writeJSON(CONFIG.KEY_BLOCKED_PEERS, Array.from(this.blockedPeers));
      this.peers.delete(peerId);
      const marker = this.roamingPeerMarkers.get(peerId);
      if (marker) marker.remove();
      this.roamingPeerMarkers.delete(peerId);
      this._dispatch('RADIA_PEER_BLOCKED', { peerId });
    }

    unblockAllPeers() {
      this.blockedPeers.clear();
      this._writeJSON(CONFIG.KEY_BLOCKED_PEERS, []);
      this._seedRoamingExplorers();
      this._dispatch('RADIA_PEERS_UNBLOCKED', {});
    }

    getBlockedPeers() {
      return Array.from(this.blockedPeers);
    }

    _handleResize() {
      this._resizeCanvases();
      this._drawFallbackBasemap();
      if (this.map) {
        this.map.invalidateSize();
      }
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

    getState() {
      const z = this.currentSprawl;
      return {
        mode: this.mode,
        isAvailable: this.isAvailable,
        position: this.position ? { ...this.position } : null,
        heading: this.heading,
        totalDistanceM: this.totalDistanceM,
        totalDistanceKm: this.totalDistanceM / 1000,
        totalSteps: Math.round(this.totalDistanceM * 1.31),
        sessionDistanceM: this.sessionDistanceM,
        xpMultiplier: this.xpMultiplier,
        hotspot: this.activeHotspot || this.landmarks[0],
        sprawlZoneKey: this.currentSprawlKey,
        sprawlZoneLabel: `${z.name} (${z.feet}ft)`,
        encounterRadiusM: z.meters,
        encounterRadiusFt: z.feet,
        mapTheme: this.mapTheme,
        provider: this.currentProvider,
        is25dTilt: false
      };
    }

    static get SPRAWL_ZONES() { return SPRAWL_ZONES; }
    static get TILE_PROVIDERS() { return TILE_PROVIDERS; }
    static get CITY_PRESETS() { return CITY_PRESETS; }
    static get Geo() { return Geo; }
  }

  const engine = new RadiaProximityEngine();
  window.RadiaProximity = engine;
  window.RadiaGeo = Geo;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => engine.init());
  } else {
    engine.init();
  }
})();
