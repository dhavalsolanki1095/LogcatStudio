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
    const shellTabs = { raw: 1, tree: 1, compare: 1, api: 1 };
    const isShellView = !!shellTabs[name];
    const shell = document.getElementById('json-shell');
    if (shell) {
      shell.classList.toggle('active', isShellView);
    }

    const jsonList = document.getElementById('json-block-list');
    const apiList = document.getElementById('api-list');
    const sideNav = document.getElementById('side-nav');

    // Same vertical sidebar behavior as API Calls for Raw / Tree / Compare
    if (name === 'api') {
      if (jsonList) jsonList.hidden = true;
      if (apiList) apiList.hidden = false;
      if (sideNav) sideNav.hidden = false;
    } else if (isShellView) {
      if (apiList) apiList.hidden = true;
      if (jsonList) jsonList.hidden = false;
      if (sideNav) sideNav.hidden = false;
    } else if (sideNav) {
      sideNav.hidden = true;
    }

    document.querySelectorAll('.output-tab').forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.tab === name);
    });
    document.querySelectorAll('.tab-panel').forEach((panel) => {
      panel.classList.toggle('active', panel.id === `tab-${name}`);
    });

    const apiActions = document.getElementById('api-header-actions');
    const treeActions = document.getElementById('tree-header-actions');
    if (apiActions) apiActions.hidden = name !== 'api';
    if (treeActions) treeActions.hidden = name !== 'tree';
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

  function blockLabel(block, index) {
    if (block && block.label) {
      return {
        title: block.label,
        meta: block.source === 'api' ? 'From API Calls' : 'JSON block',
        badge: block.source === 'api' ? 'API' : 'JSON',
        badgeClass: block.source === 'api' ? 'api' : ''
      };
    }
    const n = index + 1;
    if (!block || !block.valid || block.value == null) {
      return { title: `JSON ${n}`, meta: 'Invalid', badge: 'ERR', badgeClass: 'invalid' };
    }
    const v = block.value;
    if (Array.isArray(v)) {
      return { title: `JSON ${n}`, meta: `Array · ${v.length} items`, badge: 'ARR', badgeClass: '' };
    }
    if (v && typeof v === 'object') {
      if (Object.prototype.hasOwnProperty.call(v, 'current_page')) {
        const total = v.total != null ? v.total : '?';
        const dataLen = Array.isArray(v.data) ? v.data.length : '?';
        return {
          title: `List page ${v.current_page}`,
          meta: `${dataLen} rows · total ${total}`,
          badge: 'LIST',
          badgeClass: ''
        };
      }
      if (v.id != null && v.name != null && String(v.name).trim()) {
        return {
          title: `#${v.id} · ${String(v.name).slice(0, 40)}`,
          meta: v.status != null ? `status: ${v.status}` : `id: ${v.id}`,
          badge: 'OBJ',
          badgeClass: ''
        };
      }
      if (v.id != null) {
        return { title: `id: ${v.id}`, meta: Object.keys(v).length + ' keys', badge: 'OBJ', badgeClass: '' };
      }
      if (v.success != null) {
        return { title: `success: ${v.success}`, meta: Object.keys(v).length + ' keys', badge: 'OBJ', badgeClass: '' };
      }
      const keys = Object.keys(v);
      return {
        title: `JSON ${n}`,
        meta: keys.slice(0, 3).join(', ') + (keys.length > 3 ? '…' : ''),
        badge: 'OBJ',
        badgeClass: ''
      };
    }
    return { title: `JSON ${n}`, meta: typeof v, badge: 'VAL', badgeClass: '' };
  }

  /** Same card markup used by API Calls and JSON blocks side-nav */
  function fillSideNavCard(btn, opts) {
    const method = opts.method || '?';
    const methodClass = opts.methodClass != null ? opts.methodClass : String(method).toLowerCase();
    const statusText = opts.statusText != null ? opts.statusText : '—';
    const statusClass = opts.statusClass || 'pending';
    const path = opts.path || '';
    const meta = opts.meta || '';
    btn.innerHTML = `
      <div class="raw-block-title">
        <span class="api-method ${LSUtils.escapeHtml(methodClass)}">${LSUtils.escapeHtml(method)}</span>
        <span class="api-status ${LSUtils.escapeHtml(statusClass)}">${LSUtils.escapeHtml(
          String(statusText)
        )}</span>
      </div>
      <div class="raw-block-meta">${LSUtils.escapeHtml(path)}</div>
      <div class="raw-block-meta">${LSUtils.escapeHtml(meta)}</div>
    `;
  }

  function cardOptsForBlock(block, index) {
    const info = blockLabel(block, index);
    const size = block.raw ? LSUtils.formatBytes(new Blob([block.raw]).size) : '';

    // API-sourced JSON → identical card fields to API Calls
    if (block && block.source === 'api') {
      const status =
        block.status != null
          ? block.status
          : block.kind === 'Request'
            ? 'REQ'
            : '—';
      const statusClass =
        block.status == null
          ? 'pending'
          : block.status >= 200 && block.status < 400
            ? 'ok'
            : 'err';
      const metaParts = [];
      if (block.kind) metaParts.push(block.kind);
      if (block.durationMs != null) metaParts.push(block.durationMs + 'ms');
      if (size) metaParts.push(size);
      else if (block.bodyBytes != null) metaParts.push(block.bodyBytes + ' B');
      return {
        method: block.method || '?',
        methodClass: String(block.method || '').toLowerCase(),
        statusText: status,
        statusClass,
        path: block.path || info.title,
        meta: metaParts.join(' · ')
      };
    }

    // Plain JSON → same card shell (badge + status + path + meta)
    const badge = info.badge || 'JSON';
    const statusClass = block && block.valid ? 'ok' : 'err';
    const statusText = block && block.valid ? 'OK' : 'ERR';
    const metaParts = [];
    if (info.meta) metaParts.push(info.meta);
    if (size) metaParts.push(size);
    return {
      method: badge,
      methodClass: String(badge).toLowerCase(),
      statusText,
      statusClass,
      path: info.title,
      meta: metaParts.join(' · ')
    };
  }

  function renderBlockChips(blocks, activeIndex, onSelect) {
    const bar = document.getElementById('block-bar');
    const list = document.getElementById('json-block-list');
    const itemsEl = document.getElementById('json-block-items');
    if (!bar) return;

    bar.innerHTML = '';
    const count = blocks && blocks.length ? blocks.length : 0;
    const apiTab = document.getElementById('tab-api');
    const onApi = apiTab && apiTab.classList.contains('active');

    if (!count) {
      bar.innerHTML = '<span class="block-bar-empty">Paste Logcat or JSON to begin</span>';
      if (itemsEl) {
        itemsEl.innerHTML =
          '<div class="api-list-empty">No JSON found. Paste Logcat or JSON to begin.</div>';
      }
      if (list) {
        list.dataset.hasItems = '0';
        list.hidden = !!onApi;
      }
      return;
    }

    if (count === 1) {
      const info = blockLabel(blocks[0], 0);
      bar.innerHTML = `<span class="block-bar-empty">1 JSON · ${LSUtils.escapeHtml(info.title)}</span>`;
    } else {
      bar.innerHTML = `<span class="block-bar-empty">${count} JSON blocks — select from left list</span>`;
    }

    if (!itemsEl) return;

    itemsEl.innerHTML = '';
    blocks.forEach((b, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'raw-block-item' + (i === activeIndex ? ' active' : '');
      fillSideNavCard(btn, cardOptsForBlock(b, i));
      btn.addEventListener('click', () => {
        if (typeof onSelect === 'function') onSelect(i);
      });
      itemsEl.appendChild(btn);
    });

    if (list) {
      list.dataset.hasItems = '1';
      list.hidden = !!onApi;
    }
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
    // Syntax highlight is expensive — skip for large payloads to keep UI responsive
    const HIGHLIGHT_MAX = 120000;

    if (pre) {
      if (
        src &&
        src.length <= HIGHLIGHT_MAX &&
        validation.valid &&
        typeof LSHighlighter !== 'undefined'
      ) {
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

  function formatHeadersHtml(headers) {
    const keys = Object.keys(headers || {});
    if (!keys.length) return '<span class="api-muted">No headers</span>';
    return keys
      .map(
        (k) =>
          `<span class="hk">${LSUtils.escapeHtml(k)}</span>: <span class="hv">${LSUtils.escapeHtml(
            String(headers[k])
          )}</span>`
      )
      .join('\n');
  }

  function formatBodyHtml(bodyRaw, bodyValue, bodyValid) {
    if (!bodyRaw && bodyValue == null) {
      return '<div class="api-muted">No body</div>';
    }
    let text = bodyRaw || '';
    if (bodyValid && bodyValue != null) {
      try {
        text =
          typeof LSFormatter !== 'undefined'
            ? LSFormatter.beautify(bodyValue, '2')
            : JSON.stringify(bodyValue, null, 2);
      } catch (_) {
        text = bodyRaw;
      }
    }
    const html =
      bodyValid && typeof LSHighlighter !== 'undefined'
        ? LSHighlighter.highlightJson(text)
        : LSUtils.escapeHtml(text);
    return `<pre class="api-body">${html}</pre>`;
  }

  function renderApiCalls(calls, activeIndex, onSelect) {
    const list = document.getElementById('api-list');
    const itemsEl = document.getElementById('api-list-items');
    const detail = document.getElementById('api-detail');
    if (!list || !detail) return;

    const items = Array.isArray(calls) ? calls : [];
    const target = itemsEl || list;

    if (!items.length) {
      target.innerHTML =
        '<div class="api-list-empty">No API calls found. Paste OkHttp / Logcat / .logcat export.</div>';
      detail.innerHTML =
        '<div class="api-detail-empty">Select an API call to view request / response</div>';
      syncApiHeaderActions(null);
      return;
    }

    target.innerHTML = '';
    items.forEach((call, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'raw-block-item' + (i === activeIndex ? ' active' : '');
      const statusClass =
        call.status == null
          ? 'pending'
          : call.status >= 200 && call.status < 400
            ? 'ok'
            : 'err';
      const metaParts = [];
      if (call.durationMs != null) metaParts.push(call.durationMs + 'ms');
      if (call.bodyBytes != null) metaParts.push(call.bodyBytes + ' B');
      fillSideNavCard(btn, {
        method: call.method || '?',
        methodClass: String(call.method || '').toLowerCase(),
        statusText: call.status != null ? call.status : '—',
        statusClass,
        path: call.path || call.url || '',
        meta: metaParts.join(' · ')
      });
      btn.addEventListener('click', () => {
        if (typeof onSelect === 'function') onSelect(i);
      });
      target.appendChild(btn);
    });

    const call = items[activeIndex];
    if (!call) {
      detail.innerHTML =
        '<div class="api-detail-empty">Select an API call to view request / response</div>';
      syncApiHeaderActions(null);
      return;
    }

    const statusClass =
      call.status == null
        ? 'pending'
        : call.status >= 200 && call.status < 400
          ? 'ok'
          : 'err';

    detail.innerHTML = `
      <div class="api-detail-header">
        <div class="api-detail-title">
          <span class="api-method ${String(call.method || '').toLowerCase()}">${LSUtils.escapeHtml(
            call.method || '?'
          )}</span>
          <span class="api-status ${statusClass}">${call.status != null ? call.status : '—'}</span>
          ${call.durationMs != null ? `<span class="api-meta">${call.durationMs}ms</span>` : ''}
          ${call.bodyBytes != null ? `<span class="api-meta">${call.bodyBytes} bytes</span>` : ''}
        </div>
        <div class="api-detail-url" id="api-detail-url" title="Click to copy URL">${LSUtils.escapeHtml(
          call.url || ''
        )}</div>
      </div>

      <div class="api-detail-scroll">
        <div class="api-section">
          <div class="api-section-title">Request headers</div>
          <pre class="api-headers">${formatHeadersHtml(call.request.headers)}</pre>
          <div class="api-section-title">Request body</div>
          <div class="api-body-wrap">${formatBodyHtml(
            call.request.bodyRaw,
            call.request.body,
            call.request.bodyValid
          )}</div>
        </div>

        <div class="api-section">
          <div class="api-section-title">Response headers</div>
          <pre class="api-headers">${formatHeadersHtml(call.response.headers)}</pre>
          <div class="api-section-title">Response body</div>
          <div class="api-body-wrap">${formatBodyHtml(
            call.response.bodyRaw,
            call.response.body,
            call.response.bodyValid
          )}</div>
        </div>
      </div>
    `;

    const urlEl = detail.querySelector('#api-detail-url');
    if (urlEl && call.url) {
      urlEl.style.cursor = 'pointer';
      urlEl.addEventListener('click', async () => {
        const ok = await LSUtils.copyText(call.url);
        LSUtils.toast(ok ? 'URL copied' : 'Copy failed', ok ? 'success' : 'error');
      });
    }

    syncApiHeaderActions(call);
  }

  function syncApiHeaderActions(call) {
    const setDisabled = (id, disabled) => {
      const el = document.getElementById(id);
      if (el) el.disabled = !!disabled;
    };
    const hasRequest = !!(call && call.request && (call.request.bodyRaw || call.request.body));
    const hasResponse = !!(call && call.response && (call.response.bodyRaw || call.response.body));
    setDisabled('btn-api-copy-full', !call);
    setDisabled('btn-api-copy-url', !(call && call.url));
    setDisabled('btn-api-copy-request', !hasRequest);
    setDisabled('btn-api-copy-response', !hasResponse);
    setDisabled('btn-api-use-response-json', !hasResponse);
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
    highlightRawSearch,
    renderApiCalls,
    syncApiHeaderActions
  };
})();

window.LSUI = LSUI;
