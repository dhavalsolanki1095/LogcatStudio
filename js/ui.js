/**
 * Logcat Studio — UI helpers (theme, tabs, splitters, menus, modals)
 */
const LSUI = (() => {
  'use strict';

  let currentTheme = 'dark';

  function applyTheme(theme) {
    currentTheme = theme === 'light' ? 'light' : 'dark';
    document.body.classList.toggle('theme-light', currentTheme === 'light');
    document.body.classList.toggle('theme-dark', currentTheme === 'dark');

    const icon = document.getElementById('theme-toggle-icon');
    if (icon) icon.textContent = currentTheme === 'dark' ? '🌙' : '☀️';

    const btn = document.getElementById('btn-theme-toggle');
    if (btn) {
      btn.title = currentTheme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode';
    }

    LSStorage.setTheme(currentTheme);
  }

  function toggleTheme() {
    applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
  }

  function initTheme() {
    applyTheme(LSStorage.getTheme());
  }

  function switchTab(name) {
    document.querySelectorAll('.output-tab').forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.tab === name);
    });
    document.querySelectorAll('.tab-panel').forEach((panel) => {
      panel.classList.toggle('active', panel.id === `tab-${name}`);
    });
  }

  function closeMenus() {
    document.querySelectorAll('.toolbar-menu').forEach((m) => {
      m.hidden = true;
    });
    document.querySelectorAll('.toolbar-dropdown-toggle').forEach((b) => {
      b.setAttribute('aria-expanded', 'false');
    });
  }

  function setupDropdowns() {
    document.querySelectorAll('.toolbar-dropdown').forEach((dd) => {
      const toggle = dd.querySelector('.toolbar-dropdown-toggle');
      const menu = dd.querySelector('.toolbar-menu');
      if (!toggle || !menu) return;

      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = menu.hidden;
        closeMenus();
        menu.hidden = !open;
        toggle.setAttribute('aria-expanded', String(open));
      });
    });

    document.addEventListener('click', () => closeMenus());
  }

  function setupSplitter() {
    const splitter = document.getElementById('splitter-v');
    const inputPane = document.getElementById('input-pane');
    const workspace = document.getElementById('workspace');
    if (!splitter || !inputPane || !workspace) return;

    const saved = LSStorage.getPanelWidth();
    if (saved && window.innerWidth > 900) {
      inputPane.style.width = `${saved}px`;
    }

    let dragging = false;

    function onMove(clientX, clientY) {
      if (!dragging) return;
      const rect = workspace.getBoundingClientRect();
      const vertical = window.innerWidth <= 900;

      if (vertical) {
        const y = clientY - rect.top;
        const pct = Math.min(70, Math.max(20, (y / rect.height) * 100));
        inputPane.style.width = '100%';
        inputPane.style.height = `${pct}%`;
      } else {
        const x = clientX - rect.left;
        const w = Math.min(rect.width - 200, Math.max(200, x));
        inputPane.style.height = '';
        inputPane.style.width = `${w}px`;
        LSStorage.setPanelWidth(w);
      }
    }

    splitter.addEventListener('mousedown', (e) => {
      dragging = true;
      splitter.classList.add('dragging');
      document.body.style.cursor = window.innerWidth <= 900 ? 'row-resize' : 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY));
    window.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      splitter.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    });

    // Touch
    splitter.addEventListener('touchstart', (e) => {
      dragging = true;
      splitter.classList.add('dragging');
    }, { passive: true });
    window.addEventListener('touchmove', (e) => {
      if (!dragging || !e.touches[0]) return;
      onMove(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    window.addEventListener('touchend', () => {
      dragging = false;
      splitter.classList.remove('dragging');
    });
  }

  function setStatus(map) {
    Object.keys(map).forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = map[id];
    });
  }

  function setValidationBanner(result) {
    const banner = document.getElementById('validation-banner');
    const input = document.getElementById('raw-output');
    if (!banner) return;

    if (!result || result.skip) {
      banner.classList.remove('visible', 'ok', 'err');
      if (input) input.classList.remove('valid', 'invalid');
      return;
    }

    banner.classList.add('visible');
    if (result.valid) {
      banner.classList.add('ok');
      banner.classList.remove('err');
      banner.textContent = '✓ Valid JSON';
      if (input) {
        input.classList.add('valid');
        input.classList.remove('invalid');
      }
    } else {
      banner.classList.add('err');
      banner.classList.remove('ok');
      let msg = `✗ Invalid JSON — ${result.error || 'parse error'}`;
      if (result.line != null) msg += ` (line ${result.line}`;
      if (result.column != null) msg += `, col ${result.column}`;
      if (result.line != null) msg += ')';
      banner.textContent = msg;
      if (input) {
        input.classList.add('invalid');
        input.classList.remove('valid');
      }
    }
  }

  function renderBlockChips(blocks, activeIndex, onSelect) {
    const bar = document.getElementById('block-bar');
    if (!bar) return;
    bar.innerHTML = '';

    if (!blocks || !blocks.length) {
      bar.innerHTML = '<span class="block-bar-empty">No JSON blocks detected</span>';
      return;
    }

    if (blocks.length === 1) {
      bar.innerHTML = '<span class="block-bar-empty">1 JSON block</span>';
      return;
    }

    blocks.forEach((b, i) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `block-chip${i === activeIndex ? ' active' : ''}`;
      const label = b.valid ? `Block ${i + 1}` : `Block ${i + 1} (invalid)`;
      chip.textContent = label;
      chip.title = LSUtils.truncate(b.raw, 120);
      chip.addEventListener('click', () => onSelect(i));
      bar.appendChild(chip);
    });
  }

  function renderStats(stats) {
    const el = document.getElementById('stats-container');
    if (!el) return;

    if (!stats) {
      el.innerHTML = '<div class="tree-empty"><div class="ph-title">No statistics</div><div class="ph-hint">Process valid JSON to see stats.</div></div>';
      return;
    }

    const items = [
      { label: 'Objects', value: stats.objects },
      { label: 'Arrays', value: stats.arrays },
      { label: 'Strings', value: stats.strings },
      { label: 'Numbers', value: stats.numbers },
      { label: 'Booleans', value: stats.booleans },
      { label: 'Nulls', value: stats.nulls },
      { label: 'Keys', value: stats.keys },
      { label: 'Max Depth', value: stats.maxDepth },
      { label: 'Nodes', value: stats.nodes },
      { label: 'Characters', value: LSUtils.formatNumber(stats.charCount) },
      { label: 'Lines', value: LSUtils.formatNumber(stats.lineCount) },
      { label: 'Size', value: stats.size }
    ];

    el.innerHTML = `<div class="stats-grid">${items.map((it) => `
      <div class="stat-card">
        <div class="stat-label">${it.label}</div>
        <div class="stat-value">${it.value}</div>
      </div>`).join('')}</div>`;
  }

  function renderHistory(list, onPick) {
    const panel = document.getElementById('history-panel');
    const listEl = document.getElementById('history-list');
    if (!listEl) return;

    listEl.innerHTML = '';
    if (!list || !list.length) {
      listEl.innerHTML = '<div class="history-empty">No history yet. Pasted JSON will appear here.</div>';
      return;
    }

    list.forEach((item) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'history-item';
      btn.innerHTML = `
        <div class="hi-preview">${LSUtils.escapeHtml(item.preview)}</div>
        <div class="hi-meta">${LSUtils.escapeHtml(item.type)} · ${LSUtils.escapeHtml(item.size)} · ${LSUtils.escapeHtml(new Date(item.at).toLocaleString())}</div>`;
      btn.addEventListener('click', () => {
        onPick(item);
        panel.classList.remove('open');
      });
      listEl.appendChild(btn);
    });
  }

  function toggleHistory(force) {
    const panel = document.getElementById('history-panel');
    if (!panel) return;
    if (typeof force === 'boolean') {
      panel.classList.toggle('open', force);
    } else {
      panel.classList.toggle('open');
    }
  }

  function showReceipt(html) {
    const overlay = document.getElementById('modal-overlay');
    const frame = document.getElementById('receipt-frame');
    const title = document.getElementById('modal-title');
    if (!overlay || !frame) return;

    title.textContent = 'Receipt Preview';
    frame.innerHTML = html;
    document.getElementById('receipt-preview-wrap').hidden = false;
    document.getElementById('image-preview-wrap').hidden = true;
    overlay.classList.add('open');
  }

  function showImagePreview(src) {
    const overlay = document.getElementById('modal-overlay');
    const img = document.getElementById('image-preview-img');
    const title = document.getElementById('modal-title');
    if (!overlay || !img) return;

    title.textContent = 'Image Preview';
    img.src = src;
    document.getElementById('receipt-preview-wrap').hidden = true;
    document.getElementById('image-preview-wrap').hidden = false;
    overlay.classList.add('open');
  }

  function closeModal() {
    const overlay = document.getElementById('modal-overlay');
    if (overlay) overlay.classList.remove('open');
  }

  function setReceiptButtonVisible(visible) {
    const btn = document.getElementById('btn-receipt-preview');
    if (btn) btn.hidden = !visible;
  }

  function renderRawOutput(text) {
    const ta = document.getElementById('raw-output');
    const pre = document.getElementById('raw-highlight');
    if (!ta) return;

    const src = String(text || '');
    ta.value = src;

    const validation = src ? LSValidator.validate(src) : { valid: false };

    if (pre) {
      if (src && validation.valid && typeof LSHighlighter !== 'undefined') {
        pre.innerHTML = LSHighlighter.highlightJson(src);
        pre.hidden = false;
        ta.classList.add('json-colorized');
      } else {
        pre.innerHTML = '';
        pre.hidden = true;
        ta.classList.remove('json-colorized');
      }
    }

    ta.classList.toggle('valid', !!src && validation.valid);
    ta.classList.toggle('invalid', !!src && !validation.valid);
  }

  function setupRawScrollSync() {
    const ta = document.getElementById('raw-output');
    const pre = document.getElementById('raw-highlight');
    if (!ta || !pre) return;

    ta.addEventListener('scroll', () => {
      pre.scrollTop = ta.scrollTop;
      pre.scrollLeft = ta.scrollLeft;
    });
  }

  function highlightRawSearch(textarea, query, opts) {
    // Textarea can't highlight; we only report count via tree search.
    // Optionally scroll to first match index in raw text.
    if (!textarea || !query) return 0;
    const text = textarea.value;
    let flags = opts && opts.caseSensitive ? 'g' : 'gi';
    let re;
    try {
      re = opts && opts.regex
        ? new RegExp(query, flags)
        : new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
    } catch (_) {
      return 0;
    }
    const matches = text.match(re);
    return matches ? matches.length : 0;
  }

  return {
    initTheme,
    applyTheme,
    toggleTheme,
    switchTab,
    setupDropdowns,
    setupSplitter,
    closeMenus,
    setStatus,
    setValidationBanner,
    renderBlockChips,
    renderStats,
    renderHistory,
    toggleHistory,
    showReceipt,
    showImagePreview,
    closeModal,
    setReceiptButtonVisible,
    renderRawOutput,
    setupRawScrollSync,
    highlightRawSearch
  };
})();

window.LSUI = LSUI;
