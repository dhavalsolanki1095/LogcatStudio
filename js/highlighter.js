/**
 * Logcat Studio — JSON syntax highlighter (VS Code-style)
 */
const LSHighlighter = (() => {
  'use strict';

  function highlightJson(text) {
    const src = String(text || '');
    if (!src) return '';

    let out = '';
    let i = 0;
    const len = src.length;

    while (i < len) {
      const ch = src[i];

      if (ch === '"') {
        const start = i;
        i += 1;
        while (i < len) {
          if (src[i] === '\\') {
            i += 2;
            continue;
          }
          if (src[i] === '"') {
            i += 1;
            break;
          }
          i += 1;
        }
        let j = i;
        while (j < len && /\s/.test(src[j])) j += 1;
        const cls = src[j] === ':' ? 'json-key' : 'json-string';
        out += `<span class="${cls}">${LSUtils.escapeHtml(src.slice(start, i))}</span>`;
        continue;
      }

      if (ch === '-' || (ch >= '0' && ch <= '9')) {
        const prev = i > 0 ? src[i - 1] : '\0';
        if (i === 0 || /[\s,\[\{:]/.test(prev)) {
          const start = i;
          if (src[i] === '-') i += 1;
          while (i < len && /[0-9.eE+-]/.test(src[i])) i += 1;
          const token = src.slice(start, i);
          if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(token)) {
            out += `<span class="json-number">${LSUtils.escapeHtml(token)}</span>`;
            continue;
          }
          i = start;
        }
      }

      if (src.startsWith('true', i) && !/[A-Za-z0-9_]/.test(src[i + 4] || '')) {
        out += '<span class="json-boolean">true</span>';
        i += 4;
        continue;
      }
      if (src.startsWith('false', i) && !/[A-Za-z0-9_]/.test(src[i + 5] || '')) {
        out += '<span class="json-boolean">false</span>';
        i += 5;
        continue;
      }
      if (src.startsWith('null', i) && !/[A-Za-z0-9_]/.test(src[i + 4] || '')) {
        out += '<span class="json-null">null</span>';
        i += 4;
        continue;
      }

      if (ch === '{' || ch === '}' || ch === '[' || ch === ']' || ch === ':' || ch === ',') {
        out += `<span class="json-punct">${LSUtils.escapeHtml(ch)}</span>`;
        i += 1;
        continue;
      }

      out += LSUtils.escapeHtml(ch);
      i += 1;
    }

    return out;
  }

  return { highlightJson };
})();

window.LSHighlighter = LSHighlighter;
