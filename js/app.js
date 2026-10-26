/**
 * ============================================================================
 * RADIA — MASTER APPLICATION, INSIGHT NETWORK GRAPH & AI SYNTHESIS CONTROLLER
 * (js/app.js)
 * ----------------------------------------------------------------------------
 *  • Orchestrates the 4 primary views:
 *      1. Explore Map (#view-radar)
 *      2. Insight Graph & AI Reflection Synthesis (#view-reflections)
 *      3. Activity, Walking Telemetry & Milestones (#view-climb)
 *      4. Settings, Sprawl Calibration & Privacy Vault (#view-settings)
 *  • Renders the Interactive HTML5 Canvas Insight Network Graph
 *    (#insight-constellation-canvas) with 3 analytical layouts:
 *      - 'tree'          : Growth Tree (Location Hubs -> Mutual Insight Dyads ->
 *                          3-Pillar AI Synthesis)
 *      - 'constellation' : Network Graph pointing to the AI Synthesis Core
 *      - 'spatial'       : 1.0-Mile Geodesic Spatial Correlation Map
 *  • Supports Daylight Mode (default) and Evening Dark Mode seamlessly.
 *
 *  Public singleton: window.RadiaApp
 * ============================================================================
 */

(function () {
  'use strict';

  const KEY_UI_APPEARANCE = 'radia_ui_appearance_v3';

  class RadiaAppController {
    constructor() {
      this.currentView = 'view-radar';
      this.timerInterval = null;
      this.sessionTimeRemaining = 0;
      this.currentPartnerAlias = 'Jordan';
      this.currentPrompt = null;
      this.currentHotspotName = 'Central Fountain Plaza';
      this.currentSprawlLabel = 'Neighborhood Park (40ft)';
      this.selectedSafetyRating = 1;
      this.isMutualConnected = false;

      // Appearance ('light' default | 'dark')
      this.appearance = localStorage.getItem(KEY_UI_APPEARANCE) || 'light';

      // Insight Graph Canvas State
      this.graphMode = 'tree'; // 'tree' | 'constellation' | 'spatial'
      this.graphTransform = { scale: 1, offsetX: 0, offsetY: 0 };
      this.isDraggingGraph = false;
      this.graphDragStart = { x: 0, y: 0 };
      this.journalFilter = 'all';
      this.journalSearchQuery = '';
      this.constellationNodes = [];
      this.selectedNodeEntry = null;
      this.selectedAiPillar = null;
      this.canvasAnimId = null;
      this.lastCanvasTs = 0;
      this.toastTimeout = null;
    }

    async init() {
      this.setAppearance(this.appearance, false);
      this._bindNavigationDock();
      this._bindTopHUDShortcuts();
      this._bindMapProviderAndCityControls();
      this._bindRuntimeConfigControls();
      this._bindPresenceControls();
      this._bindQuickGuideModal();
      this._bindSprawlCalibrationControls();
      this._bindSettingsAndProfile();
      this._bindAudioControls();
      this._bindCollisionModalEvents();
      this._bindCatalystSessionEvents();
      this._bindPostEncounterFlow();
      this._bindConstellationAndJournalEvents();
      this._bindInsightsChrome();
      this._bindGlobalAchievementToasts();
      this._bindKeyboardAndBackdropDismissal();

      if (window.RadiaStorage) {
        await window.RadiaStorage.init();
      }

      await this.refreshInsightConstellationAndJournal();
      if (window.RadiaGamification) {
        await window.RadiaGamification.evaluateAchievementsAndQuests();
      }

      this._startConstellationAnimationLoop();

      if (window.lucide) {
        window.lucide.createIcons();
      }
    }

    /* ----------------------------------------------------------------------
       0. APPEARANCE MODE (ARCHITECTURAL DAYLIGHT vs EVENING DARK)
       ---------------------------------------------------------------------- */
    setAppearance(mode, notify = true) {
      this.appearance = mode === 'dark' ? 'dark' : 'light';
      localStorage.setItem(KEY_UI_APPEARANCE, this.appearance);
      document.documentElement.classList.toggle('theme-dark', this.appearance === 'dark');

      document.querySelectorAll('.appearance-mode-btn').forEach((btn) => {
        const active = btn.getAttribute('data-appearance') === this.appearance;
        btn.classList.toggle('btn-emerald', active);
        btn.classList.toggle('btn-glass', !active);
      });

      const headerToggleIcon = document.getElementById('btn-toggle-appearance');
      if (headerToggleIcon) {
        headerToggleIcon.innerHTML = this.appearance === 'dark'
          ? '<i data-lucide="sun" class="w-4 h-4 text-amber-400"></i>'
          : '<i data-lucide="moon" class="w-4 h-4 text-slate-600"></i>';
        if (window.lucide) window.lucide.createIcons();
      }

      if (window.RadiaProximity && typeof window.RadiaProximity._drawFallbackBasemap === 'function') {
        window.RadiaProximity._drawFallbackBasemap();
      }

      this._drawConstellationCanvas(performance.now());

      if (notify) {
        this.showToast(
          this.appearance === 'dark' ? 'Evening Dark Appearance Active' : 'Daylight Appearance Active',
          'emerald'
        );
      }
    }

    toggleAppearance() {
      const next = this.appearance === 'dark' ? 'light' : 'dark';
      this.setAppearance(next, true);
      if (window.RadiaProximity && typeof window.RadiaProximity.setMapTheme === 'function') {
        window.RadiaProximity.setMapTheme(next === 'dark' ? 'dark' : 'voyager');
      }
    }

    /* ----------------------------------------------------------------------
       RUNTIME CONFIG — map key, demo mode, honest default states
       ---------------------------------------------------------------------- */
    _bindRuntimeConfigControls() {
      const cfg = window.RadiaConfig;
      this._applyDemoVisibility();
      if (!cfg) return;

      const keyInput = document.getElementById('input-maptiler-key');
      const keyStatus = document.getElementById('maptiler-key-status');
      const saveKeyBtn = document.getElementById('btn-save-maptiler-key');

      const renderKeyStatus = () => {
        if (!keyStatus) return;
        keyStatus.textContent = cfg.get('maptilerKey')
          ? 'Key saved in this browser. All five map styles now use MapTiler imagery.'
          : 'Leave blank to keep the free tiles. A key is only sent to MapTiler, and it is stored in this browser only.';
      };

      if (keyInput) keyInput.value = cfg.get('maptilerKey') || '';
      renderKeyStatus();

      if (saveKeyBtn) {
        saveKeyBtn.addEventListener('click', () => {
          cfg.set('maptilerKey', (keyInput && keyInput.value.trim()) || '');
          renderKeyStatus();
          if (window.RadiaProximity && typeof window.RadiaProximity._applyTileProvider === 'function') {
            window.RadiaProximity._applyTileProvider(window.RadiaProximity.mapTheme);
          }
          this.showToast(cfg.get('maptilerKey') ? 'Map key saved' : 'Using free map tiles', 'emerald');
        });
      }

      const demoToggle = document.getElementById('toggle-demo-mode');
      if (demoToggle) {
        demoToggle.checked = !!cfg.get('demoMode');
        demoToggle.addEventListener('change', () => {
          cfg.set('demoMode', demoToggle.checked);
          window.location.reload();
        });
      }

      const insightEmptyMap = document.getElementById('btn-insight-empty-map');
      if (insightEmptyMap) {
        insightEmptyMap.addEventListener('click', () => this.switchView('view-radar'));
      }
    }

    /* ----------------------------------------------------------------------
       NEARBY PRESENCE — local BroadcastChannel or hosted realtime
       ---------------------------------------------------------------------- */
    _bindPresenceControls() {
      const cfg = window.RadiaConfig;
      const presence = window.RadiaPresence;
      if (!cfg) return;

      const statusEl = document.getElementById('presence-status');
      const hostedFields = document.getElementById('presence-hosted-fields');
      const urlInput = document.getElementById('input-supabase-url');
      const keyInput = document.getElementById('input-supabase-anon-key');
      const saveBtn = document.getElementById('btn-save-presence');

      if (urlInput) urlInput.value = cfg.get('supabaseUrl') || '';
      if (keyInput) keyInput.value = cfg.get('supabaseAnonKey') || '';

      const setActiveDriver = (driver) => {
        document.querySelectorAll('.presence-driver-btn').forEach((btn) => {
          const active = btn.getAttribute('data-presence') === driver;
          btn.classList.toggle('btn-emerald', active);
          btn.classList.toggle('btn-glass', !active);
        });
        if (hostedFields) hostedFields.classList.toggle('hidden', driver !== 'supabase');
      };

      const renderStatus = () => {
        if (!statusEl || !presence) return;
        const driver = presence.driver;
        if (driver === 'off') {
          statusEl.textContent = 'Only you on the map.';
        } else if (presence.status === 'live' && driver === 'local') {
          statusEl.textContent = 'Live on this machine. Open a second tab or window to see another person appear.';
        } else if (presence.status === 'live') {
          statusEl.textContent = 'Connected to your hosted channel. Others in your geohash cell will appear.';
        } else if (presence.status === 'error') {
          statusEl.textContent = `Not connected: ${presence.error || 'unknown error'}`;
        } else {
          statusEl.textContent = 'Connecting…';
        }
      };

      setActiveDriver(presence ? presence.driver : (cfg.get('presenceDriver') || 'off'));
      renderStatus();

      window.addEventListener('RADIA_PRESENCE_STATUS', renderStatus);

      document.querySelectorAll('.presence-driver-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const driver = btn.getAttribute('data-presence') || 'off';
          cfg.set('presenceDriver', driver);
          setActiveDriver(driver);
          if (presence) {
            presence.start(driver);
            setTimeout(renderStatus, 60);
          }
        });
      });

      if (saveBtn) {
        saveBtn.addEventListener('click', () => {
          cfg.set('supabaseUrl', (urlInput && urlInput.value.trim()) || '');
          cfg.set('supabaseAnonKey', (keyInput && keyInput.value.trim()) || '');
          cfg.set('presenceDriver', 'supabase');
          setActiveDriver('supabase');
          if (presence) presence.start('supabase');
          setTimeout(renderStatus, 80);
          this.showToast('Presence settings saved', 'emerald');
        });
      }

      // Resume a previously chosen transport on load.
      if (presence) {
        const saved = cfg.get('presenceDriver') || 'off';
        if (saved !== 'off') setTimeout(() => presence.start(saved), 1200);
      }
    }

    /* ----------------------------------------------------------------------
       THE VOID — solar insight graph
       One star at the top. Every insight is a small star beneath it, joined
       by a thread that carries light back into the centre. No legend, no
       labels until you ask for one.
       ---------------------------------------------------------------------- */

    _solarColors() {
      return {
        changed: '#e8996d',
        learned: '#7fc3a8',
        reached: '#9db8c2',
        hub: '#a9e6c8',
        label: 'rgba(234, 242, 236, 0.80)',
        sub: 'rgba(234, 242, 236, 0.44)',
        dust: '228, 238, 230'
      };
    }

    _solarReasonFor(entry, i) {
      const c = String(entry.category || '').toLowerCase();
      if (/vuln|human|identity|fear|loss/.test(c)) return 'changed';
      if (/observ|curio|learn|question/.test(c)) return 'learned';
      if (/mutual|connect|people|reach/.test(c)) return 'reached';
      return ['changed', 'learned', 'reached'][i % 3];
    }

    /* One star at the top, one quiet ring of insight-stars beneath it.
       Everything else is empty sky on purpose. */
    _solarLayout(W, H, entries) {
      const colors = this._solarColors();
      const narrow = W < 520;
      const list = entries || [];
      const shown = list.slice(0, 8);

      const hub = { x: W / 2, y: H * (narrow ? 0.36 : 0.32) };
      const rx = narrow ? W * 0.33 : Math.min(W * 0.31, 272);
      const ry = narrow ? H * 0.23 : H * 0.27;

      // An even fan under the star: no overlap, no grouping clutter.
      const anglesFor = (n) => {
        if (n <= 1) return [90];
        const span = n === 2 ? 54 : 104;
        const start = 90 - span / 2;
        const step = span / (n - 1);
        return Array.from({ length: n }, (_, i) => start + step * i);
      };

      const t = performance.now() / 1000;
      const baseAngles = anglesFor(shown.length);
      const nodes = shown.map((entry, i) => {
        const key = this._solarReasonFor(entry, i);
        const drift = Math.sin(t * 0.20 + i * 1.7) * 2.1;
        const angle = baseAngles[i] + drift;
        const rad = (angle * Math.PI) / 180;
        const depth = 1 + Math.sin(t * 0.44 + i * 0.9) * 0.012;
        return {
          x: hub.x + Math.cos(rad) * rx * depth,
          y: hub.y + Math.sin(rad) * ry * depth,
          r: narrow ? 5 : 5.6,
          key,
          color: colors[key],
          entry
        };
      });

      return { hub, nodes, colors, narrow, rx, ry, count: list.length };
    }

    _drawSolarGraph(ctx, W, H, entries) {
      const TAU = Math.PI * 2;
      const t = performance.now() / 1000;
      const layout = this._solarLayout(W, H, entries || []);
      const { hub, rx, ry, colors } = layout;
      this._solarNodes = layout.nodes;
      this._solarPositions = [hub];
      this._solarReasonY = hub.y;

      const tint = (hex, a) => {
        const n = parseInt(hex.slice(1), 16);
        return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
      };

      /* Dust: fixed positions, breathing light. */
      const rand = (n) => {
        const x = Math.sin(n * 127.1) * 43758.5453;
        return x - Math.floor(x);
      };
      for (let i = 0; i < 44; i++) {
        const dx = rand(i + 1) * W;
        const dy = rand(i + 71) * H;
        const alpha = 0.035 + 0.085 * (0.5 + 0.5 * Math.sin(t * 0.6 + i * 1.7));
        ctx.fillStyle = `rgba(${colors.dust}, ${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(dx, dy, rand(i + 31) > 0.9 ? 1.5 : 0.85, 0, TAU);
        ctx.fill();
      }

      /* Gravity: slow rings leaving the star, so the system feels alive. */
      for (let k = 0; k < 2; k++) {
        const p = (t * 0.07 + k / 2) % 1;
        ctx.strokeStyle = `rgba(169, 230, 200, ${((1 - p) * (1 - p) * 0.09).toFixed(3)})`;
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.ellipse(hub.x, hub.y, Math.max(2, rx * p), Math.max(2, ry * p), 0, 0, TAU);
        ctx.stroke();
      }

      /* One orbit line the insight-stars sit on. */
      if (layout.nodes.length) {
        ctx.save();
        ctx.strokeStyle = 'rgba(169, 230, 200, 0.10)';
        ctx.lineWidth = 0.8;
        ctx.setLineDash([2, 9]);
        ctx.beginPath();
        ctx.ellipse(hub.x, hub.y, rx, ry, 0, 0.10, Math.PI - 0.10);
        ctx.stroke();
        ctx.restore();
      }

      /* Light threads, bowed so they never look like a chart. */
      layout.nodes.forEach((n, i) => {
        const dx = n.x - hub.x;
        const dy = n.y - hub.y;
        const len = Math.hypot(dx, dy) || 1;
        const bow = 12 + (i % 3) * 5;
        n.cx = (hub.x + n.x) / 2 + (dy / len) * bow;
        n.cy = (hub.y + n.y) / 2 - (dx / len) * bow;

        const active = this.solarSelected === n.entry || this.solarHovered === n.entry;
        const dim = this.solarSelected && !active ? 0.32 : 1;
        const thread = ctx.createLinearGradient(hub.x, hub.y, n.x, n.y);
        thread.addColorStop(0, `rgba(196, 246, 220, ${(active ? 0.62 : 0.30) * dim})`);
        thread.addColorStop(0.55, `rgba(196, 246, 220, ${(active ? 0.24 : 0.09) * dim})`);
        thread.addColorStop(1, tint(n.color, (active ? 0.34 : 0.06) * dim));

        ctx.strokeStyle = thread;
        ctx.lineWidth = active ? 1.3 : 0.85;
        ctx.beginPath();
        ctx.moveTo(hub.x, hub.y);
        ctx.quadraticCurveTo(n.cx, n.cy, n.x, n.y);
        ctx.stroke();
      });

      /* A pulse of light travels each thread into the star. */
      layout.nodes.forEach((n, i) => {
        if (this.solarSelected && this.solarSelected !== n.entry) return;
        const p = (t * (0.15 + (i % 3) * 0.015) + i * 0.19) % 1;
        const q = p * p * (3 - 2 * p);
        const mx = (1 - q) * (1 - q) * n.x + 2 * (1 - q) * q * n.cx + q * q * hub.x;
        const my = (1 - q) * (1 - q) * n.y + 2 * (1 - q) * q * n.cy + q * q * hub.y;
        const life = Math.sin(Math.PI * p);

        const glow = ctx.createRadialGradient(mx, my, 0, mx, my, 5.5);
        glow.addColorStop(0, tint(n.color, 0.55 * life));
        glow.addColorStop(1, tint(n.color, 0));
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(mx, my, 5.5, 0, TAU);
        ctx.fill();

        ctx.fillStyle = `rgba(255, 255, 255, ${(0.62 * life).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(mx, my, 1.1, 0, TAU);
        ctx.fill();
      });

      /* The star itself. */
      const core = layout.narrow ? 12.5 : 14.5;
      const breathe = 1 + 0.035 * Math.sin(t * 1.05);
      const glowR = (layout.narrow ? 78 : 98) * breathe;

      const glow = ctx.createRadialGradient(hub.x, hub.y, 0, hub.x, hub.y, glowR);
      glow.addColorStop(0, 'rgba(182, 245, 213, 0.55)');
      glow.addColorStop(0.34, 'rgba(128, 206, 174, 0.19)');
      glow.addColorStop(1, 'rgba(128, 206, 174, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(hub.x, hub.y, glowR, 0, TAU);
      ctx.fill();

      // A thin ring, and a moon that takes its time.
      ctx.strokeStyle = 'rgba(196, 246, 220, 0.16)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(hub.x, hub.y, core + 12, 0, TAU);
      ctx.stroke();

      ctx.save();
      ctx.translate(hub.x, hub.y);
      ctx.rotate(t * 0.14);
      const ringRx = core + 27;
      ctx.strokeStyle = 'rgba(196, 246, 220, 0.26)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.ellipse(0, 0, ringRx, ringRx * 0.34, 0, 0, TAU);
      ctx.stroke();
      const ma = t * 0.55;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
      ctx.beginPath();
      ctx.arc(Math.cos(ma) * ringRx, Math.sin(ma) * ringRx * 0.34, 1.5, 0, TAU);
      ctx.fill();
      ctx.restore();

      // Core, with a soft cross of light.
      const coreGrad = ctx.createRadialGradient(hub.x - core * 0.3, hub.y - core * 0.32, 1, hub.x, hub.y, core);
      coreGrad.addColorStop(0, '#ffffff');
      coreGrad.addColorStop(0.48, '#dff8ea');
      coreGrad.addColorStop(1, '#8fd6b4');
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(hub.x, hub.y, core, 0, TAU);
      ctx.fill();

      ctx.save();
      ctx.translate(hub.x, hub.y);
      ctx.globalCompositeOperation = 'lighter';
      const arm = core * (2.8 + 0.1 * Math.sin(t * 1.4));
      const flare = ctx.createRadialGradient(0, 0, core * 0.6, 0, 0, arm);
      flare.addColorStop(0, 'rgba(255, 255, 255, 0.32)');
      flare.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = flare;
      ctx.beginPath();
      ctx.ellipse(0, 0, arm, 1.9, 0, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(0, 0, 1.9, arm * 0.78, 0, 0, TAU);
      ctx.fill();
      ctx.restore();

      /* Insight-stars: small, quiet, and only loud when you ask. */
      layout.nodes.forEach((n, i) => {
        const selected = this.solarSelected === n.entry;
        const hovered = this.solarHovered === n.entry;
        const dimmed = !!this.solarSelected && !selected;
        const twinkle = (0.74 + 0.26 * Math.sin(t * 0.85 + i * 1.9)) * (dimmed ? 0.45 : 1);
        const r = selected || hovered ? n.r + 2.1 : n.r;
        const haloR = selected ? 38 : hovered ? 28 : dimmed ? 12 : 17;

        const halo = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, haloR);
        halo.addColorStop(0, tint(n.color, selected ? 0.52 : hovered ? 0.40 : dimmed ? 0.06 : 0.15));
        halo.addColorStop(1, tint(n.color, 0));
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(n.x, n.y, haloR, 0, TAU);
        ctx.fill();

        ctx.globalAlpha = selected || hovered ? 1 : twinkle;
        ctx.fillStyle = n.color;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
        ctx.beginPath();
        ctx.arc(n.x - r * 0.18, n.y - r * 0.22, r * 0.34, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;

        if (selected) {
          const ring = 5 + (Math.sin(t * 2.1) * 0.5 + 0.5) * 5;
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.46)';
          ctx.lineWidth = 0.9;
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r + ring, 0, TAU);
          ctx.stroke();

          ctx.textAlign = 'center';
          ctx.font = '500 10px "Instrument Sans", sans-serif';
          ctx.fillStyle = colors.label;
          ctx.fillText(n.entry.partnerAlias || 'Someone', n.x, n.y + n.r + 17);
        }
      });
    }

    _solarHitTest(evt) {
      const canvas = document.getElementById('insight-constellation-canvas');
      if (!canvas || !this._solarNodes || !this._solarNodes.length) return null;
      const rect = canvas.getBoundingClientRect();
      const W = rect.width || 1;
      const H = rect.height || 1;
      // Inverse of: screen = (world - centre) * scale + centre + offset
      const x = ((evt.clientX - rect.left) - W / 2 - this.graphTransform.offsetX) / this.graphTransform.scale + W / 2;
      const y = ((evt.clientY - rect.top) - H / 2 - this.graphTransform.offsetY) / this.graphTransform.scale + H / 2;

      let best = null;
      let bestDist = 20;
      this._solarNodes.forEach((n) => {
        const d = Math.hypot(n.x - x, n.y - y);
        if (d < bestDist) { bestDist = d; best = n; }
      });
      return best;
    }

    _showSolarSheet(entry) {
      const box = document.getElementById('constellation-node-inspector');
      if (!box) return;

      if (!entry) {
        box.classList.add('hidden');
        box.innerHTML = '';
        return;
      }

      const esc = (value) => String(value == null ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

      const spot = entry.locationSpot;
      const place = (spot && (spot.name || spot.label)) || 'Nearby';
      const when = entry.timestamp
        ? new Date(entry.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        : '';

      box.innerHTML = `
        <button type="button" class="void-sheet-close" aria-label="Close">×</button>
        <div class="void-sheet-meta">${esc(entry.partnerAlias || 'Someone')} · ${esc(place)}${when ? ' · ' + esc(when) : ''}</div>
        <h3>${esc(entry.promptText || 'A conversation that stayed with you')}</h3>
        <div class="void-pair">
          ${entry.mySharedInsight ? `<div class="void-quote"><span>You</span>${esc(entry.mySharedInsight)}</div>` : ''}
          ${entry.partnerSharedInsight ? `<div class="void-quote"><span>Them</span>${esc(entry.partnerSharedInsight)}</div>` : ''}
        </div>`;

      box.classList.remove('hidden');
      // The sheet sits under the sky, which can push it behind the dock on a phone.
      requestAnimationFrame(() => {
        const view = document.getElementById('view-reflections');
        if (!view) return;
        const overflow = box.getBoundingClientRect().bottom - (window.innerHeight - 96);
        if (overflow > 0) {
          view.scrollTo({ top: view.scrollTop + overflow + 8, behavior: 'smooth' });
        }
      });
      const close = box.querySelector('.void-sheet-close');
      if (close) {
        close.addEventListener('click', () => {
          this.solarSelected = null;
          this._showSolarSheet(null);
        });
      }
    }

    _bindInsightsChrome() {
      const canvas = document.getElementById('insight-constellation-canvas');
      const tooltip = document.getElementById('constellation-hover-tooltip');

      if (canvas && !this._solarBound) {
        this._solarBound = true;

        canvas.addEventListener('click', (evt) => {
          const hit = this._solarHitTest(evt);
          this.solarSelected = hit ? hit.entry : null;
          this._showSolarSheet(hit ? hit.entry : null);
          // A finger leaves no hover state behind.
          if (tooltip) tooltip.classList.remove('visible');
          this.solarHovered = null;
        });

        canvas.addEventListener('mousemove', (evt) => {
          const hit = this._solarHitTest(evt);
          this.solarHovered = hit ? hit.entry : null;
          canvas.style.cursor = hit ? 'pointer' : 'grab';
          if (!tooltip) return;
          if (!hit) {
            tooltip.classList.remove('visible');
            return;
          }
          const spot = hit.entry.locationSpot;
          const place = (spot && (spot.name || spot.label)) || 'Nearby';
          tooltip.textContent = `${hit.entry.partnerAlias || 'Someone'} · ${place}`;
          tooltip.style.left = `${evt.clientX + 12}px`;
          tooltip.style.top = `${evt.clientY - 34}px`;
          tooltip.classList.add('visible');
        });

        canvas.addEventListener('mouseleave', () => {
          this.solarHovered = null;
          if (tooltip) tooltip.classList.remove('visible');
        });
      }

      const menuBtn = document.getElementById('btn-insights-menu');
      const menu = document.getElementById('insights-menu');
      if (menuBtn && menu && !menuBtn.dataset.bound) {
        menuBtn.dataset.bound = 'true';
        menuBtn.addEventListener('click', (evt) => {
          evt.stopPropagation();
          const willOpen = menu.classList.contains('hidden');
          menu.classList.toggle('hidden', !willOpen);
          menuBtn.setAttribute('aria-expanded', String(willOpen));
        });
        menu.addEventListener('click', (evt) => evt.stopPropagation());
        document.addEventListener('click', () => {
          menu.classList.add('hidden');
          menuBtn.setAttribute('aria-expanded', 'false');
        });
      }

      const journalBtn = document.getElementById('btn-toggle-journal');
      const journalPanel = document.getElementById('journal-panel');
      if (journalBtn && journalPanel && !journalBtn.dataset.bound) {
        journalBtn.dataset.bound = 'true';
        journalBtn.addEventListener('click', () => {
          const willOpen = journalPanel.classList.contains('hidden');
          journalPanel.classList.toggle('hidden', !willOpen);
          journalBtn.setAttribute('aria-expanded', String(willOpen));
        });
      }

      const collectionBtn = document.getElementById('btn-toggle-collection');
      const collection = document.getElementById('activity-collection');
      if (collectionBtn && collection && !collectionBtn.dataset.bound) {
        collectionBtn.dataset.bound = 'true';
        collectionBtn.addEventListener('click', () => {
          const willOpen = collection.classList.contains('hidden');
          collection.classList.toggle('hidden', !willOpen);
          collectionBtn.classList.toggle('open', willOpen);
          collectionBtn.setAttribute('aria-expanded', String(willOpen));
        });
      }
    }

    _applyDemoVisibility() {
      const demo = !!(window.RadiaConfig && window.RadiaConfig.get('demoMode'));
      const wrap = document.getElementById('radar-demo-controls');
      if (wrap) wrap.classList.toggle('hidden', !demo);
      const sampleBtn = document.getElementById('btn-plant-sample-insight');
      if (sampleBtn) sampleBtn.classList.toggle('hidden', !demo);
      document.documentElement.classList.toggle('demo-mode', demo);
    }

    _bindKeyboardAndBackdropDismissal() {
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          ['modal-sprawl-calibrator', 'modal-quick-guide', 'modal-collision'].forEach((id) => {
            const el = document.getElementById(id);
            if (el && el.classList.contains('active')) el.classList.remove('active');
          });
          if (window.RadiaProximity && typeof window.RadiaProximity.closeEntityInspector === 'function') {
            window.RadiaProximity.closeEntityInspector();
          }
        }
      });

      ['modal-sprawl-calibrator', 'modal-quick-guide'].forEach((id) => {
        const backdrop = document.getElementById(id);
        if (backdrop) {
          backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) backdrop.classList.remove('active');
          });
        }
      });
    }

    /* ----------------------------------------------------------------------
       1. NAVIGATION DOCK & VIEW ROUTER
       ---------------------------------------------------------------------- */
    _bindNavigationDock() {
      document.querySelectorAll('.dock-item').forEach((btn) => {
        btn.addEventListener('click', () => {
          const targetViewId = btn.getAttribute('data-target');
          if (targetViewId) this.switchView(targetViewId);
        });
      });
    }

    _bindTopHUDShortcuts() {
      const levelPill = document.getElementById('hud-btn-open-climb');
      if (levelPill) {
        levelPill.addEventListener('click', () => this.switchView('view-climb'));
      }

      const sprawlPill = document.getElementById('hud-btn-open-sprawl');
      if (sprawlPill) {
        sprawlPill.addEventListener('click', () => this.openSprawlModal());
      }

      const bottomSprawlBtn = document.getElementById('btn-open-sprawl-sheet');
      if (bottomSprawlBtn) {
        bottomSprawlBtn.addEventListener('click', () => this.openSprawlModal());
      }

      const appearanceBtn = document.getElementById('btn-toggle-appearance');
      if (appearanceBtn) {
        appearanceBtn.addEventListener('click', () => this.toggleAppearance());
      }
    }

    _bindMapProviderAndCityControls() {
      const toggleBtn = document.getElementById('btn-toggle-map-layers');
      const popover = document.getElementById('map-layers-popover');

      const closePopover = () => {
        if (popover && !popover.classList.contains('hidden')) {
          popover.classList.add('hidden');
          if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
        }
      };

      if (toggleBtn && popover) {
        toggleBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const willOpen = popover.classList.contains('hidden');
          popover.classList.toggle('hidden', !willOpen);
          toggleBtn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
        });

        popover.addEventListener('click', (e) => {
          e.stopPropagation();
        });

        document.addEventListener('click', () => {
          closePopover();
        });

        document.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') closePopover();
        });
      }

      document.querySelectorAll('.map-provider-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const providerKey = btn.getAttribute('data-provider');
          if (window.RadiaProximity && providerKey) {
            window.RadiaProximity.setMapTheme(providerKey);
            const p = window.RadiaProximity.currentProvider;
            this.showToast(`World Map Layer: ${p.name}`, 'emerald');
          }
          closePopover();
        });
      });

      document.querySelectorAll('.city-jump-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const cityKey = btn.getAttribute('data-city');
          if (window.RadiaProximity && cityKey) {
            window.RadiaProximity.jumpToCity(cityKey);
          }
          closePopover();
        });
      });
    }

    _bindQuickGuideModal() {
      const openBtn = document.getElementById('btn-open-quick-guide');
      const closeBtn = document.getElementById('btn-close-quick-guide');
      const modal = document.getElementById('modal-quick-guide');
      if (openBtn && modal) {
        openBtn.addEventListener('click', () => modal.classList.add('active'));
      }
      if (closeBtn && modal) {
        closeBtn.addEventListener('click', () => modal.classList.remove('active'));
      }
    }

    switchView(viewId) {
      document.querySelectorAll('.app-view').forEach((view) => {
        view.classList.remove('active');
      });
      document.querySelectorAll('.dock-item').forEach((item) => {
        item.classList.toggle('active', item.getAttribute('data-target') === viewId);
      });

      const target = document.getElementById(viewId);
      if (target) {
        target.classList.add('active');
        this.currentView = viewId;
      }

      if (viewId === 'view-radar' && window.RadiaProximity && window.RadiaProximity.map) {
        setTimeout(() => {
          window.RadiaProximity.map.invalidateSize();
          window.RadiaProximity._handleResize();
        }, 60);
      }

      if (viewId === 'view-reflections') {
        setTimeout(() => {
          this.refreshInsightConstellationAndJournal();
        }, 40);
      }

      if (viewId === 'view-climb' && window.RadiaGamification) {
        window.RadiaGamification.evaluateAchievementsAndQuests();
      }

      if (viewId === 'view-settings') {
        this._refreshSettingsVaultDiagnostics();
      }
    }

    /* ----------------------------------------------------------------------
       2. DYNAMIC URBAN SPRAWL CALIBRATION SHEET
       ---------------------------------------------------------------------- */
    _bindSprawlCalibrationControls() {
      const modalSprawl = document.getElementById('modal-sprawl-calibrator');
      const closeBtn = document.getElementById('btn-close-sprawl-modal');

      if (closeBtn && modalSprawl) {
        closeBtn.addEventListener('click', () => modalSprawl.classList.remove('active'));
      }

      document.querySelectorAll('.sprawl-zone-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const zoneKey = btn.getAttribute('data-sprawl');
          if (window.RadiaProximity && zoneKey) {
            window.RadiaProximity.setSprawlZone(zoneKey, false);
            const z = window.RadiaProximity.currentSprawl;
            this.showToast(`Proximity Radius Calibrated: ${z.name} (${z.feet}ft)`, 'emerald');
          }
          if (modalSprawl) modalSprawl.classList.remove('active');
        });
      });

      const autoBtn = document.getElementById('btn-sprawl-auto-calibrate');
      if (autoBtn) {
        autoBtn.addEventListener('click', () => {
          if (window.RadiaProximity) {
            window.RadiaProximity.setSprawlZone('park_neighborhood', true);
            this.showToast('Auto-Density Calibration Enabled (40ft Park Standard)', 'emerald');
          }
          if (modalSprawl) modalSprawl.classList.remove('active');
        });
      }
    }

    openSprawlModal() {
      const modal = document.getElementById('modal-sprawl-calibrator');
      if (modal) modal.classList.add('active');
    }

    /* ----------------------------------------------------------------------
       3. SETTINGS, PROFILE & VAULT PREFERENCES
       ---------------------------------------------------------------------- */
    _bindSettingsAndProfile() {
      const nameInput = document.getElementById('input-first-name');
      const handleInput = document.getElementById('input-contact-handle');
      const pulseToggle = document.getElementById('toggle-pocket-pulse');
      const timerButtons = document.querySelectorAll('.timer-pref-btn');
      const themeButtons = document.querySelectorAll('.theme-select-btn');
      const appearanceButtons = document.querySelectorAll('.appearance-mode-btn');
      const unblockBtn = document.getElementById('btn-unblock-all-peers');
      const wipeVaultBtn = document.getElementById('btn-wipe-vault');

      if (window.RadiaPeerSync) {
        const prof = window.RadiaPeerSync.getProfile();
        if (nameInput && prof.firstName) nameInput.value = prof.firstName;
        if (handleInput && prof.contactHandle) handleInput.value = prof.contactHandle;

        timerButtons.forEach((b) => {
          const active = parseInt(b.getAttribute('data-time'), 10) === prof.preferredTimer;
          b.classList.toggle('btn-emerald', active);
          b.classList.toggle('btn-glass', !active);
        });
      }

      if (nameInput) {
        nameInput.addEventListener('change', (e) => {
          const val = e.target.value.trim() || 'Alex';
          if (window.RadiaPeerSync) window.RadiaPeerSync.updateProfile({ firstName: val });
          this.showToast(`Profile updated: ${val}`, 'emerald');
        });
      }

      if (handleInput) {
        handleInput.addEventListener('change', (e) => {
          const val = e.target.value.trim();
          if (window.RadiaPeerSync) window.RadiaPeerSync.updateProfile({ contactHandle: val });
          this.showToast('Double-blind contact handle saved', 'emerald');
        });
      }

      if (pulseToggle) {
        pulseToggle.addEventListener('change', (e) => {
          if (window.RadiaAudio) window.RadiaAudio.hapticsEnabled = e.target.checked;
        });
      }

      timerButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
          timerButtons.forEach((b) => {
            b.classList.remove('btn-emerald');
            b.classList.add('btn-glass');
          });
          btn.classList.add('btn-emerald');
          btn.classList.remove('btn-glass');

          const chosenTime = parseInt(btn.getAttribute('data-time'), 10);
          if (window.RadiaPeerSync) {
            window.RadiaPeerSync.updateProfile({ preferredTimer: chosenTime });
          }
          this.showToast(`Comfort Timer set to ${chosenTime > 0 ? chosenTime / 60 + ' Minutes' : 'Open Dialogue'}`, 'emerald');
        });
      });

      themeButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
          const provider = btn.getAttribute('data-provider') || btn.getAttribute('data-theme');
          if (window.RadiaProximity && provider) {
            window.RadiaProximity.setMapTheme(provider);
            this.showToast(`Default Map Style updated`, 'emerald');
          }
        });
      });

      appearanceButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
          const mode = btn.getAttribute('data-appearance');
          if (mode) this.setAppearance(mode, true);
        });
      });

      if (unblockBtn) {
        unblockBtn.addEventListener('click', () => {
          if (window.RadiaProximity) window.RadiaProximity.unblockAllPeers();
          this._refreshSettingsVaultDiagnostics();
          this.showToast('Blocked list cleared & nearby members restored', 'emerald');
        });
      }

      if (wipeVaultBtn) {
        wipeVaultBtn.addEventListener('click', async () => {
          if (window.RadiaStorage) {
            await window.RadiaStorage.purgeVault();
            localStorage.removeItem('radia_starter_constellation_seeded_v2');
            await window.RadiaStorage.ensureStarterInsights();
            await this.refreshInsightConstellationAndJournal();
            this._refreshSettingsVaultDiagnostics();
            this.showToast('Vault reset to starter insight network', 'amber');
          }
        });
      }
    }

    async _refreshSettingsVaultDiagnostics() {
      const encStatusEl = document.getElementById('settings-vault-status');
      const credEl = document.getElementById('settings-credibility-weight');
      const blockedCountEl = document.getElementById('settings-blocked-count');

      if (window.RadiaStorage) {
        const stats = await window.RadiaStorage.getStats();
        const cred = await window.RadiaStorage.getRaterCredibility();
        if (encStatusEl) {
          encStatusEl.textContent = `${stats.totalReflections} Nodes • AES-256-GCM`;
        }
        if (credEl) {
          credEl.textContent = `${cred.weight.toFixed(2)}x Weight`;
        }
      }
      if (blockedCountEl && window.RadiaProximity) {
        const b = window.RadiaProximity.getBlockedPeers();
        blockedCountEl.textContent = `${b.length} Blocked`;
      }
    }

    /* ----------------------------------------------------------------------
       4. AUDIO CONTROLS
       ---------------------------------------------------------------------- */
    _bindAudioControls() {
      const audioBtn = document.getElementById('btn-audio-toggle');
      if (!audioBtn) return;

      audioBtn.addEventListener('click', () => {
        if (!window.RadiaAudio) return;
        const isMuted = window.RadiaAudio.toggleMute();
        audioBtn.innerHTML = isMuted
          ? '<i data-lucide="volume-x" class="w-4 h-4 text-slate-400"></i>'
          : '<i data-lucide="volume-2" class="w-4 h-4 text-teal-600"></i>';
        if (window.lucide) window.lucide.createIcons();
        this.showToast(isMuted ? 'Audio Chimes Muted' : 'Audio Chimes Enabled', 'emerald');
      });
    }

    /* ----------------------------------------------------------------------
       5. COLLISION MODAL (MUTUAL ENCOUNTER PING)
       ---------------------------------------------------------------------- */
    _bindCollisionModalEvents() {
      const modalCollision = document.getElementById('modal-collision');
      const peerNameEl = document.getElementById('peer-collision-name');
      const peerBioEl = document.getElementById('peer-collision-bio');
      const timerLabelEl = document.getElementById('peer-collision-synced-timer');
      const radiusBadgeEl = document.getElementById('collision-radius-badge-text');
      const acceptBtn = document.getElementById('btn-accept-collision');
      const declineBtn = document.getElementById('btn-decline-collision');

      window.addEventListener('RADIA_SYNC_COLLISION_PING', (e) => {
        const {
          firstName,
          bioTag,
          syncedTimerSeconds,
          distanceFeet,
          sprawlZoneLabel,
          hotspotName
        } = e.detail;

        this.currentPartnerAlias = firstName || 'Jordan';
        this.currentHotspotName = hotspotName || 'Central Fountain Plaza';
        this.currentSprawlLabel = sprawlZoneLabel || 'Neighborhood Park (40ft)';

        if (peerNameEl) peerNameEl.textContent = this.currentPartnerAlias;
        if (peerBioEl) peerBioEl.textContent = bioTag || `Walking near ${this.currentHotspotName}`;
        if (radiusBadgeEl) {
          radiusBadgeEl.textContent = `${distanceFeet || 24}ft Away • ${this.currentSprawlLabel}`;
        }
        if (timerLabelEl) {
          timerLabelEl.innerHTML = `
            <i data-lucide="timer" class="w-3.5 h-3.5"></i>
            <span>Synced Comfort Limit: ${syncedTimerSeconds > 0 ? Math.floor(syncedTimerSeconds / 60) + ' Minutes' : 'Open Dialogue'}</span>
          `;
          if (window.lucide) window.lucide.createIcons();
        }

        if (modalCollision) modalCollision.classList.add('active');
        if (window.RadiaAudio) window.RadiaAudio.playCollisionPing();
      });

      if (acceptBtn) {
        acceptBtn.addEventListener('click', () => {
          if (modalCollision) modalCollision.classList.remove('active');
          if (window.RadiaPeerSync) window.RadiaPeerSync.acceptCollision();
        });
      }

      if (declineBtn) {
        declineBtn.addEventListener('click', () => {
          if (modalCollision) modalCollision.classList.remove('active');
          if (window.RadiaPeerSync) window.RadiaPeerSync.declineCollision();
        });
      }
    }

    /* ----------------------------------------------------------------------
       6. LIVE CATALYST CONVERSATION VIEW
       ---------------------------------------------------------------------- */
    _bindCatalystSessionEvents() {
      const modalCatalyst = document.getElementById('modal-catalyst');
      const promptTextEl = document.getElementById('catalyst-prompt-text');
      const followUpEl = document.getElementById('catalyst-followup-text');
      const categoryPillEl = document.getElementById('catalyst-category-pill');
      const partnerLabelEl = document.getElementById('catalyst-partner-label');
      const countdownTextEl = document.getElementById('catalyst-countdown-text');
      const shuffleBtn = document.getElementById('btn-shuffle-catalyst');
      const concludeBtn = document.getElementById('btn-conclude-conversation');

      const updatePromptUI = (prompt) => {
        if (!prompt) return;
        this.currentPrompt = prompt;
        if (promptTextEl) promptTextEl.textContent = `"${prompt.text || prompt.promptText}"`;
        if (followUpEl) {
          followUpEl.textContent = prompt.followUp
            ? `Follow-up: "${prompt.followUp}"`
            : 'Take turns sharing your perspective without judgment.';
        }
        if (categoryPillEl) categoryPillEl.textContent = prompt.categoryLabel || prompt.category;
      };

      window.addEventListener('RADIA_CONVERSATION_STARTED', (e) => {
        const { durationSeconds, prompt, partnerProfile, hotspotName } = e.detail;
        if (partnerProfile && partnerProfile.firstName) {
          this.currentPartnerAlias = partnerProfile.firstName;
        }
        if (hotspotName) this.currentHotspotName = hotspotName;
        if (partnerLabelEl) {
          partnerLabelEl.textContent = `With ${this.currentPartnerAlias} • ${this.currentHotspotName}`;
        }

        updatePromptUI(prompt);
        if (modalCatalyst) modalCatalyst.classList.add('active');
        this.startSessionTimer(durationSeconds, countdownTextEl);
      });

      window.addEventListener('RADIA_PROMPT_CHANGED', (e) => {
        updatePromptUI(e.detail.prompt);
      });

      if (shuffleBtn) {
        shuffleBtn.addEventListener('click', () => {
          if (window.RadiaPeerSync) {
            window.RadiaPeerSync.nextSynchronizedPrompt();
            if (window.RadiaAudio) window.RadiaAudio.playTimerTick();
          }
        });
      }

      if (concludeBtn) {
        concludeBtn.addEventListener('click', () => this.endSession());
      }

      window.addEventListener('RADIA_PARTNER_WALKED_AWAY', () => this.endSession());
    }

    startSessionTimer(durationSec, displayEl) {
      if (this.timerInterval) clearInterval(this.timerInterval);
      this.sessionTimeRemaining = durationSec || 180;

      const render = () => {
        if (this.sessionTimeRemaining <= 0) {
          if (displayEl) displayEl.textContent = '00:00';
          if (window.RadiaAudio) window.RadiaAudio.playTimerComplete();
          clearInterval(this.timerInterval);
          return;
        }
        const mins = Math.floor(this.sessionTimeRemaining / 60);
        const secs = this.sessionTimeRemaining % 60;
        if (displayEl) {
          displayEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        }
        if (this.sessionTimeRemaining <= 10 && window.RadiaAudio) {
          window.RadiaAudio.playTimerTick();
        }
        this.sessionTimeRemaining--;
      };

      if (durationSec > 0) {
        render();
        this.timerInterval = setInterval(render, 1000);
      } else if (displayEl) {
        displayEl.textContent = 'Open';
      }
    }

    endSession() {
      if (this.timerInterval) clearInterval(this.timerInterval);
      const modalCatalyst = document.getElementById('modal-catalyst');
      if (modalCatalyst) modalCatalyst.classList.remove('active');

      if (window.RadiaPeerSync) {
        window.RadiaPeerSync.concludeConversation();
      }
      if (window.RadiaGamification) {
        window.RadiaGamification.recordConversationCompleted(this.currentPartnerAlias);
      }

      this.openPostEncounterModal();
    }

    /* ----------------------------------------------------------------------
       7. POST-ENCOUNTER FLOW: MUTUAL INSIGHT EXCHANGE, 3-TIER SAFETY & CONNECT
       ---------------------------------------------------------------------- */
    _bindPostEncounterFlow() {
      const modalPost = document.getElementById('modal-post-encounter');
      const ratingBtns = document.querySelectorAll('.feedback-rating-btn');
      const connectBtn = document.getElementById('btn-toggle-mutual-connect');
      const saveFinishBtn = document.getElementById('btn-save-reflection-finish');
      const insightInput = document.getElementById('textarea-shared-insight');
      const vaultTextarea = document.getElementById('textarea-reflection-entry');

      ratingBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
          ratingBtns.forEach((b) => b.classList.remove('selected'));
          btn.classList.add('selected');
          this.selectedSafetyRating = parseInt(btn.getAttribute('data-rating'), 10);
        });
      });

      if (connectBtn) {
        connectBtn.addEventListener('click', () => {
          const currentState = connectBtn.getAttribute('data-state') === 'true';
          const newState = !currentState;
          this.isMutualConnected = newState;
          connectBtn.setAttribute('data-state', String(newState));

          if (newState) {
            connectBtn.classList.add('btn-emerald');
            connectBtn.classList.remove('btn-glass');
            connectBtn.textContent = 'Connected ✓';
          } else {
            connectBtn.classList.remove('btn-emerald');
            connectBtn.classList.add('btn-glass');
            connectBtn.textContent = 'Opt In to Share';
          }

          if (window.RadiaPeerSync) {
            window.RadiaPeerSync.submitConnectIntent(newState);
          }
        });
      }

      window.addEventListener('RADIA_CONTACT_REVEALED', (e) => {
        const { partnerHandle } = e.detail;
        const revealBox = document.getElementById('mutual-contact-reveal-box');
        const link = document.getElementById('mutual-contact-link');
        if (revealBox && link) {
          revealBox.classList.remove('hidden');
          link.textContent = partnerHandle || `@${this.currentPartnerAlias.toLowerCase()}.radia`;
          link.href = partnerHandle && partnerHandle.startsWith('http') ? partnerHandle : '#';
        }
      });

      if (saveFinishBtn) {
        saveFinishBtn.addEventListener('click', async () => {
          const sharedInsightText = (insightInput && insightInput.value.trim()) ||
            `Reflecting with ${this.currentPartnerAlias} shifted how I view our shared neighborhood space.`;
          const privateNotes = (vaultTextarea && vaultTextarea.value.trim()) || sharedInsightText;

          let partnerReciprocal = '';
          if (window.RadiaPeerSync) {
            const res = window.RadiaPeerSync.submitMutualInsight(sharedInsightText);
            partnerReciprocal = res.partnerInsight;
          }

          if (window.RadiaStorage) {
            await window.RadiaStorage.saveEncounterFeedback({
              peerAlias: this.currentPartnerAlias,
              rating: this.selectedSafetyRating
            });

            const savedEntry = await window.RadiaStorage.saveReflection({
              promptId: this.currentPrompt ? this.currentPrompt.id : 'o-01',
              promptText: this.currentPrompt
                ? (this.currentPrompt.text || this.currentPrompt.promptText)
                : "Look around us right now. What won't exist in 50 years?",
              category: this.currentPrompt ? this.currentPrompt.category : 'Observational & Physical Context',
              mySharedInsight: sharedInsightText,
              partnerSharedInsight: partnerReciprocal,
              notes: privateNotes,
              partnerAlias: this.currentPartnerAlias,
              mutualConnect: this.isMutualConnected
            });

            this.selectedNodeEntry = savedEntry;
            this.selectedAiPillar = null;
          }

          if (insightInput) insightInput.value = '';
          if (vaultTextarea) vaultTextarea.value = '';
          if (modalPost) modalPost.classList.remove('active');

          this.switchView('view-reflections');
          this.showToast(`Mutual Insight linked with ${this.currentPartnerAlias}`, 'emerald');
        });
      }
    }

    openPostEncounterModal() {
      const modalPost = document.getElementById('modal-post-encounter');
      const revealBox = document.getElementById('mutual-contact-reveal-box');
      const connectBtn = document.getElementById('btn-toggle-mutual-connect');
      const partnerNameSpans = document.querySelectorAll('.post-partner-name');
      const partnerInsightPreview = document.getElementById('post-partner-insight-preview');
      const chipsContainer = document.getElementById('post-subprompt-chips');
      const insightInput = document.getElementById('textarea-shared-insight');

      this.selectedSafetyRating = 1;
      this.isMutualConnected = false;

      document.querySelectorAll('.feedback-rating-btn').forEach((b) => {
        b.classList.toggle('selected', b.getAttribute('data-rating') === '1');
      });

      partnerNameSpans.forEach((el) => {
        el.textContent = this.currentPartnerAlias;
      });

      const activeSession = window.RadiaPeerSync ? window.RadiaPeerSync.getActiveSession() : null;
      const pInsight = (activeSession && activeSession.partnerSharedInsight) ||
        (window.RadiaPrompts
          ? window.RadiaPrompts.getPartnerInsightForPrompt(this.currentPrompt, this.currentPartnerAlias)
          : 'Talking through this prompt face-to-face reminded me how grounding real human presence is.');

      if (partnerInsightPreview) {
        partnerInsightPreview.textContent = `"${pInsight}"`;
      }

      if (chipsContainer && window.RadiaPrompts) {
        const chips = window.RadiaPrompts.getReflectionPrompts(Date.now(), 4);
        chipsContainer.innerHTML = chips.map((c) => `
          <button type="button" class="subprompt-chip" data-chip="${c}">+ ${c}</button>
        `).join('');

        chipsContainer.querySelectorAll('.subprompt-chip').forEach((btn) => {
          btn.addEventListener('click', () => {
            btn.classList.toggle('active');
            const phrase = btn.getAttribute('data-chip');
            if (insightInput) {
              const cur = insightInput.value.trim();
              insightInput.value = cur
                ? `${cur} This conversation ${phrase}.`
                : `Talking with ${this.currentPartnerAlias} ${phrase}.`;
            }
          });
        });
      }

      if (revealBox) revealBox.classList.add('hidden');
      if (connectBtn) {
        connectBtn.setAttribute('data-state', 'false');
        connectBtn.className = 'btn-glass px-3.5 py-1.5 rounded-xl text-xs font-bold text-teal-700';
        connectBtn.textContent = 'Opt In to Share';
      }

      if (modalPost) modalPost.classList.add('active');
    }

    /* ----------------------------------------------------------------------
       8. INTERACTIVE INSIGHT NETWORK GRAPH & AI REFLECTION SYNTHESIS
       ---------------------------------------------------------------------- */
    _bindConstellationAndJournalEvents() {
      const exportBtn = document.getElementById('btn-export-reflections');
      if (exportBtn) {
        exportBtn.addEventListener('click', async () => {
          if (window.RadiaStorage) {
            await window.RadiaStorage.downloadExport('markdown');
            this.showToast('Exported Insight Network & AI Synthesis (.md)', 'emerald');
          }
        });
      }

      const exportJsonBtn = document.getElementById('btn-export-reflections-json');
      if (exportJsonBtn) {
        exportJsonBtn.addEventListener('click', async () => {
          if (window.RadiaStorage) {
            await window.RadiaStorage.downloadExport('json');
            this.showToast('Exported Insight Network Dataset (.json)', 'emerald');
          }
        });
      }

      const expandBtn = document.getElementById('btn-expand-constellation');
      if (expandBtn) {
        expandBtn.addEventListener('click', () => {
          const stage = document.querySelector('.constellation-stage');
          if (stage) {
            stage.classList.toggle('stage-expanded');
            this._drawConstellationCanvas(performance.now());
          }
        });
      }

      // Graph Zoom & Reset Controls
      const zoomInBtn = document.getElementById('btn-graph-zoom-in');
      const zoomOutBtn = document.getElementById('btn-graph-zoom-out');
      const zoomResetBtn = document.getElementById('btn-graph-zoom-reset');

      if (zoomInBtn) {
        zoomInBtn.addEventListener('click', () => {
          this.graphTransform.scale = Math.min(2.2, Number((this.graphTransform.scale + 0.2).toFixed(2)));
          this._drawConstellationCanvas(performance.now());
        });
      }
      if (zoomOutBtn) {
        zoomOutBtn.addEventListener('click', () => {
          this.graphTransform.scale = Math.max(0.65, Number((this.graphTransform.scale - 0.2).toFixed(2)));
          this._drawConstellationCanvas(performance.now());
        });
      }
      if (zoomResetBtn) {
        zoomResetBtn.addEventListener('click', () => {
          this.graphTransform = { scale: 1, offsetX: 0, offsetY: 0 };
          this._drawConstellationCanvas(performance.now());
        });
      }

      // Journal Search & Category Filter Controls
      const searchInput = document.getElementById('input-search-insights');
      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          this.journalSearchQuery = (e.target.value || '').trim().toLowerCase();
          this._renderJournalList(this._cachedEntries || []);
          this._drawConstellationCanvas(performance.now());
        });
      }

      document.querySelectorAll('.journal-filter-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.journalFilter = btn.getAttribute('data-filter') || 'all';
          document.querySelectorAll('.journal-filter-btn').forEach((b) => {
            const on = b.getAttribute('data-filter') === this.journalFilter;
            b.classList.toggle('btn-emerald', on);
            b.classList.toggle('btn-glass', !on);
          });
          this._renderJournalList(this._cachedEntries || []);
          this._drawConstellationCanvas(performance.now());
        });
      });

      const plantSampleBtn = document.getElementById('btn-plant-sample-insight');
      if (plantSampleBtn) {
        plantSampleBtn.addEventListener('click', async () => {
          if (!window.RadiaStorage) return;
          const newEntry = await window.RadiaStorage.plantSampleInsight();
          this.selectedNodeEntry = newEntry;
          this.selectedAiPillar = null;
          await this.refreshInsightConstellationAndJournal();
          if (window.RadiaGamification) {
            await window.RadiaGamification.evaluateAchievementsAndQuests();
          }
          const spatial = await window.RadiaStorage.getSpatialCorrelations();
          this.showToast(
            `Added Mutual Insight with ${newEntry.partnerAlias} (${spatial.maxSameMileCount}/10 in Same Mile)`,
            'emerald'
          );
        });
      }

      document.querySelectorAll('.constellation-mode-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.graphMode = btn.getAttribute('data-graph-mode') || 'tree';
          this.graphTransform = { scale: 1, offsetX: 0, offsetY: 0 };
          document.querySelectorAll('.constellation-mode-btn').forEach((b) => {
            const on = b.getAttribute('data-graph-mode') === this.graphMode;
            b.classList.toggle('btn-emerald', on);
            b.classList.toggle('btn-glass', !on);
          });
          this._drawConstellationCanvas(performance.now());
        });
      });

      const canvas = document.getElementById('insight-constellation-canvas');
      const tooltip = document.getElementById('constellation-hover-tooltip');
      if (canvas) {
        const toGraphCoords = (clientX, clientY) => {
          const rect = canvas.getBoundingClientRect();
          const rawX = clientX - rect.left;
          const rawY = clientY - rect.top;
          const cx = rect.width / 2;
          const cy = rect.height / 2;
          const gx = (rawX - cx - this.graphTransform.offsetX) / this.graphTransform.scale + cx;
          const gy = (rawY - cy - this.graphTransform.offsetY) / this.graphTransform.scale + cy;
          return { rawX, rawY, gx, gy };
        };

        const findHitNode = (gx, gy) => {
          let hitNode = null;
          let minD = 30 / this.graphTransform.scale;
          this.constellationNodes.forEach((node) => {
            const d = Math.hypot(node.x - gx, node.y - gy);
            if (d < minD) {
              minD = d;
              hitNode = node;
            }
          });
          return hitNode;
        };

        canvas.addEventListener('wheel', (ev) => {
          ev.preventDefault();
          const delta = ev.deltaY < 0 ? 0.12 : -0.12;
          this.graphTransform.scale = Math.max(0.65, Math.min(2.2, Number((this.graphTransform.scale + delta).toFixed(2))));
          this._drawConstellationCanvas(performance.now());
        }, { passive: false });

        canvas.addEventListener('pointerdown', (ev) => {
          const { gx, gy } = toGraphCoords(ev.clientX, ev.clientY);
          const hitNode = findHitNode(gx, gy);

          if (hitNode) {
            if (window.RadiaAudio) window.RadiaAudio.playTimerTick();
            if (hitNode.aiPillar) {
              this.selectedAiPillar = hitNode.aiPillar;
              this._renderAiPillarInspector(hitNode.aiPillar);
            } else if (hitNode.entry) {
              this.selectedAiPillar = null;
              this.selectedNodeEntry = hitNode.entry;
              this._renderSelectedNodeInspector(hitNode.entry);
            }
            this._drawConstellationCanvas(performance.now());
          } else {
            this.isDraggingGraph = true;
            this.graphDragStart = {
              x: ev.clientX - this.graphTransform.offsetX,
              y: ev.clientY - this.graphTransform.offsetY
            };
          }
        });

        canvas.addEventListener('pointermove', (ev) => {
          if (this.isDraggingGraph) {
            this.graphTransform.offsetX = Math.max(-180, Math.min(180, ev.clientX - this.graphDragStart.x));
            this.graphTransform.offsetY = Math.max(-150, Math.min(150, ev.clientY - this.graphDragStart.y));
            this._drawConstellationCanvas(performance.now());
            return;
          }

          if (!tooltip) return;
          const { rawX, rawY, gx, gy } = toGraphCoords(ev.clientX, ev.clientY);
          const hit = findHitNode(gx, gy);
          if (hit) {
            tooltip.style.left = `${rawX}px`;
            tooltip.style.top = `${rawY}px`;
            if (hit.aiPillar) {
              tooltip.innerHTML = `<strong class="text-teal-300 block">${hit.aiPillar.label}</strong><span>${hit.aiPillar.sub} • Click to inspect</span>`;
            } else if (hit.entry) {
              const spot = (hit.entry.locationSpot && hit.entry.locationSpot.name) || 'Neighborhood Hub';
              tooltip.innerHTML = `<strong class="text-teal-300 block">With ${hit.entry.partnerAlias} • ${spot}</strong><span>"${hit.entry.mySharedInsight.slice(0, 68)}..."</span>`;
            }
            tooltip.classList.add('tooltip-visible');
          } else {
            tooltip.classList.remove('tooltip-visible');
          }
        });

        window.addEventListener('pointerup', () => {
          this.isDraggingGraph = false;
        });

        canvas.addEventListener('pointerleave', () => {
          if (tooltip) tooltip.classList.remove('tooltip-visible');
        });
      }
    }

    _startConstellationAnimationLoop() {
      const loop = (ts) => {
        this.canvasAnimId = requestAnimationFrame(loop);
        if (this.currentView !== 'view-reflections') return;
        if (ts - this.lastCanvasTs < 40) return;
        this.lastCanvasTs = ts;
        this._drawConstellationCanvas(ts);
      };
      this.canvasAnimId = requestAnimationFrame(loop);
    }

    async refreshInsightConstellationAndJournal() {
      if (!window.RadiaStorage) return;

      const entries = await window.RadiaStorage.getReflections({ limit: 100 });
      const spatial = await window.RadiaStorage.getSpatialCorrelations();
      const metaSynthesis = await window.RadiaStorage.generateMetaInsightSynthesis();

      if (!this.selectedNodeEntry && entries.length > 0) {
        this.selectedNodeEntry = entries[0];
      }

      const dockBadge = document.getElementById('dock-insight-badge');
      if (dockBadge) {
        dockBadge.textContent = String(entries.length);
        // A zero badge is noise: only surface the count once there is something.
        dockBadge.classList.toggle('hidden', entries.length === 0);
      }

      // With no real insights there is nothing to synthesise, so show the empty
      // state instead of a graph full of invented pillars.
      const emptyInsights = document.getElementById('insight-empty-state');
      if (emptyInsights) emptyInsights.classList.toggle('hidden', entries.length > 0);
      // The sky itself stays: three reason-stars with nothing beneath them is
      // an honest picture of an empty graph, not invented content.
      document.getElementById('view-reflections')?.classList.toggle('sky-empty', entries.length === 0);
      const metaCard = document.getElementById('ai-meta-insight-container');
      if (metaCard) metaCard.classList.toggle('hidden', entries.length === 0);

      const mileCount = document.getElementById('insight-same-mile-count');
      if (mileCount) mileCount.textContent = String(spatial.maxSameMileCount || 0);
      const voidCount = document.getElementById('void-count');
      if (voidCount) {
        voidCount.textContent = entries.length === 1 ? '1 star' : `${entries.length} stars`;
      }

      this._cachedEntries = entries;
      this._cachedMeta = metaSynthesis;
      this._cachedSpatial = spatial;
      this._drawConstellationCanvas(performance.now());

      if (this.selectedAiPillar) {
        this._renderAiPillarInspector(this.selectedAiPillar);
      } else if (this.selectedNodeEntry) {
        this._renderSelectedNodeInspector(this.selectedNodeEntry);
      }

      this._renderMetaInsightCard(metaSynthesis, spatial);
      this._renderJournalList(entries);

      if (window.lucide) window.lucide.createIcons();
    }

    _drawConstellationCanvas(ts = 0) {
      const canvas = document.getElementById('insight-constellation-canvas');
      if (!canvas) return;

      const parent = canvas.parentElement;
      const rect = parent ? parent.getBoundingClientRect() : { width: 380, height: 420 };
      const W = Math.max(320, rect.width || 400);
      const H = Math.max(380, rect.height || 420);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      if (canvas.width !== Math.floor(W * dpr) || canvas.height !== Math.floor(H * dpr)) {
        canvas.width = Math.floor(W * dpr);
        canvas.height = Math.floor(H * dpr);
        canvas.style.width = `${W}px`;
        canvas.style.height = `${H}px`;
      }

      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      // Apply interactive pan & zoom transform around center
      const cx = W / 2;
      const cy = H / 2;
      ctx.translate(cx + this.graphTransform.offsetX, cy + this.graphTransform.offsetY);
      ctx.scale(this.graphTransform.scale, this.graphTransform.scale);
      ctx.translate(-cx, -cy);

      const isDark = document.documentElement.classList.contains('theme-dark');
      // One palette for the graph, matching DESIGN.md: pine, ember, slate-sky.
      const textPrimary = isDark ? '#edefe9' : '#111a17';
      const textMuted = isDark ? '#8d9a91' : '#6c7a73';
      const accentTeal = isDark ? '#7fc3a8' : '#0b4f3f';
      const accentAmber = isDark ? '#e8996d' : '#c2552a';
      const accentViolet = isDark ? '#9db8c2' : '#3c6e86';
      const accentSky = isDark ? '#9db8c2' : '#3c6e86';

      const entries = (this._cachedEntries || []).slice(0, 12);
      const meta = this._cachedMeta || {};
      const spatial = this._cachedSpatial || { maxSameMileCount: entries.length };
      this.constellationNodes = [];

      // Default view: the void. Three reason-stars, quiet orbiting insights.
      if (this.graphMode !== 'spatial' && this.graphMode !== 'constellation') {
        this._drawSolarGraph(ctx, W, H, entries);
        return;
      }

      if (this.graphMode === 'spatial') {
        this._drawSpatialSameMileMode(ctx, W, H, entries, spatial, isDark, textPrimary, accentTeal, accentAmber);
        return;
      }

      if (this.graphMode === 'tree') {
        // ====================================================================
        // MODE A: INSIGHT GROWTH TREE (Location Hubs -> Mutual Dyads -> AI Synthesis)
        // ====================================================================
        const rootY = H - 38;
        const coreY = 82;

        // 1. Same-Mile Spatial Correlation Base Arc
        ctx.save();
        ctx.strokeStyle = isDark ? 'rgba(251, 191, 36, 0.35)' : 'rgba(217, 119, 6, 0.35)';
        ctx.lineWidth = 1.8;
        ctx.setLineDash([4, 5]);
        ctx.beginPath();
        ctx.ellipse(cx, rootY, Math.min(W * 0.38, 175), 16, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = textMuted;
        ctx.font = '700 9.5px "Instrument Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`SAME 1-MILE NEIGHBORHOOD CLUSTER (${spatial.maxSameMileCount}/10 IN MILE)`, cx, rootY + 25);

        // 2. Central Synthesis Trunk & 3 Pillar Branches
        const trunkGrad = ctx.createLinearGradient(cx, rootY, cx, coreY);
        trunkGrad.addColorStop(0, accentTeal);
        trunkGrad.addColorStop(1, accentAmber);

        ctx.strokeStyle = trunkGrad;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx, rootY);
        ctx.quadraticCurveTo(cx - 4, H * 0.56, cx, coreY);
        ctx.stroke();

        const leftCrown = { x: Math.max(78, cx - Math.min(138, W * 0.31)), y: 66 };
        const rightCrown = { x: Math.min(W - 78, cx + Math.min(138, W * 0.31)), y: 66 };
        const topCrown = { x: cx, y: 46 };

        [
          { target: leftCrown, color: accentTeal },
          { target: rightCrown, color: accentSky },
          { target: topCrown, color: accentAmber }
        ].forEach((b) => {
          ctx.strokeStyle = b.color;
          ctx.globalAlpha = 0.65;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(cx, coreY + 22);
          ctx.quadraticCurveTo((cx + b.target.x) / 2, coreY, b.target.x, b.target.y);
          ctx.stroke();
        });
        ctx.globalAlpha = 1;
        ctx.restore();

        // 3. Mutual Insight Dyads (Your Insight + Partner's Reciprocal Insight)
        entries.forEach((entry, idx) => {
          const isVuln = entry.category.includes('Vulnerability');
          const isObs = entry.category.includes('Observational');
          const myColor = isVuln ? accentTeal : isObs ? accentAmber : accentSky;
          const partnerColor = accentViolet;

          const col = idx % 3;
          const row = Math.floor(idx / 3);
          const spanX = Math.min(W * 0.33, 145);
          const baseColX = col === 0 ? cx - spanX : col === 1 ? cx : cx + spanX;
          const jitterX = ((idx * 29) % 30) - 15;

          const myX = Math.max(46, Math.min(W - 56, baseColX + jitterX));
          const myY = Math.max(138, H - 96 - row * 64 - (idx % 2) * 18);
          const partX = Math.max(34, Math.min(W - 34, myX + (idx % 2 === 0 ? 28 : -28)));
          const partY = myY - 14;

          const targetCrown = isVuln ? leftCrown : isObs ? topCrown : rightCrown;

          // Edge from Node to AI Pillar
          ctx.save();
          ctx.strokeStyle = isDark ? 'rgba(45, 212, 191, 0.28)' : 'rgba(13, 148, 136, 0.25)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(myX, myY);
          ctx.quadraticCurveTo(cx, (myY + targetCrown.y) / 2, targetCrown.x, targetCrown.y);
          ctx.stroke();

          // Subtle Signal Pulse Along Edge
          const flowT = ((ts / 2600 + idx * 0.19) % 1);
          const inv = 1 - flowT;
          const moteX = inv * inv * myX + 2 * inv * flowT * cx + flowT * flowT * targetCrown.x;
          const moteY = inv * inv * myY + 2 * inv * flowT * ((myY + targetCrown.y) / 2) + flowT * flowT * targetCrown.y;
          ctx.fillStyle = accentAmber;
          ctx.beginPath();
          ctx.arc(moteX, moteY, 2.2, 0, Math.PI * 2);
          ctx.fill();

          // Dyad Connector (Your Insight <-> Partner Insight)
          ctx.strokeStyle = isDark ? 'rgba(167, 139, 250, 0.7)' : 'rgba(124, 58, 237, 0.55)';
          ctx.lineWidth = 1.6;
          ctx.setLineDash([2, 3]);
          ctx.beginPath();
          ctx.moveTo(myX, myY);
          ctx.lineTo(partX, partY);
          ctx.stroke();
          ctx.restore();

          // Partner Insight Node
          ctx.fillStyle = partnerColor;
          ctx.beginPath();
          ctx.arc(partX, partY, 5.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.4;
          ctx.stroke();

          // Your Insight Node
          const isSelected = !this.selectedAiPillar && this.selectedNodeEntry && this.selectedNodeEntry.id === entry.id;
          if (isSelected) {
            ctx.strokeStyle = accentAmber;
            ctx.lineWidth = 2.4;
            ctx.beginPath();
            ctx.arc(myX, myY, 13.5, 0, Math.PI * 2);
            ctx.stroke();
          }

          ctx.fillStyle = myColor;
          ctx.beginPath();
          ctx.arc(myX, myY, 7.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.8;
          ctx.stroke();

          const spotShort = entry.locationSpot ? entry.locationSpot.name.split(' ')[0] : 'Park';
          ctx.fillStyle = textPrimary;
          ctx.font = `${isSelected ? '800' : '600'} 9.5px "Instrument Sans", sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText(`${entry.partnerAlias} • ${spotShort}`, myX, myY + 19);

          this.constellationNodes.push({ x: myX, y: myY, entry });
          this.constellationNodes.push({ x: partX, y: partY, entry });
        });

        // 4. 3 AI Synthesis Pillar Nodes
        const aiNodes = [
          {
            id: 'changed',
            x: leftCrown.x,
            y: leftCrown.y,
            label: 'HOW YOU CHANGED',
            sub: 'Personal Shift',
            color: accentTeal,
            summary: meta.evolutionSummary
          },
          {
            id: 'learned',
            x: topCrown.x,
            y: topCrown.y,
            label: 'AI SYNTHESIS CORE',
            sub: 'What You Learned',
            color: accentAmber,
            summary: meta.learnedSummary,
            isMain: true
          },
          {
            id: 'ripple',
            x: rightCrown.x,
            y: rightCrown.y,
            label: 'EFFECT ON OTHERS',
            sub: 'Community Impact',
            color: accentSky,
            summary: meta.rippleSummary
          }
        ];

        aiNodes.forEach((an) => {
          const r = an.isMain ? 11 : 8.5;
          ctx.fillStyle = `${an.color}22`;
          ctx.beginPath();
          ctx.arc(an.x, an.y, r + 8, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = an.color;
          ctx.beginPath();
          ctx.arc(an.x, an.y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.stroke();

          ctx.fillStyle = textPrimary;
          ctx.font = '800 9.5px "Instrument Sans", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(an.label, an.x, an.y - (r + 8));

          this.constellationNodes.push({ x: an.x, y: an.y, aiPillar: an });
        });
      } else {
        // ====================================================================
        // MODE B: RADIAL NETWORK GRAPH
        // ====================================================================
        const cy = H / 2;

        entries.forEach((entry, idx) => {
          const angle = (idx * ((Math.PI * 2) / Math.max(4, entries.length))) - Math.PI / 2;
          const radius = Math.min(W, H) * 0.31 + (idx % 2) * 22;
          const myX = cx + Math.cos(angle) * radius;
          const myY = cy + Math.sin(angle) * (radius * 0.82);
          const partX = myX + Math.cos(angle + 0.42) * 25;
          const partY = myY + Math.sin(angle + 0.42) * 25;

          ctx.save();
          ctx.strokeStyle = isDark ? 'rgba(45, 212, 191, 0.3)' : 'rgba(13, 148, 136, 0.28)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(myX, myY);
          ctx.lineTo(cx, cy);
          ctx.stroke();

          ctx.strokeStyle = isDark ? 'rgba(167, 139, 250, 0.65)' : 'rgba(124, 58, 237, 0.55)';
          ctx.setLineDash([2, 3]);
          ctx.beginPath();
          ctx.moveTo(myX, myY);
          ctx.lineTo(partX, partY);
          ctx.stroke();
          ctx.restore();

          ctx.fillStyle = accentViolet;
          ctx.beginPath();
          ctx.arc(partX, partY, 5.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.4;
          ctx.stroke();

          const isSelected = !this.selectedAiPillar && this.selectedNodeEntry && this.selectedNodeEntry.id === entry.id;
          if (isSelected) {
            ctx.strokeStyle = accentAmber;
            ctx.lineWidth = 2.4;
            ctx.beginPath();
            ctx.arc(myX, myY, 13.5, 0, Math.PI * 2);
            ctx.stroke();
          }

          ctx.fillStyle = accentTeal;
          ctx.beginPath();
          ctx.arc(myX, myY, 7, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.6;
          ctx.stroke();

          const spotShort = entry.locationSpot ? entry.locationSpot.name.split(' ')[0] : 'Park';
          ctx.fillStyle = textPrimary;
          ctx.font = '700 9.5px "Instrument Sans", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`${entry.partnerAlias} • ${spotShort}`, myX, myY + 18);

          this.constellationNodes.push({ x: myX, y: myY, entry });
          this.constellationNodes.push({ x: partX, y: partY, entry });
        });

        // Central AI Synthesis Hub
        ctx.fillStyle = `${accentAmber}24`;
        ctx.beginPath();
        ctx.arc(cx, cy, 24, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = accentAmber;
        ctx.beginPath();
        ctx.arc(cx, cy, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = textPrimary;
        ctx.font = '800 10px "Instrument Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('AI SYNTHESIS CORE', cx, cy - 17);

        this.constellationNodes.push({
          x: cx,
          y: cy,
          aiPillar: {
            id: 'learned',
            label: 'AI SYNTHESIS CORE',
            sub: 'Complete Network Synthesis',
            color: accentAmber,
            summary: `${meta.evolutionSummary || ''} ${meta.rippleSummary || ''}`
          }
        });
      }
    }

    _drawSpatialSameMileMode(ctx, W, H, entries, spatial, isDark, textPrimary, accentTeal, accentAmber) {
      const cx = W / 2;
      const cy = H / 2 + 8;
      const mileR = Math.min(W, H) * 0.37;

      ctx.save();
      ctx.strokeStyle = isDark ? 'rgba(251, 191, 36, 0.5)' : 'rgba(217, 119, 6, 0.45)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.arc(cx, cy, mileR, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = isDark ? 'rgba(45, 212, 191, 0.25)' : 'rgba(13, 148, 136, 0.25)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(cx, cy, mileR * 0.55, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = textPrimary;
      ctx.font = '800 10.5px "Instrument Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`1.0-MILE SPATIAL CORRELATION MAP (${spatial.maxSameMileCount} / 10 IN SAME MILE)`, cx, 28);

      const pts = entries.map((entry, idx) => {
        const angle = idx * 1.15;
        const r = 28 + ((idx * 27) % Math.max(40, mileR - 36));
        return {
          x: cx + Math.cos(angle) * r,
          y: cy + Math.sin(angle) * r,
          entry
        };
      });

      ctx.save();
      ctx.strokeStyle = isDark ? 'rgba(45, 212, 191, 0.28)' : 'rgba(13, 148, 136, 0.22)';
      ctx.lineWidth = 1.2;
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          ctx.beginPath();
          ctx.moveTo(pts[i].x, pts[i].y);
          ctx.lineTo(pts[j].x, pts[j].y);
          ctx.stroke();
        }
      }
      ctx.restore();

      pts.forEach((p) => {
        const spotName = p.entry.locationSpot ? p.entry.locationSpot.name.split(' ')[0] : 'Park';
        ctx.fillStyle = accentTeal;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 7.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.8;
        ctx.stroke();

        ctx.fillStyle = textPrimary;
        ctx.font = '700 9.5px "Instrument Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${spotName} (${p.entry.partnerAlias})`, p.x, p.y + 18);

        this.constellationNodes.push({ x: p.x, y: p.y, entry: p.entry });
      });
    }

    _renderAiPillarInspector(pillar) {
      const box = document.getElementById('constellation-node-inspector');
      if (!box || !pillar) return;

      box.innerHTML = `
        <div class="flex items-center justify-between gap-2 pb-2 border-b border-slate-200">
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full" style="background:${pillar.color}"></span>
            <span class="text-xs font-extrabold text-amber-700 uppercase tracking-wider">${pillar.label}</span>
          </div>
          <span class="text-[11px] font-bold text-teal-700">${pillar.sub}</span>
        </div>
        <p class="text-xs text-slate-800 leading-relaxed mt-2.5">${pillar.summary}</p>
      `;
    }

    _renderSelectedNodeInspector(entry) {
      const box = document.getElementById('constellation-node-inspector');
      if (!box || !entry) return;

      const spotName = (entry.locationSpot && entry.locationSpot.name) || 'Central Fountain Plaza';
      const sprawlZone = (entry.locationSpot && entry.locationSpot.sprawlZone) || 'Neighborhood Park (40ft)';

      box.innerHTML = `
        <div class="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200">
          <div class="flex items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-full bg-teal-600"></span>
            <span class="text-xs font-extrabold text-teal-700 uppercase tracking-wider">${entry.category}</span>
          </div>
          <div class="flex items-center gap-1.5 text-[11px] font-semibold text-amber-700">
            <i data-lucide="map-pin" class="w-3.5 h-3.5"></i>
            <span>${spotName} • ${sprawlZone}</span>
          </div>
        </div>

        <p class="text-sm font-serif-catalyst italic text-slate-900 mt-2.5">
          "${entry.promptText}"
        </p>

        <div class="mutual-insight-pair mt-3">
          <div class="insight-bubble-mine">
            <span class="text-[10px] font-extrabold uppercase tracking-wider text-teal-700 block mb-1">
              Your Shared Insight
            </span>
            <p class="text-xs text-slate-800 leading-relaxed">${entry.mySharedInsight}</p>
          </div>
          <div class="insight-bubble-partner">
            <span class="text-[10px] font-extrabold uppercase tracking-wider text-violet-700 block mb-1">
              ${entry.partnerAlias}'s Reciprocal Insight
            </span>
            <p class="text-xs text-slate-800 leading-relaxed">${entry.partnerSharedInsight}</p>
          </div>
        </div>
      `;

      if (window.lucide) window.lucide.createIcons();
    }

    _renderMetaInsightCard(meta, spatial) {
      const container = document.getElementById('ai-meta-insight-container');
      if (!container || !meta) return;

      const keywordChips = Array.isArray(meta.topKeywords)
        ? meta.topKeywords.map((kw) => `<span class="px-2.5 py-0.5 rounded-full bg-teal-500/10 border border-teal-500/25 text-[10.5px] font-semibold text-teal-700">#${kw}</span>`).join('')
        : '';

      container.innerHTML = `
        <div class="meta-insight-card p-4 space-y-3.5">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-2.5">
              <div class="w-9 h-9 rounded-xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-700">
                <i data-lucide="sparkles" class="w-5 h-5"></i>
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <span class="text-[10px] font-extrabold uppercase tracking-wider text-teal-700">AI Reflection Synthesis</span>
                  <span class="px-2 py-0.2 rounded-full bg-amber-500/15 text-amber-700 text-[10px] font-mono-code font-bold">Openness Index: ${meta.opennessScore || 92}%</span>
                </div>
                <h3 class="text-sm font-extrabold text-slate-900">${meta.headline}</h3>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <span class="px-2.5 py-1 rounded-full bg-teal-500/10 border border-teal-500/30 text-[10px] font-mono-code font-bold text-teal-700">
                ${meta.spatialSummary}
              </span>
              <button id="btn-resynthesize-ai-tree" type="button" class="btn-glass px-2.5 py-1 rounded-xl text-[10.5px] font-bold text-teal-700">
                Refresh Synthesis
              </button>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-1">
            <div class="p-3.5 rounded-2xl bg-slate-100/85 border border-slate-200 space-y-1">
              <span class="text-[10px] font-extrabold uppercase text-teal-700 block">1. What Has Changed About You</span>
              <p class="text-xs text-slate-700 leading-relaxed">${meta.evolutionSummary}</p>
            </div>
            <div class="p-3.5 rounded-2xl bg-slate-100/85 border border-slate-200 space-y-1">
              <span class="text-[10px] font-extrabold uppercase text-amber-700 block">2. What You Have Learned</span>
              <p class="text-xs text-slate-700 leading-relaxed">${meta.learnedSummary}</p>
            </div>
            <div class="p-3.5 rounded-2xl bg-slate-100/85 border border-slate-200 space-y-1">
              <span class="text-[10px] font-extrabold uppercase text-sky-700 block">3. Effect on People Around You</span>
              <p class="text-xs text-slate-700 leading-relaxed">${meta.rippleSummary}</p>
            </div>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200">
            <div class="flex flex-wrap items-center gap-1.5">
              <span class="text-[10px] font-bold uppercase text-slate-500 mr-1">Recurring Themes:</span>
              ${keywordChips}
            </div>
            <span class="text-[11px] font-semibold text-slate-600">
              Recommended Next Catalyst: <strong class="text-teal-700">${meta.recommendedCategory || 'Curiosity & Perspectives'}</strong>
            </span>
          </div>
        </div>
      `;

      const resynthBtn = container.querySelector('#btn-resynthesize-ai-tree');
      if (resynthBtn) {
        resynthBtn.addEventListener('click', async () => {
          if (window.RadiaAudio) window.RadiaAudio.playSpotHarvest();
          this.showToast('AI Reflection Synthesis updated from all mutual insight nodes', 'emerald');
          await this.refreshInsightConstellationAndJournal();
        });
      }
    }

    _filterEntries(entries) {
      return (entries || []).filter((entry) => {
        if (this.journalFilter === 'mutual' && !entry.mutualConnect) return false;
        if (this.journalFilter === 'vuln' && !entry.category.includes('Vulnerability')) return false;
        if (this.journalFilter === 'obs' && !entry.category.includes('Observational')) return false;
        if (this.journalFilter === 'cur' && !entry.category.includes('Curiosity')) return false;

        if (this.journalSearchQuery) {
          const hay = `${entry.partnerAlias} ${entry.promptText} ${entry.mySharedInsight} ${entry.partnerSharedInsight} ${entry.notes} ${(entry.locationSpot && entry.locationSpot.name) || ''}`.toLowerCase();
          if (!hay.includes(this.journalSearchQuery)) return false;
        }
        return true;
      });
    }

    _renderJournalList(entries) {
      const container = document.getElementById('reflections-list');
      if (!container) return;

      const filtered = this._filterEntries(entries);
      const countEl = document.getElementById('journal-filtered-count');
      if (countEl) {
        countEl.textContent = `${filtered.length} of ${entries.length} Insights`;
      }

      if (filtered.length === 0) {
        container.innerHTML = `
          <div class="glass-panel p-6 rounded-2xl text-center space-y-2 border border-slate-200">
            <p class="text-xs font-bold text-slate-700">No insights match your current filter.</p>
            <p class="text-[11px] text-slate-500">Try clearing the search query or selecting "All Insights".</p>
          </div>
        `;
        return;
      }

      container.innerHTML = filtered.map((entry) => {
        const spotName = (entry.locationSpot && entry.locationSpot.name) || 'Neighborhood Walk';
        return `
          <div class="glass-panel p-4 rounded-2xl space-y-2.5 border border-slate-200 hover:border-teal-500/40 transition-colors cursor-pointer journal-entry-card" data-entry-id="${entry.id}">
            <div class="flex items-center justify-between text-[11px] text-slate-500">
              <span class="font-bold text-teal-700 uppercase tracking-wider">${entry.category}</span>
              <span class="text-amber-700 font-semibold">${spotName} • ${new Date(entry.timestamp).toLocaleDateString()}</span>
            </div>
            <p class="text-xs font-serif-catalyst italic text-slate-900">"${entry.promptText}"</p>
            <div class="mutual-insight-pair">
              <div class="insight-bubble-mine">
                <span class="text-[9.5px] font-bold uppercase text-teal-700 block">Your Insight</span>
                <p class="text-[11.5px] text-slate-700 mt-0.5">${entry.mySharedInsight}</p>
              </div>
              <div class="insight-bubble-partner">
                <span class="text-[9.5px] font-bold uppercase text-violet-700 block">${entry.partnerAlias}'s Insight</span>
                <p class="text-[11.5px] text-slate-700 mt-0.5">${entry.partnerSharedInsight}</p>
              </div>
            </div>
            <div class="flex items-center justify-between text-[10px] text-slate-500 pt-1">
              <span>Encrypted Vault Note: "${entry.notes}"</span>
              <span class="text-teal-700 font-mono-code font-bold">+${entry.xpEarned} XP</span>
            </div>
          </div>
        `;
      }).join('');

      container.querySelectorAll('.journal-entry-card').forEach((card) => {
        card.addEventListener('click', () => {
          const id = card.getAttribute('data-entry-id');
          const found = entries.find((e) => e.id === id);
          if (found) {
            this.selectedAiPillar = null;
            this.selectedNodeEntry = found;
            this._renderSelectedNodeInspector(found);
            this._drawConstellationCanvas(performance.now());
          }
        });
      });
    }

    /* ----------------------------------------------------------------------
       9. GLOBAL TOAST NOTIFICATION SYSTEM
       ---------------------------------------------------------------------- */
    _bindGlobalAchievementToasts() {
      window.addEventListener('RADIA_ACHIEVEMENT_UNLOCKED', (e) => {
        const ach = e.detail && e.detail.achievement;
        if (ach) {
          this.showToast(`Milestone Unlocked: ${ach.title} (+${ach.xpReward} XP)`, 'amber');
        }
      });

      window.addEventListener('RADIA_LEVEL_UP', (e) => {
        const { newLevel, rankTitle } = e.detail;
        this.showToast(`Tier Up: Tier ${newLevel} • ${rankTitle}`, 'emerald');
      });
    }

    showToast(message, tone = 'emerald') {
      const toast = document.getElementById('radia-global-toast');
      const textEl = document.getElementById('radia-global-toast-text');
      if (!toast || !textEl) return;

      textEl.textContent = message;
      toast.className = `glass-pill px-4 py-2 rounded-full flex items-center gap-2 text-xs font-bold shadow-lg ${
        tone === 'amber'
          ? 'text-amber-700 border-amber-500/40'
          : 'text-teal-700 border-teal-500/40'
      } toast-active`;

      if (this.toastTimeout) clearTimeout(this.toastTimeout);
      this.toastTimeout = setTimeout(() => {
        toast.classList.remove('toast-active');
      }, 3200);
    }
  }

  const app = new RadiaAppController();
  window.RadiaApp = app;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => app.init());
  } else {
    app.init();
  }
})();
