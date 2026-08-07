/**
 * Logcat Studio — Lightweight source line index (no text duplication beyond split)
 * Lines are references into the split of state.inputRaw.
 */
const LSLogIndex = (() => {
  'use strict';

  const RE_SLASH = /^([VDIWEAF])\/([^:]*?):\s?(.*)$/i;
  const RE_TIME = /(?:^|\s)(\d{1,2}:\d{2}:\d{2}(?:[.,]\d+)?)/;
  const RE_PID_TID = /(\d{2,})\s*-\s*(\d{2,})/;
  const RE_LEVEL_COL = /\s([VDIWEAF])\s{2,}/i;

  /**
   * Extract metadata from a raw Logcat line without mutating it.
   */
  function enrich(line) {
    const raw = String(line == null ? '' : line);
    const out = {
      time: null,
      pid: null,
      tid: null,
      thread: null,
      level: null,
      tag: null,
      message: raw
    };

    if (!raw.trim()) return out;

    const tm = raw.match(RE_TIME);
    if (tm) out.time = tm[1].replace(',', '.');

    const pt = raw.match(RE_PID_TID);
    if (pt) {
      out.pid = pt[1];
      out.tid = pt[2];
      out.thread = pt[1] + '-' + pt[2];
    }

    const slash = raw.trim().match(RE_SLASH);
    if (slash) {
      out.level = slash[1].toUpperCase();
      out.tag = slash[2].trim();
      out.message = slash[3];
      return out;
    }

    const lv = raw.match(RE_LEVEL_COL);
    if (lv) out.level = lv[1].toUpperCase();

    // AS padded columns: … TAG  PACKAGE  LEVEL  MESSAGE
    const cols = raw.split(/\s{2,}/).map((c) => c.trim()).filter(Boolean);
    if (cols.length >= 2) {
      for (let i = 0; i < cols.length; i++) {
        if (/^[VDIWEAF]$/i.test(cols[i])) {
          out.level = cols[i].toUpperCase();
          if (i > 0 && !/^\d/.test(cols[i - 1]) && !/^[VDIWEAF]$/i.test(cols[i - 1])) {
            const prev = cols[i - 1];
            if (!/^[a-z][a-z0-9_.]*\.[a-zA-Z]/.test(prev)) out.tag = prev;
          }
          out.message = cols[cols.length - 1];
          break;
        }
      }
      if (!out.tag && cols.length >= 3) {
        // Heuristic: tag often before package
        for (let i = 0; i < cols.length - 1; i++) {
          if (/^[A-Za-z][\w.]{0,40}$/.test(cols[i]) && !/^[VDIWEAF]$/i.test(cols[i])) {
            if (!/^\d/.test(cols[i]) && cols[i].indexOf('.') < 0) {
              out.tag = cols[i];
              break;
            }
          }
        }
      }
    }

    if (typeof LSParser !== 'undefined' && LSParser.parseLogLine) {
      const parsed = LSParser.parseLogLine(raw);
      if (parsed && parsed.message) out.message = parsed.message;
    }

    return out;
  }

  function build(text) {
    const lines = String(text || '').split(/\r\n|\r|\n/);
    return {
      text: String(text || ''),
      lines,
      lineCount: lines.length,
      enrich
    };
  }

  /** Character offset of line start (0-based line index) */
  function lineOffset(lines, lineIndex) {
    let off = 0;
    const n = Math.min(lineIndex, lines.length);
    for (let i = 0; i < n; i++) {
      off += lines[i].length + 1;
    }
    return off;
  }

  return { build, enrich, lineOffset };
})();

window.LSLogIndex = LSLogIndex;
