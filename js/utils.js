/**
 * Logcat Studio — Utility helpers
 */
const LSUtils = (() => {
  'use strict';

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function debounce(fn, wait) {
    let t = null;
    return function debounced(...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const val = bytes / Math.pow(1024, i);
    return `${val < 10 && i > 0 ? val.toFixed(1) : Math.round(val)} ${units[i]}`;
  }

  function formatNumber(n) {
    return Number(n).toLocaleString();
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand('copy');
      } catch (_) { /* ignore */ }
      document.body.removeChild(ta);
      return ok;
    }
  }

  function downloadText(filename, content, mime) {
    const blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function toast(message, type) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast-msg ${type || 'info'}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.2s';
      setTimeout(() => el.remove(), 220);
    }, 2800);
  }

  function storageGet(key, fallback) {
    try {
      const raw = localStorage.getItem(`logcat-studio:${key}`);
      if (raw === null || raw === undefined) return fallback;
      return JSON.parse(raw);
    } catch (_) {
      return fallback;
    }
  }

  function storageSet(key, value) {
    try {
      localStorage.setItem(`logcat-studio:${key}`, JSON.stringify(value));
      return true;
    } catch (_) {
      return false;
    }
  }

  function isUrl(str) {
    return typeof str === 'string' && /^https?:\/\/[^\s"'<>]+$/i.test(str.trim());
  }

  function isImageUrl(str) {
    if (!isUrl(str)) return false;
    return /\.(png|jpe?g|gif|webp|svg|bmp|ico)(\?.*)?$/i.test(str.trim()) ||
      /via\.placeholder\.com/i.test(str);
  }

  function isHexColor(str) {
    return typeof str === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(str.trim());
  }

  function isUuid(str) {
    return typeof str === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str.trim());
  }

  function isBase64Image(str) {
    return typeof str === 'string' &&
      /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/i.test(str.trim());
  }

  function isUnixTimestamp(n) {
    if (typeof n !== 'number' || !Number.isFinite(n)) return false;
    // Seconds (10 digits) or millis (13 digits) in a reasonable range
    if (n > 1e9 && n < 2e10) return 's';
    if (n > 1e12 && n < 2e13) return 'ms';
    return false;
  }

  function formatTimestamp(n) {
    const kind = isUnixTimestamp(n);
    if (!kind) return null;
    const ms = kind === 's' ? n * 1000 : n;
    try {
      return new Date(ms).toLocaleString();
    } catch (_) {
      return null;
    }
  }

  function truncate(str, len) {
    const s = String(str);
    if (s.length <= len) return s;
    return s.slice(0, len - 1) + '…';
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function safeJsonParse(text) {
    try {
      return { ok: true, value: JSON.parse(text) };
    } catch (err) {
      return { ok: false, error: err };
    }
  }

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function countLines(text) {
    if (!text) return 0;
    return String(text).split(/\r\n|\r|\n/).length;
  }

  return {
    escapeHtml,
    debounce,
    formatBytes,
    formatNumber,
    copyText,
    downloadText,
    toast,
    storageGet,
    storageSet,
    isUrl,
    isImageUrl,
    isHexColor,
    isUuid,
    isBase64Image,
    isUnixTimestamp,
    formatTimestamp,
    truncate,
    nowIso,
    safeJsonParse,
    deepClone,
    countLines
  };
})();

window.LSUtils = LSUtils;
