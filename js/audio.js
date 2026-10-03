/**
 * ============================================================================
 * RADIA — AUDIO & HAPTICS ENGINE (js/audio.js)
 * Pure procedural Web Audio API synthesizer & synchronized haptic feedback.
 * Zero external MP3/WAV dependencies — 100% GitHub Pages & PWA ready.
 * ============================================================================
 */

class AudioManager {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
    this.isUnlocked = false;
    this.hapticsEnabled = true;

    // Master bus nodes
    this.masterGain = null;
    this.reverbConvolver = null;
    this.reverbGain = null;

    // Local storage key for persistent mute preferences
    this.STORAGE_KEY_MUTE = 'radia_audio_muted';
    this.STORAGE_KEY_HAPTICS = 'radia_haptics_enabled';

    this._loadPreferences();
    this._initAutoplayUnlock();
  }

  /**
   * Initialize or retrieve the active AudioContext instance.
   * Lazily evaluated to respect browser security/autoplay restrictions.
   */
  _getAudioContext() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this.ctx = new AudioContextClass();
        this._buildMasterBus();
      } else {
        console.warn('[Radia Audio] Web Audio API is not supported on this browser.');
      }
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch((err) => {
        console.warn('[Radia Audio] Failed to resume AudioContext:', err);
      });
    }

    return this.ctx;
  }

  /**
   * Build the master processing chain including a procedurally generated impulse reverb.
   */
  _buildMasterBus() {
    if (!this.ctx) return;

    // Master output gain
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 1, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);

    // Procedural algorithmic reverb channel
    this.reverbGain = this.ctx.createGain();
    this.reverbGain.gain.setValueAtTime(0.28, this.ctx.currentTime);

    this.reverbConvolver = this.ctx.createConvolver();
    this.reverbConvolver.buffer = this._generateImpulseResponse(1.8, 2.2);

    this.reverbConvolver.connect(this.reverbGain);
    this.reverbGain.connect(this.masterGain);
  }

  /**
   * Synthesizes an algorithmic impulse response buffer for ambient acoustic space.
   * @param {number} duration - Reverb decay duration in seconds.
   * @param {number} decay - Exponential decay rate.
   */
  _generateImpulseResponse(duration, decay) {
    if (!this.ctx) return null;
    const sampleRate = this.ctx.sampleRate;
    const length = Math.floor(sampleRate * duration);
    const impulse = this.ctx.createBuffer(2, length, sampleRate);
    const leftChannel = impulse.getChannelData(0);
    const rightChannel = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const n = i / length;
      // Exponential decay envelope with subtle stereo variance
      const envelope = Math.pow(1 - n, decay);
      leftChannel[i] = (Math.random() * 2 - 1) * envelope;
      rightChannel[i] = (Math.random() * 2 - 1) * envelope;
    }

    return impulse;
  }

  /**
   * Binds global one-time touch/click listeners to unlock AudioContext.
   */
  _initAutoplayUnlock() {
    const unlockHandler = () => {
      const ctx = this._getAudioContext();
      if (ctx && ctx.state === 'running') {
        this.isUnlocked = true;
        // Play a silent buffer tick to guarantee mobile Safari unlock
        const buffer = ctx.createBuffer(1, 1, 22050);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(0);

        window.removeEventListener('pointerdown', unlockHandler);
        window.removeEventListener('keydown', unlockHandler);
        window.removeEventListener('touchstart', unlockHandler);
      }
    };

    window.addEventListener('pointerdown', unlockHandler, { passive: true });
    window.addEventListener('keydown', unlockHandler, { passive: true });
    window.addEventListener('touchstart', unlockHandler, { passive: true });
  }

  /**
   * Load saved user preferences from local storage.
   */
  _loadPreferences() {
    try {
      const savedMute = localStorage.getItem(this.STORAGE_KEY_MUTE);
      if (savedMute !== null) {
        this.isMuted = JSON.parse(savedMute);
      }

      const savedHaptics = localStorage.getItem(this.STORAGE_KEY_HAPTICS);
      if (savedHaptics !== null) {
        this.hapticsEnabled = JSON.parse(savedHaptics);
      }
    } catch (e) {
      console.warn('[Radia Audio] Local storage access error:', e);
    }
  }

  /**
   * Toggle global audio mute state.
   * @returns {boolean} Current muted state.
   */
  toggleMute() {
    this.isMuted = !this.isMuted;
    try {
      localStorage.setItem(this.STORAGE_KEY_MUTE, JSON.stringify(this.isMuted));
    } catch (e) {}

    if (this.masterGain && this.ctx) {
      this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 1, this.ctx.currentTime);
    }

    return this.isMuted;
  }

  /**
   * Toggle mobile haptic feedback.
   * @returns {boolean} Current haptic state.
   */
  toggleHaptics() {
    this.hapticsEnabled = !this.hapticsEnabled;
    try {
      localStorage.setItem(this.STORAGE_KEY_HAPTICS, JSON.stringify(this.hapticsEnabled));
    } catch (e) {}
    return this.hapticsEnabled;
  }

  /**
   * Safe wrapper around navigator.vibrate
   * @param {number|number[]} pattern - Millisecond pattern array.
   */
  _triggerHaptic(pattern) {
    if (!this.hapticsEnabled) return;
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch (err) {
        // Ignored if device blocks programmatic vibration
      }
    }
  }

  /* ==========================================================================
     PROCEDURAL SOUNDSCAPES & HARMONIC GENERATORS
     ========================================================================== */

  /**
   * 1. COLLISION PING (~40ft Encounter Trigger)
   * Atmospheric, binaural low-frequency pulse (120Hz -> 240Hz sweep with subtle stereo panning).
   */
  playCollisionPing() {
    this._triggerHaptic([100, 80, 150]);
    if (this.isMuted) return;

    const ctx = this._getAudioContext();
    if (!ctx) return;

    const t = ctx.currentTime;

    // Sub oscillator for visceral physical sensation
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;

    // Filter to roll off harsh frequencies and maintain a warm aesthetic
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(320, t);
    filter.frequency.exponentialRampToValueAtTime(800, t + 0.4);

    // Pitch sweep: 120Hz -> 240Hz upward swell
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(240, t + 0.35);

    // Dynamic amplitude envelope (warm swell -> long release)
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.7, t + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);

    if (panner) {
      // Subtle sweep from left-center to centered
      panner.pan.setValueAtTime(-0.25, t);
      panner.pan.linearRampToValueAtTime(0.1, t + 0.4);
      osc.connect(filter);
      filter.connect(panner);
      panner.connect(gain);
    } else {
      osc.connect(filter);
      filter.connect(gain);
    }

    gain.connect(this.masterGain);
    if (this.reverbConvolver) {
      gain.connect(this.reverbConvolver);
    }

    osc.start(t);
    osc.stop(t + 1.25);
  }

  /**
   * 2. TIMER TICK (Tactile Countdown Click)
   * Ultra-quiet, organic woodblock-style transient triggered on final 10 seconds.
   */
  playTimerTick() {
    this._triggerHaptic(20);
    if (this.isMuted) return;

    const ctx = this._getAudioContext();
    if (!ctx) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    // Woodblock transient: Fast pitch drop from 880Hz -> 220Hz in 35ms
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(220, t + 0.035);

    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.045);
  }

  /**
   * 3. TIMER COMPLETE (Wrap-Up Chime)
   * Soft harmonic triad (C5, E5, G5) that signals session conclusion without alarming users.
   */
  playTimerComplete() {
    this._triggerHaptic([60, 40, 80]);
    if (this.isMuted) return;

    const ctx = this._getAudioContext();
    if (!ctx) return;

    const t = ctx.currentTime;
    // C5 (523.25Hz), E5 (659.25Hz), G5 (783.99Hz)
    const notes = [523.25, 659.25, 783.99];

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const delay = idx * 0.08;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + delay);

      gain.gain.setValueAtTime(0.0001, t + delay);
      gain.gain.exponentialRampToValueAtTime(0.25, t + delay + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + delay + 1.4);

      osc.connect(gain);
      gain.connect(this.masterGain);

      if (this.reverbConvolver) {
        gain.connect(this.reverbConvolver);
      }

      osc.start(t + delay);
      osc.stop(t + delay + 1.5);
    });
  }

  /**
   * 4. MUTUAL MATCH (Ascending Double-Blind Handshake)
   * Rich, uplifting ascending arpeggio when both users mutually tap "Connect".
   */
  playMutualMatch() {
    this._triggerHaptic([50, 50, 50, 50, 100]);
    if (this.isMuted) return;

    const ctx = this._getAudioContext();
    if (!ctx) return;

    const t = ctx.currentTime;
    // Ascending Pentatonic: G4 (392.00), B4 (493.88), D5 (587.33), E5 (659.25), G5 (783.99)
    const arpeggio = [392.00, 493.88, 587.33, 659.25, 783.99];

    arpeggio.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startTime = t + (index * 0.065);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      // Add a touch of FM vibrato for warmth on top notes
      if (index >= 3) {
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.frequency.setValueAtTime(6.0, startTime);
        lfoGain.gain.setValueAtTime(4.0, startTime);
        lfo.connect(osc.frequency);
        lfo.start(startTime);
        lfo.stop(startTime + 1.2);
      }

      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(0.3, startTime + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.9);

      osc.connect(gain);
      gain.connect(this.masterGain);

      if (this.reverbConvolver) {
        gain.connect(this.reverbConvolver);
      }

      osc.start(startTime);
      osc.stop(startTime + 1.0);
    });
  }

  /**
   * 5. REFLECTION SAVED (Mechanical Glass/Typewriter Ping)
   * Crisp, satisfying high-frequency tactile bell when a box reflection is logged.
   */
  playReflectionSaved() {
    this._triggerHaptic(40);
    if (this.isMuted) return;

    const ctx = this._getAudioContext();
    if (!ctx) return;

    const t = ctx.currentTime;

    // High metal chime fundamental + dissonant harmonic
    const fundamental = ctx.createOscillator();
    const overtone = ctx.createOscillator();
    const gain = ctx.createGain();

    fundamental.type = 'sine';
    fundamental.frequency.setValueAtTime(2093.00, t); // C7

    overtone.type = 'sine';
    overtone.frequency.setValueAtTime(4186.01, t); // C8

    gain.gain.setValueAtTime(0.22, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);

    fundamental.connect(gain);
    overtone.connect(gain);
    gain.connect(this.masterGain);

    if (this.reverbConvolver) {
      gain.connect(this.reverbConvolver);
    }

    fundamental.start(t);
    overtone.start(t);
    fundamental.stop(t + 0.7);
    overtone.stop(t + 0.7);
  }

  /**
   * 6. LEVEL UP (The Climb Milestone Crescendo)
   * Punchy, cinematic chord burst celebrating rank progression and badges.
   */
  playLevelUp() {
    this._triggerHaptic([80, 60, 120, 80, 200]);
    if (this.isMuted) return;

    const ctx = this._getAudioContext();
    if (!ctx) return;

    const t = ctx.currentTime;

    // Bass root + power fifth + brass-style swell
    const chord = [130.81, 196.00, 261.63, 329.63, 392.00, 523.25]; // C3, G3, C4, E4, G4, C5

    chord.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const stagger = i * 0.04;

      osc.type = i < 2 ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(freq, t + stagger);

      // Low pass sweep to give a cinematic filter opening effect
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(200, t + stagger);
      filter.frequency.exponentialRampToValueAtTime(3500, t + stagger + 0.3);

      gain.gain.setValueAtTime(0.0001, t + stagger);
      gain.gain.exponentialRampToValueAtTime(0.25 / (chord.length * 0.5), t + stagger + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + stagger + 1.8);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);

      if (this.reverbConvolver) {
        gain.connect(this.reverbConvolver);
      }

      osc.start(t + stagger);
      osc.stop(t + stagger + 2.0);
    });
  }
}

// Export singleton instance globally to window for instant script inclusion
window.RadiaAudio = new AudioManager();