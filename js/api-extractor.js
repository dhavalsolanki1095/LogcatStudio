/**
 * Logcat Studio — API call extractor (OkHttp / Retrofit style)
 *
 * Supports:
 *   - Plain Android Studio Logcat paste (any format combo)
 *   - Android Studio .logcat JSON export (logcatMessages[])
 *
 * Groups transactions:
 *   --> METHOD URL
 *     request headers / body
 *   --> END METHOD
 *   <-- STATUS URL (duration)
 *     response headers / body
 *   <-- END HTTP
 */
const LSApiExtractor = (() => {
  'use strict';

  const RE_REQ_START = /^-->\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\S+)/i;
  const RE_REQ_END = /^-->\s+END\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/i;
  const RE_RES_START = /^<--\s+(\d{3})\s+(\S+)(?:\s+\((\d+)ms\))?/i;
  const RE_RES_END = /^<--\s+END\s+HTTP\b(?:\s+\((\d+)-byte body\))?/i;
  const RE_HEADER = /^([A-Za-z0-9!#$%&'*+.^_`|~-]+):\s*(.*)$/;

  function decodeEscapes(s) {
    return String(s || '')
      .replace(/\\u003[dD]/g, '=')
      .replace(/\\u0026/g, '&')
      .replace(/\\u003c/gi, '<')
      .replace(/\\u003e/gi, '>')
      .replace(/&laquo;/g, '«')
      .replace(/&raquo;/g, '»');
  }

  /**
   * Convert any input into ordered message lines (message text only).
   */
  function toMessageLines(raw) {
    const text = String(raw || '').trim();
    if (!text) return [];

    // Prefer shared expander (one path with parser)
    if (typeof LSParser !== 'undefined' && LSParser.expandStudioLogcatExport) {
      const expanded = LSParser.expandStudioLogcatExport(text);
      if (expanded && expanded.text) {
        return expanded.text.split(/\r\n|\r|\n/);
      }
    }

    // Android Studio .logcat JSON export (fallback)
    if (text.startsWith('{') && text.includes('"logcatMessages"')) {
      try {
        const parsed = JSON.parse(text);
        if (parsed && Array.isArray(parsed.logcatMessages)) {
          return parsed.logcatMessages
            .map((m) => decodeEscapes((m && m.message) || '').trim())
            .filter((m) => m !== undefined);
        }
      } catch (_) {
        /* fall through to plain lines */
      }
    }

    return text.split(/\r\n|\r|\n/).map((line) => {
      const msg =
        typeof LSParser !== 'undefined' ? LSParser.stripLogPrefix(line) : line;
      return decodeEscapes(String(msg || '').trim());
    });
  }

  function tryParseJsonBody(parts) {
    if (!parts || !parts.length) return { raw: '', value: null, valid: false };
    const joined = parts.join('');
    if (!joined.trim()) return { raw: '', value: null, valid: false };

    let candidate = joined.trim();
    // Prefer existing merge if available for split fragments
    if (typeof LSParser !== 'undefined' && LSParser.concatenateJsonLines) {
      const merged = LSParser.concatenateJsonLines(parts.join('\n'));
      if (merged) candidate = merged;
    }

    const parsed =
      typeof LSUtils !== 'undefined'
        ? LSUtils.safeJsonParse(candidate)
        : (() => {
            try {
              return { ok: true, value: JSON.parse(candidate) };
            } catch (e) {
              return { ok: false, error: e };
            }
          })();

    if (parsed.ok) {
      return { raw: candidate, value: parsed.value, valid: true };
    }
    return { raw: candidate, value: null, valid: false };
  }

  function pathOnly(url) {
    try {
      const u = new URL(url);
      return u.pathname + (u.search || '');
    } catch (_) {
      const m = String(url || '').match(/https?:\/\/[^/]+(\/.*)?$/i);
      return (m && m[1]) || url || '';
    }
  }

  function emptyTxn() {
    return {
      method: null,
      url: null,
      status: null,
      durationMs: null,
      bodyBytes: null,
      request: { headers: {}, bodyRaw: '', body: null, bodyValid: false },
      response: { headers: {}, bodyRaw: '', body: null, bodyValid: false },
      complete: false
    };
  }

  /**
   * Extract API transactions from Logcat / .logcat / OkHttp paste.
   * Pass opts.lines when text is already split (avoids a second full split/parse).
   */
  function extract(raw, opts) {
    const options = opts || {};
    const lines = Array.isArray(options.lines)
      ? options.lines
      : toMessageLines(raw);
    const calls = [];
    let txn = null;
    let phase = null; // 'req' | 'res' | null
    let bodyBuf = [];
    const maxCalls = options.maxCalls > 0 ? options.maxCalls : 500;

    function flushBody(into) {
      if (!bodyBuf.length) return;
      const parsed = tryParseJsonBody(bodyBuf);
      into.bodyRaw = parsed.raw;
      into.body = parsed.value;
      into.bodyValid = parsed.valid;
      // If not JSON, keep as plain text body
      if (!parsed.valid && bodyBuf.join('').trim()) {
        into.bodyRaw = bodyBuf.join('\n').trim();
      }
      bodyBuf = [];
    }

    function finishTxn() {
      if (!txn) return;
      if (phase === 'req') flushBody(txn.request);
      if (phase === 'res') flushBody(txn.response);
      if (txn.method && txn.url) {
        txn.path = pathOnly(txn.url);
        txn.complete = txn.status != null;
        calls.push(txn);
      }
      txn = null;
      phase = null;
      bodyBuf = [];
    }

    for (let i = 0; i < lines.length; i += 1) {
      if (calls.length >= maxCalls) break;
      const msg = lines[i];
      if (msg === '') {
        // blank line often separates headers from body in OkHttp
        continue;
      }

      let m = msg.match(RE_REQ_START);
      if (m) {
        if (txn) finishTxn();
        txn = emptyTxn();
        txn.method = m[1].toUpperCase();
        txn.url = m[2];
        phase = 'req';
        bodyBuf = [];
        continue;
      }

      m = msg.match(RE_REQ_END);
      if (m && txn) {
        flushBody(txn.request);
        phase = null;
        continue;
      }

      m = msg.match(RE_RES_START);
      if (m) {
        if (!txn) {
          txn = emptyTxn();
          txn.url = m[2];
          txn.method = 'GET';
        }
        // If response URL differs but we have an open txn, keep method from request
        if (!txn.url) txn.url = m[2];
        txn.status = parseInt(m[1], 10);
        txn.durationMs = m[3] != null ? parseInt(m[3], 10) : null;
        phase = 'res';
        bodyBuf = [];
        continue;
      }

      m = msg.match(RE_RES_END);
      if (m && txn) {
        if (m[1] != null) txn.bodyBytes = parseInt(m[1], 10);
        flushBody(txn.response);
        finishTxn();
        continue;
      }

      if (!txn || !phase) continue;

      // Header line
      const hm = msg.match(RE_HEADER);
      if (hm && !msg.startsWith('{') && !msg.startsWith('[') && !/^:"/.test(msg)) {
        // If we already started collecting a JSON body, treat as body continuation
        if (bodyBuf.length && (bodyBuf[0].startsWith('{') || bodyBuf[0].startsWith('['))) {
          bodyBuf.push(msg);
          continue;
        }
        const target = phase === 'req' ? txn.request : txn.response;
        target.headers[hm[1]] = hm[2];
        continue;
      }

      // Body / continuation (JSON fragments, mid-key splits, plain text)
      if (
        msg.startsWith('{') ||
        msg.startsWith('[') ||
        /^:"/.test(msg) ||
        /^[\w]+":/.test(msg) ||
        bodyBuf.length > 0 ||
        (phase === 'res' && !/^[A-Za-z0-9!#$%&'*+.^_`|~-]+:\s/.test(msg))
      ) {
        // Skip obvious non-body noise
        if (/^(?:ALLOW_DEFAULT|IGNORE_ARGUMENTS|Token |Server |Swipe |cloud)/i.test(msg)) {
          continue;
        }
        if (bodyBuf.length < 8000) bodyBuf.push(msg);
      }
    }

    if (txn) finishTxn();
    return calls;
  }

  function summarize(call) {
    if (!call) return '';
    const status = call.status != null ? String(call.status) : '—';
    const dur = call.durationMs != null ? `${call.durationMs}ms` : '';
    return `${call.method || '?'} ${call.path || call.url || ''} → ${status}${dur ? ' ' + dur : ''}`.trim();
  }

  function formatBodyText(part) {
    if (!part) return '(none)';
    if (part.bodyValid && part.body != null) {
      try {
        return typeof LSFormatter !== 'undefined'
          ? LSFormatter.beautify(part.body, '2')
          : JSON.stringify(part.body, null, 2);
      } catch (_) {
        return part.bodyRaw || '(none)';
      }
    }
    const raw = String(part.bodyRaw || '').trim();
    return raw || '(none)';
  }

  function formatHeadersText(headers) {
    const keys = Object.keys(headers || {});
    if (!keys.length) return '(none)';
    return keys.map((k) => `${k}: ${headers[k]}`).join('\n');
  }

  /**
   * Shareable text: Method, URL, Status + Request body + Response body only.
   */
  function formatFullDetails(call) {
    if (!call) return '';

    const method = call.method || '—';
    const url = call.url || '—';
    const status = call.status != null ? String(call.status) : '—';

    let reqBody = formatBodyText(call.request);
    if (reqBody === '(none)') reqBody = 'No request body';

    let resBody = formatBodyText(call.response);
    if (resBody === '(none)') resBody = 'No response body';

    return [
      `Method:  ${method}`,
      `URL:     ${url}`,
      `Status:  ${status}`,
      '',
      'Request:',
      reqBody,
      '',
      'Response:',
      resBody
    ].join('\n');
  }

  return {
    extract,
    toMessageLines,
    summarize,
    pathOnly,
    formatFullDetails
  };
})();

window.LSApiExtractor = LSApiExtractor;
