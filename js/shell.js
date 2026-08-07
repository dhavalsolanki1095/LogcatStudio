/**
 * Logcat Studio V2 — Shell enhancements for the professional UI.
 * Does not replace the processing engine (LSApp / LSUI / LSParser / …).
 * Namespace: LogcatStudioV2
 */
const LogcatStudioV2 = (() => {
  'use strict';

  const STORAGE_PREFIX = 'logcatStudioV2.';

  const state = {
    statusMode: 'ready'
  };

  function $(id) {
    return document.getElementById(id);
  }

  function storageGet(key, fallback) {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + key);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch (_) {
      return fallback;
    }
  }

  function storageSet(key, value) {
    try {
      localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
      return true;
    } catch (_) {
      return false;
    }
  }

  function closeMenus() {
    document.querySelectorAll('.rv2-menu').forEach((m) => {
      m.classList.remove('open');
      const trigger = m.querySelector('.rv2-menu-trigger');
      const panel = m.querySelector('.rv2-menu-panel');
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
      if (panel) panel.hidden = true;
    });
  }

  function setupMenus() {
    document.querySelectorAll('.rv2-menu').forEach((menu) => {
      const trigger = menu.querySelector('.rv2-menu-trigger');
      const panel = menu.querySelector('.rv2-menu-panel');
      if (!trigger || !panel) return;

      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const willOpen = panel.hidden;
        closeMenus();
        if (willOpen) {
          panel.hidden = false;
          menu.classList.add('open');
          trigger.setAttribute('aria-expanded', 'true');
        }
      });
    });

    document.addEventListener('click', () => closeMenus());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeMenus();
    });

    document.querySelectorAll('[data-rv2-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.getAttribute('data-rv2-action');
        closeMenus();
        runAction(action);
      });
    });
  }

  function clickId(id) {
    const el = $(id);
    if (el) el.click();
  }

  function runAction(action) {
    switch (action) {
      case 'new':
        clickId('btn-clear');
        focusInput();
        break;
      case 'open':
        clickId('btn-open');
        break;
      case 'paste':
        clickId('btn-paste');
        break;
      case 'clear':
        clickId('btn-clear');
        break;
      case 'history':
        clickId('btn-history');
        break;
      case 'process':
        clickId('btn-process');
        break;
      case 'beautify':
        clickId('btn-beautify');
        break;
      case 'minify':
        clickId('btn-minify');
        break;
      case 'repair':
        clickId('btn-repair');
        break;
      case 'copy-formatted':
        clickId('btn-copy-formatted');
        break;
      case 'download-json':
        clickId('btn-download-json');
        break;
      case 'download-txt':
        clickId('btn-download-txt');
        break;
      case 'find': {
        const si = $('search-input');
        si?.focus();
        si?.select();
        break;
      }
      case 'select-all': {
        const ta = $('input-editor');
        if (ta) {
          ta.focus();
          ta.select();
        }
        break;
      }
      case 'tab-raw':
      case 'tab-tree':
      case 'tab-api':
      case 'tab-issues':
      case 'tab-compare': {
        const name = action.replace('tab-', '');
        const tab = document.querySelector(`.output-tab[data-tab="${name}"]`);
        if (tab) tab.click();
        break;
      }
      case 'theme':
        clickId('btn-theme-toggle');
        break;
      case 'fullscreen':
        toggleFullscreen();
        break;
      case 'receipt':
        clickId('btn-receipt-preview');
        break;
      default:
        break;
    }
  }

  function focusInput() {
    $('input-editor')?.focus();
  }

  function setupInputActions() {
    const ta = $('input-editor');

    // Observe programmatic value changes for type badge
    if (ta) {
      const desc = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
      if (desc && desc.set) {
        Object.defineProperty(ta, 'value', {
          get() {
            return desc.get.call(this);
          },
          set(v) {
            desc.set.call(this, v);
            updateTypeBadge();
          },
          configurable: true
        });
      }
    }

    $('rv2-btn-paste-pane')?.addEventListener('click', () => clickId('btn-paste'));
    $('rv2-btn-new')?.addEventListener('click', () => {
      clickId('btn-clear');
      focusInput();
    });
  }

  function normalizeType(raw) {
    const t = String(raw || '').toLowerCase();
    if (!t || t === '—' || t === 'empty') return 'empty';
    if (t.includes('log')) return 'logcat';
    if (t.includes('json')) return 'json';
    return 'unknown';
  }

  function updateTypeBadge() {
    const typeEl = $('status-type');
    const badge = $('rv2-type-badge');
    if (!badge) return;
    const type = normalizeType(typeEl ? typeEl.textContent : '');
    const labels = {
      empty: 'Unknown',
      unknown: 'Unknown',
      logcat: 'Logcat',
      json: 'JSON'
    };
    badge.dataset.type = type;
    badge.textContent = labels[type] || 'Unknown';
  }

  function setStatus(mode, label) {
    state.statusMode = mode;
    const dot = $('rv2-status-dot');
    const text = $('rv2-status-label');
    if (dot) dot.dataset.state = mode;
    if (text) text.textContent = label || (
      mode === 'processing' ? 'Processing…' :
      mode === 'error' ? 'Processing failed' :
      mode === 'success' ? 'Processed successfully' :
      'Ready'
    );
  }

  function syncBusyStatus() {
    const busy = $('busy-overlay');
    const isBusy =
      document.body.classList.contains('ls-busy') ||
      (busy && !busy.hidden);
    if (isBusy) {
      setStatus('processing', 'Processing…');
      return;
    }
    if (state.statusMode === 'processing') {
      setStatus('success', 'Processed successfully');
      setTimeout(() => {
        if (state.statusMode === 'success') setStatus('ready', 'Ready');
      }, 2200);
    }
  }

  function setupStatusObserver() {
    const busy = $('busy-overlay');
    if (busy) {
      const mo = new MutationObserver(syncBusyStatus);
      mo.observe(busy, { attributes: true, attributeFilter: ['hidden', 'class'] });
    }
    const moBody = new MutationObserver(syncBusyStatus);
    moBody.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    // Watch status-type for badge sync
    const typeEl = $('status-type');
    if (typeEl) {
      const mo2 = new MutationObserver(() => updateTypeBadge());
      mo2.observe(typeEl, { childList: true, characterData: true, subtree: true });
    }

    // Sync receipt menu item with receipt button visibility
    const receiptBtn = $('btn-receipt-preview');
    const menuReceipt = $('rv2-menu-receipt');
    if (receiptBtn && menuReceipt) {
      const mo3 = new MutationObserver(() => {
        menuReceipt.hidden = !!receiptBtn.hidden;
      });
      mo3.observe(receiptBtn, { attributes: true, attributeFilter: ['hidden'] });
      menuReceipt.hidden = !!receiptBtn.hidden;
    }
  }

  function setupCompareEmpty() {
    const left = $('compare-left');
    const right = $('compare-right');
    const empty = $('rv2-compare-empty');
    if (!left || !right || !empty) return;

    function sync() {
      const hasAny = !!(left.value.trim() || right.value.trim());
      empty.hidden = hasAny;
    }

    left.addEventListener('input', sync);
    right.addEventListener('input', sync);
    $('rv2-compare-use-left')?.addEventListener('click', () => {
      clickId('btn-compare-use-current');
      sync();
    });

    // Observe programmatic updates
    const desc = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    if (desc && desc.set) {
      [left, right].forEach((ta) => {
        Object.defineProperty(ta, 'value', {
          get() {
            return desc.get.call(this);
          },
          set(v) {
            desc.set.call(this, v);
            sync();
          },
          configurable: true
        });
      });
    }
    sync();
  }

  function setupMobileTabs() {
    const app = document.querySelector('.rv2-app');
    if (!app) return;
    app.setAttribute('data-mobile-pane', 'input');

    document.querySelectorAll('.rv2-mobile-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const pane = tab.getAttribute('data-rv2-pane') || 'input';
        app.setAttribute('data-mobile-pane', pane);
        document.querySelectorAll('.rv2-mobile-tab').forEach((t) => {
          const on = t === tab;
          t.classList.toggle('active', on);
          t.setAttribute('aria-selected', on ? 'true' : 'false');
        });
      });
    });
  }

  function toggleFullscreen() {
    const el = document.documentElement;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().catch(() => {
        document.body.classList.add('rv2-fullscreen');
      });
      document.body.classList.add('rv2-fullscreen');
    } else {
      document.exitFullscreen?.();
      document.body.classList.remove('rv2-fullscreen');
    }
  }

  function setupFullscreen() {
    $('rv2-btn-fullscreen')?.addEventListener('click', toggleFullscreen);
    document.addEventListener('fullscreenchange', () => {
      document.body.classList.toggle('rv2-fullscreen', !!document.fullscreenElement);
    });
  }

  function setupPanelWidthPersist() {
    // Prefer V2 key; fall back to shared LSStorage value for continuity
    const saved = storageGet('panelWidth', null);
    if (saved != null && typeof LSStorage !== 'undefined') {
      // Apply via existing splitter storage if engine already loaded a value
      const current = LSStorage.getPanelWidth();
      if (current == null) {
        LSStorage.setPanelWidth(saved);
      }
    }

    // Mirror panel width into V2 key when splitter changes
    const inputPane = $('input-pane');
    if (!inputPane || typeof ResizeObserver === 'undefined') return;
    let timer = null;
    const ro = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const w = inputPane.getBoundingClientRect().width;
        if (w > 120) storageSet('panelWidth', Math.round(w));
      }, 200);
    });
    ro.observe(inputPane);
  }

  function enhanceHistoryEmptyCopy() {
    // Soften empty-history copy when panel opens (engine may overwrite)
    const list = $('history-list');
    if (!list) return;
    const mo = new MutationObserver(() => {
      const empty = list.querySelector('.history-empty');
      if (empty && /No history yet/i.test(empty.textContent || '')) {
        empty.innerHTML =
          '<div style="font-weight:600;margin-bottom:6px;color:var(--ls-text)">No history yet</div>' +
          'Processed Logcat sessions will appear here.';
      }
    });
    mo.observe(list, { childList: true });
  }

  function patchThemeIcon() {
    // Keep SVG theme button — prevent emoji injection if icon id appears later
    if (typeof LSUI === 'undefined') return;
    const originalToggle = LSUI.toggleTheme;
    if (typeof originalToggle !== 'function') return;

    // After theme changes, persist a V2 theme preference copy (non-breaking)
    const wrap = function () {
      originalToggle.call(LSUI);
      const isLight = document.body.classList.contains('theme-light');
      storageSet('theme', isLight ? 'light' : 'dark');
    };
    try {
      LSUI.toggleTheme = wrap;
    } catch (_) {
      /* ignore */
    }
  }

  function init() {
    setupMenus();
    setupInputActions();
    setupStatusObserver();
    setupCompareEmpty();
    setupMobileTabs();
    setupFullscreen();
    setupPanelWidthPersist();
    enhanceHistoryEmptyCopy();
    patchThemeIcon();
    updateTypeBadge();
    setStatus('ready', 'Ready');
  }

  return {
    init,
    runAction,
    setStatus,
    updateTypeBadge,
    toggleFullscreen,
    closeMenus
  };
})();

window.LogcatStudioV2 = LogcatStudioV2;

document.addEventListener('DOMContentLoaded', () => {
  // LSApp.init also binds on DOMContentLoaded; run after a tick so engine is ready
  setTimeout(() => {
    try {
      LogcatStudioV2.init();
    } catch (err) {
      console.error('LogcatStudioV2 init failed', err);
    }
  }, 0);
});
