/**
 * ============================================================================
 * RADIA — PROCEDURAL WEB AUDIO & HAPTICS ENGINE (js/audio.js)
 * ----------------------------------------------------------------------------
 *  • Pure procedural Web Audio API synthesizer & synchronized haptic feedback.
 *  • Zero external MP3/WAV dependencies — 100% static/PWA ready.
 *  • Includes acoustic cues for:
 *      1. Collision Ping (~40ft / Sprawl Bubble encounter trigger)
 *      2. Timer Tick & Timer Complete Chime
 *      3. Mutual Match Ascending Arpeggio
 *      4. Reflection & Insight Network Node Link Chime
 *      5. Community Hub Check-In & Field Credit Chime
 *      6. Tier Up & Spatial Milestone Unlock Fanfare
 * ============================================================================
 */

class AudioManager {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
    this.isUnlocked = false;
    this.hapticsEnabled = true;

    this.masterGain = null;
    this.reverbConvolver = null;
    this.reverbGain = null;

    this.STORAGE_KEY_MUTE = 'radia_audio_muted';
    this.STORAGE_KEY_HAPTICS = 'radia_haptics_enabled';

    this._loadPreferences();
    this._initAutoplayUnlock();
  }

  _getAudioContext() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this.ctx = new AudioContextClass();
        this._buildMasterBus();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  _buildMasterBus() {
    if (!this.ctx) return;

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.85, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);

    this.reverbGain = this.ctx.createGain();
    this.reverbGain.gain.setValueAtTime(0.26, this.ctx.currentTime);

    this.reverbConvolver = this.ctx.createConvolver();
    this.reverbConvolver.buffer = this._generateImpulseResponse(1.6, 2.3);

    this.reverbConvolver.connect(this.reverbGain);
    this.reverbGain.connect(this.masterGain);
  }

  _generateImpulseResponse(duration, decay) {
    if (!this.ctx) return null;
    const sampleRate = this.ctx.sampleRate;
    const length = Math.floor(sampleRate * duration);
    const impulse = this.ctx.createBuffer(2, length, sampleRate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const env = Math.pow(1 - i / length, decay);
      left[i] = (Math.random() * 2 - 1) * env;
      right[i] = (Math.random() * 2 - 1) * env;
    }
    return impulse;
  }

  _initAutoplayUnlock() {
    const unlockHandler = () => {
      const ctx = this._getAudioContext();
      if (ctx && ctx.state === 'running') {
        this.isUnlocked = true;
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

  _loadPreferences() {
    try {
      const savedMute = localStorage.getItem(this.STORAGE_KEY_MUTE);
      if (savedMute !== null) this.isMuted = JSON.parse(savedMute);
      const savedHaptics = localStorage.getItem(this.STORAGE_KEY_HAPTICS);
      if (savedHaptics !== null) this.hapticsEnabled = JSON.parse(savedHaptics);
    } catch (e) {}
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    try {
      localStorage.setItem(this.STORAGE_KEY_MUTE, JSON.stringify(this.isMuted));
    } catch (e) {}

    if (this.masterGain && this.ctx) {
      this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.85, this.ctx.currentTime);
    }
    return this.isMuted;
  }

  toggleHaptics() {
    this.hapticsEnabled = !this.hapticsEnabled;
    try {
      localStorage.setItem(this.STORAGE_KEY_HAPTICS, JSON.stringify(this.hapticsEnabled));
    } catch (e) {}
    return this.hapticsEnabled;
  }

  _triggerHaptic(pattern) {
    if (!this.hapticsEnabled) return;
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try { navigator.vibrate(pattern); } catch (e) {}
    }
  }

  /** 1. COLLISION PING */
  playCollisionPing() {
    this._triggerHaptic([90, 60, 140]);
    if (this.isMuted) return;
    const ctx = this._getAudioContext();
    if (!ctx) return;

    const t = ctx.currentTime;
    const freqs = [261.63, 392.00, 523.25];
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = t + idx * 0.07;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.28, start + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 1.0);
      osc.connect(gain);
      gain.connect(this.masterGain);
      if (this.reverbConvolver) gain.connect(this.reverbConvolver);
      osc.start(start);
      osc.stop(start + 1.05);
    });
  }

  /** 2. TIMER TICK */
  playTimerTick() {
    this._triggerHaptic(15);
    if (this.isMuted) return;
    const ctx = this._getAudioContext();
    if (!ctx) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(840, t);
    osc.frequency.exponentialRampToValueAtTime(240, t + 0.032);
    gain.gain.setValueAtTime(0.14, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.038);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.042);
  }

  /** 3. TIMER COMPLETE */
  playTimerComplete() {
    this._triggerHaptic([60, 40, 80]);
    if (this.isMuted) return;
    const ctx = this._getAudioContext();
    if (!ctx) return;

    const t = ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const delay = idx * 0.08;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + delay);
      gain.gain.setValueAtTime(0.0001, t + delay);
      gain.gain.exponentialRampToValueAtTime(0.24, t + delay + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + delay + 1.3);
      osc.connect(gain);
      gain.connect(this.masterGain);
      if (this.reverbConvolver) gain.connect(this.reverbConvolver);
      osc.start(t + delay);
      osc.stop(t + delay + 1.35);
    });
  }

  /** 4. MUTUAL MATCH */
  playMutualMatch() {
    this._triggerHaptic([50, 40, 50, 40, 110]);
    if (this.isMuted) return;
    const ctx = this._getAudioContext();
    if (!ctx) return;

    const t = ctx.currentTime;
    [392.00, 493.88, 587.33, 659.25, 783.99, 1046.50].forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startTime = t + index * 0.06;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(0.26, startTime + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.85);
      osc.connect(gain);
      gain.connect(this.masterGain);
      if (this.reverbConvolver) gain.connect(this.reverbConvolver);
      osc.start(startTime);
      osc.stop(startTime + 0.9);
    });
  }

  /** 5. REFLECTION & INSIGHT CONSTELLATION NODE LINK */
  playReflectionSaved() {
    this._triggerHaptic([35, 30, 65]);
    if (this.isMuted) return;
    const ctx = this._getAudioContext();
    if (!ctx) return;

    const t = ctx.currentTime;
    [587.33, 880.00, 1174.66].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = t + i * 0.055;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.2, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.7);
      osc.connect(gain);
      gain.connect(this.masterGain);
      if (this.reverbConvolver) gain.connect(this.reverbConvolver);
      osc.start(start);
      osc.stop(start + 0.75);
    });
  }

  /** 6. COMMUNITY HUB CHECK-IN / FIELD CREDIT CHIME */
  playSpotHarvest() {
    this._triggerHaptic([40, 30, 70]);
    if (this.isMuted) return;
    const ctx = this._getAudioContext();
    if (!ctx) return;

    const t = ctx.currentTime;
    [659.25, 880.00, 1318.51].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = t + i * 0.05;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.22, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.55);
      osc.connect(gain);
      gain.connect(this.masterGain);
      if (this.reverbConvolver) gain.connect(this.reverbConvolver);
      osc.start(start);
      osc.stop(start + 0.6);
    });
  }

  playSpotCheckIn() {
    return this.playSpotHarvest();
  }

  /** 7. LEVEL UP & SPATIAL ACHIEVEMENT FANFARE */
  playLevelUp() {
    this._triggerHaptic([70, 50, 100, 60, 180]);
    if (this.isMuted) return;
    const ctx = this._getAudioContext();
    if (!ctx) return;

    const t = ctx.currentTime;
    const chord = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99];
    chord.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const stagger = i * 0.045;
      osc.type = i < 2 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, t + stagger);
      gain.gain.setValueAtTime(0.0001, t + stagger);
      gain.gain.exponentialRampToValueAtTime(0.18, t + stagger + 0.06);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + stagger + 1.5);
      osc.connect(gain);
      gain.connect(this.masterGain);
      if (this.reverbConvolver) gain.connect(this.reverbConvolver);
      osc.start(t + stagger);
      osc.stop(t + stagger + 1.6);
    });
  }
}

window.RadiaAudio = new AudioManager();
