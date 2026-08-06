/**
 * Logcat Studio — Application controller
 */
const LSApp = (() => {
  'use strict';

  const state = {
    inputRaw: '',
    blocks: [],
    activeBlock: -1,
    formatted: '',
    value: null,
    indent: '2',
    inputType: 'empty',
    receiptHtml: null,
    processing: false
  };

  function inputEl() {
    return document.getElementById('input-editor');
  }

  function rawEl() {
    return document.getElementById('raw-output');
  }

  function getIndent() {
    const sel = document.getElementById('select-indent');
    return (sel && sel.value) || state.indent || '2';
  }

  function updateStatusBar() {
    const text = state.formatted || '';
    const validation = text ? LSValidator.validate(text) : { valid: false, error: '—' };
    const statusValid = document.getElementById('status-valid');
    const statusValidWrap = document.getElementById('status-valid-wrap');

    LSUI.setStatus({
      'status-type': state.inputType || '—',
      'status-blocks': state.blocks.length ? String(state.blocks.length) : '0',
      'status-size': text ? LSUtils.formatBytes(new Blob([text]).size) : '0 B',
      'status-lines': text ? String(LSUtils.countLines(text)) : '0',
      'status-path': LSTree.getSelectedPath() || '$'
    });

    if (statusValid) {
      if (!text) {
        statusValid.textContent = '—';
        if (statusValidWrap) statusValidWrap.classList.remove('valid', 'invalid');
      } else if (validation.valid) {
        statusValid.textContent = 'Valid';
        if (statusValidWrap) {
          statusValidWrap.classList.add('valid');
          statusValidWrap.classList.remove('invalid');
        }
      } else {
        statusValid.textContent = 'Invalid';
        if (statusValidWrap) {
          statusValidWrap.classList.add('invalid');
          statusValidWrap.classList.remove('valid');
        }
      }
    }
  }

  function applyFormatted(text, value) {
    state.formatted = text;
    state.value = value;

    const raw = rawEl();
    if (raw) LSUI.renderRawOutput(text);

    if (value !== null && value !== undefined) {
      LSTree.setData(value);
    } else {
      LSTree.clear();
    }

    const validation = LSValidator.validate(text);
    LSUI.setValidationBanner(text ? validation : { skip: true });

    const stats = LSValidator.statsForText(text);
    LSUI.renderStats(stats);

    // Receipt detection
    state.receiptHtml = value != null ? LSParser.findReceiptHtml(value) : null;
    LSUI.setReceiptButtonVisible(!!state.receiptHtml);

    // Seed compare left pane if empty
    const left = document.getElementById('compare-left');
    if (left && !left.value.trim() && text) {
      left.value = text;
    }

    updateStatusBar();
  }

  function selectBlock(index) {
    if (index < 0 || index >= state.blocks.length) return;
    state.activeBlock = index;
    const block = state.blocks[index];
    LSUI.renderBlockChips(state.blocks, index, selectBlock);

    let value = block.value;
    let text = block.raw;

    if (!block.valid) {
      const repaired = LSValidator.repair(block.raw);
      if (repaired.ok) {
        value = repaired.value;
        text = LSFormatter.beautify(value, getIndent());
        LSUtils.toast(`Auto-repaired: ${repaired.repairs.join(', ')}`, 'info');
      } else {
        applyFormatted(block.raw, null);
        LSUI.setValidationBanner(LSValidator.validate(block.raw));
        return;
      }
    } else {
      try {
        text = LSFormatter.beautify(value, getIndent());
      } catch (_) {
        text = JSON.stringify(value, null, 2);
      }
    }

    applyFormatted(text, value);
  }

  function processInput(raw, options) {
    const opts = options || {};
    const text = raw == null ? (inputEl() && inputEl().value) : raw;
    state.inputRaw = text || '';

    if (inputEl() && raw != null) {
      inputEl().value = text;
    }

    if (!String(text || '').trim()) {
      state.blocks = [];
      state.activeBlock = -1;
      state.inputType = 'empty';
      applyFormatted('', null);
      LSUI.renderBlockChips([], -1, selectBlock);
      LSUI.setValidationBanner({ skip: true });
      updateStatusBar();
      return;
    }

    state.processing = true;
    const result = LSParser.process(text);
    state.inputType = result.type;
    state.blocks = result.blocks;

    if (!opts.skipHistory && result.blocks.length) {
      const previewSource = result.blocks[result.primaryIndex >= 0 ? result.primaryIndex : 0];
      LSStorage.addHistory({
        text: String(text),
        preview: previewSource ? previewSource.raw : text,
        type: result.type
      });
    }

    if (result.primaryIndex >= 0) {
      selectBlock(result.primaryIndex);
    } else {
      LSUI.renderBlockChips([], -1, selectBlock);
      applyFormatted('', null);
      LSUtils.toast('No JSON found in input', 'warn');
    }

    state.processing = false;
  }

  function beautifyCurrent() {
    const raw = rawEl();
    if (!raw || !raw.value.trim()) {
      // try input
      processInput();
      return;
    }
    const result = LSFormatter.tryBeautify(raw.value, getIndent());
    if (!result.ok) {
      // try repair then beautify
      const repaired = LSValidator.repair(raw.value);
      if (repaired.ok) {
        const text = LSFormatter.beautify(repaired.value, getIndent());
        applyFormatted(text, repaired.value);
        LSUtils.toast('Repaired & beautified', 'success');
        return;
      }
      LSUtils.toast(`Beautify failed: ${result.error.message}`, 'error');
      return;
    }
    const parsed = JSON.parse(result.text);
    applyFormatted(result.text, parsed);
    LSUtils.toast('Beautified', 'success');
  }

  function minifyCurrent() {
    const raw = rawEl();
    if (!raw || !raw.value.trim()) return;
    const result = LSFormatter.tryMinify(raw.value);
    if (!result.ok) {
      LSUtils.toast(`Minify failed: ${result.error.message}`, 'error');
      return;
    }
    const parsed = JSON.parse(result.text);
    applyFormatted(result.text, parsed);
    LSUtils.toast('Minified', 'success');
  }

  function repairCurrent() {
    const source = (rawEl() && rawEl().value.trim()) || (inputEl() && inputEl().value) || '';
    if (!source.trim()) return;
    const repaired = LSValidator.repair(source);
    if (repaired.ok) {
      const text = LSFormatter.beautify(repaired.value, getIndent());
      applyFormatted(text, repaired.value);
      LSUtils.toast(
        repaired.repairs.length
          ? `Repaired: ${repaired.repairs.join(', ')}`
          : 'JSON already valid',
        'success'
      );
    } else {
      LSUtils.toast(`Repair failed: ${repaired.error || 'unknown'}`, 'error');
      if (repaired.text) {
        applyFormatted(repaired.text, null);
      }
    }
  }

  async function copyFormatted() {
    const text = state.formatted || (rawEl() && rawEl().value) || '';
    if (!text) return;
    const ok = await LSUtils.copyText(text);
    LSUtils.toast(ok ? 'Copied formatted JSON' : 'Copy failed', ok ? 'success' : 'error');
  }

  async function copyMinified() {
    try {
      const text = LSFormatter.minify(state.value != null ? state.value : (rawEl() && rawEl().value));
      const ok = await LSUtils.copyText(text);
      LSUtils.toast(ok ? 'Copied minified JSON' : 'Copy failed', ok ? 'success' : 'error');
    } catch (err) {
      LSUtils.toast(`Copy minify failed: ${err.message}`, 'error');
    }
  }

  async function copyPath() {
    const path = LSTree.getSelectedPath() || '$';
    const ok = await LSUtils.copyText(path);
    LSUtils.toast(ok ? `Copied ${path}` : 'Copy failed', ok ? 'success' : 'error');
  }

  function downloadJson() {
    const text = state.formatted || (rawEl() && rawEl().value) || '';
    if (!text) return;
    LSUtils.downloadText('logcat-studio.json', text, 'application/json;charset=utf-8');
    LSUtils.toast('Downloaded JSON', 'success');
  }

  function downloadTxt() {
    const text = state.formatted || (rawEl() && rawEl().value) || '';
    if (!text) return;
    LSUtils.downloadText('logcat-studio.txt', text, 'text/plain;charset=utf-8');
    LSUtils.toast('Downloaded TXT', 'success');
  }

  function clearAll() {
    if (inputEl()) inputEl().value = '';
    state.inputRaw = '';
    state.blocks = [];
    state.activeBlock = -1;
    state.inputType = 'empty';
    state.receiptHtml = null;
    applyFormatted('', null);
    LSUI.renderBlockChips([], -1, selectBlock);
    LSUI.setValidationBanner({ skip: true });
    LSUI.setReceiptButtonVisible(false);
    const left = document.getElementById('compare-left');
    const right = document.getElementById('compare-right');
    if (left) left.value = '';
    if (right) right.value = '';
    LSCompare.renderDiff(document.getElementById('compare-diff'), null);
    updateStatusBar();
  }

  function runSearch() {
    const query = (document.getElementById('search-input') && document.getElementById('search-input').value) || '';
    const regex = !!(document.getElementById('search-regex') && document.getElementById('search-regex').checked);
    const caseSensitive = !!(document.getElementById('search-case') && document.getElementById('search-case').checked);
    const keys = !!(document.getElementById('search-keys') && document.getElementById('search-keys').checked);
    const values = !!(document.getElementById('search-values') && document.getElementById('search-values').checked);

    const count = LSTree.setSearch({ query, regex, caseSensitive, keys, values });
    const rawCount = LSUI.highlightRawSearch(rawEl(), query, { regex, caseSensitive });
    const label = document.getElementById('search-count');
    if (label) {
      if (!query) label.textContent = '';
      else label.textContent = `${count} tree · ${rawCount} raw`;
    }
  }

  function runCompare() {
    const left = document.getElementById('compare-left');
    const right = document.getElementById('compare-right');
    const result = LSCompare.compareTexts(left.value, right.value);
    LSCompare.renderDiff(document.getElementById('compare-diff'), result);
    if (result.ok) {
      const s = result.summary;
      LSUtils.toast(`Compare: +${s.added} / −${s.removed} / ~${s.changed}`, 'info');
    } else {
      LSUtils.toast(result.error, 'error');
    }
  }

  function useCurrentAsCompareLeft() {
    const left = document.getElementById('compare-left');
    if (left && state.formatted) left.value = state.formatted;
  }

  const EMBEDDED_SAMPLES = {
    logcat: `11:46:27.862 OkHttp                   I  {"current_page":1,"data":[{"id":1342899,"name":"","open":1,"status":"OPEN","totals":{"discounts":0,"items":0,"other_
11:46:27.862 OkHttp                   I  charges":0,"sub_total":1081,"total":1081,"due":1081}},{"id":1342738,"name":"test 0455","opened_at":"2026-08-05 11:26:10","c
11:46:27.862 OkHttp                   I  losed_at":null,"open":1,"totals":{"total":8632},"status":"OPEN"}],"per_page":10000,"total":2}
11:46:27.863 OkHttp                   I  <-- END HTTP`,
    messageOnly: `--> END GET
<-- 200 https://devapi.tabpoint.us/v33/locations/4000743/tickets?page=1 (503ms)
content-type: application/json

{"current_page":1,"data":[{"id":1342899,"name":"","open":1,"status":"OPEN","totals":{"discounts":0,"items":0,"other_
charges":0,"sub_total":1081,"total":1081,"due":1081}},{"id":1342738,"name":"test 0455","opened_at":"2026-08-05 11:26:10","c
losed_at":null,"open":1,"totals":{"total":8632},"status":"OPEN"}],"per_page":10000,"total":2}
<-- END HTTP (9594-byte body)`,
    formats: `2021-10-04 11:00:14.234 27217-3814  ExampleTag1             com.example.app1                     D  {"format":1,"ok":true}
27217-3814  ExampleTag1             com.example.app1                     I  {"format":2,"ok":true}
27217-3814  com.example.app1                     W  {"format":3,"ok":true}
27217-3814  com.example.app1                    {"format":4,"ok":true}
com.example.app1                    {"format":5,"ok":true}
{"format":6,"ok":true}
11:46:27.862 OkHttp                   I  {"current_page":1,"data":[{"id":1,"totals":{"other_
11:46:27.862 OkHttp                   I  charges":0,"total":1081},"status":"OPEN"}],"total":1}`,
    request: `D/OkHttp: --> POST https://api.pos.example.com/v2/checkout\nD/OkHttp: Content-Type: application/json\nD/OkHttp: {"ticket":{"id":"TCK-9921","items":[{"name":"Espresso","qty":1,"price":2.75}],"total":11.34},"device":{"model":"Pixel 7","os":"14"}}`,
    response: `I/Retrofit: <-- 200 OK https://api.pos.example.com/v2/checkout (245ms)\nI/Retrofit: {"success":true,"data":{"transactionId":"TXN-44102","amount":11.34,"receipt":{"receipt_html":"<div style='font-family:monospace;width:280px;padding:12px'><h2 style='text-align:center'>Cafe Demo</h2><p style='text-align:center'>Order TCK-9921</p><hr/><p>Espresso x1 ........ $2.75</p><p><b>TOTAL ............. $11.34</b></p></div>"},"createdAt":1710495000,"uuid":"a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"}}`,
    json: `{"app":"Logcat Studio Demo","version":"1.0.0","features":{"smartPaste":true,"treeView":true},"theme":{"primary":"#007acc"},"meta":{"generatedAt":1710495600,"requestId":"550e8400-e29b-41d4-a716-446655440000","nullable":null}}`
  };

  function loadSample(name) {
    const map = {
      logcat: 'samples/sample-logcat.txt',
      formats: 'samples/sample-all-formats.txt',
      messageOnly: 'samples/sample-message-only-split.txt',
      request: 'samples/sample-request.txt',
      response: 'samples/sample-response.txt',
      json: 'samples/sample-json.json'
    };
    const url = map[name];
    if (!url) return;

    const apply = (text) => {
      processInput(text);
      LSUtils.toast(`Loaded sample: ${name}`, 'success');
    };

    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then(apply)
      .catch(() => {
        if (EMBEDDED_SAMPLES[name]) apply(EMBEDDED_SAMPLES[name]);
        else LSUtils.toast('Could not load sample', 'warn');
      });
  }

  function openFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      processInput(String(reader.result || ''));
      LSUtils.toast(`Opened ${file.name}`, 'success');
    };
    reader.onerror = () => LSUtils.toast('Failed to read file', 'error');
    reader.readAsText(file);
  }

  function refreshHistoryPanel() {
    LSUI.renderHistory(LSStorage.getHistory(), (item) => {
      processInput(item.text, { skipHistory: true });
    });
  }

  function bindEvents() {
    const input = inputEl();
    if (input) {
      const onPasteProcess = LSUtils.debounce(() => processInput(), 180);
      input.addEventListener('paste', () => {
        setTimeout(() => processInput(), 0);
      });
      input.addEventListener('input', onPasteProcess);
    }

    document.getElementById('btn-process')?.addEventListener('click', () => processInput());
    document.getElementById('btn-process-pane')?.addEventListener('click', () => processInput());
    document.getElementById('btn-clear')?.addEventListener('click', clearAll);
    document.getElementById('btn-beautify')?.addEventListener('click', beautifyCurrent);
    document.getElementById('btn-minify')?.addEventListener('click', minifyCurrent);
    document.getElementById('btn-repair')?.addEventListener('click', repairCurrent);
    document.getElementById('btn-theme-toggle')?.addEventListener('click', () => LSUI.toggleTheme());

    document.getElementById('btn-copy-formatted')?.addEventListener('click', () => {
      copyFormatted();
      LSUI.closeMenus();
    });
    document.getElementById('btn-copy-minified')?.addEventListener('click', () => {
      copyMinified();
      LSUI.closeMenus();
    });
    document.getElementById('btn-copy-path')?.addEventListener('click', () => {
      copyPath();
      LSUI.closeMenus();
    });

    document.getElementById('btn-download-json')?.addEventListener('click', () => {
      downloadJson();
      LSUI.closeMenus();
    });
    document.getElementById('btn-download-txt')?.addEventListener('click', () => {
      downloadTxt();
      LSUI.closeMenus();
    });

    document.getElementById('btn-expand-all')?.addEventListener('click', () => LSTree.expandAll());
    document.getElementById('btn-collapse-all')?.addEventListener('click', () => LSTree.collapseAll());

    document.getElementById('btn-receipt-preview')?.addEventListener('click', () => {
      if (state.receiptHtml) LSUI.showReceipt(state.receiptHtml);
    });

    document.getElementById('btn-history')?.addEventListener('click', (e) => {
      e.stopPropagation();
      refreshHistoryPanel();
      LSUI.toggleHistory();
    });
    document.getElementById('btn-history-clear')?.addEventListener('click', () => {
      LSStorage.clearHistory();
      refreshHistoryPanel();
      LSUtils.toast('History cleared', 'info');
    });
    document.getElementById('btn-history-close')?.addEventListener('click', () => LSUI.toggleHistory(false));

    document.getElementById('select-indent')?.addEventListener('change', (e) => {
      state.indent = e.target.value;
      LSStorage.setIndent(state.indent);
      if (state.value != null) {
        try {
          const text = LSFormatter.beautify(state.value, state.indent);
          applyFormatted(text, state.value);
        } catch (_) { /* ignore */ }
      }
    });

    // Tabs
    document.querySelectorAll('.output-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        LSUI.switchTab(tab.dataset.tab);
        if (tab.dataset.tab === 'stats') {
          LSUI.renderStats(LSValidator.statsForText(state.formatted || ''));
        }
      });
    });

    // Search
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      searchInput.addEventListener('input', LSUtils.debounce(runSearch, 150));
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          searchInput.value = '';
          runSearch();
        }
      });
    }
    ['search-regex', 'search-case', 'search-keys', 'search-values'].forEach((id) => {
      document.getElementById(id)?.addEventListener('change', runSearch);
    });

    // Compare
    document.getElementById('btn-compare-run')?.addEventListener('click', runCompare);
    document.getElementById('btn-compare-use-current')?.addEventListener('click', useCurrentAsCompareLeft);

    // Samples menu
    document.getElementById('btn-sample-logcat')?.addEventListener('click', () => {
      loadSample('logcat');
      LSUI.closeMenus();
    });
    document.getElementById('btn-sample-formats')?.addEventListener('click', () => {
      loadSample('formats');
      LSUI.closeMenus();
    });
    document.getElementById('btn-sample-message-only')?.addEventListener('click', () => {
      loadSample('messageOnly');
      LSUI.closeMenus();
    });
    document.getElementById('btn-sample-request')?.addEventListener('click', () => {
      loadSample('request');
      LSUI.closeMenus();
    });
    document.getElementById('btn-sample-response')?.addEventListener('click', () => {
      loadSample('response');
      LSUI.closeMenus();
    });
    document.getElementById('btn-sample-json')?.addEventListener('click', () => {
      loadSample('json');
      LSUI.closeMenus();
    });

    // Open file
    document.getElementById('btn-open')?.addEventListener('click', () => {
      document.getElementById('file-open-input')?.click();
    });
    document.getElementById('file-open-input')?.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      openFile(file);
      e.target.value = '';
    });

    // Paste button
    document.getElementById('btn-paste')?.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        processInput(text);
        LSUtils.toast('Pasted from clipboard', 'success');
      } catch (_) {
        inputEl()?.focus();
        LSUtils.toast('Press Ctrl+V in the input pane', 'info');
      }
    });

    // Modal
    document.getElementById('modal-close')?.addEventListener('click', () => LSUI.closeModal());
    document.getElementById('modal-overlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'modal-overlay') LSUI.closeModal();
    });

    // Path bar click to copy
    document.getElementById('json-path')?.addEventListener('click', copyPath);

    // Drag & drop
    const overlay = document.getElementById('drop-overlay');
    let dragDepth = 0;
    window.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dragDepth += 1;
      overlay?.classList.add('visible');
    });
    window.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) overlay?.classList.remove('visible');
    });
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => {
      e.preventDefault();
      dragDepth = 0;
      overlay?.classList.remove('visible');
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) openFile(file);
      else {
        const text = e.dataTransfer && e.dataTransfer.getData('text');
        if (text) processInput(text);
      }
    });

    // Close history on outside click
    document.addEventListener('click', (e) => {
      const panel = document.getElementById('history-panel');
      const btn = document.getElementById('btn-history');
      if (panel && panel.classList.contains('open')) {
        if (!panel.contains(e.target) && e.target !== btn && !btn?.contains(e.target)) {
          LSUI.toggleHistory(false);
        }
      }
    });

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      const meta = e.ctrlKey || e.metaKey;
      const tag = (e.target && e.target.tagName) || '';
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable;

      if (meta && e.key === 'Enter') {
        e.preventDefault();
        processInput();
        return;
      }

      if (meta && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
        e.preventDefault();
        beautifyCurrent();
        return;
      }

      if (meta && !e.shiftKey && (e.key === 'm' || e.key === 'M')) {
        // Avoid hijacking when typing in inputs unless intentional
        if (!typing || e.target === rawEl() || e.target === inputEl()) {
          e.preventDefault();
          minifyCurrent();
        }
        return;
      }

      if (meta && !e.shiftKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        const si = document.getElementById('search-input');
        si?.focus();
        si?.select();
        return;
      }

      if (meta && (e.key === 'o' || e.key === 'O')) {
        e.preventDefault();
        document.getElementById('file-open-input')?.click();
        return;
      }

      if (e.key === 'Escape') {
        LSUI.closeModal();
        LSUI.toggleHistory(false);
        LSUI.closeMenus();
      }
    });
  }

  function initTree() {
    LSTree.init(document.getElementById('tree-container'), {
      onSelect(path) {
        const el = document.getElementById('json-path');
        if (el) el.textContent = path || '$';
        LSUI.setStatus({ 'status-path': path || '$' });
      },
      onChange(value) {
        state.value = value;
        try {
          const text = LSFormatter.beautify(value, getIndent());
          state.formatted = text;
          if (rawEl()) LSUI.renderRawOutput(text);
          LSUI.setValidationBanner(LSValidator.validate(text));
          LSUI.renderStats(LSValidator.statsForText(text));
          state.receiptHtml = LSParser.findReceiptHtml(value);
          LSUI.setReceiptButtonVisible(!!state.receiptHtml);
          updateStatusBar();
        } catch (_) { /* ignore */ }
      }
    });
  }

  function init() {
    LSUI.initTheme();
    LSUI.setupDropdowns();
    LSUI.setupSplitter();
    LSUI.setupRawScrollSync();
    initTree();
    bindEvents();

    const indent = LSStorage.getIndent();
    state.indent = indent;
    const sel = document.getElementById('select-indent');
    if (sel) sel.value = indent;

    LSCompare.renderDiff(document.getElementById('compare-diff'), null);
    LSUI.renderStats(null);
    LSUI.setReceiptButtonVisible(false);
    updateStatusBar();

    // Welcome: if query ?sample=logcat
    const params = new URLSearchParams(window.location.search);
    const sample = params.get('sample');
    if (sample) loadSample(sample);
  }

  return {
    init,
    processInput,
    beautifyCurrent,
    minifyCurrent,
    repairCurrent,
    clearAll,
    loadSample
  };
})();

window.LSApp = LSApp;

document.addEventListener('DOMContentLoaded', () => LSApp.init());
