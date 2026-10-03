/**
 * ============================================================================
 * RADIA — MASTER APPLICATION CONTROLLER (js/app.js)
 * ----------------------------------------------------------------------------
 *  • Orchestrates state across UI Views, Audio, Proximity, PeerSync, and Storage.
 *  • Binds modals, live catalyst countdown timers, double-blind reveals, and
 *    Zero-Knowledge journaling.
 * ============================================================================
 */

(function () {
  'use strict';

  class RadiaAppController {
    constructor() {
      this.currentView = 'view-radar';
      this.timerInterval = null;
      this.sessionTimeRemaining = 0;
      this.currentPartnerAlias = 'Anonymous Walker';
      this.currentPrompt = null;
    }

    init() {
      this._bindNavigationDock();
      this._bindSettingsAndProfile();
      this._bindAudioControls();
      this._bindCollisionModalEvents();
      this._bindCatalystSessionEvents();
      this._bindPostEncounterFlow();
      this._bindJournalEvents();

      console.log('[Radia App] Master Controller Initialized.');
    }

    /* ----------------------------------------------------------------------
       1. NAVIGATION DOCK (Tab Router)
       ---------------------------------------------------------------------- */
    _bindNavigationDock() {
      const dockButtons = document.querySelectorAll('.dock-item');
      dockButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
          const targetViewId = btn.getAttribute('data-target');
          this.switchView(targetViewId);
        });
      });
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

      // Re-render journals if opening Journal tab
      if (viewId === 'view-reflections') {
        this.renderJournalEntries();
      }
    }

    /* ----------------------------------------------------------------------
       2. SETTINGS & PROFILE BINDINGS
       ---------------------------------------------------------------------- */
    _bindSettingsAndProfile() {
      const nameInput = document.getElementById('input-first-name');
      const handleInput = document.getElementById('input-contact-handle');
      const pulseToggle = document.getElementById('toggle-pocket-pulse');
      const timerButtons = document.querySelectorAll('.timer-pref-btn');

      if (nameInput) {
        nameInput.addEventListener('change', (e) => {
          if (window.RadiaPeerSync) {
            window.RadiaPeerSync.updateProfile({ firstName: e.target.value.trim() || 'Wanderer' });
          }
        });
      }

      if (handleInput) {
        handleInput.addEventListener('change', (e) => {
          if (window.RadiaPeerSync) {
            window.RadiaPeerSync.updateProfile({ contactHandle: e.target.value.trim() });
          }
        });
      }

      if (pulseToggle) {
        pulseToggle.addEventListener('change', (e) => {
          if (window.RadiaAudio) {
            window.RadiaAudio.hapticsEnabled = e.target.checked;
          }
        });
      }

      timerButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
          timerButtons.forEach(b => {
            b.classList.remove('text-emerald-400', 'border-emerald-500/40');
            b.classList.add('text-slate-400');
          });
          btn.classList.add('text-emerald-400', 'border-emerald-500/40');
          btn.classList.remove('text-slate-400');

          const chosenTime = parseInt(btn.getAttribute('data-time'), 10);
          if (window.RadiaPeerSync) {
            window.RadiaPeerSync.updateProfile({ preferredTimer: chosenTime });
          }
        });
      });
    }

    /* ----------------------------------------------------------------------
       3. AUDIO CONTROLS
       ---------------------------------------------------------------------- */
    _bindAudioControls() {
      const audioBtn = document.getElementById('btn-audio-toggle');
      if (!audioBtn) return;

      audioBtn.addEventListener('click', () => {
        if (!window.RadiaAudio) return;
        const isMuted = window.RadiaAudio.toggleMute();
        audioBtn.innerHTML = isMuted
          ? '<i data-lucide="volume-x" class="w-4 h-4 text-slate-500"></i>'
          : '<i data-lucide="volume-2" class="w-4 h-4 text-slate-300"></i>';
        if (window.lucide) window.lucide.createIcons();
      });
    }

    /* ----------------------------------------------------------------------
       4. COLLISION MODAL EVENT BUS & CONTROLS
       ---------------------------------------------------------------------- */
    _bindCollisionModalEvents() {
      const modalCollision = document.getElementById('modal-collision');
      const peerNameEl = document.getElementById('peer-collision-name');
      const timerLabelEl = document.getElementById('peer-collision-synced-timer');
      const acceptBtn = document.getElementById('btn-accept-collision');
      const declineBtn = document.getElementById('btn-decline-collision');

      // Hook peer-sync discovery event
      window.addEventListener('RADIA_SYNC_COLLISION_PING', (e) => {
        const { firstName, syncedTimerSeconds } = e.detail;
        this.currentPartnerAlias = firstName || 'Nearby Stranger';

        if (peerNameEl) peerNameEl.textContent = this.currentPartnerAlias;
        if (timerLabelEl) {
          timerLabelEl.innerHTML = `
            <i data-lucide="timer" class="w-3.5 h-3.5"></i>
            <span>Synced Limit: ${syncedTimerSeconds > 0 ? Math.floor(syncedTimerSeconds / 60) + ' Mins' : 'Open Dialogue'}</span>
          `;
          if (window.lucide) window.lucide.createIcons();
        }

        modalCollision.classList.add('active');
        if (window.RadiaAudio) window.RadiaAudio.playCollisionPing();
      });

      if (acceptBtn) {
        acceptBtn.addEventListener('click', () => {
          modalCollision.classList.remove('active');
          if (window.RadiaPeerSync) window.RadiaPeerSync.acceptCollision();
        });
      }

      if (declineBtn) {
        declineBtn.addEventListener('click', () => {
          modalCollision.classList.remove('active');
          if (window.RadiaPeerSync) window.RadiaPeerSync.declineCollision();
        });
      }
    }

    /* ----------------------------------------------------------------------
       5. LIVE CATALYST SESSION & SYNCHRONIZED COUNTDOWN
       ---------------------------------------------------------------------- */
    _bindCatalystSessionEvents() {
      const modalCatalyst = document.getElementById('modal-catalyst');
      const promptTextEl = document.getElementById('catalyst-prompt-text');
      const categoryPillEl = document.getElementById('catalyst-category-pill');
      const countdownTextEl = document.getElementById('catalyst-countdown-text');
      const concludeBtn = document.getElementById('btn-conclude-conversation');

      window.addEventListener('RADIA_CONVERSATION_STARTED', (e) => {
        const { durationSeconds, prompt } = e.detail;
        this.currentPrompt = prompt;

        if (promptTextEl) promptTextEl.textContent = `"${prompt.text || prompt.promptText}"`;
        if (categoryPillEl) categoryPillEl.textContent = prompt.categoryLabel || prompt.category;

        modalCatalyst.classList.add('active');
        this.startSessionTimer(durationSeconds, countdownTextEl);
      });

      if (concludeBtn) {
        concludeBtn.addEventListener('click', () => {
          this.endSession();
        });
      }

      window.addEventListener('RADIA_PARTNER_WALKED_AWAY', () => {
        this.endSession();
      });
    }

    startSessionTimer(durationSec, displayEl) {
      if (this.timerInterval) clearInterval(this.timerInterval);
      this.sessionTimeRemaining = durationSec || 180;

      const render = () => {
        if (this.sessionTimeRemaining <= 0) {
          if (displayEl) displayEl.textContent = '00:00';
          if (window.RadiaAudio) window.RadiaAudio.playTimerComplete();
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

      render();
      if (durationSec > 0) {
        this.timerInterval = setInterval(render, 1000);
      } else if (displayEl) {
        displayEl.textContent = 'Open';
      }
    }

    endSession() {
      if (this.timerInterval) clearInterval(this.timerInterval);
      document.getElementById('modal-catalyst').classList.remove('active');

      if (window.RadiaPeerSync) {
        window.RadiaPeerSync.concludeConversation();
      }
      if (window.RadiaGamification) {
        window.RadiaGamification.recordConversationCompleted(this.currentPartnerAlias);
      }

      this.openPostEncounterModal();
    }

    /* ----------------------------------------------------------------------
       6. POST-ENCOUNTER FLOW (3-Tier Safety, Double-Blind, Journal Box)
       ---------------------------------------------------------------------- */
    _bindPostEncounterFlow() {
      const modalPost = document.getElementById('modal-post-encounter');
      const ratingBtns = document.querySelectorAll('.feedback-rating-btn');
      const connectBtn = document.getElementById('btn-toggle-mutual-connect');
      const saveFinishBtn = document.getElementById('btn-save-reflection-finish');
      const textarea = document.getElementById('textarea-reflection-entry');

      let selectedRating = 0;

      ratingBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
          ratingBtns.forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          selectedRating = parseInt(btn.getAttribute('data-rating'), 10);
        });
      });

      if (connectBtn) {
        connectBtn.addEventListener('click', () => {
          const currentState = connectBtn.getAttribute('data-state') === 'true';
          const newState = !currentState;
          connectBtn.setAttribute('data-state', String(newState));

          if (newState) {
            connectBtn.classList.add('btn-emerald');
            connectBtn.classList.remove('btn-glass');
            connectBtn.textContent = 'Requested ✓';
          } else {
            connectBtn.classList.remove('btn-emerald');
            connectBtn.classList.add('btn-glass');
            connectBtn.textContent = 'Connect';
          }

          if (window.RadiaPeerSync) {
            window.RadiaPeerSync.submitConnectIntent(newState);
          }
        });
      }

      // Handle mutual match reveal
      window.addEventListener('RADIA_CONTACT_REVEALED', (e) => {
        const { partnerHandle } = e.detail;
        const revealBox = document.getElementById('mutual-contact-reveal-box');
        const link = document.getElementById('mutual-contact-link');

        if (revealBox && link) {
          revealBox.classList.remove('hidden');
          link.textContent = partnerHandle || 'Shared Number';
          link.href = partnerHandle.startsWith('http') ? partnerHandle : `tel:${partnerHandle}`;
        }
      });

      if (saveFinishBtn) {
        saveFinishBtn.addEventListener('click', async () => {
          const notes = textarea ? textarea.value.trim() : '';

          // 1. Save local private feedback
          if (window.RadiaStorage) {
            await window.RadiaStorage.saveEncounterFeedback({
              peerAlias: this.currentPartnerAlias,
              rating: selectedRating
            });

            // 2. Save zero-knowledge reflection
            if (notes.length > 0 && this.currentPrompt) {
              await window.RadiaStorage.saveReflection({
                promptText: this.currentPrompt.text || this.currentPrompt.promptText,
                category: this.currentPrompt.category,
                notes: notes,
                partnerAlias: this.currentPartnerAlias
              });
            }
          }

          if (textarea) textarea.value = '';
          modalPost.classList.remove('active');
          this.switchView('view-radar');
        });
      }
    }

    openPostEncounterModal() {
      const modalPost = document.getElementById('modal-post-encounter');
      const revealBox = document.getElementById('mutual-contact-reveal-box');
      const connectBtn = document.getElementById('btn-toggle-mutual-connect');

      if (revealBox) revealBox.classList.add('hidden');
      if (connectBtn) {
        connectBtn.setAttribute('data-state', 'false');
        connectBtn.className = 'btn-glass px-3.5 py-1.5 rounded-xl text-xs font-bold text-slate-400';
        connectBtn.textContent = 'Connect';
      }

      modalPost.classList.add('active');
    }

    /* ----------------------------------------------------------------------
       7. JOURNAL & EXPORT BINDINGS
       ---------------------------------------------------------------------- */
    _bindJournalEvents() {
      const exportBtn = document.getElementById('btn-export-reflections');
      if (exportBtn) {
        exportBtn.addEventListener('click', async () => {
          if (window.RadiaStorage) {
            await window.RadiaStorage.downloadExport('markdown');
          }
        });
      }
    }

    async renderJournalEntries() {
      const container = document.getElementById('reflections-list');
      if (!container || !window.RadiaStorage) return;

      const entries = await window.RadiaStorage.getReflections();
      if (entries.length === 0) {
        container.innerHTML = `
          <div class="glass-panel p-4 rounded-2xl border border-white/5 text-center py-12">
            <i data-lucide="book-open" class="w-8 h-8 mx-auto mb-2 text-slate-500"></i>
            <p class="text-sm text-slate-400">No reflections recorded yet.</p>
            <p class="text-xs text-slate-500 mt-1">Conclude conversations and fill your journal boxes to climb ranks.</p>
          </div>
        `;
      } else {
        container.innerHTML = entries.map((entry) => `
          <div class="glass-panel p-4 rounded-2xl space-y-2 border border-white/5">
            <div class="flex items-center justify-between text-[11px] text-slate-400">
              <span class="font-bold text-emerald-400 uppercase tracking-wider">${entry.category}</span>
              <span>${new Date(entry.timestamp).toLocaleDateString()}</span>
            </div>
            <p class="text-xs font-serif italic text-slate-200">"${entry.promptText}"</p>
            <p class="text-xs text-slate-300 leading-relaxed bg-slate-900/40 p-2.5 rounded-xl border border-white/5">${entry.notes}</p>
            <div class="flex items-center justify-between text-[10px] text-slate-500 pt-1">
              <span>With: ${entry.partnerAlias}</span>
              <span class="text-emerald-400 font-bold">+${entry.xpEarned} XP</span>
            </div>
          </div>
        `).join('');
      }

      if (window.lucide) window.lucide.createIcons();
    }
  }

  const app = new RadiaAppController();
  window.RadiaApp = app;

  document.addEventListener('DOMContentLoaded', () => {
    app.init();
  });
})();