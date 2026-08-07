/**
 * Logcat Studio — Interactive JSON Tree View
 */
const LSTree = (() => {
  'use strict';

  let rootValue = null;
  let container = null;
  let selectedPath = '$';
  let searchState = { query: '', regex: false, caseSensitive: false, keys: true, values: true };
  let matchPaths = new Set();
  let onSelect = null;
  let onChange = null;
  let collapsed = new Set(); // paths that are collapsed
  let lazyLimit = 200; // children rendered per level initially
  let nodeIdSeq = 0;

  function pathJoin(parent, key, isIndex) {
    if (parent === '$') {
      return isIndex ? `$[${key}]` : `$.${key}`;
    }
    return isIndex ? `${parent}[${key}]` : `${parent}.${key}`;
  }

  function typeOf(v) {
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'array';
    return typeof v;
  }

  function summary(v) {
    const t = typeOf(v);
    if (t === 'array') return `Array(${v.length})`;
    if (t === 'object') return `Object(${Object.keys(v).length})`;
    return '';
  }

  function matchesSearch(key, value, path) {
    const q = searchState.query;
    if (!q) return false;

    let pattern;
    try {
      if (searchState.regex) {
        pattern = new RegExp(q, searchState.caseSensitive ? '' : 'i');
      } else {
        const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        pattern = new RegExp(esc, searchState.caseSensitive ? '' : 'i');
      }
    } catch (_) {
      return false;
    }

    if (searchState.keys && key != null && pattern.test(String(key))) return true;
    if (searchState.values) {
      const t = typeOf(value);
      if (t === 'string' || t === 'number' || t === 'boolean' || t === 'null') {
        const s = value === null ? 'null' : String(value);
        if (pattern.test(s)) return true;
      }
    }
    return false;
  }

  function collectMatches(value, path, key) {
    if (matchesSearch(key, value, path)) {
      matchPaths.add(path);
    }
    const t = typeOf(value);
    if (t === 'array') {
      value.forEach((item, i) => collectMatches(item, pathJoin(path, i, true), i));
    } else if (t === 'object') {
      Object.keys(value).forEach((k) => collectMatches(value[k], pathJoin(path, k, false), k));
    }
  }

  function getByPath(root, path) {
    if (path === '$') return root;
    // Parse $.a.b[0].c
    const parts = [];
    const re = /(?:\.([A-Za-z_$][\w$]*))|(?:\[(\d+)\])/g;
    let m;
    const body = path.startsWith('$') ? path.slice(1) : path;
    while ((m = re.exec(body))) {
      if (m[1] !== undefined) parts.push({ key: m[1], index: false });
      else parts.push({ key: parseInt(m[2], 10), index: true });
    }
    let cur = root;
    for (const p of parts) {
      if (cur == null) return undefined;
      cur = cur[p.key];
    }
    return cur;
  }

  function setByPath(root, path, newVal) {
    if (path === '$') return newVal;
    const parts = [];
    const re = /(?:\.([A-Za-z_$][\w$]*))|(?:\[(\d+)\])/g;
    let m;
    const body = path.startsWith('$') ? path.slice(1) : path;
    while ((m = re.exec(body))) {
      if (m[1] !== undefined) parts.push(m[1]);
      else parts.push(parseInt(m[2], 10));
    }
    if (!parts.length) return root;
    let cur = root;
    for (let i = 0; i < parts.length - 1; i += 1) {
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = newVal;
    return root;
  }

  function renderPreviews(value) {
    const wrap = document.createElement('span');
    wrap.className = 'tree-preview';

    if (typeof value === 'string') {
      if (LSUtils.isHexColor(value)) {
        const sw = document.createElement('span');
        sw.className = 'tree-swatch';
        sw.style.background = value;
        sw.title = value;
        wrap.appendChild(sw);
      }
      if (LSUtils.isUrl(value)) {
        const a = document.createElement('a');
        a.className = 'tree-link';
        a.href = value;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = '↗';
        a.title = value;
        wrap.appendChild(a);
      }
      if (LSUtils.isImageUrl(value) || LSUtils.isBase64Image(value)) {
        const img = document.createElement('img');
        img.className = 'tree-thumb';
        img.src = value;
        img.alt = 'preview';
        img.title = 'Click to enlarge';
        img.addEventListener('click', (e) => {
          e.stopPropagation();
          if (typeof window.LSUI !== 'undefined' && LSUI.showImagePreview) {
            LSUI.showImagePreview(value);
          }
        });
        wrap.appendChild(img);
      }
      if (LSUtils.isUuid(value)) {
        const badge = document.createElement('span');
        badge.className = 'tree-badge';
        badge.textContent = 'UUID';
        wrap.appendChild(badge);
      }
    }

    if (typeof value === 'number') {
      const formatted = LSUtils.formatTimestamp(value);
      if (formatted) {
        const badge = document.createElement('span');
        badge.className = 'tree-badge';
        badge.textContent = formatted;
        badge.title = 'Unix timestamp';
        wrap.appendChild(badge);
      }
    }

    return wrap.childNodes.length ? wrap : null;
  }

  function formatPrimitive(value) {
    const t = typeOf(value);
    if (t === 'string') return JSON.stringify(value);
    if (t === 'null') return 'null';
    return String(value);
  }

  function parseEditedValue(text, previous) {
    const trimmed = text.trim();
    if (trimmed === 'null') return null;
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(trimmed)) return Number(trimmed);
    // If user kept quotes from JSON.stringify
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
      try {
        return JSON.parse(trimmed.replace(/^'/, '"').replace(/'$/, '"'));
      } catch (_) {
        return trimmed.slice(1, -1);
      }
    }
    // Default: if previous was string, keep as string without forcing quotes
    if (typeof previous === 'string') return trimmed;
    try {
      return JSON.parse(trimmed);
    } catch (_) {
      return trimmed;
    }
  }

  function createRow(key, value, path, isIndex, depth) {
    const t = typeOf(value);
    const isExpandable = t === 'object' || t === 'array';
    const row = document.createElement('div');
    row.className = 'tree-row';
    row.dataset.path = path;
    if (path === selectedPath) row.classList.add('selected');
    if (matchPaths.has(path)) row.classList.add('match');

    const indent = document.createElement('span');
    indent.className = 'tree-indent';
    indent.style.width = `${depth * 16 + 4}px`;
    row.appendChild(indent);

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'tree-toggle';
    if (isExpandable) {
      const isCollapsed = collapsed.has(path);
      toggle.textContent = isCollapsed ? '▶' : '▼';
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        if (collapsed.has(path)) collapsed.delete(path);
        else collapsed.add(path);
        render();
      });
    } else {
      toggle.textContent = '';
      toggle.style.visibility = 'hidden';
    }
    row.appendChild(toggle);

    if (key !== null && key !== undefined && path !== '$') {
      const keyEl = document.createElement('span');
      keyEl.className = 'tree-key';
      keyEl.textContent = isIndex ? String(key) : String(key);
      keyEl.title = path;
      row.appendChild(keyEl);

      const colon = document.createElement('span');
      colon.className = 'tree-colon';
      colon.textContent = ':';
      row.appendChild(colon);
    }

    const valEl = document.createElement('span');
    valEl.className = `tree-value ${t}`;

    if (isExpandable) {
      valEl.textContent = summary(value);
      valEl.classList.add(t);
    } else {
      valEl.textContent = formatPrimitive(value);
      valEl.classList.add('editable');
      valEl.contentEditable = 'true';
      valEl.spellcheck = false;
      valEl.title = 'Click to edit, Enter to save, Esc to cancel';

      let original = valEl.textContent;
      valEl.addEventListener('focus', () => {
        original = valEl.textContent;
      });
      valEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          valEl.blur();
        } else if (e.key === 'Escape') {
          valEl.textContent = original;
          valEl.blur();
        }
      });
      valEl.addEventListener('blur', () => {
        const next = parseEditedValue(valEl.textContent, value);
        if (JSON.stringify(next) !== JSON.stringify(value)) {
          rootValue = setByPath(rootValue, path, next);
          if (onChange) onChange(rootValue);
          render();
        } else {
          valEl.textContent = formatPrimitive(value);
        }
      });
      valEl.addEventListener('click', (e) => e.stopPropagation());
    }
    row.appendChild(valEl);

    const preview = renderPreviews(value);
    if (preview) row.appendChild(preview);

    // Actions
    const actions = document.createElement('span');
    actions.className = 'tree-actions';

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'tree-action-btn';
    copyBtn.textContent = 'Copy';
    copyBtn.title = 'Copy node JSON';
    copyBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const text = JSON.stringify(value, null, 2);
      const ok = await LSUtils.copyText(text);
      LSUtils.toast(ok ? 'Node copied' : 'Copy failed', ok ? 'success' : 'error');
    });
    actions.appendChild(copyBtn);

    if (path !== '$') {
      const dupBtn = document.createElement('button');
      dupBtn.type = 'button';
      dupBtn.className = 'tree-action-btn';
      dupBtn.textContent = 'Dup';
      dupBtn.title = 'Duplicate node (arrays / sibling key)';
      dupBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        duplicateNode(path);
      });
      actions.appendChild(dupBtn);
    }

    row.appendChild(actions);

    row.addEventListener('click', () => {
      selectedPath = path;
      document.querySelectorAll('.tree-row.selected').forEach((el) => el.classList.remove('selected'));
      row.classList.add('selected');
      if (onSelect) onSelect(path, value);
    });

    return { row, isExpandable };
  }

  function duplicateNode(path) {
    // Duplicate within parent array, or create key_copy for objects
    const re = /^(.*)(?:\.([A-Za-z_$][\w$]*)|\[(\d+)\])$/;
    const m = path.match(re);
    if (!m) return;
    const parentPath = m[1] || '$';
    const parent = getByPath(rootValue, parentPath);
    if (parent == null) return;

    if (m[3] !== undefined) {
      const idx = parseInt(m[3], 10);
      const clone = LSUtils.deepClone(parent[idx]);
      parent.splice(idx + 1, 0, clone);
    } else {
      const key = m[2];
      let newKey = `${key}_copy`;
      let n = 2;
      while (Object.prototype.hasOwnProperty.call(parent, newKey)) {
        newKey = `${key}_copy${n++}`;
      }
      parent[newKey] = LSUtils.deepClone(parent[key]);
    }
    if (onChange) onChange(rootValue);
    render();
    LSUtils.toast('Node duplicated', 'success');
  }

  function buildNode(key, value, path, isIndex, depth, frag) {
    const { row, isExpandable } = createRow(key, value, path, isIndex, depth);
    const wrap = document.createElement('div');
    wrap.className = 'tree-node';
    wrap.appendChild(row);

    if (isExpandable && !collapsed.has(path)) {
      const children = document.createElement('div');
      children.className = 'tree-children';

      if (Array.isArray(value)) {
        const limit = Math.min(value.length, lazyLimit);
        for (let i = 0; i < limit; i += 1) {
          buildNode(i, value[i], pathJoin(path, i, true), true, depth + 1, children);
        }
        if (value.length > lazyLimit) {
          const more = document.createElement('div');
          more.className = 'tree-row';
          more.style.paddingLeft = `${(depth + 1) * 16 + 24}px`;
          more.style.color = 'var(--ls-text-muted)';
          more.style.fontSize = '11px';
          more.textContent = `… ${value.length - lazyLimit} more items (expand parent after search to refine)`;
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'tree-action-btn';
          btn.textContent = 'Show all';
          btn.addEventListener('click', () => {
            lazyLimit = Math.max(lazyLimit, value.length);
            render();
          });
          more.appendChild(btn);
          children.appendChild(more);
        }
      } else {
        const keys = Object.keys(value);
        const limit = Math.min(keys.length, lazyLimit);
        for (let i = 0; i < limit; i += 1) {
          const k = keys[i];
          buildNode(k, value[k], pathJoin(path, k, false), false, depth + 1, children);
        }
        if (keys.length > lazyLimit) {
          const more = document.createElement('div');
          more.className = 'tree-row';
          more.style.paddingLeft = `${(depth + 1) * 16 + 24}px`;
          more.style.color = 'var(--ls-text-muted)';
          more.textContent = `… ${keys.length - lazyLimit} more keys `;
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'tree-action-btn';
          btn.textContent = 'Show all';
          btn.addEventListener('click', () => {
            lazyLimit = Math.max(lazyLimit, keys.length);
            render();
          });
          more.appendChild(btn);
          children.appendChild(more);
        }
      }
      wrap.appendChild(children);
    }

    frag.appendChild(wrap);
  }

  function render() {
    if (!container) return;
    container.innerHTML = '';

    if (rootValue === undefined || rootValue === null && arguments.length === 0) {
      // allow null as valid JSON
    }

    if (rootValue === undefined) {
      container.innerHTML = `
        <div class="tree-empty">
          <div class="ph-icon">{ }</div>
          <div class="ph-title">No JSON loaded</div>
          <div class="ph-hint">Paste Logcat output or JSON on the left. Tree view appears here automatically.</div>
        </div>`;
      return;
    }

    matchPaths = new Set();
    if (searchState.query) {
      collectMatches(rootValue, '$', null);
    }

    const frag = document.createDocumentFragment();
    buildNode(null, rootValue, '$', false, 0, frag);
    container.appendChild(frag);

    if (onSelect) {
      onSelect(selectedPath, getByPath(rootValue, selectedPath));
    }
  }

  function setData(value) {
    rootValue = value;
    selectedPath = '$';
    collapsed = new Set();
    lazyLimit = 200;
    // Collapse deep roots lightly: leave root expanded
    render();
  }

  function clear() {
    rootValue = undefined;
    selectedPath = '$';
    matchPaths = new Set();
    collapsed = new Set();
    if (container) {
      container.innerHTML = `
        <div class="tree-empty">
          <div class="ph-icon">{ }</div>
          <div class="ph-title">No JSON loaded</div>
          <div class="ph-hint">Paste Logcat output or JSON on the left. Tree view appears here automatically.</div>
        </div>`;
    }
  }

  function expandAll() {
    collapsed.clear();
    render();
  }

  function collapseAll() {
    // Collapse every expandable path
    collapsed.clear();
    function walk(node, path) {
      const t = typeOf(node);
      if (t === 'array' || t === 'object') {
        if (path !== '$') collapsed.add(path);
        else collapsed.add('$');
        if (Array.isArray(node)) {
          node.forEach((item, i) => walk(item, pathJoin(path, i, true)));
        } else {
          Object.keys(node).forEach((k) => walk(node[k], pathJoin(path, k, false)));
        }
      }
    }
    if (rootValue !== undefined) walk(rootValue, '$');
    // Keep root visible but collapsed children — actually collapse root's children only
    collapsed.delete('$');
    render();
  }

  function setSearch(opts) {
    searchState = { ...searchState, ...opts };
    render();
    return matchPaths.size;
  }

  function getData() {
    return rootValue;
  }

  function getSelectedPath() {
    return selectedPath;
  }

  function getMatchCount() {
    return matchPaths.size;
  }

  function init(el, handlers) {
    container = el;
    onSelect = handlers && handlers.onSelect;
    onChange = handlers && handlers.onChange;
    clear();
  }

  return {
    init,
    setData,
    clear,
    render,
    expandAll,
    collapseAll,
    setSearch,
    getData,
    getSelectedPath,
    getMatchCount,
    getByPath,
    pathJoin
  };
})();

window.LSTree = LSTree;
