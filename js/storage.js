/**
 * Logcat Studio — Local storage (history + preferences)
 */
const LSStorage = (() => {
  'use strict';

  const HISTORY_KEY = 'history';
  const THEME_KEY = 'theme';
  const INDENT_KEY = 'indent';
  const PANEL_KEY = 'panelWidth';
  const MAX_HISTORY = 10;

  function getTheme() {
    return LSUtils.storageGet(THEME_KEY, 'dark');
  }

  function setTheme(theme) {
    LSUtils.storageSet(THEME_KEY, theme === 'light' ? 'light' : 'dark');
  }

  function getIndent() {
    return LSUtils.storageGet(INDENT_KEY, '2');
  }

  function setIndent(style) {
    LSUtils.storageSet(INDENT_KEY, style);
  }

  function getPanelWidth() {
    return LSUtils.storageGet(PANEL_KEY, null);
  }

  function setPanelWidth(px) {
    LSUtils.storageSet(PANEL_KEY, px);
  }

  function getHistory() {
    const list = LSUtils.storageGet(HISTORY_KEY, []);
    return Array.isArray(list) ? list : [];
  }

  function addHistory(entry) {
    const list = getHistory();
    const item = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      preview: LSUtils.truncate(String(entry.preview || entry.text || ''), 80),
      text: String(entry.text || ''),
      type: entry.type || 'json',
      size: entry.size || LSUtils.formatBytes(new Blob([entry.text || '']).size),
      at: entry.at || LSUtils.nowIso()
    };

    // Dedupe identical recent paste
    const filtered = list.filter((h) => h.text !== item.text);
    filtered.unshift(item);
    LSUtils.storageSet(HISTORY_KEY, filtered.slice(0, MAX_HISTORY));
    return getHistory();
  }

  function clearHistory() {
    LSUtils.storageSet(HISTORY_KEY, []);
    return [];
  }

  function removeHistory(id) {
    const list = getHistory().filter((h) => h.id !== id);
    LSUtils.storageSet(HISTORY_KEY, list);
    return list;
  }

  return {
    getTheme,
    setTheme,
    getIndent,
    setIndent,
    getPanelWidth,
    setPanelWidth,
    getHistory,
    addHistory,
    clearHistory,
    removeHistory,
    MAX_HISTORY
  };
})();

window.LSStorage = LSStorage;
