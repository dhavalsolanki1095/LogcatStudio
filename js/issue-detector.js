/**
 * Logcat Studio — Smart Error Detection + Crash Grouping
 * Scans source lines once; stores line indexes only (no log duplication).
 */
const LSIssueDetector = (() => {
  'use strict';

  const CATEGORIES = [
    { id: 'crash', label: 'CRASH', icon: '🔴' },
    { id: 'anr', label: 'ANR', icon: '🟠' },
    { id: 'warning', label: 'WARNINGS', icon: '🟡' },
    { id: 'api', label: 'API ERRORS', icon: '🌐' },
    { id: 'database', label: 'DATABASE', icon: '🗄' },
    { id: 'performance', label: 'PERFORMANCE', icon: '⚡' },
    { id: 'permission', label: 'PERMISSION', icon: '🔐' }
  ];

  const EXCEPTION_RE =
    /\b((?:[a-zA-Z_]\w*\.)*[A-Z]\w*(?:Error|Exception|Throwable|Failure))\b/;
  const KNOWN_EX =
    /\b(NullPointerException|IllegalStateException|IndexOutOfBoundsException|ArrayIndexOutOfBoundsException|ClassCastException|NumberFormatException|RuntimeException|OutOfMemoryError|SocketTimeoutException|ConnectException|UnknownHostException|SSLHandshakeException|SecurityException|SQLiteException)\b/;
  const STACK_AT =
    /^\s*at\s+.+?\(([^():]+\.\w+):(\d+)\)|^\s*at\s+.+?\(([^:)]+\.kt):(\d+)\)|^\s*at\s+.+\((Native Method)\)/;
  const STACK_AT_FILE = /\(([^():]+\.(?:java|kt|js)):(\d+)\)/;
  const FATAL = /FATAL EXCEPTION|AndroidRuntime/i;
  const CAUSED = /^\s*Caused by:\s*/i;
  const ANR_RE =
    /\bANR\b|Application Not Responding|Input dispatching timed out|\bam_anr\b/i;
  const DB_RE =
    /\bRoom(?:Database)?\b|\bSQLite(?:Exception)?\b|\bMigration\b|database locked|no such table|no such column|constraint failed|UNIQUE constraint failed|FOREIGN KEY constraint failed|Room cannot verify the data integrity/i;
  const PERF_RE =
    /Skipped frames|\bChoreographer\b|\bStrictMode\b|\bGC_FOR_ALLOC\b|\bGC\b|OutOfMemoryError|Slow query|Slow operation/i;
  const PERF_DUR =
    /(?:duration|took|elapsed)\s*[=:]?\s*(\d+(?:\.\d+)?)\s*(ms|s)?/i;
  const PERM_RE =
    /SecurityException|Permission Denial|Permission denied|not granted|Missing permission|requires permission/i;
  const PERM_NAME = /android\.permission\.[A-Z0-9_]+/;
  const HTTP_STATUS = /\b([45]\d{2})\b/;
  const HTTP_CODES = new Set([
    400, 401, 403, 404, 409, 422, 429, 500, 501, 502, 503, 504
  ]);
  const NET_EX =
    /SocketTimeoutException|ConnectException|UnknownHostException|SSLHandshakeException|Connection refused|Connection reset|\btimeout\b/i;

  function emptySummary() {
    return {
      crash: 0,
      anr: 0,
      warning: 0,
      api: 0,
      database: 0,
      performance: 0,
      permission: 0
    };
  }

  function extractSource(line) {
    const m = String(line || '').match(STACK_AT_FILE);
    if (m) return { file: m[1], line: parseInt(m[2], 10) };
    return null;
  }

  function extractException(line) {
    const s = String(line || '');
    const known = s.match(KNOWN_EX);
    if (known) return known[1];
    const caused = s.match(/Caused by:\s*([^\s:]+)/i);
    if (caused) {
      const short = caused[1].split('.').pop();
      return short;
    }
    const gen = s.match(EXCEPTION_RE);
    if (gen) return gen[1].split('.').pop();
    return null;
  }

  function parseDurationMs(line) {
    const m = String(line || '').match(PERF_DUR);
    if (!m) return null;
    let n = parseFloat(m[1]);
    const unit = (m[2] || 'ms').toLowerCase();
    if (unit === 's') n *= 1000;
    return n;
  }

  function makeIssue(partial) {
    return Object.assign(
      {
        id: '',
        category: 'crash',
        lineIndex: 0,
        lineEnd: 0,
        time: null,
        title: '',
        message: '',
        exception: null,
        sourceFile: null,
        sourceLine: null,
        permission: null,
        status: null,
        durationMs: null,
        groupKey: null
      },
      partial
    );
  }

  /**
   * Detect issues from log text.
   * @param {string} text
   * @param {{ apiCalls?: array }} opts
   */
  function detect(text, opts) {
    const options = opts || {};
    const lines = Array.isArray(options.lines)
      ? options.lines
      : String(text || '').split(/\r\n|\r|\n/);
    const issues = [];
    const summary = emptySummary();
    let idSeq = 0;
    const large = lines.length > 25000 || String(text || '').length > 800000;
    const MAX_STORE = {
      crash: large ? 1500 : 5000,
      anr: large ? 500 : 2000,
      warning: large ? 800 : 3000,
      api: large ? 1500 : 5000,
      database: large ? 800 : 3000,
      performance: large ? 800 : 3000,
      permission: large ? 500 : 2000
    };
    const stored = emptySummary();
    // Cap scan window for very large logs (still counts within window)
    const scanLimit = large ? Math.min(lines.length, 60000) : lines.length;

    function push(issue) {
      if (summary[issue.category] != null) summary[issue.category] += 1;
      const cap = MAX_STORE[issue.category] || 2000;
      if ((stored[issue.category] || 0) >= cap) return;
      stored[issue.category] = (stored[issue.category] || 0) + 1;
      idSeq += 1;
      issue.id = 'iss_' + idSeq;
      issues.push(issue);
    }

    function quickInteresting(raw) {
      // Cheap prefilter — skip enrich/regex storm on boring lines
      if (!raw || raw.length < 3) return false;
      const c = raw.charCodeAt(0);
      // stack frames / caused by often indented
      if (c === 32 || c === 9) return true;
      if (
        raw.indexOf('Exception') >= 0 ||
        raw.indexOf('Error') >= 0 ||
        raw.indexOf('FATAL') >= 0 ||
        raw.indexOf('ANR') >= 0 ||
        raw.indexOf('WARN') >= 0 ||
        raw.indexOf('Room') >= 0 ||
        raw.indexOf('SQLite') >= 0 ||
        raw.indexOf('Permission') >= 0 ||
        raw.indexOf('-->') >= 0 ||
        raw.indexOf('<--') >= 0 ||
        raw.indexOf('Skipped') >= 0 ||
        raw.indexOf('Choreographer') >= 0 ||
        raw.indexOf('duration') >= 0 ||
        raw.indexOf('took ') >= 0 ||
        raw.indexOf(' W/') >= 0 ||
        raw.indexOf('W/') === 0 ||
        raw.indexOf(' E/') >= 0 ||
        raw.indexOf('E/') === 0
      ) {
        return true;
      }
      // Level column " W  " / " E  "
      if (/\s[WEF]\s{2,}/.test(raw)) return true;
      return false;
    }

    // Track crash blocks: FATAL / exception start → following stack
    let i = 0;
    while (i < scanLimit) {
      const raw = lines[i];
      if (!quickInteresting(raw)) {
        i += 1;
        continue;
      }
      const meta = LSLogIndex.enrich(raw);
      const msg = meta.message || raw;

      // --- CRASH ---
      const isFatal = FATAL.test(raw);
      const exName = extractException(raw);
      const isCaused = CAUSED.test(msg) || CAUSED.test(raw);
      const isStack = /^\s*at\s+/.test(msg) || /^\s*at\s+/.test(raw);

      if (isFatal || (exName && (isCaused || /Exception|Error/.test(raw))) ||
          (meta.level === 'E' && exName && /Exception|Error/.test(raw))) {
        // Expand block to include following stack frames
        let end = i;
        let sourceFile = null;
        let sourceLine = null;
        let exception = exName;
        for (let j = i; j < Math.min(lines.length, i + 80); j++) {
          const L = lines[j];
          if (j > i) {
            const m2 = LSLogIndex.enrich(L).message || L;
            if (
              /^\s*at\s+/.test(m2) ||
              CAUSED.test(m2) ||
              /^\s*\.\.\.\s+\d+\s+more/.test(m2) ||
              extractException(L)
            ) {
              end = j;
              if (!exception) exception = extractException(L);
              const src = extractSource(L);
              // Prefer first app frame (kt/java) that isn't android/java framework
              if (src && !sourceFile) {
                if (!/^(android\.|java\.|kotlin\.|com\.android\.)/.test(src.file)) {
                  sourceFile = src.file;
                  sourceLine = src.line;
                }
              }
              if (src && !sourceFile) {
                sourceFile = src.file;
                sourceLine = src.line;
              }
              continue;
            }
            // Stop if new log metadata line that's not a stack
            if (j > i + 1 && (RE_TIME_LIKE(L) || /^[VDIWEAF]\//i.test(L.trim())) && !/^\s/.test(L)) {
              break;
            }
            if (j > i && L.trim() === '') break;
          } else {
            end = j;
          }
        }

        // Avoid double-counting pure stack continuation lines as new crashes
        if (isStack && !isFatal && !isCaused && !exName) {
          i += 1;
          continue;
        }

        const title = exception || (isFatal ? 'FATAL EXCEPTION' : 'Crash');
        const groupKey =
          (exception || title) +
          '|' +
          (sourceFile || '') +
          ':' +
          (sourceLine != null ? sourceLine : '');

        push(
          makeIssue({
            category: 'crash',
            lineIndex: i,
            lineEnd: end,
            time: meta.time,
            title,
            message: msg.slice(0, 200),
            exception: exception || title,
            sourceFile,
            sourceLine,
            groupKey
          })
        );
        i = end + 1;
        continue;
      }

      // --- ANR ---
      if (ANR_RE.test(raw)) {
        push(
          makeIssue({
            category: 'anr',
            lineIndex: i,
            lineEnd: i,
            time: meta.time,
            title: 'ANR',
            message: msg.slice(0, 200),
            groupKey: 'anr|' + msg.slice(0, 80)
          })
        );
        i += 1;
        continue;
      }

      // --- WARNINGS ---
      if (
        meta.level === 'W' ||
        /\bW\//.test(raw) ||
        /\bWARN(?:ING)?\b/i.test(raw)
      ) {
        push(
          makeIssue({
            category: 'warning',
            lineIndex: i,
            lineEnd: i,
            time: meta.time,
            title: meta.tag ? 'W/' + meta.tag : 'Warning',
            message: msg.slice(0, 200),
            groupKey: 'warn|' + (meta.tag || '') + '|' + msg.slice(0, 60)
          })
        );
        i += 1;
        continue;
      }

      // --- DATABASE ---
      if (DB_RE.test(raw)) {
        const ex = extractException(raw) || 'Database';
        const src = extractSource(raw);
        push(
          makeIssue({
            category: 'database',
            lineIndex: i,
            lineEnd: i,
            time: meta.time,
            title: ex,
            message: msg.slice(0, 200),
            exception: ex,
            sourceFile: src && src.file,
            sourceLine: src && src.line,
            groupKey: 'db|' + ex + '|' + ((src && src.file) || '') + ':' + ((src && src.line) || '')
          })
        );
        i += 1;
        continue;
      }

      // --- PERFORMANCE ---
      const dur = parseDurationMs(raw);
      const slow = dur != null && dur > 3000;
      if (PERF_RE.test(raw) || slow || /\bOutOfMemoryError\b/.test(raw)) {
        push(
          makeIssue({
            category: 'performance',
            lineIndex: i,
            lineEnd: i,
            time: meta.time,
            title: slow ? `Slow ${Math.round(dur)}ms` : (extractException(raw) || 'Performance'),
            message: msg.slice(0, 200),
            durationMs: dur,
            groupKey: 'perf|' + (slow ? 'dur' : msg.slice(0, 40))
          })
        );
        i += 1;
        continue;
      }

      // --- PERMISSION ---
      if (PERM_RE.test(raw)) {
        const perm = (raw.match(PERM_NAME) || [])[0] || null;
        push(
          makeIssue({
            category: 'permission',
            lineIndex: i,
            lineEnd: i,
            time: meta.time,
            title: perm || 'Permission',
            message: msg.slice(0, 200),
            permission: perm,
            groupKey: 'perm|' + (perm || msg.slice(0, 60))
          })
        );
        i += 1;
        continue;
      }

      // --- API / network (line-based; API calls merged later) ---
      if (NET_EX.test(raw)) {
        const st = raw.match(HTTP_STATUS);
        const code = st ? parseInt(st[1], 10) : null;
        const ex = extractException(raw) || 'Network';
        push(
          makeIssue({
            category: 'api',
            lineIndex: i,
            lineEnd: i,
            time: meta.time,
            title: code != null ? 'HTTP ' + code : ex,
            message: msg.slice(0, 200),
            exception: ex,
            status: code && HTTP_CODES.has(code) ? code : code,
            groupKey: 'api|' + (code || ex)
          })
        );
        i += 1;
        continue;
      }

      // HTTP error codes near OkHttp arrows
      if (/(?:<--|->)\s+\d{3}\b/.test(raw) || /(?:status|code)\s*[=:]\s*[45]\d{2}/i.test(raw)) {
        const st = raw.match(/\b([45]\d{2})\b/);
        if (st && HTTP_CODES.has(parseInt(st[1], 10))) {
          const code = parseInt(st[1], 10);
          push(
            makeIssue({
              category: 'api',
              lineIndex: i,
              lineEnd: i,
              time: meta.time,
              title: 'HTTP ' + code,
              message: msg.slice(0, 200),
              status: code,
              groupKey: 'api|' + code
            })
          );
        }
      }

      i += 1;
    }

    // Merge API extractor 4xx/5xx (find approximate line for jump)
    const apiCalls = options.apiCalls || [];
    apiCalls.forEach((call, apiIndex) => {
      if (call.status == null || !HTTP_CODES.has(call.status)) return;
      // Already counted from line scan? Still add with link if we can find line
      let lineIndex = findApiLine(lines, call);
      if (lineIndex < 0) lineIndex = 0;
      // Avoid exact duplicate if same line already has this status
      const dup = issues.some(
        (iss) => iss.category === 'api' && iss.lineIndex === lineIndex && iss.status === call.status
      );
      if (dup) return;
      push(
        makeIssue({
          category: 'api',
          lineIndex,
          lineEnd: lineIndex,
          time: null,
          title: (call.method || 'HTTP') + ' ' + call.status,
          message: (call.path || call.url || '').slice(0, 200),
          status: call.status,
          groupKey: 'api|' + call.status + '|' + (call.path || ''),
          apiIndex
        })
      );
    });

    const groups = groupIssues(issues);
    return {
      summary,
      issues,
      groups,
      lineCount: lines.length,
      categories: CATEGORIES
    };
  }

  function RE_TIME_LIKE(L) {
    return /^\d{1,2}:\d{2}:\d{2}/.test(L) || /^\d{4}-\d{2}-\d{2}/.test(L);
  }

  function findApiLine(lines, call) {
    const path = String(call.path || '').split('?')[0];
    const status = call.status;
    const method = call.method || '';
    for (let i = 0; i < lines.length; i++) {
      const L = lines[i];
      if (status != null && L.indexOf(String(status)) >= 0 && /<--/.test(L)) {
        if (!path || L.indexOf(path) >= 0 || (call.url && L.indexOf(call.url) >= 0)) {
          return i;
        }
        if (/<--\s+\d{3}/.test(L)) return i;
      }
    }
    if (method && path) {
      for (let i = 0; i < lines.length; i++) {
        const L = lines[i];
        if (L.indexOf(method) >= 0 && L.indexOf(path) >= 0) return i;
      }
    }
    return -1;
  }

  function groupIssues(issues) {
    const map = new Map();
    issues.forEach((iss) => {
      // Group crashes (and similar) by groupKey; warnings stay individual in category view
      const key =
        iss.category === 'crash' || iss.category === 'database' || iss.category === 'api'
          ? iss.groupKey || iss.id
          : iss.groupKey || iss.id;
      if (!map.has(key)) {
        map.set(key, {
          groupKey: key,
          category: iss.category,
          title: iss.exception || iss.title,
          sourceFile: iss.sourceFile,
          sourceLine: iss.sourceLine,
          status: iss.status,
          permission: iss.permission,
          count: 0,
          issueIds: [],
          firstTime: iss.time,
          lastTime: iss.time,
          firstLine: iss.lineIndex,
          lastLine: iss.lineIndex
        });
      }
      const g = map.get(key);
      g.count += 1;
      g.issueIds.push(iss.id);
      if (iss.time) {
        if (!g.firstTime) g.firstTime = iss.time;
        g.lastTime = iss.time;
      }
      g.lastLine = iss.lineIndex;
      if (!g.sourceFile && iss.sourceFile) {
        g.sourceFile = iss.sourceFile;
        g.sourceLine = iss.sourceLine;
      }
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }

  function issuesForCategory(report, category) {
    if (!report) return [];
    return report.issues.filter((i) => i.category === category);
  }

  function groupsForCategory(report, category) {
    if (!report) return [];
    return report.groups.filter((g) => g.category === category);
  }

  function findIssue(report, id) {
    if (!report) return null;
    return report.issues.find((i) => i.id === id) || null;
  }

  function findGroup(report, groupKey) {
    if (!report) return null;
    return report.groups.find((g) => g.groupKey === groupKey) || null;
  }

  return {
    CATEGORIES,
    detect,
    issuesForCategory,
    groupsForCategory,
    findIssue,
    findGroup,
    emptySummary
  };
})();

window.LSIssueDetector = LSIssueDetector;
