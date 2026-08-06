/**
 * Logcat Studio — Logcat / HTTP log cleaner & JSON extractor
 *
 * Android Studio Logcat Format checkboxes produce many column combos.
 * ANY of these may be present or absent (and mixed in one paste):
 *
 *   [DATE] [TIME] [PID-TID] [TAG] [PACKAGE] [PROCESS] [LEVEL] MESSAGE
 *
 * Examples (user-provided):
 *   1) DATE TIME PID-TID TAG PACKAGE LEVEL MESSAGE
 *   2) PID-TID TAG PACKAGE LEVEL MESSAGE
 *   3) PID-TID PACKAGE LEVEL MESSAGE
 *   4) PID-TID PACKAGE MESSAGE          (no level)
 *   5) PACKAGE MESSAGE
 *   6) MESSAGE only
 *   + indented multiline continuation (spaces then message)
 *   + classic: D/Tag: message
 *   + OkHttp bodies split mid-token across prefixed lines
 *
 * Only MESSAGE is kept. JSON fragments are rejoined with NO newlines.
 */
const LSParser = (() => {
  'use strict';

  const RE_DATE_TIME =
    /^(?:\d{4}-\d{2}-\d{2}[ T])?\d{1,2}:\d{2}:\d{2}(?:[.,]\d+)?/;
  const RE_TIME_ONLY = /^\d{1,2}:\d{2}:\d{2}(?:[.,]\d+)?/;
  const RE_PID_TID = /^\d{2,}\s*-\s*\d{2,}/;
  const RE_LEVEL = /^[VDIWEAF]$/i;
  const RE_PACKAGE = /^[a-z][a-z0-9_]*(?:\.[a-zA-Z0-9_]+)+(?::[a-zA-Z0-9_./-]+)?$/;
  const RE_SLASH_FORM = /^[VDIWEAF]\/([^\s:]+):\s?(.*)$/i;

  /** Package token — includes AS-truncated forms like com...ointdev.datapoint */
  function isPackageLikeToken(t) {
    const s = String(t || '');
    return /^[a-z][\w.]*(?:\.\.\.)?[\w.]*\.[a-zA-Z0-9_]+(?::[\w./-]+)?$/i.test(s) ||
      /^com\.\.\./i.test(s) ||
      RE_PACKAGE.test(s);
  }

  /**
   * Android Studio pads columns with 2+ spaces; MESSAGE is always the last column.
   */
  function messageFromColumns(cols) {
    if (!cols || !cols.length) return '';
    if (cols.length === 1) return cols[0];
    return cols[cols.length - 1];
  }

  /**
   * Split remainder (after date/time + pid) into AS columns.
   */
  function splitLogColumns(rest) {
    return String(rest || '')
      .split(/\s{2,}/)
      .map((c) => c.trim())
      .filter(Boolean);
  }

  /**
   * Strip date, time (incl. partial :MM:SS.mmm), PID-TID from line start.
   */
  function stripTimeAndPid(s) {
    let out = String(s || '');
    // Partial paste: ":32.600  2629-2629" (missing hour digit)
    out = out.replace(/^:\d{1,2}:\d{2}(?:[.,]\d+)?\s+/, '');
    // Full date+time or time only
    out = out.replace(/^(?:\d{4}-\d{2}-\d{2}[ T])?\d{1,2}:\d{2}:\d{2}(?:[.,]\d+)?\s+/, '');
    // PID-TID
    out = out.replace(/^\d{2,}\s*-\s*\d{2,}\s+/, '');
    return out;
  }

  /**
   * When strip leaves metadata, pull the JSON/log fragment from the line.
   * Used for OkHttp splits: ..."local_created_datetime" + next line :"2026-08-05..."
   */
  function extractJsonFragment(msg, inBuffer) {
    const t = String(msg || '').trim();
    if (!t) return '';

    // Already a clean fragment
    if (/^[\{\["']/.test(t) || /^:"/.test(t)) return t;
    if (inBuffer && /^[\w"]/.test(t) && /":|,|:|\d|null|true|false/.test(t)) return t;

    // Split mid-key/value across lines — never slice from an inner "{"
    if (looksLikeJsonContinuation(t) && !/^[\{\[]/.test(t)) return t;

    // Still has tag/package columns — take last padded column
    const cols = splitLogColumns(t);
    if (cols.length >= 2) {
      let last = cols[cols.length - 1];
      const glued = last.match(/^([a-z][\w.]*(?:\.\.\.)?[\w.]*\.[a-zA-Z0-9_]+)\s+(.*)$/i);
      if (glued && glued[2]) last = glued[2];
      if (last && last !== cols[0]) return last;
    }

    // Inline after truncated package: ".datapoint {..." or ".datapoint :"..."
    const afterPkg = t.match(/\.datapoint\s+(.+)$/i);
    if (afterPkg) return afterPkg[1].trim();

    // Find first JSON-relevant substring
    const patterns = [
      /(\{[\s\S]*)$/,
      /(:"[\s\S]*)$/,
      /("[\w_]+":[\s\S]*)$/,
      /([\w]+":[\s\S]*)$/
    ];
    for (const re of patterns) {
      const m = t.match(re);
      if (m) return m[1];
    }

    return t;
  }

  /**
   * Detect Android Studio indented multiline continuation:
   * metadata columns blank, message indented to align under previous message.
   */
  function isContinuationLine(line) {
    const s = String(line == null ? '' : line);
    if (!s.trim()) return false;
    // Lots of leading whitespace, no timestamp / pid at start
    if (/^\s{8,}\S/.test(s)) {
      const t = s.trimStart();
      if (!RE_DATE_TIME.test(t) && !RE_PID_TID.test(t) && !RE_SLASH_FORM.test(t)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Regex fallback for common padded layouts when tokenization is ambiguous.
   * Matches: optional date/time, optional pid-tid, then ... LEVEL  MESSAGE
   * or package-padded then message.
   */
  function stripByRegex(line) {
    let s = String(line == null ? '' : line);

    const slash = s.match(RE_SLASH_FORM);
    if (slash) return slash[2];

    if (isContinuationLine(s)) {
      return s.trim();
    }

    s = stripTimeAndPid(s);
    const quick = s.trim();
    // TIME-only / message-only paste — payload follows time directly
    if (/^[\{\["']/.test(quick) || /^:\s*"/.test(quick) || /^-->/.test(quick) || /^<--/.test(quick)) {
      return quick;
    }

    // PRIMARY: AS column layout — message is always the last 2+-space column
    const cols = splitLogColumns(s);
    if (cols.length >= 2) {
      let last = messageFromColumns(cols);
      // Package + message share last column (single space): com...datapoint {"id":
      const glued = last.match(/^([a-z][\w.]*(?:\.\.\.)?[\w.]*\.[a-zA-Z0-9_]+)\s+(.*)$/i);
      if (glued && glued[2]) {
        last = glued[2];
      }
      // Level-only last column with message after on same token? rare
      if (RE_LEVEL.test(last) && cols.length >= 3) {
        return cols.slice(cols.indexOf(last) + 1).join(' ') || last;
      }
      return last;
    }

    // Message-only OkHttp JSON continuation (charges":0, losed_at":null) — no AS columns
    if (looksLikeJsonContinuation(quick) && !/^[\{\[]/.test(quick)) {
      return quick;
    }

    // Single column remainder — try LEVEL then package/tag fallbacks
    let m;
    let best = null;
    const reLevel = /\s([VDIWEAF])\s{2,}/gi;
    while ((m = reLevel.exec(s)) !== null) best = m;
    if (best) {
      return s.slice(best.index + best[0].length);
    }

    best = null;
    const reLevel1 = /\s([VDIWEAF])\s/gi;
    while ((m = reLevel1.exec(s)) !== null) {
      const after = s.slice(m.index + m[0].length);
      if (
        after.length === 0 ||
        /^[\{\["':]/.test(after) ||
        /^(?:-->|<--|GET |POST |PUT |PATCH |DELETE |HTTP\/|server:|content-type:|Authorization:)/i.test(after) ||
        /^[A-Za-z0-9_"'\-]/.test(after)
      ) {
        best = m;
      }
    }
    if (best) {
      return s.slice(best.index + best[0].length);
    }

    // Tag + truncated/full package + message (single spaces between package and JSON)
    const tagPkgMsg = s.match(
      /^([A-Za-z_][\w.$/-]*)\s+([a-z][\w.]*(?:\.\.\.)?[\w.]*\.[a-zA-Z0-9_]+)\s+(.*)$/i
    );
    if (tagPkgMsg) {
      return tagPkgMsg[3];
    }

    const pkg = s.match(
      /^([a-z][\w.]*(?:\.\.\.)?[\w.]*\.[a-zA-Z0-9_]+(?:\:[\w./-]+)?)\s{2,}(.*)$/i
    );
    if (pkg) {
      return pkg[2];
    }

    const tagOnly = s.match(/^([A-Za-z_][\w.$/-]*)\s{2,}(.+)$/);
    if (tagOnly && !/^[\[{"]/.test(tagOnly[1])) {
      return tagOnly[2];
    }

    return extractJsonFragment(s, false) || s.replace(/^\s+/, '');
  }

  /**
   * Parse one line → message only.
   */
  function parseLogLine(line) {
    const raw = String(line == null ? '' : line);
    if (!raw.trim()) {
      return { message: '', isLogLine: false, isContinuation: false };
    }

    if (isContinuationLine(raw)) {
      return { message: raw.trim(), isLogLine: true, isContinuation: true };
    }

    // Prefer regex strip (handles AS padding + all checkbox combos reliably)
    const message = stripByRegex(raw);

    // Detect whether this looked like a meta log line
    const isLogLine =
      RE_SLASH_FORM.test(raw.trim()) ||
      RE_DATE_TIME.test(raw.trim()) ||
      RE_TIME_ONLY.test(raw.trim()) ||
      RE_PID_TID.test(raw.trim()) ||
      /\s[VDIWEAF]\s{2,}/i.test(raw) ||
      RE_PACKAGE.test(raw.trim().split(/\s{2,}/)[0] || '');

    return { message, isLogLine, isContinuation: false };
  }

  function stripLogPrefix(line) {
    return parseLogLine(line).message;
  }

  function jsonPayloadStart(msg) {
    const s = String(msg || '');
    const idx = s.search(/[\[{]/);
    if (idx < 0) return null;
    return s.slice(idx);
  }

  function cleanLogcat(raw) {
    return String(raw || '')
      .split(/\r\n|\r|\n/)
      .map(stripLogPrefix)
      .join('\n');
  }

  function detectInputType(raw) {
    const text = String(raw || '').trim();
    if (!text) return 'empty';

    // Android Studio .logcat JSON export — check BEFORE full JSON.parse
    // (these files are valid JSON and can be multi‑MB; parsing for type kills the UI)
    if (looksLikeStudioLogcatExport(text)) return 'logcat';

    if (
      (text.startsWith('{') && text.endsWith('}')) ||
      (text.startsWith('[') && text.endsWith(']'))
    ) {
      // Only probe-parse small payloads; large ones are treated as JSON by shape
      if (text.length <= 256 * 1024) {
        const probe = LSUtils.safeJsonParse(text);
        if (probe.ok) return 'json';
      } else {
        return 'json';
      }
    }

    if (
      /^\d{1,2}:\d{2}:\d{2}/m.test(text) ||
      /^\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}/m.test(text) ||
      /^\d{2,}-\d{2,}\s+/m.test(text) ||
      /^[VDIWEAF]\//m.test(text) ||
      /\b(?:OkHttp|Retrofit|Timber|Volley|Ktor|ApiInterceptor|ApiLogger)\b/i.test(text) ||
      /(?:-->|<--)\s+(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|\d{3})\b/i.test(text) ||
      /\s[VDIWEAF]\s{2,}/m.test(text) ||
      /^--> END/m.test(text) ||
      /^<-- END HTTP/m.test(text)
    ) {
      return 'logcat';
    }

    if (/[{[]/.test(text) && /[}\]]/.test(text)) return 'mixed';
    return 'text';
  }

  /** Cheap check — does not parse the full file */
  function looksLikeStudioLogcatExport(text) {
    const t = String(text || '');
    if (!t.startsWith('{')) return false;
    const head = t.slice(0, 4000);
    return head.includes('"logcatMessages"');
  }

  function decodeLogcatEscapes(s) {
    return String(s || '')
      .replace(/\\u003[dD]/g, '=')
      .replace(/\\u0026/g, '&')
      .replace(/\\u003c/gi, '<')
      .replace(/\\u003e/gi, '>')
      .replace(/&laquo;/g, '«')
      .replace(/&raquo;/g, '»');
  }

  /**
   * Expand Android Studio .logcat JSON export → plain message lines (one parse).
   * Returns null if not a studio export.
   */
  function expandStudioLogcatExport(raw) {
    const text = String(raw || '');
    if (!looksLikeStudioLogcatExport(text)) return null;
    try {
      const parsed = JSON.parse(text);
      if (!parsed || !Array.isArray(parsed.logcatMessages)) return null;
      const lines = [];
      for (let i = 0; i < parsed.logcatMessages.length; i += 1) {
        const m = parsed.logcatMessages[i];
        const msg = decodeLogcatEscapes((m && m.message) || '').trim();
        if (msg) lines.push(msg);
      }
      return {
        text: lines.join('\n'),
        messageCount: lines.length,
        originalSize: text.length
      };
    } catch (_) {
      return null;
    }
  }

  /**
   * Normalize input before process/API extract (expand studio export once).
   */
  function prepareInput(raw) {
    const original = String(raw || '');
    const expanded = expandStudioLogcatExport(original);
    if (expanded) {
      return {
        workText: expanded.text,
        studioExport: true,
        messageCount: expanded.messageCount,
        originalSize: expanded.originalSize
      };
    }
    return {
      workText: original,
      studioExport: false,
      messageCount: 0,
      originalSize: original.length
    };
  }

  function isHttpNoise(msg) {
    const t = String(msg || '').trim();
    if (!t) return true;
    if (/^-->\s/.test(t)) return true;
    if (/^<--\s*END\b/i.test(t)) return true;
    if (/^<--\s+\d{3}\b/.test(t)) return true;
    if (/^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+https?:\/\//i.test(t)) return true;
    if (
      /^[A-Za-z][A-Za-z0-9-_]*:\s+\S/.test(t) &&
      !t.startsWith('{') &&
      !t.startsWith('[') &&
      !t.startsWith('"')
    ) {
      return true;
    }
    if (/^(?:ALLOW_DEFAULT|IGNORE_ARGUMENTS|Token |Server |Swipe |cloud|Seat totals|orderType|revenueCenter)/i.test(t)) {
      return true;
    }
    return false;
  }

  function looksLikeJsonContinuation(msg) {
    const t = String(msg || '').trim();
    if (!t) return false;
    // Base64 / JWT fragments are not JSON continuations
    if (/^[A-Za-z0-9+/=_-]+$/.test(t) && t.length > 40 && !/["':{},\[\]]/.test(t)) return false;
    // Lines with log tag / level columns are not bare continuations
    if (/^(?:OkHttp|Retrofit|Timber|Volley|Ktor)\b/i.test(t)) return false;
    if (/^[A-Za-z_][\w.$/-]*\s{2,}[VDIWEAF]\s{2,}/i.test(t)) return false;
    if (/^[\}\]\),]/.test(t)) return true;
    if (/^:"/.test(t)) return true;
    // OkHttp mid-key splits: charges":0, losed_at":null, closed_at":null
    if (/^[\w]+":/.test(t)) return true;
    // Trailing partial key: other_
    if (/^[\w_]+_$/.test(t)) return true;
    if (/^[\w"]/.test(t) && /["{}\[\]:,]|true|false|null|\d/.test(t)) return true;
    return false;
  }

  /** True when the stripped message is already the log payload (message-only / OkHttp body). */
  function isBareMessage(msg) {
    const t = String(msg || '').trim();
    if (!t) return false;
    if (/^[\{\["']/.test(t) || /^:\s*"/.test(t)) return true;
    if (/^-->/.test(t) || /^<--/.test(t)) return true;
    if (looksLikeJsonContinuation(t)) return true;
    if (isHttpNoise(t)) return true;
    return false;
  }

  function jsonBalance(text) {
    let depth = 0;
    let inString = false;
    let escape = false;
    let rootOpen = -1;

    for (let i = 0; i < text.length; i += 1) {
      const c = text[i];
      if (inString) {
        if (escape) escape = false;
        else if (c === '\\') escape = true;
        else if (c === '"') inString = false;
        continue;
      }
      if (c === '"') {
        inString = true;
        continue;
      }
      if (c === '{' || c === '[') {
        if (rootOpen < 0) rootOpen = i;
        depth += 1;
      } else if (c === '}' || c === ']') {
        depth -= 1;
      }
    }

    const trimmed = String(text || '').trim();
    const startsAtRoot = trimmed.startsWith('{') || trimmed.startsWith('[');
    return {
      started: rootOpen >= 0,
      balanced: startsAtRoot && depth === 0,
      depth,
      rootOpen
    };
  }

  /** True only when the entire buffer is one valid JSON value from root. */
  function isCompleteJson(text) {
    const t = String(text || '').trim();
    if (!t.startsWith('{') && !t.startsWith('[')) return false;
    const bal = jsonBalance(t);
    if (!bal.balanced) return false;
    // Avoid re-parsing multi‑MB buffers on every fragment check
    if (t.length > 200000) return true;
    return LSUtils.safeJsonParse(t).ok;
  }

  /**
   * Concatenate all JSON body lines (any AS format combo → message-only).
   * Skips HTTP noise; never inserts newlines between fragments.
   */
  function concatenateJsonLines(raw) {
    const lines = String(raw || '').split(/\r\n|\r|\n/);
    let buf = null;
    let pending = null;

    for (let i = 0; i < lines.length; i += 1) {
      let msg = stripLogPrefix(lines[i]).trim();
      if (!msg) continue;

      if (/^<--\s*END\b/i.test(msg)) {
        if (buf && !isCompleteJson(buf)) pending = buf;
        buf = null;
        continue;
      }

      if (isHttpNoise(msg) && !looksLikeJsonContinuation(msg)) continue;

      msg = extractJsonFragment(msg, buf != null);

      const isStart = msg.startsWith('{') || msg.startsWith('[');
      const isCont = looksLikeJsonContinuation(msg);
      if (!isStart && !isCont) continue;

      if (buf != null) {
        buf += msg;
      } else if (isCont) {
        buf = (pending || '') + msg;
        pending = null;
      } else if (isStart) {
        buf = jsonPayloadStart(msg) || msg;
      }

      if (buf && isCompleteJson(buf)) {
        const done = buf.trim();
        buf = null;
        pending = null;
        return done;
      }
    }

    if (buf && isCompleteJson(buf)) return buf.trim();
    if (pending && isCompleteJson(pending)) return pending.trim();

    // Best-effort partial for downstream repair
    if (buf && (buf.startsWith('{') || buf.startsWith('['))) return buf.trim();
    if (pending && (pending.startsWith('{') || pending.startsWith('['))) return pending.trim();

    return null;
  }

  /**
   * Merge OkHttp / Logcat JSON body split across lines (incl. TIME-only paste).
   * Returns one complete JSON string or null.
   */
  function mergeSplitJsonLines(raw) {
    return concatenateJsonLines(raw);
  }

  /**
   * Strip every line, merge split JSON fragments (no newlines between parts).
   * Returns array of complete JSON strings.
   */
  function rebuildFromLogcat(raw) {
    const merged = mergeSplitJsonLines(raw);
    if (merged && isCompleteJson(merged)) {
      return [merged];
    }

    const lines = String(raw || '').split(/\r\n|\r|\n/);
    const jsonBlocks = [];
    let jsonBuf = null;
    let pendingPartial = null;

    function flushJson(forceDiscard) {
      if (jsonBuf == null || !jsonBuf.length) {
        jsonBuf = null;
        return;
      }
      if (isCompleteJson(jsonBuf)) {
        jsonBlocks.push(jsonBuf.trim());
        jsonBuf = null;
        pendingPartial = null;
      } else if (forceDiscard) {
        pendingPartial = jsonBuf;
        jsonBuf = null;
      }
    }

    for (let i = 0; i < lines.length; i += 1) {
      const parsed = parseLogLine(lines[i]);
      let trimmed = parsed.message.trim();

      if (jsonBuf != null) {
        if (/^<--\s*END\b/i.test(trimmed)) {
          flushJson(true);
          continue;
        }
        if (trimmed === '') continue;

        trimmed = extractJsonFragment(trimmed, true);

        if (isHttpNoise(trimmed) && !looksLikeJsonContinuation(trimmed)) {
          continue;
        }

        jsonBuf += trimmed;
        if (isCompleteJson(jsonBuf)) flushJson(false);
        continue;
      }

      // Attach orphan continuation to saved partial
      if (looksLikeJsonContinuation(trimmed) && !/^[\{\[]/.test(trimmed)) {
        if (pendingPartial) {
          jsonBuf = pendingPartial + extractJsonFragment(trimmed, true);
          pendingPartial = null;
          if (isCompleteJson(jsonBuf)) flushJson(false);
        }
        continue;
      }

      trimmed = extractJsonFragment(trimmed, false);
      const payload = jsonPayloadStart(trimmed);
      if (payload && (payload.startsWith('{') || payload.startsWith('['))) {
        jsonBuf = payload;
        if (isCompleteJson(jsonBuf)) flushJson(false);
      }
    }

    flushJson(true);
    return jsonBlocks;
  }

  function extractJsonBlocks(text) {
    const src = String(text || '');
    const blocks = [];
    let i = 0;
    const len = src.length;

    while (i < len) {
      const ch = src[i];
      if (ch !== '{' && ch !== '[') {
        i += 1;
        continue;
      }

      const open = ch;
      const close = ch === '{' ? '}' : ']';
      let depth = 0;
      let inString = false;
      let escape = false;
      let j = i;

      for (; j < len; j += 1) {
        const c = src[j];
        if (inString) {
          if (escape) escape = false;
          else if (c === '\\') escape = true;
          else if (c === '"') inString = false;
          continue;
        }
        if (c === '"') {
          inString = true;
          continue;
        }
        if (c === open) depth += 1;
        else if (c === close) {
          depth -= 1;
          if (depth === 0) {
            const rawBlock = src.slice(i, j + 1);
            if (rawBlock.length >= 2) {
              blocks.push({ raw: rawBlock, start: i, end: j + 1 });
            }
            i = j + 1;
            break;
          }
        }
      }

      if (j >= len) break;
    }

    return blocks;
  }

  function blockQuality(block) {
    let score = block.raw ? block.raw.length : 0;
    if (!block.valid) return score - 1e8;
    score += 1e9;
    const v = block.value;
    if (!v || typeof v !== 'object') return score;
    if (Array.isArray(v)) return score + v.length * 100;

    // Strong preference for API ticket / list root objects
    if (Object.prototype.hasOwnProperty.call(v, '_embedded')) score += 2e6;
    if (Object.prototype.hasOwnProperty.call(v, 'totals')) score += 1.5e6;
    if (Object.prototype.hasOwnProperty.call(v, 'current_page')) score += 1.5e6;
    if (Object.prototype.hasOwnProperty.call(v, 'id_external')) score += 8e5;
    if (Object.prototype.hasOwnProperty.call(v, 'status') && Object.prototype.hasOwnProperty.call(v, 'open')) score += 5e5;
    if (Object.prototype.hasOwnProperty.call(v, 'data')) score += 5e5;

    // Penalize nested menu line-items mistaken as root
    if (Object.prototype.hasOwnProperty.call(v, 'menu_item')) score -= 3e6;
    if (Object.prototype.hasOwnProperty.call(v, 'price_per_unit')) score -= 3e6;
    if (Object.prototype.hasOwnProperty.call(v, 'menu_item_external')) score -= 2e6;
    if (Object.prototype.hasOwnProperty.call(v, 'printers') && !Object.prototype.hasOwnProperty.call(v, '_embedded')) {
      score -= 1e6;
    }
    if (Object.keys(v).length <= 3) score -= 2e5;

    return score;
  }

  function scoreBlock(block) {
    return blockQuality(block);
  }

  /** Extract only the outermost JSON value — never nested objects. */
  function extractRootJsonBlock(text) {
    const src = String(text || '').trim();
    if (!src.startsWith('{') && !src.startsWith('[')) return null;
    const blocks = extractJsonBlocks(src);
    if (!blocks.length) return null;
    return blocks[0].raw;
  }

  function process(raw) {
    // Studio .logcat export → message lines first (never treat whole file as one JSON)
    let source = String(raw || '');
    const expanded = expandStudioLogcatExport(source);
    if (expanded) source = expanded.text;

    const type = detectInputType(source);

    // 1) Merge split JSON lines (all AS format combos + message-only OkHttp paste)
    const mergedOne = concatenateJsonLines(source);
    let blocks = [];
    if (mergedOne && isCompleteJson(mergedOne)) {
      blocks = [{ raw: mergedOne }];
    } else if (mergedOne) {
      blocks = [{ raw: mergedOne }];
    }

    // 2) Fallback: rebuild from log lines
    if (!blocks.length) {
      const mergedBlocks = rebuildFromLogcat(source);
      blocks = mergedBlocks.map((r) => ({ raw: r }));
    }

    // 3) Fallback: strip all lines and concatenate JSON parts only
    if (!blocks.length) {
      const parts = String(source || '')
        .split(/\r\n|\r|\n/)
        .map(stripLogPrefix)
        .map((m) => m.trim())
        .filter((m) => m && (m.startsWith('{') || m.startsWith('[') || looksLikeJsonContinuation(m)));
      if (parts.length) {
        let buf = '';
        for (const p of parts) {
          if (!buf && (p.startsWith('{') || p.startsWith('['))) buf = p;
          else if (buf) buf += p;
        }
        if (buf) {
          const root = extractRootJsonBlock(buf) || buf;
          blocks = [{ raw: root }];
        }
      }
    }

    if (blocks.length === 0) {
      const trimmed = String(source || '').trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        blocks = [{ raw: trimmed }];
      }
    }

    const enriched = blocks.map((b) => {
      const rawText = b.raw;
      // Never accept the entire studio export / huge blob as a "JSON block"
      if (rawText && rawText.length > 500000 && looksLikeStudioLogcatExport(rawText)) {
        return null;
      }
      const parsed = LSUtils.safeJsonParse(rawText);
      if (parsed.ok) {
        return { raw: rawText, value: parsed.value, valid: true };
      }
      const repaired = typeof LSValidator !== 'undefined' ? LSValidator.repair(rawText) : { ok: false };
      if (repaired.ok) {
        return {
          raw: JSON.stringify(repaired.value),
          value: repaired.value,
          valid: true,
          repaired: true,
          repairs: repaired.repairs
        };
      }
      return {
        raw: rawText,
        value: null,
        valid: false,
        error: String(parsed.error && parsed.error.message)
      };
    }).filter(Boolean);

    const seen = new Set();
    const unique = [];
    enriched.forEach((b) => {
      let key;
      if (b.valid && b.raw && b.raw.length > 100000) {
        key = 'len:' + b.raw.length + ':' + b.raw.slice(0, 120) + ':' + b.raw.slice(-40);
      } else {
        key = b.valid ? JSON.stringify(b.value) : b.raw;
      }
      if (seen.has(key)) return;
      seen.add(key);
      unique.push(b);
    });

    let primaryIndex = -1;
    let bestScore = -Infinity;
    unique.forEach((b, i) => {
      const s = blockQuality(b);
      if (s > bestScore) {
        bestScore = s;
        primaryIndex = i;
      }
    });

    const cleaned =
      primaryIndex >= 0 && unique[primaryIndex]
        ? unique[primaryIndex].raw
        : mergedOne || cleanLogcat(source);

    return {
      type,
      cleaned,
      blocks: unique,
      primaryIndex
    };
  }

  function findReceiptHtml(value) {
    const keys = ['receipt_html', 'receiptHtml', 'receipt', 'html', 'print_data', 'printData'];
    let found = null;

    function walk(node, depth) {
      if (found || depth > 12 || node == null) return;
      if (typeof node === 'string') {
        const s = node.trim();
        if (s.startsWith('<') && s.includes('>')) found = s;
        return;
      }
      if (typeof node !== 'object') return;
      if (Array.isArray(node)) {
        node.forEach((x) => walk(x, depth + 1));
        return;
      }
      for (const k of Object.keys(node)) {
        const v = node[k];
        if (keys.includes(k)) {
          if (typeof v === 'string' && v.trim().startsWith('<')) {
            found = v;
            return;
          }
          if (v && typeof v === 'object') {
            walk(v, depth + 1);
            if (found) return;
          }
        }
      }
      for (const k of Object.keys(node)) {
        walk(node[k], depth + 1);
        if (found) return;
      }
    }

    walk(value, 0);
    return found;
  }

  return {
    stripLogPrefix,
    parseLogLine,
    cleanLogcat,
    detectInputType,
    looksLikeStudioLogcatExport,
    expandStudioLogcatExport,
    prepareInput,
    extractJsonBlocks,
    mergeSplitJsonLines,
    concatenateJsonLines,
    rebuildFromLogcat,
    process,
    findReceiptHtml
  };
})();

window.LSParser = LSParser;
