  /**
 * ============================================================================
 * RADIA — WALKING TELEMETRY, ACTIVITY GOALS & SPATIAL MILESTONES ENGINE
 * (js/gamification.js)
 * ----------------------------------------------------------------------------
 *  • Consumer Activity & Progression Telemetry (Strava / Apple Fitness style):
 *      1. Activity XP (Drives Tier 1–7 Member Standing)
 *      2. Field Credits (Earned by walking, checking in at Community Hubs,
 *         completing Walking Milestones & Daily Activity Goals)
 *  • Walking Milestone Track (0.25 km, 0.50 km, 1.00 km, 1.0 Mile / 1,609m)
 *  • 6 Spatial & Conversational Milestones (with clean architectural badges):
 *      - First Connection, Same-Mile Network (10 in Same Mile),
 *        Hub Regular, Active Strider, Mutual Connector, Perspective Weaver.
 *  • Daily Activity Goals & Profile Ring Accents.
 *
 *  Public singleton: window.RadiaGamification
 * ============================================================================
 */

(function () {
  'use strict';

  const STORAGE_KEY_PROGRESS = 'radia_climb_progress_v2';

  const XP_RULES = {
    PER_25M_WALKED: 6,
    LUMINA_PER_25M: 8,
    LANDMARK_HARVEST_XP: 60,
    LANDMARK_HARVEST_LUMINA: 45,
    CONVERSATION_CONCLUDED_XP: 75,
    CONVERSATION_CONCLUDED_LUMINA: 40,
    REFLECTION_SAVED_XP: 90,
    REFLECTION_SAVED_LUMINA: 55
  };

  const WALKING_MILESTONES = [
    { id: 'ms_250m', meters: 250, label: '0.25 km Walk', rewardLumina: 50, rewardXP: 40 },
    { id: 'ms_500m', meters: 500, label: '0.50 km Loop', rewardLumina: 90, rewardXP: 75 },
    { id: 'ms_1000m', meters: 1000, label: '1.00 km Stride', rewardLumina: 160, rewardXP: 130 },
    { id: 'ms_1609m', meters: 1609, label: '1.0 Mile Benchmark', rewardLumina: 300, rewardXP: 250 }
  ];

  const RANKS = [
    { level: 1, title: 'Local Member', xpRequired: 0, auraClass: 'aura-tier-1', auraColor: '#0d9488', desc: 'Botanical Teal Ring' },
    { level: 2, title: 'Neighborhood Explorer', xpRequired: 300, auraClass: 'aura-tier-1', auraColor: '#10b981', desc: 'Emerald Park Accent' },
    { level: 3, title: 'Active Connector', xpRequired: 750, auraClass: 'aura-tier-2', auraColor: '#d97706', desc: 'Warm Amber Accent' },
    { level: 4, title: 'Dialogue Catalyst', xpRequired: 1400, auraClass: 'aura-tier-2', auraColor: '#f59e0b', desc: 'Solar Horizon Ring' },
    { level: 5, title: 'Commons Weaver', xpRequired: 2300, auraClass: 'aura-tier-3', auraColor: '#0284c7', desc: 'Coastal Sky Ring' },
    { level: 6, title: 'Community Steward', xpRequired: 3500, auraClass: 'aura-tier-3', auraColor: '#2563eb', desc: 'Cobalt Meridian Ring' },
    { level: 7, title: 'Radia Fellow', xpRequired: 5000, auraClass: 'aura-tier-4', auraColor: '#7c3aed', desc: 'Violet Perspective Ring' }
  ];

  const AURA_COSMETICS = [
    {
      id: 'aura_emerald',
      name: 'Botanical Teal Ring',
      subtitle: 'Signature architectural teal accent • Tier 1 Default',
      auraClass: 'aura-tier-1',
      primary: '#0d9488',
      accent: '#14b8a6',
      unlockLevel: 1,
      luminaCost: 0
    },
    {
      id: 'aura_solar',
      name: 'Warm Terracotta & Amber',
      subtitle: 'Golden hour profile ring • Tier 2 or 120 Credits',
      auraClass: 'aura-tier-2',
      primary: '#d97706',
      accent: '#f59e0b',
      unlockLevel: 2,
      luminaCost: 120
    },
    {
      id: 'aura_cyan',
      name: 'Coastal Azure Ring',
      subtitle: 'Crisp marine horizon accent • Tier 4 or 240 Credits',
      auraClass: 'aura-tier-3',
      primary: '#0284c7',
      accent: '#38bdf8',
      unlockLevel: 4,
      luminaCost: 240
    },
    {
      id: 'aura_prismatic',
      name: 'Indigo Synthesis Ring',
      subtitle: 'Deep perspective violet ring • Tier 6 or 400 Credits',
      auraClass: 'aura-tier-4',
      primary: '#7c3aed',
      accent: '#a855f7',
      unlockLevel: 6,
      luminaCost: 400
    }
  ];

  const ACHIEVEMENTS = [
    {
      id: 'first_spark',
      title: 'First Connection',
      desc: 'Complete your first real-world catalyst conversation',
      xpReward: 100,
      luminaReward: 50,
      svg: `<svg viewBox="0 0 48 48" fill="none" class="w-11 h-11"><rect x="4" y="4" width="40" height="40" rx="12" fill="rgba(217,119,6,0.12)" stroke="#d97706" stroke-width="1.8"/><path d="M24 12L27 21L36 24L27 27L24 36L21 27L12 24L21 21L24 12Z" fill="#d97706"/></svg>`
    },
    {
      id: 'mile_weaver',
      title: 'Same-Mile Network (10 in 1 Mi)',
      desc: 'Record 10 mutual insights within the same 1.0-mile neighborhood radius',
      xpReward: 350,
      luminaReward: 180,
      svg: `<svg viewBox="0 0 48 48" fill="none" class="w-11 h-11"><rect x="4" y="4" width="40" height="40" rx="12" fill="rgba(13,148,136,0.12)" stroke="#0d9488" stroke-width="1.8"/><circle cx="24" cy="24" r="11" stroke="#0d9488" stroke-width="1.6"/><circle cx="24" cy="24" r="3.5" fill="#d97706"/><circle cx="17" cy="19" r="2.2" fill="#0d9488"/><circle cx="31" cy="19" r="2.2" fill="#0d9488"/><circle cx="17" cy="29" r="2.2" fill="#0d9488"/><circle cx="31" cy="29" r="2.2" fill="#0d9488"/></svg>`
    },
    {
      id: 'park_philosopher',
      title: 'Community Hub Regular',
      desc: 'Anchor 4+ conversation insights at local Community Hubs',
      xpReward: 250,
      luminaReward: 100,
      svg: `<svg viewBox="0 0 48 48" fill="none" class="w-11 h-11"><rect x="4" y="4" width="40" height="40" rx="12" fill="rgba(16,185,129,0.12)" stroke="#059669" stroke-width="1.8"/><path d="M24 13C18 13 15 17 17 22C15 24 17 28 21 28H27C31 28 33 24 31 22C33 17 30 13 24 13Z" fill="#059669" fill-opacity="0.25" stroke="#059669" stroke-width="1.6"/><path d="M24 22V34" stroke="#059669" stroke-width="2" stroke-linecap="round"/></svg>`
    },
    {
      id: 'trailblazer',
      title: 'Active Strider',
      desc: 'Log 250+ meters of neighborhood walking activity',
      xpReward: 200,
      luminaReward: 90,
      svg: `<svg viewBox="0 0 48 48" fill="none" class="w-11 h-11"><rect x="4" y="4" width="40" height="40" rx="12" fill="rgba(2,132,199,0.12)" stroke="#0284c7" stroke-width="1.8"/><path d="M13 31L20 20L27 27L31 21L36 31H13Z" fill="#0284c7" fill-opacity="0.25" stroke="#0284c7" stroke-width="1.6" stroke-linejoin="round"/></svg>`
    },
    {
      id: 'ripple_maker',
      title: 'Mutual Connector',
      desc: 'Complete 3+ double-blind mutual contact exchanges',
      xpReward: 300,
      luminaReward: 140,
      svg: `<svg viewBox="0 0 48 48" fill="none" class="w-11 h-11"><rect x="4" y="4" width="40" height="40" rx="12" fill="rgba(124,58,237,0.12)" stroke="#7c3aed" stroke-width="1.8"/><circle cx="20" cy="24" r="7.5" stroke="#7c3aed" stroke-width="1.8"/><circle cx="28" cy="24" r="7.5" stroke="#0d9488" stroke-width="1.8"/></svg>`
    },
    {
      id: 'constellation_keeper',
      title: 'Perspective Weaver',
      desc: 'Record insights across all 3 prompt categories (Human, Observational, Curiosity)',
      xpReward: 400,
      luminaReward: 160,
      svg: `<svg viewBox="0 0 48 48" fill="none" class="w-11 h-11"><rect x="4" y="4" width="40" height="40" rx="12" fill="rgba(37,99,235,0.12)" stroke="#2563eb" stroke-width="1.8"/><line x1="24" y1="14" x2="15" y2="31" stroke="#0d9488" stroke-width="1.6"/><line x1="24" y1="14" x2="33" y2="31" stroke="#d97706" stroke-width="1.6"/><line x1="15" y1="31" x2="33" y2="31" stroke="#2563eb" stroke-width="1.6"/><circle cx="24" cy="14" r="3.2" fill="#d97706"/><circle cx="15" cy="31" r="3.2" fill="#0d9488"/><circle cx="33" cy="31" r="3.2" fill="#2563eb"/></svg>`
    }
  ];

  class RadiaGamificationEngine {
    constructor() {
      this.state = this._loadState();
      this.accruedDistanceBufferM = 0;
    }

    _loadState() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY_PROGRESS);
        if (raw) {
          const parsed = JSON.parse(raw);
          return this._mergeDefaults(parsed);
        }
      } catch (e) {}
      return this._mergeDefaults({});
    }

    _mergeDefaults(s) {
      return {
        totalXP: typeof s.totalXP === 'number' ? s.totalXP : 480,
        luminaCoins: typeof s.luminaCoins === 'number' ? s.luminaCoins : 145,
        level: typeof s.level === 'number' ? s.level : 2,
        totalEncounters: typeof s.totalEncounters === 'number' ? s.totalEncounters : 4,
        totalReflections: typeof s.totalReflections === 'number' ? s.totalReflections : 4,
        spotsHarvested: typeof s.spotsHarvested === 'number' ? s.spotsHarvested : 1,
        lifetimeMeters: typeof s.lifetimeMeters === 'number' ? s.lifetimeMeters : 340,
        equippedAuraId: s.equippedAuraId || 'aura_emerald',
        unlockedAuras: Array.isArray(s.unlockedAuras) ? s.unlockedAuras : ['aura_emerald', 'aura_solar'],
        unlockedAchievements: Array.isArray(s.unlockedAchievements) ? s.unlockedAchievements : ['first_spark', 'trailblazer'],
        claimedQuests: Array.isArray(s.claimedQuests) ? s.claimedQuests : [],
        claimedMilestones: Array.isArray(s.claimedMilestones) ? s.claimedMilestones : []
      };
    }

    _saveState() {
      if (this._saveDebounceTimer) clearTimeout(this._saveDebounceTimer);
      this._saveDebounceTimer = setTimeout(() => {
        try {
          localStorage.setItem(STORAGE_KEY_PROGRESS, JSON.stringify(this.state));
        } catch (e) {}
      }, 300);
    }

    init() {
      this._bindEvents();
      this._bindQuickActionButtons();
      this._applyEquippedAuraToDOM();
      setTimeout(() => this.evaluateAchievementsAndQuests(), 350);
      this.refreshUI();
      return this;
    }

    _bindQuickActionButtons() {
      const powerWalkBtn = document.getElementById('btn-climb-power-walk');
      if (powerWalkBtn) {
        powerWalkBtn.addEventListener('click', () => {
          if (window.RadiaProximity && typeof window.RadiaProximity.simulateStepBurst === 'function') {
            window.RadiaProximity.simulateStepBurst(200);
          } else {
            this.state.lifetimeMeters += 200;
            this.addRewards(48, 64, '+200m Walk • +64 Credits');
          }
          if (window.RadiaApp) {
            window.RadiaApp.showToast('Logged +200m walk (262 steps) • +64 Credits & +48 XP', 'emerald');
          }
        });
      }

      const plantMileBtn = document.getElementById('btn-climb-plant-mile');
      if (plantMileBtn) {
        plantMileBtn.addEventListener('click', async () => {
          if (window.RadiaStorage) {
            const newEntry = await window.RadiaStorage.plantSampleInsight();
            await this.evaluateAchievementsAndQuests();
            if (window.RadiaApp) {
              await window.RadiaApp.refreshInsightConstellationAndJournal();
              const sp = await window.RadiaStorage.getSpatialCorrelations();
              window.RadiaApp.showToast(
                `Logged Same-Mile Insight with ${newEntry.partnerAlias} (${sp.maxSameMileCount}/10 in Same Mile)`,
                'amber'
              );
            }
          }
        });
      }
    }

    _bindEvents() {
      window.addEventListener('RADIA_DISTANCE_UPDATED', (e) => {
        const { deltaMeters, xpMultiplier } = e.detail;
        if (deltaMeters > 0) {
          this.accruedDistanceBufferM += deltaMeters;
          this.state.lifetimeMeters += deltaMeters;

          if (this.accruedDistanceBufferM >= 25) {
            const steps = Math.floor(this.accruedDistanceBufferM / 25);
            this.accruedDistanceBufferM %= 25;
            const mult = xpMultiplier || 1;
            const xpGain = Math.round(steps * XP_RULES.PER_25M_WALKED * mult);
            const luminaGain = Math.round(steps * XP_RULES.LUMINA_PER_25M * mult);
            this.addRewards(xpGain, luminaGain, `+${luminaGain} Credits • Walked ${steps * 25}m`);
          } else {
            this._saveState();
            const climbView = document.getElementById('view-climb');
            if (climbView && climbView.classList.contains('active')) {
              this.refreshUI();
            } else {
              this.refreshHUDCountersOnly();
            }
          }
        }
      });

      window.addEventListener('RADIA_REFLECTION_SAVED', (e) => {
        const xpEarned = (e.detail && e.detail.xpEarned) || XP_RULES.REFLECTION_SAVED_XP;
        this.state.totalReflections++;
        this.addRewards(xpEarned, XP_RULES.REFLECTION_SAVED_LUMINA, `+${XP_RULES.REFLECTION_SAVED_LUMINA} Credits • Insight Node Added`);
        this.evaluateAchievementsAndQuests();
      });

      window.addEventListener('RADIA_LANDMARK_HARVESTED', (e) => {
        const spotName = (e.detail && e.detail.spot && e.detail.spot.name) || 'Community Hub';
        this.state.spotsHarvested++;
        this.addRewards(
          XP_RULES.LANDMARK_HARVEST_XP,
          XP_RULES.LANDMARK_HARVEST_LUMINA,
          `+${XP_RULES.LANDMARK_HARVEST_LUMINA} Credits • ${spotName}`
        );
        this.evaluateAchievementsAndQuests();
      });
    }

    recordConversationCompleted(partnerAlias) {
      this.state.totalEncounters++;
      this.addRewards(
        XP_RULES.CONVERSATION_CONCLUDED_XP,
        XP_RULES.CONVERSATION_CONCLUDED_LUMINA,
        `+${XP_RULES.CONVERSATION_CONCLUDED_LUMINA} Credits • Connected with ${partnerAlias}`
      );
      this.evaluateAchievementsAndQuests();
    }

    addRewards(xpAmount, luminaAmount, label) {
      const prevLevel = this.state.level;
      this.state.totalXP += Math.max(0, Math.round(xpAmount || 0));
      this.state.luminaCoins += Math.max(0, Math.round(luminaAmount || 0));

      let currentRank = RANKS[0];
      for (let i = RANKS.length - 1; i >= 0; i--) {
        if (this.state.totalXP >= RANKS[i].xpRequired) {
          currentRank = RANKS[i];
          break;
        }
      }
      this.state.level = currentRank.level;

      AURA_COSMETICS.forEach((aura) => {
        if (this.state.level >= aura.unlockLevel && !this.state.unlockedAuras.includes(aura.id)) {
          this.state.unlockedAuras.push(aura.id);
        }
      });

      this._saveState();
      this.refreshUI();

      if (label) {
        this._spawnFloatingMapReward(label);
      }

      if (this.state.level > prevLevel) {
        if (window.RadiaAudio) window.RadiaAudio.playLevelUp();
        window.dispatchEvent(new CustomEvent('RADIA_LEVEL_UP', {
          detail: { newLevel: this.state.level, rankTitle: currentRank.title }
        }));
      }
    }

    _spawnFloatingMapReward(text) {
      const stage = document.getElementById('radar-world-stage');
      if (!stage) return;
      const el = document.createElement('div');
      el.className = 'kinetic-float-reward';
      el.textContent = text;
      stage.appendChild(el);
      setTimeout(() => {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 1600);
    }

    async evaluateAchievementsAndQuests() {
      let spatial = {
        totalInsights: this.state.totalReflections,
        maxSameMileCount: 4,
        mutualCount: 2,
        hasAllThreeCategories: true
      };

      if (window.RadiaStorage && typeof window.RadiaStorage.getSpatialCorrelations === 'function') {
        try {
          spatial = await window.RadiaStorage.getSpatialCorrelations();
        } catch (e) {}
      }

      const checks = {
        first_spark: this.state.totalEncounters >= 1 || spatial.totalInsights >= 1,
        mile_weaver: spatial.maxSameMileCount >= 10,
        park_philosopher: spatial.totalInsights >= 4,
        trailblazer: this.state.lifetimeMeters >= 250,
        ripple_maker: spatial.mutualCount >= 3,
        constellation_keeper: spatial.hasAllThreeCategories && spatial.totalInsights >= 4
      };

      let newlyUnlocked = null;
      ACHIEVEMENTS.forEach((ach) => {
        if (checks[ach.id] && !this.state.unlockedAchievements.includes(ach.id)) {
          this.state.unlockedAchievements.push(ach.id);
          this.state.totalXP += ach.xpReward;
          this.state.luminaCoins += ach.luminaReward;
          newlyUnlocked = ach;
        }
      });

      if (newlyUnlocked) {
        this._saveState();
        if (window.RadiaAudio) window.RadiaAudio.playLevelUp();
        window.dispatchEvent(new CustomEvent('RADIA_ACHIEVEMENT_UNLOCKED', {
          detail: { achievement: newlyUnlocked }
        }));
      }

      this.lastSpatial = spatial;
      this.refreshUI();
    }

    getDailyQuests() {
      const walkedM = Math.round(this.state.lifetimeMeters);
      const spots = this.state.spotsHarvested;
      const insights = (this.lastSpatial && this.lastSpatial.totalInsights) || this.state.totalReflections;

      return [
        {
          id: 'quest_walk_150',
          title: 'Daily Neighborhood Walk',
          desc: 'Walk 400 meters with proximity discovery active',
          current: Math.min(400, walkedM),
          target: 400,
          unit: 'm',
          xpReward: 120,
          luminaReward: 80,
          claimed: this.state.claimedQuests.includes('quest_walk_150')
        },
        {
          id: 'quest_spots_2',
          title: 'Community Hub Check-In',
          desc: 'Check in at 2 local neighborhood Community Hubs',
          current: Math.min(2, spots),
          target: 2,
          unit: 'hubs',
          xpReward: 150,
          luminaReward: 95,
          claimed: this.state.claimedQuests.includes('quest_spots_2')
        },
        {
          id: 'quest_insights_5',
          title: 'Insight Network Growth',
          desc: 'Record 5 mutual insights in your Insight Graph',
          current: Math.min(5, insights),
          target: 5,
          unit: 'nodes',
          xpReward: 180,
          luminaReward: 110,
          claimed: this.state.claimedQuests.includes('quest_insights_5')
        }
      ];
    }

    claimQuest(questId) {
      const quests = this.getDailyQuests();
      const q = quests.find((item) => item.id === questId);
      if (!q || q.claimed || q.current < q.target) return false;

      this.state.claimedQuests.push(questId);
      if (window.RadiaAudio) window.RadiaAudio.playSpotHarvest();
      this.addRewards(q.xpReward, q.luminaReward, `Goal Completed • +${q.luminaReward} Credits`);
      return true;
    }

    claimMilestone(msId) {
      const ms = WALKING_MILESTONES.find((m) => m.id === msId);
      if (!ms || this.state.claimedMilestones.includes(msId) || this.state.lifetimeMeters < ms.meters) {
        return false;
      }
      this.state.claimedMilestones.push(msId);
      if (window.RadiaAudio) window.RadiaAudio.playSpotHarvest();
      this.addRewards(ms.rewardXP, ms.rewardLumina, `Milestone Claimed • +${ms.rewardLumina} Credits`);
      if (window.RadiaApp) {
        window.RadiaApp.showToast(`Claimed ${ms.label}: +${ms.rewardLumina} Credits & +${ms.rewardXP} XP`, 'amber');
      }
      return true;
    }

    equipOrUnlockAura(auraId) {
      const aura = AURA_COSMETICS.find((a) => a.id === auraId);
      if (!aura) return false;

      if (!this.state.unlockedAuras.includes(auraId)) {
        if (this.state.luminaCoins < aura.luminaCost && this.state.level < aura.unlockLevel) {
          return { ok: false, reason: `Requires ${aura.luminaCost} Credits or Tier ${aura.unlockLevel}` };
        }
        if (this.state.level < aura.unlockLevel) {
          this.state.luminaCoins -= aura.luminaCost;
        }
        this.state.unlockedAuras.push(auraId);
      }

      this.state.equippedAuraId = auraId;
      this._saveState();
      this._applyEquippedAuraToDOM();
      this.refreshUI();
      if (window.RadiaAudio) window.RadiaAudio.playSpotHarvest();
      return { ok: true, aura };
    }

    _applyEquippedAuraToDOM() {
      const aura = AURA_COSMETICS.find((a) => a.id === this.state.equippedAuraId) || AURA_COSMETICS[0];
      document.documentElement.style.setProperty('--avatar-primary', aura.primary);
      document.documentElement.style.setProperty('--avatar-accent', aura.accent);
    }

    getCurrentRank() {
      const rank = RANKS.find((r) => r.level === this.state.level) || RANKS[0];
      const nextRank = RANKS.find((r) => r.level === this.state.level + 1);

      let progressPercent = 100;
      let targetXP = rank.xpRequired;

      if (nextRank) {
        const range = nextRank.xpRequired - rank.xpRequired;
        const within = this.state.totalXP - rank.xpRequired;
        progressPercent = Math.min(100, Math.max(4, Math.floor((within / range) * 100)));
        targetXP = nextRank.xpRequired;
      }

      return {
        ...rank,
        totalXP: this.state.totalXP,
        luminaCoins: this.state.luminaCoins,
        nextRank: nextRank ? nextRank.title : 'Maximum Tier',
        targetXP,
        progressPercent
      };
    }

    refreshHUDCountersOnly() {
      const rank = this.getCurrentRank();
      const headerLevel = document.getElementById('header-user-level');
      if (headerLevel) {
        headerLevel.textContent = `Tier ${rank.level}`;
      }
      const headerLumina = document.getElementById('header-lumina-count');
      if (headerLumina) {
        headerLumina.textContent = `${this.state.luminaCoins.toLocaleString()}`;
      }
      const headerDistance = document.getElementById('header-user-distance');
      if (headerDistance) {
        headerDistance.textContent = `${(this.state.lifetimeMeters / 1000).toFixed(2)} km`;
      }
    }

    refreshUI() {
      const rank = this.getCurrentRank();
      const spatial = this.lastSpatial || { maxSameMileCount: 4, sameMileProgressPercent: 40 };
      const totalSteps = Math.round(this.state.lifetimeMeters * 1.31);

      // 1. Pokémon-GO Trainer Medallion Compact Labels
      const headerLevel = document.getElementById('header-user-level');
      if (headerLevel) {
        headerLevel.textContent = `Tier ${rank.level}`;
      }
      const headerLumina = document.getElementById('header-lumina-count');
      if (headerLumina) {
        headerLumina.textContent = `${this.state.luminaCoins.toLocaleString()}`;
      }
      const headerDistance = document.getElementById('header-user-distance');
      if (headerDistance) {
        headerDistance.textContent = `${(this.state.lifetimeMeters / 1000).toFixed(2)} km`;
      }

      // 2. Activity & Milestones Main Progression Card
      const rankTitle = document.getElementById('climb-rank-title');
      const levelBadge = document.getElementById('climb-level-badge');
      const xpBar = document.getElementById('climb-xp-bar');
      const currentXPLabel = document.getElementById('climb-current-xp');
      const targetXPLabel = document.getElementById('climb-target-xp');
      const luminaBalanceEl = document.getElementById('climb-lumina-balance');
      const totalEncountersEl = document.getElementById('stats-total-encounters');
      const totalDistanceEl = document.getElementById('stats-total-distance');
      const sameMileCountEl = document.getElementById('stats-same-mile-count');
      const spotsHarvestedEl = document.getElementById('stats-spots-harvested');

      if (rankTitle) rankTitle.textContent = rank.title;
      if (levelBadge) levelBadge.textContent = `Tier ${rank.level}`;
      if (xpBar) xpBar.style.width = `${rank.progressPercent}%`;
      if (currentXPLabel) currentXPLabel.textContent = `${this.state.totalXP.toLocaleString()} XP`;
      if (targetXPLabel) {
        targetXPLabel.textContent = rank.nextRank !== 'Maximum Tier'
          ? `${rank.targetXP.toLocaleString()} XP to Tier ${rank.level + 1}`
          : 'Top Tier Reached';
      }
      if (luminaBalanceEl) luminaBalanceEl.textContent = `${this.state.luminaCoins.toLocaleString()}`;
      if (totalEncountersEl) totalEncountersEl.textContent = String(this.state.totalEncounters);
      if (totalDistanceEl) {
        totalDistanceEl.textContent = `${(this.state.lifetimeMeters / 1000).toFixed(2)} km`;
      }
      if (sameMileCountEl) sameMileCountEl.textContent = `${spatial.maxSameMileCount} / 10`;
      if (spotsHarvestedEl) spotsHarvestedEl.textContent = String(this.state.spotsHarvested);

      // 3. Render Walking Milestone Track
      this._renderMilestonesTrack();

      // 4. Render Daily Goals
      this._renderQuestsList();

      // 5. Render Spatial & Connection Milestones
      this._renderAchievementsGrid(spatial);

      // 6. Render Profile Ring Accents
      this._renderAuraList();
    }

    _renderMilestonesTrack() {
      const grid = document.getElementById('climb-milestones-grid');
      if (!grid) return;

      grid.innerHTML = WALKING_MILESTONES.map((ms) => {
        const reached = this.state.lifetimeMeters >= ms.meters;
        const claimed = this.state.claimedMilestones.includes(ms.id);
        const pct = Math.min(100, Math.round((this.state.lifetimeMeters / ms.meters) * 100));
        return `
          <div class="milestone-node ${reached ? 'reached' : ''} flex flex-col justify-between gap-2">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-slate-900">${ms.label}</span>
              <span class="text-[11px] font-mono-code font-semibold text-teal-700">+${ms.rewardLumina} pts</span>
            </div>
            <div class="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
              <div class="bg-gradient-to-r from-teal-600 to-amber-500 h-full" style="width:${pct}%"></div>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-mono-code text-slate-500">${Math.min(ms.meters, Math.round(this.state.lifetimeMeters))}/${ms.meters}m</span>
              ${
                claimed
                  ? `<span class="text-[10px] font-bold text-teal-700">Claimed ✓</span>`
                  : reached
                  ? `<button type="button" class="btn-amber px-2.5 py-0.5 rounded-lg text-[10px] font-bold ms-claim-btn" data-ms-id="${ms.id}">Claim</button>`
                  : `<span class="text-[10px] text-slate-500">+${ms.rewardXP} XP</span>`
              }
            </div>
          </div>
        `;
      }).join('');

      grid.querySelectorAll('.ms-claim-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.claimMilestone(btn.getAttribute('data-ms-id'));
        });
      });
    }

    _renderQuestsList() {
      const container = document.getElementById('climb-quests-list');
      if (!container) return;

      const quests = this.getDailyQuests();
      container.innerHTML = quests.map((q) => {
        const pct = Math.min(100, Math.round((q.current / q.target) * 100));
        const ready = q.current >= q.target && !q.claimed;
        return `
          <div class="p-3.5 rounded-2xl bg-slate-100/80 border ${ready ? 'border-amber-500/50' : 'border-slate-200'} space-y-2">
            <div class="flex items-center justify-between gap-2">
              <div>
                <p class="text-xs font-bold text-slate-900">${q.title}</p>
                <p class="text-[11px] text-slate-500">${q.desc}</p>
              </div>
              ${
                q.claimed
                  ? `<span class="px-2.5 py-1 rounded-full bg-teal-500/10 border border-teal-500/30 text-[10px] font-bold text-teal-700">Completed ✓</span>`
                  : ready
                  ? `<button type="button" class="btn-amber px-3 py-1.5 rounded-xl text-[11px] font-bold quest-claim-btn" data-quest-id="${q.id}">Claim +${q.luminaReward} pts</button>`
                  : `<span class="text-[11px] font-mono-code font-semibold text-amber-700">+${q.luminaReward} pts</span>`
              }
            </div>
            <div class="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
              <div class="bg-gradient-to-r from-teal-600 to-amber-500 h-full rounded-full transition-all duration-300" style="width:${pct}%"></div>
            </div>
            <div class="flex justify-between text-[10px] text-slate-500 font-mono-code">
              <span>${q.current} / ${q.target} ${q.unit}</span>
              <span>+${q.xpReward} Activity XP</span>
            </div>
          </div>
        `;
      }).join('');

      container.querySelectorAll('.quest-claim-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.claimQuest(btn.getAttribute('data-quest-id'));
        });
      });
    }

    _renderAchievementsGrid(spatial) {
      const grid = document.getElementById('climb-achievements-grid');
      if (!grid) return;

      grid.innerHTML = ACHIEVEMENTS.map((ach) => {
        const unlocked = this.state.unlockedAchievements.includes(ach.id);
        const extraProgress = ach.id === 'mile_weaver'
          ? `<div class="mt-1.5 text-[10px] font-mono-code font-semibold ${unlocked ? 'text-teal-700' : 'text-amber-700'}">${spatial.maxSameMileCount} / 10 in current mile</div>`
          : '';
        return `
          <div class="achievement-card ${unlocked ? 'unlocked' : 'locked'} flex items-start gap-3">
            <div class="flex-shrink-0">${ach.svg}</div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between gap-1">
                <h4 class="text-xs font-bold text-slate-900 truncate">${ach.title}</h4>
                <span class="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${unlocked ? 'bg-teal-500/15 text-teal-700 border border-teal-500/30' : 'bg-slate-200 text-slate-600'}">
                  ${unlocked ? 'Earned ✓' : `+${ach.xpReward} XP`}
                </span>
              </div>
              <p class="text-[11px] text-slate-500 leading-snug mt-0.5">${ach.desc}</p>
              ${extraProgress}
            </div>
          </div>
        `;
      }).join('');
    }

    _renderAuraList() {
      const container = document.getElementById('climb-aura-list');
      if (!container) return;

      container.innerHTML = AURA_COSMETICS.map((aura) => {
        const unlocked = this.state.unlockedAuras.includes(aura.id) || this.state.level >= aura.unlockLevel;
        const equipped = this.state.equippedAuraId === aura.id;

        return `
          <div class="flex items-center justify-between p-3 rounded-2xl bg-slate-100/80 border ${equipped ? 'border-teal-500/50' : 'border-slate-200'}">
            <div class="flex items-center gap-3">
              <span class="w-4 h-4 rounded-full shadow-sm" style="background: linear-gradient(135deg, ${aura.primary}, ${aura.accent});"></span>
              <div>
                <p class="text-xs font-bold text-slate-900">${aura.name}</p>
                <p class="text-[10px] text-slate-500">${aura.subtitle}</p>
              </div>
            </div>
            ${
              equipped
                ? `<span class="px-2.5 py-1 rounded-full bg-teal-500/15 border border-teal-500/30 text-[10px] font-bold text-teal-700 uppercase">Active</span>`
                : unlocked
                ? `<button type="button" class="btn-glass px-3 py-1.5 rounded-xl text-[11px] font-bold text-teal-700 aura-action-btn" data-aura-id="${aura.id}">Apply</button>`
                : `<button type="button" class="btn-glass px-3 py-1.5 rounded-xl text-[11px] font-bold text-amber-700 aura-action-btn" data-aura-id="${aura.id}">Unlock (${aura.luminaCost} pts)</button>`
            }
          </div>
        `;
      }).join('');

      container.querySelectorAll('.aura-action-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const res = this.equipOrUnlockAura(btn.getAttribute('data-aura-id'));
          if (res && res.ok === false && window.RadiaApp) {
            window.RadiaApp.showToast(res.reason, 'amber');
          }
        });
      });
    }
  }

  const gamification = new RadiaGamificationEngine();
  window.RadiaGamification = gamification;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => gamification.init());
  } else {
    gamification.init();
  }
})();
