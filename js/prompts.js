/**
 * ============================================================================
 * RADIA — CATALYST QUESTION ENGINE (js/prompts.js)
 * ----------------------------------------------------------------------------
 *  54 psychologically safe, non-polarizing, high-depth conversation catalysts
 *  engineered to bypass small talk WITHOUT triggering debate, tribal identity
 *  conflict, or social-status performance.
 *
 *  DESIGN DOCTRINE (Conversational Psychology):
 *    1. NO identity triggers — zero politics, religion, nationality, income.
 *    2. NO comparison traps — never "what's the best/most impressive."
 *    3. SELF-DISCLOSURE SYMMETRY — both people can answer at equal depth.
 *    4. LOW-FLOOR / HIGH-CEILING — answerable in 10 seconds or 10 minutes.
 *    5. PRESENT-TENSE ANCHORING — many prompts reference the shared physical
 *       space so strangers have an immediate, neutral common object.
 *    6. EXIT DIGNITY — no prompt can corner someone into forced vulnerability.
 *
 *  DETERMINISTIC SYNC:
 *    MurmurHash3 (x86 32-bit) → Mulberry32 PRNG. Given an identical sharedSeed
 *    from peer-sync.js, BOTH devices independently resolve the EXACT same
 *    prompt with zero additional network round-trips.
 *
 *  Public singleton: window.RadiaPrompts
 * ============================================================================
 */

