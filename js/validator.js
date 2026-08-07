/**
 * Logcat Studio — JSON validation and repair
 */
const LSValidator = (() => {
  'use strict';

  /**
   * Parse error position from native SyntaxError message when possible.
   */
  function parseErrorPosition(message, text) {
    const msg = String(message || '');
    let position = null;

    const atMatch = msg.match(/at position\s+(\d+)/i) ||
      msg.match(/position\s+(\d+)/i) ||
      msg.match(/column\s+(\d+)/i);

    if (atMatch) {
      position = parseInt(atMatch[1], 10);
    }

    // Some engines: "at line X column Y"
    const lc = msg.match(/line\s+(\d+)\s+column\s+(\d+)/i);
    if (lc) {
      return {
        line: parseInt(lc[1], 10),
        column: parseInt(lc[2], 10),
        position
      };
    }

    if (position != null && text) {
      const before = String(text).slice(0, position);
      const lines = before.split(/\r\n|\r|\n/);
      return {
        line: lines.length,
        column: lines[lines.length - 1].length + 1,
        position
      };
    }

    return { line: null, column: null, position };
  }

  function validate(text) {
    const raw = String(text == null ? '' : text).trim();
    if (!raw) {
      return {
        valid: false,
        error: 'Empty input',
        line: null,
        column: null,
        position: null,
        value: null
      };
    }

    try {
      const value = JSON.parse(raw);
      return {
        valid: true,
        error: null,
        line: null,
        column: null,
        position: null,
        value
      };
    } catch (err) {
      const pos = parseErrorPosition(err.message, raw);
      return {
        valid: false,
        error: err.message || 'Invalid JSON',
        line: pos.line,
        column: pos.column,
        position: pos.position,
        value: null
      };
    }
  }

  /**
   * Attempt common repairs for malformed JSON from logs.
   */
  function repair(text) {
    let s = String(text || '').trim();
    if (!s) return { ok: false, text: s, repairs: [], error: 'Empty input' };

    const repairs = [];
    const original = s;

    // Remove BOM
    if (s.charCodeAt(0) === 0xfeff) {
      s = s.slice(1);
      repairs.push('Removed BOM');
    }

    // Replace smart quotes
    if (/[\u201C\u201D\u2018\u2019]/.test(s)) {
      s = s.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");
      repairs.push('Normalized smart quotes');
    }

    // Single-quoted strings → double quotes (conservative)
    if (/'[^']*'/.test(s) && !/"/.test(s.replace(/'[^']*'/g, ''))) {
      // mostly single-quoted JSON-like
    }
    const beforeQuotes = s;
    s = s.replace(/'([^'\\]*(\\.[^'\\]*)*)'/g, (_, inner) => {
      return `"${inner.replace(/"/g, '\\"')}"`;
    });
    if (s !== beforeQuotes) repairs.push('Converted single quotes to double quotes');

    // Unquoted keys: {name: "x"} → {"name": "x"}
    const beforeKeys = s;
    s = s.replace(/([{,]\s*)([A-Za-z_$][\w$]*)(\s*:)/g, '$1"$2"$3');
    if (s !== beforeKeys) repairs.push('Quoted unquoted keys');

    // Trailing commas before } or ]
    const beforeComma = s;
    s = s.replace(/,\s*([}\]])/g, '$1');
    if (s !== beforeComma) repairs.push('Removed trailing commas');

    // Extra commas ,,
    const beforeDup = s;
    s = s.replace(/,\s*,+/g, ',');
    if (s !== beforeDup) repairs.push('Removed duplicate commas');

    // Wrap bare content if it looks like key:value pairs without braces
    if (!s.startsWith('{') && !s.startsWith('[') && /:\s*/.test(s)) {
      s = `{${s}}`;
      repairs.push('Wrapped in object braces');
    }

    // Remove JS-style comments
    const beforeComments = s;
    s = s.replace(/\/\*[\s\S]*?\*\//g, '');
    s = s.replace(/(^|[^:])\/\/.*$/gm, '$1');
    if (s !== beforeComments) repairs.push('Removed comments');

    // Replace undefined / NaN
    const beforeUndef = s;
    s = s.replace(/\bundefined\b/g, 'null').replace(/\bNaN\b/g, 'null');
    if (s !== beforeUndef) repairs.push('Replaced undefined/NaN with null');

    const check = validate(s);
    if (check.valid) {
      return { ok: true, text: JSON.stringify(check.value), value: check.value, repairs, original };
    }

    // Last resort: extract first balanced block from repaired text
    const blocks = LSParser.extractJsonBlocks(s);
    for (const b of blocks) {
      const v = validate(b.raw);
      if (v.valid) {
        repairs.push('Extracted valid JSON block');
        return { ok: true, text: JSON.stringify(v.value), value: v.value, repairs, original };
      }
    }

    return {
      ok: false,
      text: s,
      value: null,
      repairs,
      original,
      error: check.error
    };
  }

  return {
    validate,
    repair,
    parseErrorPosition
  };
})();

window.LSValidator = LSValidator;
