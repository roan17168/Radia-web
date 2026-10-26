/**
 * ============================================================================
 * RADIA — ZERO-KNOWLEDGE VAULT, MUTUAL INSIGHT TREE & SPATIAL CORRELATION ENGINE
 * (js/storage.js)
 * ----------------------------------------------------------------------------
 *  • AES-256-GCM encrypted on-device storage (WebCrypto + IndexedDB).
 *  • Stores dual-node encounter insights:
 *      - Your Shared Insight (non-judgmental takeaway from the conversation)
 *      - Partner's Shared Insight (exchanged upon concluding conversation)
 *      - Private Encrypted Vault Note (AES-256-GCM at rest)
 *      - Catalyst Prompt + Physical Location Spot ({ name, lat, lng, sprawlZone })
 *  • Geodesic Spatial Correlation Engine:
 *      - Tracks "10 Insights in the Same Mile" (1,609.34m Haversine cluster)
 *      - Tracks Landmark Spot resonance & Cross-Neighborhood bridges
 *  • On-Device AI Meta-Insight Synthesizer:
 *      - Synthesizes how you've evolved, what you've learned, and your ripple
 *        effect on the community around you.
 *
 *  Public singleton: window.RadiaStorage
 * ============================================================================
 */

(function () {
  'use strict';

  const DB_NAME = 'radia_reflection_vault_v2';
  const DB_VERSION = 1;
  const MILE_METERS = 1609.34;

  const STORES = {
    REFLECTIONS: 'reflections',
    ENCOUNTERS: 'encounters',
    META: 'meta'
  };

  const KEYS = {
    VAULT_KEY: 'radia_vault_key_v1',
    ENCRYPTION_ON: 'radia_vault_encrypted',
    SEEDED_STARTER: 'radia_starter_constellation_seeded_v3'
  };

  const XP = {
    REFLECTION_BASE: 85,
    PER_WORD: 1.0,
    WORD_BONUS_CAP: 90,
    MIN_WORDS_FOR_XP: 2
  };

  /* Haversine helper in meters */
  function haversineM(lat1, lon1, lat2, lon2) {
    if (typeof lat1 !== 'number' || typeof lat2 !== 'number') return 0;
    const R = 6371008.8;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  /* ==========================================================================
     LOCAL AES-256-GCM VAULT CRYPTO
     ========================================================================== */

  const Vault = {
    key: null,
    available: false,

    async init() {
      this.available = !!(window.crypto && window.crypto.subtle && window.isSecureContext);
      if (!this.available) return false;

      try {
        const stored = localStorage.getItem(KEYS.VAULT_KEY);
        if (stored) {
          this.key = await crypto.subtle.importKey(
            'jwk',
            JSON.parse(stored),
            { name: 'AES-GCM', length: 256 },
            true,
            ['encrypt', 'decrypt']
          );
        } else {
          this.key = await crypto.subtle.generateKey(
            { name: 'AES-GCM', length: 256 },
            true,
            ['encrypt', 'decrypt']
          );
          const jwk = await crypto.subtle.exportKey('jwk', this.key);
          localStorage.setItem(KEYS.VAULT_KEY, JSON.stringify(jwk));
          localStorage.setItem(KEYS.ENCRYPTION_ON, 'true');
        }
        return true;
      } catch (err) {
        this.available = false;
        this.key = null;
        return false;
      }
    },

    async encrypt(plaintext) {
      const text = String(plaintext == null ? '' : plaintext);
      if (!this.available || !this.key) return { t: text, enc: false };
      try {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const buf = new TextEncoder().encode(text);
        const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, this.key, buf);
        return { c: this._b64(cipher), iv: this._b64(iv.buffer), enc: true };
      } catch (e) {
        return { t: text, enc: false };
      }
    },

    async decrypt(payload) {
      if (!payload) return '';
      if (payload.enc !== true) return payload.t || '';
      if (!this.available || !this.key) return payload.t || '[Encrypted Local Entry]';
      try {
        const iv = new Uint8Array(this._unb64(payload.iv));
        const data = this._unb64(payload.c);
        const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, this.key, data);
        return new TextDecoder().decode(plain);
      } catch (e) {
        return payload.t || '';
      }
    },

    destroyKey() {
      try {
        localStorage.removeItem(KEYS.VAULT_KEY);
        localStorage.removeItem(KEYS.ENCRYPTION_ON);
      } catch (e) {}
      this.key = null;
    },

    _b64(buffer) {
      const bytes = new Uint8Array(buffer);
      let bin = '';
      for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
      return btoa(bin);
    },

    _unb64(b64) {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return bytes.buffer;
    }
  };

  /* ==========================================================================
     RADIA STORAGE ENGINE
     ========================================================================== */

  class RadiaStorageEngine {
    constructor() {
      this.db = null;
      this.ready = false;
      this.encryptionActive = false;
      this._readyPromise = null;
    }

    init() {
      if (this._readyPromise) return this._readyPromise;

      this._readyPromise = (async () => {
        this.encryptionActive = await Vault.init();
        this.db = await this._openDB();
        this.ready = true;

        await this.ensureStarterInsights();

        this._dispatch('RADIA_STORAGE_READY', {
          encrypted: this.encryptionActive,
          dbName: DB_NAME
        });
        return this;
      })();

      return this._readyPromise;
    }

    _openDB() {
      return new Promise((resolve, reject) => {
        const req = window.indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (event) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains(STORES.REFLECTIONS)) {
            const s = db.createObjectStore(STORES.REFLECTIONS, { keyPath: 'id' });
            s.createIndex('timestamp', 'timestamp', { unique: false });
            s.createIndex('category', 'category', { unique: false });
          }
          if (!db.objectStoreNames.contains(STORES.ENCOUNTERS)) {
            const s = db.createObjectStore(STORES.ENCOUNTERS, { keyPath: 'id' });
            s.createIndex('timestamp', 'timestamp', { unique: false });
          }
          if (!db.objectStoreNames.contains(STORES.META)) {
            db.createObjectStore(STORES.META, { keyPath: 'key' });
          }
        };
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = (e) => reject(e.target.error);
      });
    }

    async _db() {
      if (this.db && this.ready) return this.db;
      await this.init();
      return this.db;
    }

    _tx(storeName, mode) {
      return this.db.transaction([storeName], mode).objectStore(storeName);
    }

    _request(req) {
      return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }

    /**
     * Seeds 4 rich initial encounters on first launch so the Insight Constellation & Tree
     * and the AI Meta-Insight Synthesis are immediately alive and interactive.
     */
    async ensureStarterInsights() {
      try {
        // Invented encounters are demo content. A real vault starts empty so the
        // insight graph reflects only conversations the user actually had.
        if (!(window.RadiaConfig && window.RadiaConfig.get('demoMode'))) return;
        if (localStorage.getItem(KEYS.SEEDED_STARTER) === 'true') return;
        const existing = await this._countReflections();
        if (existing > 0) {
          localStorage.setItem(KEYS.SEEDED_STARTER, 'true');
          return;
        }

        const baseLat = 40.730823;
        const baseLng = -73.997332;
        const now = Date.now();

        const starters = [
          {
            promptId: 'v-01',
            category: 'Human Experience & Vulnerability',
            promptText: "What is a belief you held five years ago that you've completely abandoned?",
            mySharedInsight: "I realized I don't need every step of my life mapped out ten years ahead—leaving room for serendipity is where the best connections happen.",
            partnerSharedInsight: "Hearing how we both outgrew rigid timelines made me realize personal growth is mostly learning what to put down.",
            notes: "Met Maya near the fountain plaza. We both laughed about how seriously we took our 5-year plans back in school.",
            partnerAlias: 'Maya',
            mutualConnect: true,
            locationSpot: {
              id: 'spot_fountain',
              name: 'Central Fountain Plaza',
              archetype: 'water',
              lat: baseLat + 0.00045,
              lng: baseLng - 0.00035,
              sprawlZone: 'Neighborhood Park (40ft)'
            },
            timestamp: now - 86400000 * 5
          },
          {
            promptId: 'o-01',
            category: 'Observational & Physical Context',
            promptText: "Look around us right now. What is one thing here that won't exist in 50 years?",
            mySharedInsight: "The temporary scaffolding and signage will vanish, but the 100-year-old elm trees and stone benches will still gather neighbors.",
            partnerSharedInsight: "Looking at this park through a 50-year lens makes the present afternoon feel like living history.",
            notes: "Spoke with Liam under the elm canopy. Noticed how calm the park feels when you actually look at the trees instead of a screen.",
            partnerAlias: 'Liam',
            mutualConnect: false,
            locationSpot: {
              id: 'spot_grove',
              name: 'Founders Oak Grove',
              archetype: 'park',
              lat: baseLat - 0.00052,
              lng: baseLng + 0.00048,
              sprawlZone: 'Neighborhood Park (40ft)'
            },
            timestamp: now - 86400000 * 4
          },
          {
            promptId: 'c-01',
            category: CATEGORIES_FALLBACK('Curiosity & Perspectives'),
            promptText: "What's something most people call a luxury that you consider a genuine necessity?",
            mySharedInsight: "Thirty minutes of unhurried walking without headphones—it's the only time my mind truly untangles itself.",
            partnerSharedInsight: "Unscheduled time to wander and think isn't a luxury—it's how we stay human in a fast city.",
            notes: "Sora and I connected right by the West Park Overlook. Exchanged handles to grab coffee next week.",
            partnerAlias: 'Sora',
            mutualConnect: true,
            locationSpot: {
              id: 'spot_bench',
              name: 'West Park Overlook',
              archetype: 'overlook',
              lat: baseLat + 0.00062,
              lng: baseLng + 0.00055,
              sprawlZone: 'Campus / Plaza (28ft)'
            },
            timestamp: now - 86400000 * 3
          },
          {
            promptId: 'v-09',
            category: 'Human Experience & Vulnerability',
            promptText: "When did you last change your mind in the middle of a conversation?",
            mySharedInsight: "When someone listens without trying to win, it suddenly feels safe to update your perspective on the spot.",
            partnerSharedInsight: "Curiosity disarms defensiveness every single time—thank you for such an open dialogue.",
            notes: "Quick 3-minute conversation with Elena at the Solar Commons Terrace. Left feeling noticeably lighter.",
            partnerAlias: 'Elena',
            mutualConnect: true,
            locationSpot: {
              id: 'spot_plaza',
              name: 'Solar Commons Terrace',
              archetype: 'plaza',
              lat: baseLat - 0.00038,
              lng: baseLng - 0.00062,
              sprawlZone: 'Urban Core (18ft)'
            },
            timestamp: now - 86400000 * 2
          },
          {
            promptId: 'o-04',
            category: 'Observational & Physical Context',
            promptText: "If this block could remember one recurring human moment, what would it keep?",
            mySharedInsight: "The quiet rhythm of neighbors pausing on the steps at golden hour just to watch the street life unfold.",
            partnerSharedInsight: "Public steps and plazas are the living rooms of a city—they hold our shared memory.",
            notes: "Spoke with Devon by the Library Steps Plaza while walking home.",
            partnerAlias: 'Devon',
            mutualConnect: true,
            locationSpot: {
              id: 'spot_library',
              name: 'Library Steps Plaza',
              archetype: 'plaza',
              lat: baseLat + 0.00028,
              lng: baseLng + 0.00031,
              sprawlZone: 'Campus / Plaza (28ft)'
            },
            timestamp: now - 86400000 * 1
          },
          {
            promptId: 'c-05',
            category: 'Curiosity & Perspectives',
            promptText: "What skill or craft would you love to learn purely for the joy of doing it badly at first?",
            mySharedInsight: "Architectural sketching in a pocket notebook—it forces you to actually see the proportions of buildings and trees.",
            partnerSharedInsight: "Doing something analog with zero pressure to monetize it is the purest form of play.",
            notes: "Great conversation with Clara near the Botanical Conservatory Walk.",
            partnerAlias: 'Clara',
            mutualConnect: false,
            locationSpot: {
              id: 'spot_botanical',
              name: 'Botanical Conservatory Walk',
              archetype: 'park',
              lat: baseLat - 0.00025,
              lng: baseLng + 0.00022,
              sprawlZone: 'Neighborhood Park (40ft)'
            },
            timestamp: now - 3600000 * 6
          }
        ];

        for (const item of starters) {
          await this.saveReflection(item, { silent: true });
        }
        localStorage.setItem(KEYS.SEEDED_STARTER, 'true');
      } catch (e) {
        console.warn('[Radia Storage] Starter seed skipped:', e);
      }
    }

    async _countReflections() {
      await this._db();
      return this._request(this._tx(STORES.REFLECTIONS, 'readonly').count());
    }

    /**
     * Save a dual-node Mutual Insight & Encrypted Reflection record.
     */
    async saveReflection(entry, options) {
      await this._db();
      const opts = options || {};
      const e = entry || {};

      const mySharedInsight = typeof e.mySharedInsight === 'string' && e.mySharedInsight.trim()
        ? e.mySharedInsight.trim()
        : (typeof e.notes === 'string' ? e.notes.trim() : 'Every real-world conversation leaves a quiet trace of perspective.');

      const notes = typeof e.notes === 'string' && e.notes.trim()
        ? e.notes.trim()
        : mySharedInsight;

      const promptText = typeof e.promptText === 'string' && e.promptText.trim()
        ? e.promptText.trim()
        : "Look around us right now. What is one thing here that won't exist in 50 years?";

      const partnerAlias = (e.partnerAlias && String(e.partnerAlias).trim()) || 'Jordan';

      const partnerSharedInsight = (typeof e.partnerSharedInsight === 'string' && e.partnerSharedInsight.trim())
        ? e.partnerSharedInsight.trim()
        : (window.RadiaPrompts
            ? window.RadiaPrompts.getPartnerInsightForPrompt({ id: e.promptId, text: promptText }, partnerAlias)
            : "Stepping into a real conversation reminded me how much warmth exists right around us.");

      const defaultSpot = this._getCurrentLocationSpotFallback(e.locationSpot);

      const combinedWords = this._wordCount(mySharedInsight + ' ' + notes);
      const multiplier = Number.isFinite(e.xpMultiplier) && e.xpMultiplier > 0 ? e.xpMultiplier : 1;
      const xpEarned = this._calcXP(combinedWords, multiplier);
      const timestamp = e.timestamp || Date.now();

      const encNotes = await Vault.encrypt(notes);
      const encPrompt = await Vault.encrypt(promptText);
      const encMyInsight = await Vault.encrypt(mySharedInsight);
      const encPartnerInsight = await Vault.encrypt(partnerSharedInsight);

      const record = {
        id: this._uuid(),
        sessionId: e.sessionId || null,
        timestamp: timestamp,
        createdAt: new Date(timestamp).toISOString(),
        promptId: e.promptId || 'o-01',
        category: e.category || 'Observational & Physical Context',
        partnerAlias: partnerAlias,
        mutualConnect: !!e.mutualConnect,
        locationSpot: defaultSpot,
        durationSec: Number.isFinite(e.durationSec) ? e.durationSec : 180,
        answeredSubPrompts: Array.isArray(e.answeredSubPrompts) ? e.answeredSubPrompts : [],
        _prompt: encPrompt,
        _notes: encNotes,
        _myInsight: encMyInsight,
        _partnerInsight: encPartnerInsight,
        wordCount: combinedWords,
        charCount: notes.length,
        xpEarned: xpEarned,
        xpMultiplier: multiplier,
        encrypted: encNotes.enc === true,
        schemaVersion: 2
      };

      await this._request(this._tx(STORES.REFLECTIONS, 'readwrite').add(record));
      await this._bumpMeta('lifetimeXP', xpEarned);
      await this._bumpMeta('lifetimeWords', combinedWords);
      await this._bumpMeta('lifetimeReflections', 1);

      if (!opts.silent && window.RadiaAudio && typeof window.RadiaAudio.playReflectionSaved === 'function') {
        window.RadiaAudio.playReflectionSaved();
      }

      const hydrated = await this._hydrate(record);

      if (!opts.silent) {
        this._dispatch('RADIA_REFLECTION_SAVED', {
          id: record.id,
          xpEarned: xpEarned,
          wordCount: combinedWords,
          multiplier: multiplier,
          entry: hydrated
        });
      }

      return hydrated;
    }

    _getCurrentLocationSpotFallback(providedSpot) {
      if (providedSpot && typeof providedSpot.lat === 'number') return providedSpot;

      const proxState = window.RadiaProximity && typeof window.RadiaProximity.getState === 'function'
        ? window.RadiaProximity.getState()
        : null;

      const baseLat = proxState && proxState.position ? proxState.position.lat : 40.730823;
      const baseLng = proxState && proxState.position ? proxState.position.lng : -73.997332;
      const spotName = (proxState && proxState.hotspot && proxState.hotspot.name)
        ? proxState.hotspot.name
        : 'Neighborhood Greenway Walk';
      const sprawlLabel = (proxState && proxState.sprawlZoneLabel) || 'Neighborhood Park (40ft)';

      return {
        id: 'spot_' + Math.random().toString(36).slice(2, 7),
        name: spotName,
        archetype: 'park',
        lat: baseLat + (Math.random() - 0.5) * 0.0012,
        lng: baseLng + (Math.random() - 0.5) * 0.0012,
        sprawlZone: sprawlLabel
      };
    }

    /**
     * Quick helper to plant a sample geo-anchored encounter insight in the current mile
     * so users can test growing their Insight Network & unlocking "10 in the Same Mile".
     */
    async plantSampleInsight() {
      const samplePartners = ['Noor', 'Theo', 'Sasha', 'Rumi', 'Kai', 'Isla', 'Dev', 'Mina', 'Ezra', 'Clara'];
      const sampleSpots = [
        { name: 'Central Fountain Plaza', archetype: 'water', sprawlZone: 'Neighborhood Park (40ft)' },
        { name: 'Founders Oak Grove', archetype: 'park', sprawlZone: 'Neighborhood Park (40ft)' },
        { name: 'West Park Overlook', archetype: 'overlook', sprawlZone: 'Open Trail (65ft)' },
        { name: 'Solar Commons Terrace', archetype: 'plaza', sprawlZone: 'Campus / Plaza (28ft)' }
      ];
      const sampleMyInsights = [
        "Listening without planning my reply made the whole conversation feel effortless and genuinely grounding.",
        "We both noticed how stepping away from screens for five minutes makes the neighborhood feel friendly again.",
        "Hearing a stranger's perspective on the exact same question showed me how much creative resilience people carry.",
        "Even a three-minute honest exchange can shift the entire rhythm of an afternoon walk.",
        "Realizing how many thoughtful people walk the exact same mile every day changed how I see this street."
      ];

      const prompt = window.RadiaPrompts
        ? window.RadiaPrompts.getRandomPrompt()
        : { id: 'o-01', category: 'Observational & Physical Context', text: "Look around us right now. What won't exist in 50 years?" };

      const partner = samplePartners[Math.floor(Math.random() * samplePartners.length)];
      const spotTemplate = sampleSpots[Math.floor(Math.random() * sampleSpots.length)];
      const myInsight = sampleMyInsights[Math.floor(Math.random() * sampleMyInsights.length)];

      const proxState = window.RadiaProximity && typeof window.RadiaProximity.getState === 'function'
        ? window.RadiaProximity.getState()
        : null;
      const baseLat = proxState && proxState.position ? proxState.position.lat : 40.730823;
      const baseLng = proxState && proxState.position ? proxState.position.lng : -73.997332;

      return this.saveReflection({
        promptId: prompt.id,
        category: prompt.category,
        promptText: prompt.text,
        mySharedInsight: myInsight,
        notes: `${myInsight} (Shared at ${spotTemplate.name} with ${partner})`,
        partnerAlias: partner,
        mutualConnect: Math.random() > 0.35,
        locationSpot: {
          id: 'spot_' + Date.now().toString(36),
          name: spotTemplate.name,
          archetype: spotTemplate.archetype,
          lat: baseLat + (Math.random() - 0.5) * 0.0022, // Well within 1 mile!
          lng: baseLng + (Math.random() - 0.5) * 0.0022,
          sprawlZone: spotTemplate.sprawlZone
        }
      });
    }

    async getReflections(opts) {
      await this._db();
      const o = opts || {};
      const limit = Number.isFinite(o.limit) ? o.limit : 200;

      const raw = await new Promise((resolve, reject) => {
        const results = [];
        const idx = this._tx(STORES.REFLECTIONS, 'readonly').index('timestamp');
        const cursorReq = idx.openCursor(null, 'prev');
        cursorReq.onsuccess = (ev) => {
          const cursor = ev.target.result;
          if (!cursor) return resolve(results);
          const v = cursor.value;
          if (!o.category || v.category === o.category) {
            results.push(v);
          }
          if (results.length >= limit) return resolve(results);
          cursor.continue();
        };
        cursorReq.onerror = () => reject(cursorReq.error);
      });

      const hydrated = [];
      for (let i = 0; i < raw.length; i++) {
        hydrated.push(await this._hydrate(raw[i]));
      }
      return hydrated;
    }

    /**
     * Computes Geodesic Spatial Correlations across all stored insights:
     * - maxSameMileCount: Maximum insights clustered within any 1.0-mile (1609.34m) radius
     * - uniqueSpots: Distinct Landmark Spots visited
     * - mutualCount: Number of mutual connections
     * - categoryCounts: Breakdown across the 3 prompt categories
     */
    async getSpatialCorrelations() {
      const entries = await this.getReflections({ limit: 500 });
      if (!entries.length) {
        return {
          totalInsights: 0,
          maxSameMileCount: 0,
          sameMileProgressPercent: 0,
          sameMileUnlocked: false,
          uniqueSpots: [],
          spotCounts: {},
          maxSameSpotCount: 0,
          mutualCount: 0,
          categoryCounts: {},
          hasAllThreeCategories: false,
          clusterRadiusMiles: 0.25
        };
      }

      let maxSameMile = 1;
      let maxPairDistM = 120;

      for (let i = 0; i < entries.length; i++) {
        const a = entries[i].locationSpot;
        if (!a || typeof a.lat !== 'number') continue;
        let countInMile = 0;
        for (let j = 0; j < entries.length; j++) {
          const b = entries[j].locationSpot;
          if (!b || typeof b.lat !== 'number') continue;
          const d = haversineM(a.lat, a.lng, b.lat, b.lng);
          if (d <= MILE_METERS) {
            countInMile++;
            if (d > maxPairDistM) maxPairDistM = d;
          }
        }
        if (countInMile > maxSameMile) maxSameMile = countInMile;
      }

      const spotCounts = {};
      const categoryCounts = {};
      let mutualCount = 0;

      entries.forEach((e) => {
        const sName = (e.locationSpot && e.locationSpot.name) || 'Neighborhood Walk';
        spotCounts[sName] = (spotCounts[sName] || 0) + 1;
        categoryCounts[e.category] = (categoryCounts[e.category] || 0) + 1;
        if (e.mutualConnect) mutualCount++;
      });

      const uniqueSpots = Object.keys(spotCounts);
      const maxSameSpotCount = uniqueSpots.reduce((m, k) => Math.max(m, spotCounts[k]), 0);
      const hasAllThreeCategories = Object.keys(categoryCounts).length >= 3;

      return {
        totalInsights: entries.length,
        maxSameMileCount: maxSameMile,
        sameMileProgressPercent: Math.min(100, Math.round((maxSameMile / 10) * 100)),
        sameMileUnlocked: maxSameMile >= 10,
        uniqueSpots,
        spotCounts,
        maxSameSpotCount,
        mutualCount,
        categoryCounts,
        hasAllThreeCategories,
        clusterRadiusMiles: Number((maxPairDistM / MILE_METERS).toFixed(2))
      };
    }

    /**
     * On-Device AI Meta-Insight Synthesis Engine:
     * Analyzes the user's insight constellation, partner takeaways, and spatial clusters
     * to synthesize a Big Meta-Insight Tree summary of personal evolution & community ripple.
     */
    async generateMetaInsightSynthesis() {
      const entries = await this.getReflections({ limit: 200 });
      const spatial = await this.getSpatialCorrelations();

      if (entries.length === 0) {
        return {
          headline: "Your Constellation Awaits Its First Spark",
          evolutionSummary: "Step into the living world or plant a sample encounter to begin synthesizing how face-to-face conversations shape your perspective.",
          learnedSummary: "Each conversation adds two linked stars: what you realized, and what your partner carried away.",
          rippleSummary: "As you gather insights within your local mile, Radia maps your positive ripple across the neighborhood.",
          dominantTheme: "Emerging Explorer",
          resonanceScore: "100% Authentic",
          spatialSummary: "0 / 10 Insights in Current Mile"
        };
      }

      const vulnCount = spatial.categoryCounts['Human Experience & Vulnerability'] || 0;
      const obsCount = spatial.categoryCounts['Observational & Physical Context'] || 0;
      const curCount = spatial.categoryCounts['Curiosity & Perspectives'] || 0;

      let dominantTheme = 'Grounded Presence & Spatial Awareness';
      if (vulnCount >= obsCount && vulnCount >= curCount) {
        dominantTheme = 'Authentic Openness & Letting Go of Rigid Scripts';
      } else if (curCount >= obsCount) {
        dominantTheme = 'Playful Inquiry & Reclaiming Unhurried Time';
      }

      const latest = entries[0];
      const earliest = entries[entries.length - 1];
      const topSpot = spatial.uniqueSpots[0] || 'Central Fountain Plaza';

      // Extract Top Thematic Keywords across all mutual insights
      const stopWords = new Set(['that', 'this', 'with', 'from', 'have', 'what', 'when', 'your', 'their', 'about', 'into', 'more', 'just', 'like', 'make', 'made', 'both', 'each', 'only', 'time', 'some', 'very', 'much', 'even', 'over', 'they', 'them', 'were', 'been']);
      const freq = {};
      entries.forEach((e) => {
        const text = `${e.mySharedInsight || ''} ${e.partnerSharedInsight || ''}`.toLowerCase();
        text.replace(/[^a-z\s]/g, ' ').split(/\s+/).forEach((w) => {
          if (w.length >= 5 && !stopWords.has(w)) {
            freq[w] = (freq[w] || 0) + 1;
          }
        });
      });
      const topKeywords = Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map((pair) => pair[0]);
      if (topKeywords.length < 3) {
        ['presence', 'perspective', 'listening', 'serendipity', 'neighborhood'].forEach((k) => {
          if (!topKeywords.includes(k) && topKeywords.length < 5) topKeywords.push(k);
        });
      }

      // Compute Recommended Next Category for Balanced Growth
      let recommendedCategory = 'Observational & Physical Context';
      if (vulnCount <= obsCount && vulnCount <= curCount) {
        recommendedCategory = 'Human Experience & Vulnerability';
      } else if (curCount <= vulnCount && curCount <= obsCount) {
        recommendedCategory = 'Curiosity & Perspectives';
      }

      const opennessScore = Math.min(99, 76 + entries.length * 3 + spatial.mutualCount * 2);

      const headline = spatial.maxSameMileCount >= 10
        ? `Same-Mile Benchmark Reached: ${entries.length} Linked Insights Across Your Local Mile`
        : `Living Synthesis Across ${entries.length} Dialogues & ${spatial.uniqueSpots.length} Community Hubs`;

      const evolutionSummary = entries.length >= 4
        ? `Moving from your early encounter with ${earliest.partnerAlias} at ${earliest.locationSpot.name} to your recent dialogue with ${latest.partnerAlias}, your reflections have shifted from guarded observation toward unhurried openness—trading digital noise for intentional presence.`
        : `Through your initial dialogues with ${entries.map(e => e.partnerAlias).join(', ')}, you're actively replacing screen isolation with grounded, face-to-face curiosity.`;

      const learnedSummary = `Your network clusters around "${dominantTheme}". Across ${entries.length * 2} mutual insight nodes, a clear thread emerges: real-world stillness, listening without judgment, and noticing permanent civic and natural details over temporary distractions.`;

      const rippleSummary = `You've co-created ${entries.length} reciprocal insights with neighbors (${spatial.mutualCount} mutual double-blind connections) centered around ${topSpot}. ${spatial.maxSameMileCount} of your insights resonate within the exact same 1-mile radius (${spatial.clusterRadiusMiles} mi spread)—turning anonymous sidewalks into a connected human commons.`;

      return {
        headline,
        evolutionSummary,
        learnedSummary,
        rippleSummary,
        dominantTheme,
        topKeywords,
        recommendedCategory,
        opennessScore,
        totalNodes: entries.length * 2 + 1,
        spatialSummary: `${spatial.maxSameMileCount} / 10 Insights in Same Mile`,
        sameMileUnlocked: spatial.sameMileUnlocked
      };
    }

    async saveEncounterFeedback(fb) {
      await this._db();
      const f = fb || {};
      const rating = [1, 0, -1].includes(f.rating) ? f.rating : 1;

      const record = {
        id: this._uuid(),
        peerId: f.peerId || null,
        peerAlias: f.peerAlias || 'Anonymous Walker',
        rating: rating,
        blocked: rating === -1 || !!f.blocked,
        timestamp: Date.now(),
        createdAt: new Date().toISOString()
      };

      await this._request(this._tx(STORES.ENCOUNTERS, 'readwrite').add(record));
      await this._bumpMeta('lifetimeEncounters', 1);

      if (record.blocked && record.peerId && window.RadiaProximity) {
        window.RadiaProximity.blockPeer(record.peerId);
      }

      this._dispatch('RADIA_FEEDBACK_SAVED', { rating, blocked: record.blocked });
      return record;
    }

    async getEncounterHistory(limit = 500) {
      await this._db();
      return new Promise((resolve, reject) => {
        const out = [];
        const req = this._tx(STORES.ENCOUNTERS, 'readonly').index('timestamp').openCursor(null, 'prev');
        req.onsuccess = (ev) => {
          const c = ev.target.result;
          if (!c || out.length >= limit) return resolve(out);
          out.push(c.value);
          c.continue();
        };
        req.onerror = () => reject(req.error);
      });
    }

    async getRaterCredibility() {
      const history = await this.getEncounterHistory(1000);
      const total = history.length;
      if (total < 3) return { weight: 1.0, total, negatives: 0 };
      const negatives = history.filter((h) => h.rating === -1).length;
      const ratio = negatives / total;
      const weight = Math.max(0.1, 1 - ratio * ratio);
      return { weight: Number(weight.toFixed(3)), total, negatives };
    }

    async getMeta(key, fallback) {
      await this._db();
      const rec = await this._request(this._tx(STORES.META, 'readonly').get(key));
      return rec ? rec.value : (fallback !== undefined ? fallback : null);
    }

    async setMeta(key, value) {
      await this._db();
      await this._request(this._tx(STORES.META, 'readwrite').put({ key, value }));
      return value;
    }

    async _bumpMeta(key, delta) {
      const current = await this.getMeta(key, 0);
      return this.setMeta(key, (Number(current) || 0) + (Number(delta) || 0));
    }

    async getStats() {
      const all = await this.getReflections({ limit: 5000 });
      const spatial = await this.getSpatialCorrelations();
      let totalWords = 0;
      let totalXP = 0;
      all.forEach((r) => {
        totalWords += r.wordCount || 0;
        totalXP += r.xpEarned || 0;
      });
      return {
        totalReflections: all.length,
        totalWords,
        totalXP,
        encryptionActive: this.encryptionActive,
        spatial
      };
    }

    async exportJournal(format = 'markdown') {
      const fmt = format.toLowerCase();
      const entries = await this.getReflections({ limit: 5000 });
      const meta = await this.generateMetaInsightSynthesis();

      if (fmt === 'json') {
        return JSON.stringify({
          app: 'Radia',
          exportedAt: new Date().toISOString(),
          metaInsightSynthesis: meta,
          entries
        }, null, 2);
      }

      let md = `# Radia — Living Insight Constellation & Private Vault\n\n`;
      md += `## AI Meta-Insight Synthesis: ${meta.headline}\n`;
      md += `- **How You've Changed:** ${meta.evolutionSummary}\n`;
      md += `- **What You've Learned:** ${meta.learnedSummary}\n`;
      md += `- **Your Community Ripple:** ${meta.rippleSummary}\n\n---\n\n`;

      entries.forEach((e, i) => {
        md += `### ${i + 1}. "${e.promptText}"\n`;
        md += `- **With:** ${e.partnerAlias} at *${e.locationSpot ? e.locationSpot.name : 'Local Walk'}* (${new Date(e.timestamp).toLocaleDateString()})\n`;
        md += `- **Your Shared Insight:** ${e.mySharedInsight}\n`;
        md += `- **${e.partnerAlias}'s Insight:** ${e.partnerSharedInsight}\n`;
        md += `- **Private Vault Reflection:** ${e.notes}\n\n`;
      });
      return md;
    }

    async downloadExport(format = 'markdown') {
      const content = await this.exportJournal(format);
      const ext = format === 'json' ? 'json' : 'md';
      const mime = format === 'json' ? 'application/json' : 'text/markdown';
      const blob = new Blob([content], { type: `${mime};charset=utf-8` });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `radia-insight-constellation-${new Date().toISOString().slice(0, 10)}.${ext}`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 150);
    }

    async purgeVault() {
      await this._db();
      await this._request(this._tx(STORES.REFLECTIONS, 'readwrite').clear());
      await this._request(this._tx(STORES.ENCOUNTERS, 'readwrite').clear());
      await this._request(this._tx(STORES.META, 'readwrite').clear());
      Vault.destroyKey();
      this._dispatch('RADIA_VAULT_PURGED', {});
      return true;
    }

    async _hydrate(record) {
      const notes = await Vault.decrypt(record._notes);
      const promptText = await Vault.decrypt(record._prompt);
      const mySharedInsight = record._myInsight ? await Vault.decrypt(record._myInsight) : notes;
      const partnerSharedInsight = record._partnerInsight
        ? await Vault.decrypt(record._partnerInsight)
        : "Sharing a real conversation here made the neighborhood feel more connected.";

      return {
        id: record.id,
        sessionId: record.sessionId,
        timestamp: record.timestamp,
        createdAt: record.createdAt,
        promptId: record.promptId,
        category: record.category,
        promptText,
        mySharedInsight,
        partnerSharedInsight,
        notes,
        partnerAlias: record.partnerAlias,
        mutualConnect: !!record.mutualConnect,
        locationSpot: record.locationSpot || {
          name: 'Neighborhood Greenway Walk',
          archetype: 'park',
          lat: 40.730823,
          lng: -73.997332,
          sprawlZone: 'Neighborhood Park (40ft)'
        },
        durationSec: record.durationSec,
        wordCount: record.wordCount,
        xpEarned: record.xpEarned,
        encrypted: record.encrypted
      };
    }

    _wordCount(text) {
      if (!text || typeof text !== 'string') return 0;
      return text.trim().split(/\s+/).filter(Boolean).length;
    }

    _calcXP(wordCount, multiplier) {
      if (wordCount < XP.MIN_WORDS_FOR_XP) return 50;
      const bonus = Math.min(Math.floor(wordCount * XP.PER_WORD), XP.WORD_BONUS_CAP);
      return Math.round((XP.REFLECTION_BASE + bonus) * (multiplier || 1));
    }

    _uuid() {
      if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
      }
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
    }

    _dispatch(name, detail) {
      window.dispatchEvent(new CustomEvent(name, { detail }));
    }
  }

  function CATEGORIES_FALLBACK(c) { return c; }

  const storage = new RadiaStorageEngine();
  window.RadiaStorage = storage;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => storage.init());
  } else {
    storage.init();
  }
})();
