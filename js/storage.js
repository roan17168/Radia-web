/**
 * ============================================================================
 * RADIA — ZERO-KNOWLEDGE ON-DEVICE VAULT (js/storage.js)
 * ----------------------------------------------------------------------------
 *  PRIVACY CONTRACT (non-negotiable, enforced by architecture):
 *    • Reflections are written to IndexedDB on THIS device only.
 *    • Nothing in this module ever touches fetch(), XHR, WebSocket, or the
 *      WebRTC DataChannel. There is no transport layer in this file at all.
 *    • Reflection bodies are encrypted at rest with AES-256-GCM using a key
 *      generated locally by WebCrypto and never leaving the device.
 *    • The user may wipe everything irreversibly with one call.
 *
 *  STORES
 *    reflections  — private journal entries (encrypted body)
 *    encounters   — private 3-tier safety signals + anti-spite rater weight
 *    meta         — lightweight local counters / vault configuration
 *
 *  Public singleton: window.RadiaStorage
 * ============================================================================
 */

(function () {
  'use strict';

  /* ==========================================================================
     CONFIGURATION
     ========================================================================== */

  const DB_NAME = 'radia_reflection_vault';
  const DB_VERSION = 1;

  const STORES = {
    REFLECTIONS: 'reflections',
    ENCOUNTERS: 'encounters',
    META: 'meta'
  };

  const KEYS = {
    VAULT_KEY: 'radia_vault_key_v1',          // Local AES-GCM key (JWK)
    ENCRYPTION_ON: 'radia_vault_encrypted'
  };

  const XP = {
    REFLECTION_BASE: 75,        // Matches gamification.js: +75 for a reflection
    PER_WORD: 0.5,
    WORD_BONUS_CAP: 75,         // Max 150 XP total — thoughtful, not grindable
    MIN_WORDS_FOR_XP: 3
  };

  /* ==========================================================================
     LOCAL CRYPTO — AES-256-GCM AT REST
     The key is created by WebCrypto on first run and persisted in
     localStorage. It is never transmitted, never derived from a server value,
     and is destroyed by purgeVault().
     ========================================================================== */

  const Vault = {
    key: null,
    available: false,

    async init() {
      // Requires a secure context (https:// or localhost). GitHub Pages is https.
      this.available = !!(window.crypto && window.crypto.subtle && window.isSecureContext);
      if (!this.available) {
        console.warn('[Radia Vault] WebCrypto unavailable (insecure context). ' +
                     'Reflections will be stored locally in plaintext on this device only.');
        return false;
      }

      try {
        const stored = localStorage.getItem(KEYS.VAULT_KEY);
        if (stored) {
          this.key = await crypto.subtle.importKey(
            'jwk', JSON.parse(stored),
            { name: 'AES-GCM', length: 256 },
            true, ['encrypt', 'decrypt']
          );
        } else {
          this.key = await crypto.subtle.generateKey(
            { name: 'AES-GCM', length: 256 },
            true, ['encrypt', 'decrypt']
          );
          const jwk = await crypto.subtle.exportKey('jwk', this.key);
          localStorage.setItem(KEYS.VAULT_KEY, JSON.stringify(jwk));
          localStorage.setItem(KEYS.ENCRYPTION_ON, 'true');
        }
        return true;
      } catch (err) {
        console.warn('[Radia Vault] Key initialization failed; falling back to plaintext.', err);
        this.available = false;
        this.key = null;
        return false;
      }
    },

    /** @returns {Promise<{c:string, iv:string, enc:true} | {t:string, enc:false}>} */
    async encrypt(plaintext) {
      const text = String(plaintext == null ? '' : plaintext);
      if (!this.available || !this.key) return { t: text, enc: false };

      try {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const buf = new TextEncoder().encode(text);
        const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, this.key, buf);
        return { c: this._b64(cipher), iv: this._b64(iv.buffer), enc: true };
      } catch (err) {
        console.warn('[Radia Vault] Encrypt failed; storing plaintext locally.', err);
        return { t: text, enc: false };
      }
    },

    async decrypt(payload) {
      if (!payload) return '';
      if (payload.enc !== true) return payload.t || '';
      if (!this.available || !this.key) return '[Locked — vault key unavailable on this device]';

      try {
        const iv = new Uint8Array(this._unb64(payload.iv));
        const data = this._unb64(payload.c);
        const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, this.key, data);
        return new TextDecoder().decode(plain);
      } catch (err) {
        console.warn('[Radia Vault] Decrypt failed for one entry.', err);
        return '[Unreadable — this entry was written with a different vault key]';
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
     THE VAULT STORE
     ========================================================================== */

  class RadiaStorageEngine {
    constructor() {
      this.db = null;
      this.ready = false;
      this.encryptionActive = false;
      this._readyPromise = null;
    }

    /* ----------------------------------------------------------------------
       LIFECYCLE
       ---------------------------------------------------------------------- */

    init() {
      if (this._readyPromise) return this._readyPromise;

      this._readyPromise = (async () => {
        this.encryptionActive = await Vault.init();
        this.db = await this._openDB();
        this.ready = true;

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
        if (!('indexedDB' in window)) {
          return reject(new Error('IndexedDB is not supported in this browser.'));
        }

        const req = window.indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = (event) => {
          const db = event.target.result;

          /* ---- reflections ---- */
          if (!db.objectStoreNames.contains(STORES.REFLECTIONS)) {
            const s = db.createObjectStore(STORES.REFLECTIONS, { keyPath: 'id' });
            s.createIndex('timestamp', 'timestamp', { unique: false });
            s.createIndex('category', 'category', { unique: false });
            s.createIndex('promptId', 'promptId', { unique: false });
            s.createIndex('sessionId', 'sessionId', { unique: false });
          }

          /* ---- encounters (private safety signals) ---- */
          if (!db.objectStoreNames.contains(STORES.ENCOUNTERS)) {
            const s = db.createObjectStore(STORES.ENCOUNTERS, { keyPath: 'id' });
            s.createIndex('timestamp', 'timestamp', { unique: false });
            s.createIndex('rating', 'rating', { unique: false });
            s.createIndex('peerId', 'peerId', { unique: false });
          }

          /* ---- meta ---- */
          if (!db.objectStoreNames.contains(STORES.META)) {
            db.createObjectStore(STORES.META, { keyPath: 'key' });
          }
        };

        req.onsuccess = (e) => {
          const db = e.target.result;
          db.onversionchange = () => { db.close(); this.ready = false; };
          resolve(db);
        };

        req.onerror = (e) =>
          reject(new Error('Failed to open vault: ' + (e.target.error && e.target.error.message)));

        req.onblocked = () =>
          console.warn('[Radia Storage] Vault upgrade blocked by another open tab.');
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
        req.onerror = () => reject(new Error(req.error && req.error.message));
      });
    }

    /* ----------------------------------------------------------------------
       REFLECTIONS — WRITE
       ---------------------------------------------------------------------- */

    /**
     * Persist a private reflection. Body is encrypted before it ever touches disk.
     *
     * @param {Object} entry
     * @param {string} entry.promptText      The catalyst shown during the encounter.
     * @param {string} entry.notes           The user's free-written reflection.
     * @param {string} [entry.promptId]
     * @param {string} [entry.category]
     * @param {string} [entry.sessionId]
     * @param {string} [entry.partnerAlias]  First name only, or 'Anonymous Walker'.
     * @param {number} [entry.durationSec]   Length of the conversation.
     * @param {number} [entry.xpMultiplier]  Hotspot multiplier from proximity.js.
     * @param {string[]} [entry.answeredSubPrompts]
     * @returns {Promise<Object>} Decrypted, UI-ready record.
     */
    async saveReflection(entry) {
      await this._db();

      const e = entry || {};
      const notes = typeof e.notes === 'string' ? e.notes.trim() : '';
      const promptText = typeof e.promptText === 'string' ? e.promptText.trim() : '';

      const wordCount = this._wordCount(notes);
      const multiplier = Number.isFinite(e.xpMultiplier) && e.xpMultiplier > 0 ? e.xpMultiplier : 1;
      const xpEarned = this._calcXP(wordCount, multiplier);
      const timestamp = Date.now();

      // Encrypt the two sensitive fields only; metadata stays queryable.
      const encNotes = await Vault.encrypt(notes);
      const encPrompt = await Vault.encrypt(promptText);

      const record = {
        id: this._uuid(),
        sessionId: e.sessionId || null,
        timestamp: timestamp,
        createdAt: new Date(timestamp).toISOString(),

        promptId: e.promptId || null,
        category: e.category || 'General',
        partnerAlias: (e.partnerAlias && String(e.partnerAlias).trim()) || 'Anonymous Walker',
        durationSec: Number.isFinite(e.durationSec) ? e.durationSec : null,
        answeredSubPrompts: Array.isArray(e.answeredSubPrompts) ? e.answeredSubPrompts : [],

        // Encrypted payloads
        _prompt: encPrompt,
        _notes: encNotes,

        // Queryable, non-sensitive metadata
        wordCount: wordCount,
        charCount: notes.length,
        xpEarned: xpEarned,
        xpMultiplier: multiplier,
        encrypted: encNotes.enc === true,
        schemaVersion: 1
      };

      await this._request(this._tx(STORES.REFLECTIONS, 'readwrite').add(record));
      await this._bumpMeta('lifetimeXP', xpEarned);
      await this._bumpMeta('lifetimeWords', wordCount);
      await this._bumpMeta('lifetimeReflections', 1);

      if (window.RadiaAudio && typeof window.RadiaAudio.playReflectionSaved === 'function') {
        window.RadiaAudio.playReflectionSaved();
      }

      const hydrated = await this._hydrate(record);

      this._dispatch('RADIA_REFLECTION_SAVED', {
        id: record.id,
        xpEarned: xpEarned,
        wordCount: wordCount,
        multiplier: multiplier
      });

      return hydrated;
    }

    /* ----------------------------------------------------------------------
       REFLECTIONS — READ
       ---------------------------------------------------------------------- */

    /**
     * Fetch the private journal, newest first.
     * @param {Object} [opts] { limit, offset, category, search, from, to }
     * @returns {Promise<Array<Object>>} Decrypted records.
     */
    async getReflections(opts) {
      await this._db();
      const o = opts || {};
      const limit = Number.isFinite(o.limit) ? o.limit : 200;
      const offset = Number.isFinite(o.offset) ? o.offset : 0;

      const raw = await new Promise((resolve, reject) => {
        const results = [];
        const idx = this._tx(STORES.REFLECTIONS, 'readonly').index('timestamp');
        const cursorReq = idx.openCursor(null, 'prev');

        cursorReq.onsuccess = (ev) => {
          const cursor = ev.target.result;
          if (!cursor) return resolve(results);

          const v = cursor.value;
          let keep = true;

          if (o.category && v.category !== o.category) keep = false;
          if (o.from && v.timestamp < o.from) keep = false;
          if (o.to && v.timestamp > o.to) keep = false;

          if (keep) results.push(v);
          if (results.length >= offset + limit) return resolve(results);
          cursor.continue();
        };

        cursorReq.onerror = () =>
          reject(new Error('Journal read failed: ' + (cursorReq.error && cursorReq.error.message)));
      });

      const page = raw.slice(offset, offset + limit);
      const hydrated = [];
      for (let i = 0; i < page.length; i++) {
        hydrated.push(await this._hydrate(page[i]));
      }

      // Full-text search happens AFTER local decryption — never on the server,
      // because there is no server.
      if (o.search && String(o.search).trim()) {
        const q = String(o.search).trim().toLowerCase();
        return hydrated.filter((r) =>
          (r.notes && r.notes.toLowerCase().indexOf(q) !== -1) ||
          (r.promptText && r.promptText.toLowerCase().indexOf(q) !== -1)
        );
      }

      return hydrated;
    }

    async getReflection(id) {
      await this._db();
      const rec = await this._request(this._tx(STORES.REFLECTIONS, 'readonly').get(id));
      return rec ? this._hydrate(rec) : null;
    }

    async deleteReflection(id) {
      if (!id) throw new Error('A reflection id is required.');
      await this._db();
      await this._request(this._tx(STORES.REFLECTIONS, 'readwrite').delete(id));
      this._dispatch('RADIA_REFLECTION_DELETED', { id: id });
      return true;
    }

    /* ----------------------------------------------------------------------
       STATS
       ---------------------------------------------------------------------- */

    async getStats() {
      const all = await this.getReflections({ limit: 10000 });

      const byCategory = {};
      let totalWords = 0;
      let totalXP = 0;
      let longest = 0;

      all.forEach((r) => {
        totalWords += r.wordCount || 0;
        totalXP += r.xpEarned || 0;
        if (r.wordCount > longest) longest = r.wordCount;
        byCategory[r.category] = (byCategory[r.category] || 0) + 1;
      });

      return {
        totalReflections: all.length,
        totalWords: totalWords,
        totalXP: totalXP,
        averageWords: all.length ? Math.round(totalWords / all.length) : 0,
        longestReflection: longest,
        byCategory: byCategory,
        currentStreakDays: this._calcStreak(all),
        firstEntry: all.length ? all[all.length - 1].createdAt : null,
        lastEntry: all.length ? all[0].createdAt : null,
        encryptionActive: this.encryptionActive
      };
    }

    /** Consecutive-day writing streak, computed entirely locally. */
    _calcStreak(sortedDesc) {
      if (!sortedDesc.length) return 0;

      const dayKey = (ts) => new Date(ts).toISOString().slice(0, 10);
      const days = new Set(sortedDesc.map((r) => dayKey(r.timestamp)));

      let streak = 0;
      const cursor = new Date();

      // Allow the streak to survive if today hasn't been written yet.
      if (!days.has(dayKey(cursor.getTime()))) {
        cursor.setDate(cursor.getDate() - 1);
      }

      while (days.has(dayKey(cursor.getTime()))) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
      }

      return streak;
    }

    /* ----------------------------------------------------------------------
       PRIVATE SAFETY SIGNALS (3-tier, never public, never uploaded)
       ---------------------------------------------------------------------- */

    /**
     * @param {Object} fb
     * @param {string} fb.peerId
     * @param {number} fb.rating   1 = Good Vibe | 0 = Neutral | -1 = Unsafe/Off
     * @param {boolean} [fb.blocked]
     * @param {string} [fb.reason]
     */
    async saveEncounterFeedback(fb) {
      await this._db();
      const f = fb || {};
      const rating = [1, 0, -1].indexOf(f.rating) !== -1 ? f.rating : 0;

      const record = {
        id: this._uuid(),
        sessionId: f.sessionId || null,
        peerId: f.peerId || null,
        peerAlias: f.peerAlias || 'Anonymous Walker',
        rating: rating,
        blocked: !!f.blocked,
        reason: f.reason || null,
        durationSec: Number.isFinite(f.durationSec) ? f.durationSec : null,
        timestamp: Date.now(),
        createdAt: new Date().toISOString()
      };

      await this._request(this._tx(STORES.ENCOUNTERS, 'readwrite').add(record));
      await this._bumpMeta('lifetimeEncounters', 1);

      // Mirror a block into the proximity engine's permanent invisibility list.
      if (record.blocked && record.peerId &&
          window.RadiaProximity && typeof window.RadiaProximity.blockPeer === 'function') {
        window.RadiaProximity.blockPeer(record.peerId);
      }

      this._dispatch('RADIA_FEEDBACK_SAVED', { rating: rating, blocked: record.blocked });
      return record;
    }

    async getEncounterHistory(limit) {
      await this._db();
      const cap = Number.isFinite(limit) ? limit : 500;

      return new Promise((resolve, reject) => {
        const out = [];
        const req = this._tx(STORES.ENCOUNTERS, 'readonly').index('timestamp').openCursor(null, 'prev');
        req.onsuccess = (ev) => {
          const c = ev.target.result;
          if (!c || out.length >= cap) return resolve(out);
          out.push(c.value);
          c.continue();
        };
        req.onerror = () => reject(new Error('Encounter history read failed.'));
      });
    }

    /**
     * Local anti-spite rater-credibility weight, mirroring the server model:
     *   W = max(0.1, 1 - (negativeFlags / totalEncounters)^2)
     * A user who flags almost everyone loses the power to harm normal people.
     */
    async getRaterCredibility() {
      const history = await this.getEncounterHistory(5000);
      const total = history.length;
      if (total < 3) return { weight: 1.0, total: total, negatives: 0, sampleTooSmall: true };

      const negatives = history.filter((h) => h.rating === -1).length;
      const ratio = negatives / total;
      const weight = Math.max(0.1, 1 - ratio * ratio);

      return {
        weight: Number(weight.toFixed(3)),
        total: total,
        negatives: negatives,
        negativeRatio: Number(ratio.toFixed(3)),
        sampleTooSmall: false
      };
    }

    /* ----------------------------------------------------------------------
       META COUNTERS
       ---------------------------------------------------------------------- */

    async getMeta(key, fallback) {
      await this._db();
      const rec = await this._request(this._tx(STORES.META, 'readonly').get(key));
      return rec ? rec.value : (fallback !== undefined ? fallback : null);
    }

    async setMeta(key, value) {
      await this._db();
      await this._request(this._tx(STORES.META, 'readwrite').put({ key: key, value: value }));
      return value;
    }

    async _bumpMeta(key, delta) {
      const current = await this.getMeta(key, 0);
      return this.setMeta(key, (Number(current) || 0) + (Number(delta) || 0));
    }

    /* ----------------------------------------------------------------------
       EXPORT — TRUE DATA OWNERSHIP
       ---------------------------------------------------------------------- */

    /**
     * @param {'json'|'markdown'|'txt'} format
     * @returns {Promise<string>}
     */
    async exportJournal(format) {
      const fmt = (format || 'json').toLowerCase();
      const entries = await this.getReflections({ limit: 10000 });
      const stats = await this.getStats();

      if (fmt === 'json') {
        return JSON.stringify({
          app: 'Radia',
          export: 'Private Reflection Journal',
          exportedAt: new Date().toISOString(),
          schemaVersion: 1,
          notice: 'This file was generated entirely on-device. It was never uploaded anywhere.',
          stats: stats,
          entries: entries.map((e) => ({
            id: e.id,
            createdAt: e.createdAt,
            category: e.category,
            promptText: e.promptText,
            notes: e.notes,
            partnerAlias: e.partnerAlias,
            durationSec: e.durationSec,
            wordCount: e.wordCount,
            xpEarned: e.xpEarned
          }))
        }, null, 2);
      }

      if (fmt === 'markdown' || fmt === 'md') {
        const now = new Date();
        let md = '# Radia — Private Reflection Journal\n\n';
        md += `*Exported ${now.toLocaleDateString()} at ${now.toLocaleTimeString()}*\n\n`;
        md += `**${stats.totalReflections}** reflections · **${stats.totalWords}** words · `;
        md += `**${stats.totalXP}** XP · **${stats.currentStreakDays}** day streak\n\n`;
        md += '> This journal was written and stored entirely on your own device.\n\n---\n\n';

        if (!entries.length) {
          md += '*No reflections recorded yet.*\n';
          return md;
        }

        entries.forEach((e, i) => {
          md += `## ${i + 1}. ${e.promptText || 'Untitled reflection'}\n\n`;
          md += `**${new Date(e.timestamp).toLocaleString()}**  \n`;
          md += `Category: \`${e.category}\` · With: *${e.partnerAlias}* · `;
          md += `${e.wordCount} words · +${e.xpEarned} XP\n\n`;
          const body = e.notes && e.notes.length
            ? e.notes.split('\n').map((l) => '> ' + l).join('\n')
            : '> *(no written notes)*';
          md += body + '\n\n---\n\n';
        });

        return md;
      }

      if (fmt === 'txt') {
        let txt = 'RADIA — PRIVATE REFLECTION JOURNAL\n';
        txt += 'Exported ' + new Date().toLocaleString() + '\n';
        txt += '='.repeat(56) + '\n\n';
        entries.forEach((e, i) => {
          txt += `[${i + 1}] ${new Date(e.timestamp).toLocaleString()}\n`;
          txt += `PROMPT: ${e.promptText}\n`;
          txt += `WITH:   ${e.partnerAlias}\n\n`;
          txt += (e.notes || '(no written notes)') + '\n\n';
          txt += '-'.repeat(56) + '\n\n';
        });
        return txt;
      }

      throw new Error('Unsupported export format: ' + format);
    }

    /** Triggers a local file download. No network involved. */
    async downloadExport(format) {
      const fmt = (format || 'json').toLowerCase();
      const content = await this.exportJournal(fmt);

      const ext = fmt === 'markdown' ? 'md' : fmt;
      const mime = fmt === 'json'
        ? 'application/json'
        : (fmt === 'markdown' || fmt === 'md' ? 'text/markdown' : 'text/plain');

      const stamp = new Date().toISOString().slice(0, 10);
      const filename = `radia-journal-${stamp}.${ext}`;

      const blob = new Blob([content], { type: mime + ';charset=utf-8' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();

      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 150);

      return filename;
    }

    /* ----------------------------------------------------------------------
       DESTRUCTIVE OPERATIONS
       ---------------------------------------------------------------------- */

    async clearAllReflections() {
      await this._db();
      await this._request(this._tx(STORES.REFLECTIONS, 'readwrite').clear());
      this._dispatch('RADIA_REFLECTIONS_CLEARED', {});
      return true;
    }

    async clearEncounterHistory() {
      await this._db();
      await this._request(this._tx(STORES.ENCOUNTERS, 'readwrite').clear());
      return true;
    }

    /**
     * Irreversible, total local wipe: every reflection, every safety signal,
     * every counter, AND the AES vault key itself. Nothing is recoverable.
     */
    async purgeVault() {
      await this._db();
      await this._request(this._tx(STORES.REFLECTIONS, 'readwrite').clear());
      await this._request(this._tx(STORES.ENCOUNTERS, 'readwrite').clear());
      await this._request(this._tx(STORES.META, 'readwrite').clear());
      Vault.destroyKey();

      this._dispatch('RADIA_VAULT_PURGED', {});
      return true;
    }

    /* ----------------------------------------------------------------------
       INTERNAL HELPERS
       ---------------------------------------------------------------------- */

    /** @private Decrypt a raw record into a UI-ready object. */
    async _hydrate(record) {
      const notes = await Vault.decrypt(record._notes);
      const promptText = await Vault.decrypt(record._prompt);

      return {
        id: record.id,
        sessionId: record.sessionId,
        timestamp: record.timestamp,
        createdAt: record.createdAt,
        promptId: record.promptId,
        category: record.category,
        promptText: promptText,
        notes: notes,
        partnerAlias: record.partnerAlias,
        durationSec: record.durationSec,
        answeredSubPrompts: record.answeredSubPrompts || [],
        wordCount: record.wordCount,
        charCount: record.charCount,
        xpEarned: record.xpEarned,
        xpMultiplier: record.xpMultiplier,
        encrypted: record.encrypted
      };
    }

    _wordCount(text) {
      if (!text || typeof text !== 'string') return 0;
      const clean = text.trim();
      if (!clean) return 0;
      return clean.split(/\s+/).filter(Boolean).length;
    }

    _calcXP(wordCount, multiplier) {
      if (wordCount < XP.MIN_WORDS_FOR_XP) return 0;
      const bonus = Math.min(Math.floor(wordCount * XP.PER_WORD), XP.WORD_BONUS_CAP);
      return Math.round((XP.REFLECTION_BASE + bonus) * (multiplier || 1));
    }

    _uuid() {
      if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
      }
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    }

    _dispatch(name, detail) {
      window.dispatchEvent(new CustomEvent(name, { detail: detail }));
    }

    /** Diagnostic surface for the Settings screen. */
    async getVaultInfo() {
      const stats = await this.getStats();
      let quota = null;

      if (navigator.storage && navigator.storage.estimate) {
        try {
          const est = await navigator.storage.estimate();
          quota = {
            usedMB: (est.usage / 1048576).toFixed(2),
            quotaMB: (est.quota / 1048576).toFixed(0)
          };
        } catch (e) {}
      }

      return {
        dbName: DB_NAME,
        dbVersion: DB_VERSION,
        encryptionActive: this.encryptionActive,
        cipher: this.encryptionActive ? 'AES-256-GCM (device-local key)' : 'none (insecure context)',
        networkTransports: 'NONE — this module contains no fetch, XHR, WebSocket, or RTC code.',
        entries: stats.totalReflections,
        storage: quota
      };
    }
  }

  /* ==========================================================================
     GLOBAL EXPORT & AUTO-BOOT
     ========================================================================== */

  const storage = new RadiaStorageEngine();
  window.RadiaStorage = storage;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => storage.init());
  } else {
    storage.init();
  }

})();