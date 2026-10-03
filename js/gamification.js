/**
 * ============================================================================
 * RADIA — "THE CLIMB" GAMIFICATION & MASTERY ENGINE (js/gamification.js)
 * ----------------------------------------------------------------------------
 *  • Progression tracking (Walking Distance, Encounters, Reflections).
 *  • Aesthetic and expressive reward model (Unlocks avatar auras & journal titles).
 *  • Strict Zero Exclusion: 100% features/prompts open from Level 1.
 * ============================================================================
 */

(function () {
  'use strict';

  const STORAGE_KEY_PROGRESS = 'radia_climb_progress';

  // XP Rules
  const XP_RULES = {
    PER_100M_WALKED: 10,
    CONVERSATION_CONCLUDED: 50,
    REFLECTION_SAVED: 75
  };

  // Level Progression Hierarchy
  const RANKS = [
    { level: 1, title: 'Novice Wanderer', xpRequired: 0, auraClass: 'aura-tier-1', auraColor: '#10b981' },
    { level: 2, title: 'Urban Scout', xpRequired: 300, auraClass: 'aura-tier-1', auraColor: '#10b981' },
    { level: 3, title: 'Pathfinder', xpRequired: 800, auraClass: 'aura-tier-2', auraColor: '#f59e0b' },
    { level: 4, title: 'Dialogue Initiate', xpRequired: 1600, auraClass: 'aura-tier-2', auraColor: '#f59e0b' },
    { level: 5, title: 'Atmosphere Weaver', xpRequired: 2800, auraClass: 'aura-tier-3', auraColor: '#8b5cf6' },
    { level: 6, title: 'Community Anchor', xpRequired: 4500, auraClass: 'aura-tier-3', auraColor: '#8b5cf6' },
    { level: 7, title: 'Radia Luminary', xpRequired: 7000, auraClass: 'aura-tier-4', auraColor: '#ec4899' }
  ];

  class RadiaGamificationEngine {
    constructor() {
      this.state = this._loadState();
      this.accruedDistanceBufferM = 0;
    }

    _loadState() {
      try {
        const data = localStorage.getItem(STORAGE_KEY_PROGRESS);
        if (data) return JSON.parse(data);
      } catch (e) {}

      return {
        totalXP: 0,
        level: 1,
        totalEncounters: 0,
        totalReflections: 0,
        lifetimeMeters: 0
      };
    }

    _saveState() {
      try {
        localStorage.setItem(STORAGE_KEY_PROGRESS, JSON.stringify(this.state));
      } catch (e) {}
    }

    init() {
      this._bindProximityAndStorageEvents();
      this.refreshUI();
      return this;
    }

    _bindProximityAndStorageEvents() {
      // 1. Accrue XP from real/simulated walking distance
      window.addEventListener('RADIA_DISTANCE_UPDATED', (e) => {
        const { deltaMeters, xpMultiplier } = e.detail;
        if (deltaMeters > 0) {
          this.accruedDistanceBufferM += deltaMeters;
          this.state.lifetimeMeters += deltaMeters;

          if (this.accruedDistanceBufferM >= 100) {
            const blocks = Math.floor(this.accruedDistanceBufferM / 100);
            this.accruedDistanceBufferM %= 100;
            const mult = xpMultiplier || 1;
            const xpToAdd = blocks * XP_RULES.PER_100M_WALKED * mult;
            this.addXP(xpToAdd, `Walked ${blocks * 100}m`);
          }
          this._saveState();
        }
      });

      // 2. XP from completed reflections
      window.addEventListener('RADIA_REFLECTION_SAVED', (e) => {
        const { xpEarned } = e.detail;
        this.state.totalReflections++;
        this.addXP(xpEarned || XP_RULES.REFLECTION_SAVED, 'Reflection Logged');
      });
    }

    recordConversationCompleted(partnerAlias) {
      this.state.totalEncounters++;
      this.addXP(XP_RULES.CONVERSATION_CONCLUDED, 'Conversation Completed');
    }

    addXP(amount, reason = '') {
      const prevLevel = this.state.level;
      this.state.totalXP += amount;

      // Recalculate level
      let currentRank = RANKS[0];
      for (let i = RANKS.length - 1; i >= 0; i--) {
        if (this.state.totalXP >= RANKS[i].xpRequired) {
          currentRank = RANKS[i];
          break;
        }
      }

      this.state.level = currentRank.level;
      this._saveState();
      this.refreshUI();

      // Check level-up milestone
      if (this.state.level > prevLevel) {
        if (window.RadiaAudio && typeof window.RadiaAudio.playLevelUp === 'function') {
          window.RadiaAudio.playLevelUp();
        }
        window.dispatchEvent(new CustomEvent('RADIA_LEVEL_UP', {
          detail: {
            newLevel: this.state.level,
            rankTitle: currentRank.title
          }
        }));
      }
    }

    getCurrentRank() {
      const rank = RANKS.find(r => r.level === this.state.level) || RANKS[0];
      const nextRank = RANKS.find(r => r.level === this.state.level + 1);

      let progressToNext = 100;
      let targetXP = rank.xpRequired;

      if (nextRank) {
        const range = nextRank.xpRequired - rank.xpRequired;
        const currentWithinRange = this.state.totalXP - rank.xpRequired;
        progressToNext = Math.min(100, Math.max(0, Math.floor((currentWithinRange / range) * 100)));
        targetXP = nextRank.xpRequired;
      }

      return {
        ...rank,
        totalXP: this.state.totalXP,
        nextRank: nextRank ? nextRank.title : 'Maximum Rank',
        targetXP: targetXP,
        progressPercent: progressToNext
      };
    }

    refreshUI() {
      const rank = this.getCurrentRank();

      // Update Navigation Header Pill
      const headerLevel = document.getElementById('header-user-level');
      if (headerLevel) {
        headerLevel.textContent = `LVL ${rank.level} • ${rank.title}`;
        headerLevel.style.color = rank.auraColor;
      }

      // Update Header Aura Indicator
      const auraIndicator = document.getElementById('user-aura-indicator');
      if (auraIndicator) {
        auraIndicator.style.backgroundColor = rank.auraColor;
      }

      // Update "The Climb" View Screen Elements
      const rankTitle = document.getElementById('climb-rank-title');
      const levelBadge = document.getElementById('climb-level-badge');
      const xpBar = document.getElementById('climb-xp-bar');
      const currentXPLabel = document.getElementById('climb-current-xp');
      const targetXPLabel = document.getElementById('climb-target-xp');
      const totalEncounters = document.getElementById('stats-total-encounters');

      if (rankTitle) rankTitle.textContent = rank.title;
      if (levelBadge) {
        levelBadge.textContent = `LVL ${rank.level}`;
        levelBadge.style.color = rank.auraColor;
        levelBadge.style.borderColor = `${rank.auraColor}40`;
      }
      if (xpBar) xpBar.style.width = `${rank.progressPercent}%`;
      if (currentXPLabel) currentXPLabel.textContent = `${this.state.totalXP.toLocaleString()} XP`;
      if (targetXPLabel) {
        targetXPLabel.textContent = rank.nextRank !== 'Maximum Rank'
          ? `${rank.targetXP.toLocaleString()} XP to Level ${rank.level + 1}`
          : 'Max Rank Master';
      }
      if (totalEncounters) totalEncounters.textContent = this.state.totalEncounters;

      // Update Map Avatar Ring Aura
      const centerAvatar = document.getElementById('radar-avatar-center');
      if (centerAvatar) {
        centerAvatar.className = `absolute w-10 h-10 rounded-full bg-slate-900 overflow-hidden ${rank.auraClass}`;
      }
    }
  }

  const gamification = new RadiaGamificationEngine();
  window.RadiaGamification = gamification;

  document.addEventListener('DOMContentLoaded', () => {
    gamification.init();
  });
})();