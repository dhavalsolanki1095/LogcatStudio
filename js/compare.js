/**
 * Logcat Studio — Side-by-side JSON comparison
 */
const LSCompare = (() => {
  'use strict';

  function typeOf(v) {
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'array';
    return typeof v;
  }

  function pathJoin(parent, key, isIndex) {
    if (parent === '$') return isIndex ? `$[${key}]` : `$.${key}`;
    return isIndex ? `${parent}[${key}]` : `${parent}.${key}`;
  }

  /**
   * Diff two JSON values. Returns array of { path, type: added|removed|changed|same, left, right }
   */
  function diff(left, right, path, out) {
    const p = path || '$';
    const result = out || [];
    const lt = typeOf(left);
    const rt = typeOf(right);

    if (lt !== rt) {
      result.push({ path: p, type: 'changed', left, right });
      return result;
    }

    if (lt !== 'object' && lt !== 'array') {
      if (left !== right) {
        // NaN edge
        if (!(typeof left === 'number' && typeof right === 'number' && Number.isNaN(left) && Number.isNaN(right))) {
          result.push({ path: p, type: 'changed', left, right });
        }
      }
      return result;
    }

    if (lt === 'array') {
      const max = Math.max(left.length, right.length);
      for (let i = 0; i < max; i += 1) {
        const child = pathJoin(p, i, true);
        if (i >= left.length) {
          result.push({ path: child, type: 'added', left: undefined, right: right[i] });
        } else if (i >= right.length) {
          result.push({ path: child, type: 'removed', left: left[i], right: undefined });
        } else {
          diff(left[i], right[i], child, result);
        }
      }
      return result;
    }

    // object
    const keys = Array.from(new Set([...Object.keys(left), ...Object.keys(right)])).sort();
    keys.forEach((k) => {
      const child = pathJoin(p, k, false);
      const hasL = Object.prototype.hasOwnProperty.call(left, k);
      const hasR = Object.prototype.hasOwnProperty.call(right, k);
      if (!hasL) {
        result.push({ path: child, type: 'added', left: undefined, right: right[k] });
      } else if (!hasR) {
        result.push({ path: child, type: 'removed', left: left[k], right: undefined });
      } else {
        diff(left[k], right[k], child, result);
      }
    });

    return result;
  }

  function formatValue(v) {
    if (v === undefined) return '';
    try {
      return JSON.stringify(v);
    } catch (_) {
      return String(v);
    }
  }

  function compareTexts(leftText, rightText) {
    const leftParse = LSUtils.safeJsonParse(leftText);
    const rightParse = LSUtils.safeJsonParse(rightText);

    if (!leftParse.ok || !rightParse.ok) {
      return {
        ok: false,
        error: !leftParse.ok
          ? `Left JSON invalid: ${leftParse.error.message}`
          : `Right JSON invalid: ${rightParse.error.message}`,
        changes: []
      };
    }

    const changes = diff(leftParse.value, rightParse.value).filter((c) => c.type !== 'same');
    return {
      ok: true,
      error: null,
      changes,
      left: leftParse.value,
      right: rightParse.value,
      summary: {
        added: changes.filter((c) => c.type === 'added').length,
        removed: changes.filter((c) => c.type === 'removed').length,
        changed: changes.filter((c) => c.type === 'changed').length
      }
    };
  }

  function renderDiff(container, compareResult) {
    if (!container) return;
    container.innerHTML = '';

    if (!compareResult) {
      container.innerHTML = '<div class="diff-empty">Paste JSON on both sides and click Compare.</div>';
      return;
    }

    if (!compareResult.ok) {
      container.innerHTML = `<div class="diff-empty">${LSUtils.escapeHtml(compareResult.error)}</div>`;
      return;
    }

    if (!compareResult.changes.length) {
      container.innerHTML = '<div class="diff-empty">No differences — JSON values are equal.</div>';
      return;
    }

    const frag = document.createDocumentFragment();
    compareResult.changes.forEach((c) => {
      const line = document.createElement('div');
      line.className = `diff-line ${c.type}`;

      const prefix = document.createElement('span');
      prefix.className = 'diff-prefix';
      prefix.textContent = c.type === 'added' ? '+' : c.type === 'removed' ? '−' : '~';
      line.appendChild(prefix);

      const path = document.createElement('span');
      path.className = 'diff-path';
      path.textContent = c.path;
      line.appendChild(path);

      const detail = document.createElement('span');
      if (c.type === 'added') {
        detail.textContent = formatValue(c.right);
      } else if (c.type === 'removed') {
        detail.textContent = formatValue(c.left);
      } else {
        detail.textContent = `${formatValue(c.left)} → ${formatValue(c.right)}`;
      }
      line.appendChild(detail);
      frag.appendChild(line);
    });
    container.appendChild(frag);
  }

  return {
    diff,
    compareTexts,
    renderDiff
  };
})();

window.LSCompare = LSCompare;
