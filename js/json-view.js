/**
 * Logcat Studio — Foldable JSON viewer with line numbers
 * VS Code-style gutter folds for objects / arrays
 */
const LSJsonView = (() => {
  'use strict';

  const HIGHLIGHT_MAX = 120000;

  function findFolds(text) {
    const lines = String(text || '').split('\n');
    const folds = [];
    const stack = [];

    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      let inString = false;
      let escape = false;

      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inString) {
          if (escape) {
            escape = false;
            continue;
          }
          if (ch === '\\') {
            escape = true;
            continue;
          }
          if (ch === '"') inString = false;
          continue;
        }
        if (ch === '"') {
          inString = true;
          continue;
        }
        if (ch === '{' || ch === '[') {
          stack.push({ line: li, ch });
        } else if (ch === '}' || ch === ']') {
          const open = stack.pop();
          if (open && open.line < li) {
            folds.push({ start: open.line, end: li });
          }
        }
      }
    }

    const byStart = new Map();
    folds.forEach((f) => {
      const prev = byStart.get(f.start);
      if (!prev || f.end > prev.end) byStart.set(f.start, f);
    });

    return { lines, byStart };
  }

  function lineHidden(lineIndex, collapsed, byStart) {
    for (const start of collapsed) {
      const fold = byStart.get(start);
      if (fold && lineIndex > fold.start && lineIndex <= fold.end) return true;
    }
    return false;
  }

  function highlightLine(line, enable) {
    if (!enable || typeof LSHighlighter === 'undefined') {
      return LSUtils.escapeHtml(line);
    }
    return LSHighlighter.highlightJson(line);
  }

  function buildViewerHtml(text, collapsed, opts) {
    const enableFolds = !!(opts && opts.folds);
    const enableHighlight = !!(opts && opts.highlight);
    const { lines, byStart } = findFolds(text);
    const gutterWidth = String(Math.max(lines.length, 1)).length;
    const parts = [];

    parts.push('<div class="jv-scroll">');
    for (let i = 0; i < lines.length; i++) {
      if (enableFolds && lineHidden(i, collapsed, byStart)) continue;

      const fold = enableFolds ? byStart.get(i) : null;
      const isCollapsed = fold && collapsed.has(i);
      const hasFold = !!fold;

      let foldBtn = '<span class="jv-fold-spacer"></span>';
      if (hasFold) {
        const icon = isCollapsed ? '▶' : '▼';
        const label = isCollapsed ? 'Expand' : 'Collapse';
        foldBtn = `<button type="button" class="jv-fold" data-fold-start="${i}" title="${label}" aria-label="${label} block">${icon}</button>`;
      }

      const lineNum = String(i + 1).padStart(gutterWidth, ' ');
      let content = highlightLine(lines[i], enableHighlight);
      if (isCollapsed) {
        content += ` <button type="button" class="jv-ellipsis" data-fold-start="${i}" title="Expand">···</button>`;
      }

      parts.push(
        `<div class="jv-line${isCollapsed ? ' jv-collapsed' : ''}" data-line="${i}">` +
          `<span class="jv-gutter">` +
          `<span class="jv-lineno">${lineNum}</span>` +
          foldBtn +
          `</span>` +
          `<span class="jv-code">${content}</span>` +
          `</div>`
      );
    }
    parts.push('</div>');

    return { html: parts.join(''), byStart, lineCount: lines.length };
  }

  /**
   * Mount a foldable viewer into container.
   * Returns controller: { update, expandAll, collapseAll, getText, destroy }
   */
  function mount(container, text, options) {
    if (!container) return null;

    const opts = Object.assign(
      {
        folds: true,
        highlight: true,
        startCollapsed: false
      },
      options || {}
    );

    const state = {
      text: String(text || ''),
      collapsed: new Set(),
      byStart: new Map(),
      destroyed: false
    };

    function initCollapsed() {
      state.collapsed.clear();
      if (!opts.folds || !opts.startCollapsed) return;
      const { byStart } = findFolds(state.text);
      byStart.forEach((_, start) => {
        // Collapse nested blocks by default, keep root expanded
        if (start > 0) state.collapsed.add(start);
      });
    }

    function render(preserveScroll) {
      if (state.destroyed) return;
      const scrollEl = container.querySelector('.jv-scroll');
      const prevTop = preserveScroll && scrollEl ? scrollEl.scrollTop : 0;
      const prevLeft = preserveScroll && scrollEl ? scrollEl.scrollLeft : 0;

      const canHighlight =
        opts.highlight &&
        state.text.length > 0 &&
        state.text.length <= HIGHLIGHT_MAX;
      const built = buildViewerHtml(state.text, state.collapsed, {
        folds: opts.folds && state.text.length <= HIGHLIGHT_MAX,
        highlight: canHighlight
      });
      state.byStart = built.byStart;
      container.innerHTML = built.html || '<div class="jv-empty">No content</div>';
      container.classList.add('json-view');
      container.hidden = false;

      if (preserveScroll) {
        const next = container.querySelector('.jv-scroll');
        if (next) {
          next.scrollTop = prevTop;
          next.scrollLeft = prevLeft;
        }
      }
    }

    function onClick(e) {
      const btn = e.target.closest('.jv-fold, .jv-ellipsis');
      if (!btn || !container.contains(btn)) return;
      e.preventDefault();
      const start = Number(btn.getAttribute('data-fold-start'));
      if (Number.isNaN(start)) return;
      if (state.collapsed.has(start)) state.collapsed.delete(start);
      else state.collapsed.add(start);
      render(true);
    }

    initCollapsed();
    render(false);
    container.addEventListener('click', onClick);

    return {
      update(newText, resetFolds) {
        state.text = String(newText || '');
        if (resetFolds !== false) initCollapsed();
        render(false);
      },
      expandAll() {
        state.collapsed.clear();
        render(true);
      },
      collapseAll() {
        state.byStart.forEach((_, start) => {
          if (start > 0) state.collapsed.add(start);
        });
        // Also collapse root if it folds
        if (state.byStart.has(0)) state.collapsed.add(0);
        render(true);
      },
      getText() {
        return state.text;
      },
      destroy() {
        state.destroyed = true;
        container.removeEventListener('click', onClick);
        container.innerHTML = '';
        container.classList.remove('json-view');
      }
    };
  }

  /** One-shot HTML for static contexts (no live fold until remounted) */
  function renderHtml(text, options) {
    const opts = Object.assign({ folds: true, highlight: true }, options || {});
    const collapsed = new Set();
    return buildViewerHtml(String(text || ''), collapsed, opts).html;
  }

  return {
    mount,
    renderHtml,
    findFolds,
    HIGHLIGHT_MAX
  };
})();

window.LSJsonView = LSJsonView;
