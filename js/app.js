/**
 * Logcat Studio — Application controller
 */
const LSApp = (() => {
  'use strict';

  const state = {
    inputRaw: '',
    blocks: [],
    activeBlock: -1,
    apiCalls: [],
    activeApi: -1,
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
      'status-apis': state.apiCalls.length ? String(state.apiCalls.length) : '0',
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

    // Keep Compare left in sync with selected JSON block
    const left = document.getElementById('compare-left');
    if (left && text) {
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

  function bindApiDetailActions() {
    const getCall = () =>
      state.activeApi >= 0 ? state.apiCalls[state.activeApi] : null;

    document.getElementById('btn-api-copy-full')?.addEventListener('click', async () => {
      const call = getCall();
      if (!call) return;
      const text =
        typeof LSApiExtractor !== 'undefined'
          ? LSApiExtractor.formatFullDetails(call)
          : '';
      const ok = await LSUtils.copyText(text);
      LSUtils.toast(ok ? 'Full API details copied — ready to share' : 'Copy failed', ok ? 'success' : 'error');
    });
    document.getElementById('btn-api-copy-url')?.addEventListener('click', async () => {
      const call = getCall();
      if (!call) return;
      const ok = await LSUtils.copyText(call.url || '');
      LSUtils.toast(ok ? 'URL copied' : 'Copy failed', ok ? 'success' : 'error');
    });
    document.getElementById('btn-api-copy-request')?.addEventListener('click', async () => {
      const call = getCall();
      if (!call) return;
      const text =
        call.request.bodyValid && call.request.body != null
          ? LSFormatter.beautify(call.request.body, getIndent())
          : call.request.bodyRaw || '';
      const ok = await LSUtils.copyText(text);
      LSUtils.toast(ok ? 'Request body copied' : 'Copy failed', ok ? 'success' : 'error');
    });
    document.getElementById('btn-api-copy-response')?.addEventListener('click', async () => {
      const call = getCall();
      if (!call) return;
      const text =
        call.response.bodyValid && call.response.body != null
          ? LSFormatter.beautify(call.response.body, getIndent())
          : call.response.bodyRaw || '';
      const ok = await LSUtils.copyText(text);
      LSUtils.toast(ok ? 'Response body copied' : 'Copy failed', ok ? 'success' : 'error');
    });
    document.getElementById('btn-api-use-response-json')?.addEventListener('click', () => {
      const call = getCall();
      if (!call) return;
      if (call.response.bodyValid && call.response.body != null) {
        try {
          const text = LSFormatter.beautify(call.response.body, getIndent());
          applyFormatted(text, call.response.body);
          LSUI.switchTab('raw');
          LSUtils.toast('Response opened in Raw', 'success');
        } catch (_) {
          LSUtils.toast('Could not open response JSON', 'error');
        }
      } else if (call.response.bodyRaw) {
        applyFormatted(call.response.bodyRaw, null);
        LSUI.switchTab('raw');
      } else {
        LSUtils.toast('No response body', 'warn');
      }
    });
  }

  function selectApiCall(index) {
    if (index < 0 || index >= state.apiCalls.length) return;
    state.activeApi = index;
    LSUI.renderApiCalls(state.apiCalls, index, selectApiCall);
  }

  function refreshApiPanel() {
    if (!state.apiCalls.length) {
      state.activeApi = -1;
      LSUI.renderApiCalls([], -1, selectApiCall);
      return;
    }
    const idx = state.activeApi >= 0 ? state.activeApi : 0;
    selectApiCall(idx);
  }

  function buildRawBlocks(parserBlocks, apiCalls) {
    const fromParser = Array.isArray(parserBlocks) ? parserBlocks.slice() : [];
    const calls = Array.isArray(apiCalls) ? apiCalls : [];
    const seen = new Set();
    const out = [];

    function add(block) {
      if (!block) return;
      if (block.valid && block.value != null) {
        try {
          let key;
          if (block.raw && block.raw.length > 80000) {
            key =
              'L:' +
              block.raw.length +
              ':' +
              block.raw.slice(0, 80) +
              ':' +
              block.raw.slice(-40);
          } else {
            key = JSON.stringify(block.value);
          }
          if (seen.has(key)) return;
          seen.add(key);
        } catch (_) {
          /* still add */
        }
      }
      out.push(block);
    }

    calls.forEach((call, i) => {
      const pathShort = String(call.path || call.url || '').split('?')[0];
      [
        { part: call.response, kind: 'Response' },
        { part: call.request, kind: 'Request' }
      ].forEach(({ part, kind }) => {
        if (!part || !part.bodyValid || part.body == null) return;
        // Keep compact raw here — beautify on select (avoids freezing on many large bodies)
        let rawText = part.bodyRaw || '';
        if (!rawText && part.body != null) {
          try {
            rawText = JSON.stringify(part.body);
          } catch (_) {
            rawText = String(part.body);
          }
        }
        const sizeBytes =
          rawText
            ? new Blob([rawText]).size
            : part.bodyBytes != null
              ? part.bodyBytes
              : null;
        add({
          raw: rawText,
          value: part.body,
          valid: true,
          source: 'api',
          apiIndex: i,
          method: call.method || '?',
          path: pathShort || call.url || '',
          status: kind === 'Response' ? call.status : null,
          durationMs: kind === 'Response' ? call.durationMs : null,
          bodyBytes: sizeBytes,
          kind,
          label: `${call.method || '?'} ${pathShort} · ${kind}${
            call.status != null && kind === 'Response' ? ' · ' + call.status : ''
          }`
        });
      });
    });

    fromParser.forEach(add);
    return out.length ? out : fromParser;
  }

  function processInput(raw, options) {
    const opts = options || {};
    let incoming;
    if (raw != null) {
      incoming = raw;
    } else {
      const elVal = inputEl() ? inputEl().value : '';
      // Prefer full in-memory text when the input pane is showing a truncated preview
      if (
        state.inputRaw &&
        elVal &&
        (elVal.includes('… [truncated') || elVal.includes('full export JSON is not shown'))
      ) {
        incoming = state.inputRaw;
      } else {
        incoming = elVal;
      }
    }

    if (!String(incoming || '').trim()) {
      state.blocks = [];
      state.activeBlock = -1;
      state.apiCalls = [];
      state.activeApi = -1;
      state.inputType = 'empty';
      state.inputRaw = '';
      if (inputEl() && raw != null) inputEl().value = '';
      applyFormatted('', null);
      LSUI.renderBlockChips([], -1, selectBlock);
      LSUI.renderApiCalls([], -1, selectApiCall);
      LSUI.setValidationBanner({ skip: true });
      updateStatusBar();
      return;
    }

    // Expand Android Studio .logcat once (avoids treating multi‑MB export as one JSON)
    const prepared =
      typeof LSParser.prepareInput === 'function'
        ? LSParser.prepareInput(incoming)
        : { workText: String(incoming), studioExport: false, messageCount: 0, originalSize: String(incoming).length };

    const text = prepared.workText;
    state.inputRaw = text || '';

    // Never dump multi‑MB studio JSON into the textarea (Chrome hangs)
    if (inputEl() && (raw != null || prepared.studioExport)) {
      const INPUT_DISPLAY_MAX = 120000;
      if (prepared.studioExport) {
        const header =
          `[Android Studio .logcat — ${prepared.messageCount} messages · ${LSUtils.formatBytes(
            prepared.originalSize
          )}]\n` +
          `Message lines loaded for processing (full export JSON is not shown).\n\n`;
        const body =
          text.length > INPUT_DISPLAY_MAX
            ? text.slice(0, INPUT_DISPLAY_MAX) + '\n\n… [truncated in input pane — full data still processed]'
            : text;
        inputEl().value = header + body;
      } else if (text.length > INPUT_DISPLAY_MAX) {
        inputEl().value =
          text.slice(0, INPUT_DISPLAY_MAX) +
          `\n\n… [truncated in input pane — ${LSUtils.formatBytes(text.length)} total still processed]`;
      } else if (raw != null) {
        inputEl().value = text;
      }
    }

    const runHeavy = () => {
      state.processing = true;
      try {
        const largeStudio =
          prepared.studioExport &&
          (prepared.messageCount > 1500 || text.length > 400000);

        let result;
        if (largeStudio) {
          // Fast path: skip full JSON-line merge (was hanging Chrome on multi‑MB exports).
          // API Calls + their JSON bodies are extracted instead.
          result = {
            type: 'logcat',
            blocks: [],
            primaryIndex: -1,
            cleaned: ''
          };
        } else {
          result = LSParser.process(text);
        }
        state.inputType = prepared.studioExport ? 'logcat' : result.type;

        try {
          state.apiCalls =
            typeof LSApiExtractor !== 'undefined' ? LSApiExtractor.extract(text) : [];
        } catch (_) {
          state.apiCalls = [];
        }
        state.activeApi = state.apiCalls.length ? 0 : -1;

        state.blocks = buildRawBlocks(result.blocks, state.apiCalls);
        let primaryIndex = result.primaryIndex;
        if (primaryIndex < 0 && state.blocks.length) primaryIndex = 0;
        if (state.apiCalls.length && state.blocks.length && state.blocks[0].source === 'api') {
          primaryIndex = 0;
        }

        refreshApiPanel();

        if (!opts.skipHistory && (state.blocks.length || state.apiCalls.length)) {
          const previewSource = state.blocks[primaryIndex >= 0 ? primaryIndex : 0];
          const apiPreview =
            state.apiCalls[0] && typeof LSApiExtractor !== 'undefined'
              ? LSApiExtractor.summarize(state.apiCalls[0])
              : '';
          const histText = text.length > 80000 ? text.slice(0, 80000) : text;
          LSStorage.addHistory({
            text: histText,
            preview: previewSource ? previewSource.raw : apiPreview || text,
            type: state.inputType
          });
        }

        if (primaryIndex >= 0 && state.blocks.length) {
          selectBlock(primaryIndex);
        } else {
          LSUI.renderBlockChips([], -1, selectBlock);
          applyFormatted('', null);
          if (state.apiCalls.length) {
            LSUI.switchTab('api');
            if (!opts.fromFile) {
              LSUtils.toast(`Found ${state.apiCalls.length} API call(s)`, 'success');
            }
          } else if (!opts.fromFile) {
            LSUtils.toast('No JSON or API calls found in input', 'warn');
          }
        }

        if (prepared.studioExport && state.apiCalls.length) {
          LSUI.switchTab('api');
        }

        if (opts.fromFile) {
          const name = opts.fromFile;
          if (state.apiCalls.length) {
            LSUI.switchTab('api');
            LSUtils.toast(`Opened ${name} · ${state.apiCalls.length} API call(s)`, 'success');
          } else if (state.blocks.length) {
            LSUI.switchTab('raw');
            LSUtils.toast(`Opened ${name} · ${state.blocks.length} JSON`, 'success');
          } else {
            LSUtils.toast(`Opened ${name} — no API/JSON found`, 'warn');
          }
          if (opts.focusInput && inputEl()) inputEl().focus();
        }
      } catch (err) {
        console.error(err);
        LSUtils.toast('Processing failed — file may be too large or invalid', 'error');
      } finally {
        state.processing = false;
        updateStatusBar();
      }
    };

    // Yield to the browser so the UI can paint before heavy parse work
    const heavy = prepared.studioExport || text.length > 150000;
    if (heavy) {
      LSUtils.toast(
        prepared.studioExport
          ? `Processing ${prepared.messageCount} log messages…`
          : 'Processing large file…',
        'info'
      );
      setTimeout(runHeavy, 30);
    } else {
      runHeavy();
    }
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

  function selectedBlockLabel() {
    const i = state.activeBlock;
    const b = i >= 0 ? state.blocks[i] : null;
    if (!b) return 'selected JSON';
    if (b.label) return b.label;
    if (b.valid && b.value && typeof b.value === 'object' && !Array.isArray(b.value)) {
      if (b.value.id != null) return `id ${b.value.id}`;
      if (b.value.current_page != null) return `list page ${b.value.current_page}`;
    }
    return `JSON ${i + 1} of ${state.blocks.length}`;
  }

  function safeFileSlug(label) {
    return String(label || 'json')
      .replace(/[<>:"/\\|?*\s]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 60) || 'json';
  }

  async function copyFormatted() {
    const text = state.formatted || (rawEl() && rawEl().value) || '';
    if (!text) {
      LSUtils.toast('No JSON selected to copy', 'warn');
      return;
    }
    const ok = await LSUtils.copyText(text);
    LSUtils.toast(
      ok ? `Copied formatted · ${selectedBlockLabel()}` : 'Copy failed',
      ok ? 'success' : 'error'
    );
  }

  async function copyMinified() {
    try {
      const text = LSFormatter.minify(state.value != null ? state.value : (rawEl() && rawEl().value));
      const ok = await LSUtils.copyText(text);
      LSUtils.toast(
        ok ? `Copied minified · ${selectedBlockLabel()}` : 'Copy failed',
        ok ? 'success' : 'error'
      );
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
    if (!text) {
      LSUtils.toast('No JSON selected to download', 'warn');
      return;
    }
    const name = `logcat-${safeFileSlug(selectedBlockLabel())}.json`;
    LSUtils.downloadText(name, text, 'application/json;charset=utf-8');
    LSUtils.toast(`Downloaded · ${selectedBlockLabel()}`, 'success');
  }

  function downloadTxt() {
    const text = state.formatted || (rawEl() && rawEl().value) || '';
    if (!text) {
      LSUtils.toast('No JSON selected to download', 'warn');
      return;
    }
    const name = `logcat-${safeFileSlug(selectedBlockLabel())}.txt`;
    LSUtils.downloadText(name, text, 'text/plain;charset=utf-8');
    LSUtils.toast(`Downloaded · ${selectedBlockLabel()}`, 'success');
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

  function isSupportedDropFile(file) {
    if (!file) return false;
    const name = String(file.name || '').toLowerCase();
    if (/\.(json|txt|log|logcat|text|md)$/i.test(name)) return true;
    const type = String(file.type || '').toLowerCase();
    // Windows often gives empty / octet-stream for .logcat
    if ((type === '' || type === 'application/octet-stream') && name.includes('.')) {
      return /\.logcat$/i.test(name);
    }
    return type.includes('json') || type.startsWith('text/');
  }

  function openFile(file, options) {
    const opts = options || {};
    if (!file) return;

    if (!isSupportedDropFile(file)) {
      LSUtils.toast(`Unsupported file: ${file.name}. Use .logcat, .log, .txt, or .json`, 'warn');
      return;
    }

    const sizeMb = file.size / (1024 * 1024);
    if (sizeMb > 1.5) {
      LSUtils.toast(`Reading ${file.name} (${sizeMb.toFixed(1)} MB)…`, 'info');
    }

    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      // Yield so Chrome can paint before parse (prevents Page Unresponsive)
      setTimeout(() => {
        processInput(text, {
          fromFile: file.name,
          focusInput: opts.focusInput
        });
      }, 20);
    };
    reader.onerror = () => LSUtils.toast(`Failed to read ${file.name}`, 'error');
    reader.readAsText(file);
  }

  function handleDroppedFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return false;
    const supported = files.filter(isSupportedDropFile);
    if (!supported.length) {
      LSUtils.toast('Drop a .logcat, .log, .txt, or .json file', 'warn');
      return true;
    }
    if (supported.length > 1) {
      LSUtils.toast(`Opening ${supported[0].name} (${supported.length} files dropped — using first)`, 'info');
    }
    openFile(supported[0]);
    return true;
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
    bindApiDetailActions();

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
        if (tab.dataset.tab === 'api') {
          refreshApiPanel();
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

    // Open file
    document.getElementById('btn-open')?.addEventListener('click', () => {
      document.getElementById('file-open-input')?.click();
    });
    document.getElementById('btn-open-pane')?.addEventListener('click', () => {
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

    // Drag & drop (window + input pane) — Logcat / JSON / .logcat
    const overlay = document.getElementById('drop-overlay');
    const inputPane = document.getElementById('input-pane');
    let dragDepth = 0;

    function hasFiles(e) {
      const types = e.dataTransfer && e.dataTransfer.types;
      if (!types) return false;
      return (
        (typeof types.includes === 'function' && types.includes('Files')) ||
        (typeof types.contains === 'function' && types.contains('Files')) ||
        Array.from(types).indexOf('Files') >= 0
      );
    }

    function showDrop(on) {
      overlay?.classList.toggle('visible', on);
      overlay?.setAttribute('aria-hidden', on ? 'false' : 'true');
      inputPane?.classList.toggle('drop-target', on);
    }

    window.addEventListener('dragenter', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth += 1;
      showDrop(true);
    });
    window.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) showDrop(false);
    });
    window.addEventListener('dragover', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      showDrop(true);
    });
    window.addEventListener('drop', (e) => {
      e.preventDefault();
      dragDepth = 0;
      showDrop(false);
      const files = e.dataTransfer && e.dataTransfer.files;
      if (files && files.length) {
        handleDroppedFiles(files);
        return;
      }
      const text = e.dataTransfer && e.dataTransfer.getData('text');
      if (text) processInput(text);
    });

    // Also accept drops directly on the input editor
    if (input) {
      input.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      });
      input.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragDepth = 0;
        showDrop(false);
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
          handleDroppedFiles(e.dataTransfer.files);
        }
      });
    }

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
  }

  return {
    init,
    processInput,
    beautifyCurrent,
    minifyCurrent,
    repairCurrent,
    clearAll
  };
})();

window.LSApp = LSApp;

document.addEventListener('DOMContentLoaded', () => LSApp.init());