(function () {
  'use strict';

  /* ==========================================================================
     CATEGORY TAXONOMY
     ========================================================================== */

  const CATEGORIES = {
    VULNERABILITY: 'Human Experience & Vulnerability',
    OBSERVATIONAL: 'Observational & Physical Context',
    CURIOSITY: 'Curiosity & Perspectives'
  };

  /** Short display labels used by the catalyst pill in the conversation view. */
  const CATEGORY_LABELS = {
    [CATEGORIES.VULNERABILITY]: 'Human Catalyst',
    [CATEGORIES.OBSERVATIONAL]: 'Observational Catalyst',
    [CATEGORIES.CURIOSITY]: 'Curiosity Catalyst'
  };

  /** Accent token per category — consumed by encounter.css / app.js theming. */
  const CATEGORY_ACCENTS = {
    [CATEGORIES.VULNERABILITY]: 'emerald',
    [CATEGORIES.OBSERVATIONAL]: 'amber',
    [CATEGORIES.CURIOSITY]: 'cyan'
  };

  /* ==========================================================================
     THE CATALYST LIBRARY — 54 PROMPTS
     ----------------------------------------------------------------------
     weight : selection bias (1.0 default). Lower = rarer. Higher = more common.
     depth  : 1 = light entry, 2 = reflective, 3 = deep (never cornering).
     env    : 'GENERAL' | 'OUTDOOR' | 'CAMPUS' | 'URBAN' — soft contextual tag.
     ========================================================================== */

  const PROMPTS = [

    /* ======================================================================
       CATEGORY 1 — HUMAN EXPERIENCE & VULNERABILITY  (18)
       ====================================================================== */
    {
      id: 'v-01', category: CATEGORIES.VULNERABILITY, depth: 2, weight: 1.2, env: 'GENERAL',
      text: "What is a belief you held five years ago that you've completely abandoned?",
      followUp: "What was the moment it started to shift?"
    },
    {
      id: 'v-02', category: CATEGORIES.VULNERABILITY, depth: 1, weight: 1.2, env: 'GENERAL',
      text: "What is a small, ordinary compliment someone gave you that you still remember?",
      followUp: "Why do you think that one stuck when others didn't?"
    },
    {
      id: 'v-03', category: CATEGORIES.VULNERABILITY, depth: 2, weight: 1.1, env: 'GENERAL',
      text: "What is something you're currently overthinking more than it deserves?",
      followUp: "What would change if you just let it resolve itself?"
    },
    {
      id: 'v-04', category: CATEGORIES.VULNERABILITY, depth: 2, weight: 1.0, env: 'GENERAL',
      text: "When was the last time you felt genuinely out of your depth — and chose to stay anyway?",
      followUp: "Did it change how you size up risk now?"
    },
    {
      id: 'v-05', category: CATEGORIES.VULNERABILITY, depth: 2, weight: 1.0, env: 'GENERAL',
      text: "What is a boundary you set recently that made your life noticeably quieter?",
      followUp: "Was it hard to hold the first few times?"
    },
    {
      id: 'v-06', category: CATEGORIES.VULNERABILITY, depth: 1, weight: 1.1, env: 'GENERAL',
      text: "What do people usually assume about you within the first minute that's just wrong?",
      followUp: "What part of you do they never see coming?"
    },
    {
      id: 'v-07', category: CATEGORIES.VULNERABILITY, depth: 3, weight: 0.9, env: 'GENERAL',
      text: "What is a detour or failure you're now quietly grateful happened?",
      followUp: "Where do you think you'd be if it had gone 'right'?"
    },
    {
      id: 'v-08', category: CATEGORIES.VULNERABILITY, depth: 1, weight: 1.0, env: 'GENERAL',
      text: "What habit have you tried to build over and over that simply refuses to stick?",
      followUp: "Do you actually want it, or just like the version of you who has it?"
    },
    {
      id: 'v-09', category: CATEGORIES.VULNERABILITY, depth: 2, weight: 1.0, env: 'GENERAL',
      text: "When did you last change your mind in the middle of a conversation?",
      followUp: "What did that person do that made it feel safe to shift?"
    },
    {
      id: 'v-10', category: CATEGORIES.VULNERABILITY, depth: 2, weight: 1.1, env: 'GENERAL',
      text: "What advice do you give freely to others but struggle to follow yourself?",
      followUp: "Where does the resistance actually live?"
    },
    {
      id: 'v-11', category: CATEGORIES.VULNERABILITY, depth: 2, weight: 0.9, env: 'GENERAL',
      text: "What's an expectation you feel placed on you that you never agreed to?",
      followUp: "How do you navigate around it day to day?"
    },
    {
      id: 'v-12', category: CATEGORIES.VULNERABILITY, depth: 3, weight: 0.8, env: 'GENERAL',
      text: "What's something you forgave that was genuinely difficult to put down?",
      followUp: "Did it change the relationship, or only change you?"
    },
    {
      id: 'v-13', category: CATEGORIES.VULNERABILITY, depth: 1, weight: 1.0, env: 'GENERAL',
      text: "What were you afraid of as a kid that turned out to be completely irrelevant?",
      followUp: "What took its place?"
    },
    {
      id: 'v-14', category: CATEGORIES.VULNERABILITY, depth: 1, weight: 1.2, env: 'GENERAL',
      text: "What activity makes you lose track of time completely?",
      followUp: "When did you last actually make room for it?"
    },
    {
      id: 'v-15', category: CATEGORIES.VULNERABILITY, depth: 2, weight: 0.9, env: 'GENERAL',
      text: "What's a hard truth someone told you that you hated at the time and appreciate now?",
      followUp: "What made you trust them enough to hear it eventually?"
    },
    {
      id: 'v-16', category: CATEGORIES.VULNERABILITY, depth: 1, weight: 1.0, env: 'GENERAL',
      text: "What part of your daily routine quietly drains you without you noticing?",
      followUp: "What's the smallest change that would remove it?"
    },
    {
      id: 'v-17', category: CATEGORIES.VULNERABILITY, depth: 1, weight: 1.1, env: 'GENERAL',
      text: "What's a quality you admire in someone close to you?",
      followUp: "Have you ever tried to grow that same thing in yourself?"
    },
    {
      id: 'v-18', category: CATEGORIES.VULNERABILITY, depth: 3, weight: 0.8, env: 'GENERAL',
      text: "If you could send one sentence back to yourself five years ago, what would you deliberately leave out?",
      followUp: "Why does that part need to be lived instead of warned about?"
    },

    /* ======================================================================
       CATEGORY 2 — OBSERVATIONAL & PHYSICAL CONTEXT  (18)
       Anchored to the shared physical space inside the 40ft radius.
       ====================================================================== */
    {
      id: 'o-01', category: CATEGORIES.OBSERVATIONAL, depth: 2, weight: 1.3, env: 'GENERAL',
      text: "Look around us right now. What is one thing here that won't exist in 50 years?",
      followUp: "What do you think replaces it?"
    },
    {
      id: 'o-02', category: CATEGORIES.OBSERVATIONAL, depth: 1, weight: 1.2, env: 'GENERAL',
      text: "Without checking your phone — what sound is happening right now that you'd been filtering out?",
      followUp: "Does noticing it change how this place feels?"
    },
    {
      id: 'o-03', category: CATEGORIES.OBSERVATIONAL, depth: 2, weight: 1.0, env: 'URBAN',
      text: "If someone from 200 years ago stood exactly where we are, what would startle them first?",
      followUp: "Would they call this an upgrade?"
    },
    {
      id: 'o-04', category: CATEGORIES.OBSERVATIONAL, depth: 2, weight: 1.1, env: 'GENERAL',
      text: "Look at the people moving past us. What do you think most of them are thinking about?",
      followUp: "How often are we running the exact same loop?"
    },
    {
      id: 'o-05', category: CATEGORIES.OBSERVATIONAL, depth: 2, weight: 0.9, env: 'URBAN',
      text: "What's a design detail in places like this that almost nobody consciously notices?",
      followUp: "How does it quietly steer how people behave?"
    },
    {
      id: 'o-06', category: CATEGORIES.OBSERVATIONAL, depth: 1, weight: 0.9, env: 'GENERAL',
      text: "If you had to hide something small within sight of us for 24 hours, where would you put it?",
      followUp: "Plain sight, or genuinely hidden?"
    },
    {
      id: 'o-07', category: CATEGORIES.OBSERVATIONAL, depth: 1, weight: 1.0, env: 'OUTDOOR',
      text: "What natural thing around us right now feels most out of place here?",
      followUp: "How is it adapting to all of this?"
    },
    {
      id: 'o-08', category: CATEGORIES.OBSERVATIONAL, depth: 2, weight: 0.8, env: 'GENERAL',
      text: "If we had to finish this whole conversation without words, how would you get your point across?",
      followUp: "What's the most honest non-verbal signal humans have?"
    },
    {
      id: 'o-09', category: CATEGORIES.OBSERVATIONAL, depth: 1, weight: 1.0, env: 'GENERAL',
      text: "Of the materials around us — concrete, glass, wood, metal — which one do you feel calmest near?",
      followUp: "Any idea why that one?"
    },
    {
      id: 'o-10', category: CATEGORIES.OBSERVATIONAL, depth: 1, weight: 1.0, env: 'GENERAL',
      text: "Look at the light where we're standing. How is it shaping the mood of this conversation?",
      followUp: "Do you talk differently in daylight versus at night?"
    },
    {
      id: 'o-11', category: CATEGORIES.OBSERVATIONAL, depth: 2, weight: 1.0, env: 'GENERAL',
      text: "Point to one object you can see that took thousands of strangers to make.",
      followUp: "Does tracing that chain make the object feel heavier?"
    },
    {
      id: 'o-12', category: CATEGORIES.OBSERVATIONAL, depth: 1, weight: 0.9, env: 'GENERAL',
      text: "If you had to paint this exact scene, which color would you reach for most?",
      followUp: "Is that the color of the objects, or of the feeling?"
    },
    {
      id: 'o-13', category: CATEGORIES.OBSERVATIONAL, depth: 2, weight: 0.9, env: 'CAMPUS',
      text: "Can you spot a path here that people made by habit rather than by design?",
      followUp: "Why do humans always carve their own route?"
    },
    {
      id: 'o-14', category: CATEGORIES.OBSERVATIONAL, depth: 2, weight: 0.9, env: 'URBAN',
      text: "If every light on this block went out right now, what changes in the first sixty seconds?",
      followUp: "Do people get quieter or louder?"
    },
    {
      id: 'o-15', category: CATEGORIES.OBSERVATIONAL, depth: 1, weight: 1.0, env: 'GENERAL',
      text: "What's the oldest physical thing you can see from where we're standing?",
      followUp: "What was happening here when it first showed up?"
    },
    {
      id: 'o-16', category: CATEGORIES.OBSERVATIONAL, depth: 2, weight: 0.9, env: 'GENERAL',
      text: "If you had to sit in this exact spot for eight hours with no technology, what would you end up watching?",
      followUp: "How long before boredom turns into noticing everything?"
    },
    {
      id: 'o-17', category: CATEGORIES.OBSERVATIONAL, depth: 2, weight: 0.8, env: 'URBAN',
      text: "Is there anything around us that was designed specifically to stop a certain behavior?",
      followUp: "Does that kind of design actually work?"
    },
    {
      id: 'o-18', category: CATEGORIES.OBSERVATIONAL, depth: 1, weight: 1.1, env: 'GENERAL',
      text: "What's something about this specific place that you'd miss if it disappeared tomorrow?",
      followUp: "Would anyone else even notice it was gone?"
    },

    /* ======================================================================
       CATEGORY 3 — CURIOSITY & PERSPECTIVES  (18)
       ====================================================================== */
    {
      id: 'c-01', category: CATEGORIES.CURIOSITY, depth: 1, weight: 1.3, env: 'GENERAL',
      text: "What's something most people call a luxury that you consider a genuine necessity?",
      followUp: "Where did that standard come from for you?"
    },
    {
      id: 'c-02', category: CATEGORIES.CURIOSITY, depth: 1, weight: 1.2, env: 'GENERAL',
      text: "If you could instantly master one craft but could never earn money from it, what would you pick?",
      followUp: "Would you show anyone, or keep it entirely yours?"
    },
    {
      id: 'c-03', category: CATEGORIES.CURIOSITY, depth: 1, weight: 1.1, env: 'GENERAL',
      text: "What tiny inconvenience annoys you far more than it rationally should?",
      followUp: "What is it about that specific friction?"
    },
    {
      id: 'c-04', category: CATEGORIES.CURIOSITY, depth: 2, weight: 1.0, env: 'GENERAL',
      text: "What idea genuinely broke your brain the first time you understood it?",
      followUp: "Has it changed how you approach problems since?"
    },
    {
      id: 'c-05', category: CATEGORIES.CURIOSITY, depth: 2, weight: 1.0, env: 'GENERAL',
      text: "If every person alive had to experience one book, film, or song once, what would you choose?",
      followUp: "What does it let someone understand that nothing else does?"
    },
    {
      id: 'c-06', category: CATEGORIES.CURIOSITY, depth: 2, weight: 1.0, env: 'GENERAL',
      text: "What obsolete habit or tool do you secretly wish we'd bring back?",
      followUp: "What useful friction did convenience delete?"
    },
    {
      id: 'c-07', category: CATEGORIES.CURIOSITY, depth: 2, weight: 0.9, env: 'GENERAL',
      text: "What's considered totally normal that you've always found slightly illogical?",
      followUp: "Why do you think nobody questions it?"
    },
    {
      id: 'c-08', category: CATEGORIES.CURIOSITY, depth: 3, weight: 0.9, env: 'GENERAL',
      text: "If you were guaranteed one completely true answer to any question, what would you ask?",
      followUp: "Would you still want it if the answer wasn't what you hoped?"
    },
    {
      id: 'c-09', category: CATEGORIES.CURIOSITY, depth: 1, weight: 1.1, env: 'GENERAL',
      text: "What subject do you know almost nothing about but find endlessly fascinating?",
      followUp: "What's actually stopping you from going down that rabbit hole?"
    },
    {
      id: 'c-10', category: CATEGORIES.CURIOSITY, depth: 3, weight: 0.8, env: 'GENERAL',
      text: "Do you think people are more driven by the search for peace or the search for purpose?",
      followUp: "Which one is steering you right now?"
    },
    {
      id: 'c-11', category: CATEGORIES.CURIOSITY, depth: 1, weight: 1.2, env: 'GENERAL',
      text: "What's the most interesting thing you've gone deep on recently?",
      followUp: "What pulled you in so hard?"
    },
    {
      id: 'c-12', category: CATEGORIES.CURIOSITY, depth: 2, weight: 1.0, env: 'GENERAL',
      text: "If you could watch any ten minutes of history as an invisible observer, which ten?",
      followUp: "What exactly would you be watching for?"
    },
    {
      id: 'c-13', category: CATEGORIES.CURIOSITY, depth: 1, weight: 1.0, env: 'GENERAL',
      text: "What tradition from your childhood did you only later realize was unusual?",
      followUp: "Would you keep it going anyway?"
    },
    {
      id: 'c-14', category: CATEGORIES.CURIOSITY, depth: 2, weight: 1.0, env: 'GENERAL',
      text: "What's your unusual tell for whether someone is actually trustworthy?",
      followUp: "Has that instinct ever been wrong?"
    },
    {
      id: 'c-15', category: CATEGORIES.CURIOSITY, depth: 1, weight: 1.1, env: 'GENERAL',
      text: "What do you do purely for the process, where the result genuinely doesn't matter?",
      followUp: "How does it feel to do something with no audience?"
    },
    {
      id: 'c-16', category: CATEGORIES.CURIOSITY, depth: 2, weight: 1.0, env: 'GENERAL',
      text: "If every job paid identically and carried identical status, how would you spend your days?",
      followUp: "How far is that from where you are now?"
    },
    {
      id: 'c-17', category: CATEGORIES.CURIOSITY, depth: 1, weight: 1.0, env: 'GENERAL',
      text: "What do you find genuinely exciting that most people find boring?",
      followUp: "What are you seeing in it that they aren't?"
    },
    {
      id: 'c-18', category: CATEGORIES.CURIOSITY, depth: 2, weight: 1.0, env: 'GENERAL',
      text: "What's a skill you think everyone should be taught but almost nobody is?",
      followUp: "When did you figure out you were missing it?"
    }
  ];

  /* ==========================================================================
     REFLECTION SUB-PROMPTS
     Auto-offered inside the post-encounter journal box. Entirely optional —
     the user may ignore every one of them and free-write instead.
     ========================================================================== */

  const REFLECTION_PROMPTS = [
    "What surprised you about this person?",
    "What did this conversation make you realize about yourself?",
    "What's one thing they said that you want to remember?",
    "Did you say anything you hadn't said out loud before?",
    "What would you ask them if you had another five minutes?",
    "How did you feel in the first thirty seconds versus the last thirty?",
    "What did you notice about how they listened?",
    "What did you almost say but didn't?",
    "Was this easier or harder than you expected?",
    "What part of their answer stayed with you after you walked away?",
    "Did your own answer change while you were saying it?",
    "What's the one sentence summary of this encounter?"
  ];

  /* ==========================================================================
     DETERMINISTIC HASHING & PRNG
     ========================================================================== */

  /** MurmurHash3 (x86, 32-bit). Stable across every JS runtime. */
  function murmur3(input) {
    const str = String(input);
    let h1 = 0xdeadbeef;

    for (let i = 0; i < str.length; i++) {
      let k1 = str.charCodeAt(i);
      k1 = Math.imul(k1, 0xcc9e2d51);
      k1 = (k1 << 15) | (k1 >>> 17);
      k1 = Math.imul(k1, 0x1b873593);

      h1 ^= k1;
      h1 = (h1 << 13) | (h1 >>> 19);
      h1 = Math.imul(h1, 5) + 0xe6546b64;
    }

    h1 ^= str.length;
    h1 ^= h1 >>> 16;
    h1 = Math.imul(h1, 0x85ebca6b);
    h1 ^= h1 >>> 13;
    h1 = Math.imul(h1, 0xc2b2ae35);
    h1 ^= h1 >>> 16;

    return h1 >>> 0;
  }

  /** Mulberry32 — tiny, fast, high-quality deterministic PRNG. */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Weighted deterministic pick from a pool using a seeded RNG. */
  function weightedPick(pool, rng) {
    let total = 0;
    for (let i = 0; i < pool.length; i++) {
      total += (typeof pool[i].weight === 'number' ? pool[i].weight : 1);
    }

    let roll = rng() * total;
    for (let i = 0; i < pool.length; i++) {
      roll -= (typeof pool[i].weight === 'number' ? pool[i].weight : 1);
      if (roll <= 0) return pool[i];
    }
    return pool[pool.length - 1];
  }

  /* ==========================================================================
     CATALYST ENGINE
     ========================================================================== */

  const RadiaPromptEngine = {

    CATEGORIES,
    CATEGORY_LABELS,
    CATEGORY_ACCENTS,
    PROMPTS,
    REFLECTION_PROMPTS,

    /**
     * ------------------------------------------------------------------
     * PRIMARY API — called identically on BOTH devices by peer-sync.js.
     * Same sharedSeed  ⇒  byte-identical prompt. No network round-trip.
     * ------------------------------------------------------------------
     * @param {string|number} sharedSeed   FNV/Murmur seed from peer-sync.js
     * @param {Object}  [options]
     * @param {string}  [options.category] Restrict to one CATEGORIES value.
     * @param {number}  [options.variant]  0 = first prompt. Increment for the
     *                                     synchronized "next prompt" action —
     *                                     both peers must pass the same value.
     * @param {string}  [options.env]      'OUTDOOR' | 'CAMPUS' | 'URBAN' hint.
     * @param {number}  [options.maxDepth] 1–3 ceiling on emotional depth.
     * @returns {Object} Fully hydrated prompt payload.
     */
    getSynchronizedPrompt: function (sharedSeed, options) {
      const opts = options || {};

      if (sharedSeed === undefined || sharedSeed === null || sharedSeed === '') {
        // Never throw into a live conversation UI — degrade to a safe default.
        console.warn('[Radia Prompts] Missing sharedSeed. Falling back to time-bucket seed.');
        sharedSeed = 'radia-fallback-' + Math.floor(Date.now() / 60000);
      }

      const variant = Number.isFinite(opts.variant) ? Math.max(0, Math.floor(opts.variant)) : 0;
      const seedKey = `radia-catalyst:${sharedSeed}:v${variant}`;
      const seedHash = murmur3(seedKey);
      const rng = mulberry32(seedHash);

      /* ---- Build the eligible pool ---- */
      let pool = PROMPTS.slice();

      if (opts.category) {
        const filtered = pool.filter((p) => p.category === opts.category);
        if (filtered.length) pool = filtered;
      }

      if (Number.isFinite(opts.maxDepth)) {
        const capped = pool.filter((p) => p.depth <= opts.maxDepth);
        if (capped.length) pool = capped;
      }

      if (opts.env && opts.env !== 'GENERAL') {
        // Soft bias: environment-matched prompts get a weight boost, nothing
        // is ever excluded, so the pool can never collapse to zero.
        pool = pool.map((p) => {
          if (p.env === opts.env) {
            return Object.assign({}, p, { weight: (p.weight || 1) * 2.2 });
          }
          return p;
        });
      }

      const chosen = weightedPick(pool, rng);

      return this._hydrate(chosen, seedHash, variant, pool.length);
    },

    /**
     * Deterministically resolve an ordered deck of N unique prompts.
     * Useful for a synchronized "skip to the next question" flow where both
     * devices must traverse the same sequence.
     */
    getSynchronizedDeck: function (sharedSeed, count, options) {
      const opts = options || {};
      const size = Math.max(1, Math.min(count || 5, PROMPTS.length));
      const deck = [];
      const used = new Set();

      let variant = 0;
      let guard = 0;

      while (deck.length < size && guard < size * 40) {
        guard++;
        const candidate = this.getSynchronizedPrompt(
          sharedSeed,
          Object.assign({}, opts, { variant: variant++ })
        );
        if (!used.has(candidate.id)) {
          used.add(candidate.id);
          deck.push(candidate);
        }
      }

      return deck;
    },

    /**
     * Non-synchronized local draw. Used for solo preview, onboarding demos,
     * and the "Simulate Peer Ping" developer flow.
     */
    getRandomPrompt: function (options) {
      return this.getSynchronizedPrompt(
        'local-' + Date.now() + '-' + Math.random(),
        options
      );
    },

    /** Look up a single prompt by its stable id (used to re-hydrate journal entries). */
    getPromptById: function (id) {
      const found = PROMPTS.filter((p) => p.id === id)[0];
      return found ? this._hydrate(found, murmur3(id), 0, PROMPTS.length) : null;
    },

    /**
     * Deterministically select 3 optional reflection sub-prompts for the
     * post-encounter journal box. Seeded by the session so the user sees a
     * stable set rather than a reshuffle on every re-render.
     */
    getReflectionPrompts: function (sessionSeed, count) {
      const n = Math.max(1, Math.min(count || 3, REFLECTION_PROMPTS.length));
      const rng = mulberry32(murmur3('radia-reflect:' + (sessionSeed || Date.now())));

      const pool = REFLECTION_PROMPTS.slice();
      const picked = [];

      while (picked.length < n && pool.length) {
        const idx = Math.floor(rng() * pool.length);
        picked.push(pool.splice(idx, 1)[0]);
      }

      return picked;
    },

    /** All category values. */
    getCategories: function () {
      return Object.keys(CATEGORIES).map((k) => CATEGORIES[k]);
    },

    /** Library analytics for the Settings / About screen. */
    getLibraryStats: function () {
      const byCategory = {};
      this.getCategories().forEach((c) => {
        byCategory[c] = PROMPTS.filter((p) => p.category === c).length;
      });
      return {
        total: PROMPTS.length,
        byCategory: byCategory,
        reflectionPrompts: REFLECTION_PROMPTS.length
      };
    },

    /**
     * Integrity guard — run once at boot in dev to assert that no duplicate
     * ids or malformed records ever ship to production.
     */
    validateLibrary: function () {
      const seen = new Set();
      const errors = [];

      PROMPTS.forEach((p) => {
        if (!p.id) errors.push('Prompt missing id: ' + p.text);
        if (seen.has(p.id)) errors.push('Duplicate prompt id: ' + p.id);
        seen.add(p.id);
        if (!p.text || p.text.length < 12) errors.push('Prompt text too short: ' + p.id);
        if (!CATEGORY_LABELS[p.category]) errors.push('Unknown category on: ' + p.id);
      });

      return { valid: errors.length === 0, errors: errors };
    },

    /* ---------------------------------------------------------------- */

    /** @private Normalize a raw record into the full consumer payload. */
    _hydrate: function (prompt, seedHash, variant, poolSize) {
      return {
        id: prompt.id,
        category: prompt.category,
        categoryLabel: CATEGORY_LABELS[prompt.category] || 'Catalyst',
        accent: CATEGORY_ACCENTS[prompt.category] || 'emerald',
        depth: prompt.depth,
        env: prompt.env,

        // Dual key exposure — peer-sync.js reads `promptText`, UI reads `text`.
        text: prompt.text,
        promptText: prompt.text,

        followUp: prompt.followUp || null,

        // Determinism receipts (useful for debugging desync across devices)
        synchronizedSeed: seedHash,
        variant: variant,
        poolSize: poolSize,
        libraryVersion: '1.0.0'
      };
    }
  };

  /* ==========================================================================
     GLOBAL EXPORT
     ========================================================================== */

  window.RadiaPrompts = RadiaPromptEngine;

})();