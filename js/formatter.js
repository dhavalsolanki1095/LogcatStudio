/**
 * Logcat Studio — Beautify / Minify
 */
const LSFormatter = (() => {
  'use strict';

  const INDENTS = {
    '2': '  ',
    '4': '    ',
    'tab': '\t'
  };

  function getIndent(style) {
    return INDENTS[style] || INDENTS['2'];
  }

  function beautify(valueOrText, style) {
    const indent = getIndent(style);
    let value = valueOrText;

    if (typeof valueOrText === 'string') {
      const parsed = LSUtils.safeJsonParse(valueOrText);
      if (!parsed.ok) throw parsed.error;
      value = parsed.value;
    }

    return JSON.stringify(value, null, indent);
  }

  function minify(valueOrText) {
    let value = valueOrText;
    if (typeof valueOrText === 'string') {
      const parsed = LSUtils.safeJsonParse(valueOrText);
      if (!parsed.ok) throw parsed.error;
      value = parsed.value;
    }
    return JSON.stringify(value);
  }

  function tryBeautify(text, style) {
    try {
      return { ok: true, text: beautify(text, style) };
    } catch (err) {
      return { ok: false, error: err, text };
    }
  }

  function tryMinify(text) {
    try {
      return { ok: true, text: minify(text) };
    } catch (err) {
      return { ok: false, error: err, text };
    }
  }

  return {
    beautify,
    minify,
    tryBeautify,
    tryMinify,
    getIndent
  };
})();

window.LSFormatter = LSFormatter;
