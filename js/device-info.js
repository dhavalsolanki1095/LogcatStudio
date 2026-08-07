/**
 * Logcat Studio — Device / app info extraction from Logcat
 * Never invents values — missing fields stay null → UI shows "Not detected"
 *
 * Prefers Android Studio .logcat metadata when provided, then scans log lines.
 */
const LSDeviceInfo = (() => {
  'use strict';

  const FIELDS = [
    { key: 'manufacturer', label: 'Manufacturer' },
    { key: 'brand', label: 'Brand' },
    { key: 'model', label: 'Model' },
    { key: 'device', label: 'Device' },
    { key: 'product', label: 'Product' },
    { key: 'hardware', label: 'Hardware' },
    { key: 'androidVersion', label: 'Android' },
    { key: 'sdk', label: 'SDK / API' },
    { key: 'ram', label: 'RAM' },
    { key: 'availableRam', label: 'Available RAM' },
    { key: 'heap', label: 'Heap' },
    { key: 'abi', label: 'ABI' },
    { key: 'packageName', label: 'Package' },
    { key: 'appVersion', label: 'App Version' },
    { key: 'versionCode', label: 'Version Code' },
    { key: 'buildType', label: 'Build' }
  ];

  function empty() {
    const o = {};
    FIELDS.forEach((f) => {
      o[f.key] = null;
    });
    return o;
  }

  function setIfEmpty(info, key, value) {
    if (info[key] != null) return;
    const v = cleanValue(value);
    if (!v) return;
    info[key] = v;
  }

  function setForce(info, key, value) {
    const v = cleanValue(value);
    if (!v) return;
    info[key] = v;
  }

  function cleanValue(value) {
    let v = String(value == null ? '' : value).trim();
    if (!v) return '';
    // Strip trailing JSON/punctuation noise
    v = v.replace(/[",;}]+$/g, '').trim();
    // Reject obvious garbage (audio params, hex dumps)
    if (/^0x[0-9a-f]+$/i.test(v)) return '';
    if (/vol_level|pga_gain|dac_|adc_/i.test(v)) return '';
    if (v.length > 80) return '';
    return v;
  }

  function matchKV(line, patterns, info, key, force) {
    for (let p = 0; p < patterns.length; p++) {
      const m = line.match(patterns[p]);
      if (m && m[1]) {
        if (force) setForce(info, key, m[1]);
        else setIfEmpty(info, key, m[1]);
        return true;
      }
    }
    return false;
  }

  function applyStudioMeta(info, meta) {
    if (!meta || typeof meta !== 'object') return;
    // Studio metadata is authoritative for the connected device
    if (meta.manufacturer) setForce(info, 'manufacturer', meta.manufacturer);
    if (meta.model) setForce(info, 'model', meta.model);
    if (meta.androidVersion) setForce(info, 'androidVersion', meta.androidVersion);
    if (meta.sdk) setForce(info, 'sdk', meta.sdk);
    if (meta.packageName) setForce(info, 'packageName', meta.packageName);
    // Brand often equals manufacturer for PAX devices when Build.BRAND is absent
    if (meta.manufacturer) setIfEmpty(info, 'brand', meta.manufacturer);
  }

  /**
   * @param {string} text — expanded log lines (or raw text)
   * @param {{ deviceMeta?: object }} opts
   */
  function extract(text, opts) {
    const options = opts || {};
    const info = empty();

    // 1) Android Studio .logcat header (highest confidence)
    applyStudioMeta(info, options.deviceMeta);

    // 2) Scan log message lines for remaining / supplemental fields
    const lines = Array.isArray(options.lines)
      ? options.lines
      : String(text || '').split(/\r\n|\r|\n/);
    // Cap line scan when studio metadata already filled core fields
    const hasCore =
      !!(options.deviceMeta && options.deviceMeta.model && options.deviceMeta.manufacturer);
    const limit = hasCore
      ? Math.min(lines.length, 8000)
      : Math.min(lines.length, options.lineLimit || 20000);

    for (let i = 0; i < limit; i++) {
      const line = lines[i];
      if (!line || line.length > 2500) continue;

      matchKV(
        line,
        [
          /(?:Build\.MODEL|ro\.product\.model)\s*[=:]\s*([^\s,;|"']+)/i,
          /(?:^|\s)(?:Device\s*Model|MODEL)\s*[=:]\s*([A-Za-z0-9._+-]+)/i,
          /"model"\s*:\s*"([^"]+)"/i
        ],
        info,
        'model'
      );

      matchKV(
        line,
        [
          /(?:Build\.MANUFACTURER|ro\.product\.manufacturer)\s*[=:]\s*([^\s,;|"']+)/i,
          /(?:^|\s)MANUFACTURER\s*[=:]\s*([A-Za-z0-9._+-]+)/i,
          /"manufacturer"\s*:\s*"([^"]+)"/i
        ],
        info,
        'manufacturer'
      );

      matchKV(
        line,
        [
          /(?:Build\.BRAND|ro\.product\.brand)\s*[=:]\s*([^\s,;|"']+)/i,
          /(?:^|\s)Brand\s*[=:]\s*([A-Za-z0-9._+-]+)/i,
          /[?&]device_type=([A-Za-z0-9._+-]+)/i
        ],
        info,
        'brand'
      );

      // Avoid bare "device:" — matches audio "device:0x0 vol_level:0x1"
      matchKV(
        line,
        [
          /(?:Build\.DEVICE|ro\.product\.device)\s*[=:]\s*([^\s,;|"']+)/i,
          /"device"\s*:\s*"([^"]+)"/i
        ],
        info,
        'device'
      );

      matchKV(
        line,
        [
          /(?:Build\.PRODUCT|ro\.product\.name)\s*[=:]\s*([^\s,;|"']+)/i,
          /"product"\s*:\s*"([^"]+)"/i
        ],
        info,
        'product'
      );

      matchKV(
        line,
        [
          /(?:Build\.HARDWARE|ro\.hardware)\s*[=:]\s*([^\s,;|"']+)/i,
          /"hardware"\s*:\s*"([^"]+)"/i
        ],
        info,
        'hardware'
      );

      matchKV(
        line,
        [
          /(?:ro\.build\.version\.release|VERSION\.RELEASE|Android\s*Version)\s*[=:]\s*([\d.]+)/i,
          /"release"\s*:\s*"([\d.]+)"/i
        ],
        info,
        'androidVersion'
      );

      matchKV(
        line,
        [
          /(?:SDK_INT|ro\.build\.version\.sdk|API\s*Level)\s*[=:]\s*(\d{2,3})/i,
          /"majorVersion"\s*:\s*(\d{2,3})/i,
          /\bAPI\s+(\d{2,3})\b/i
        ],
        info,
        'sdk'
      );

      matchKV(
        line,
        [
          /\b(?:totalMem|Total\s*RAM|MemTotal)\s*[=:]\s*([\d.]+\s*(?:GB|MB|KB|B)?|\d+)/i,
          /(\d+)\s*GB\s*RAM/i
        ],
        info,
        'ram'
      );

      matchKV(
        line,
        [/\b(?:Avail(?:able)?(?:Mem|RAM)|free\s*RAM)\s*[=:]\s*([\d.]+\s*(?:GB|MB|KB)?|\d+)/i],
        info,
        'availableRam'
      );

      matchKV(
        line,
        [/\b(?:Heap(?:Size)?|maxHeap|dalvik\.vm\.heapsize)\s*[=:]\s*([\d.]+\s*(?:GB|MB|KB)?|\d+)/i],
        info,
        'heap'
      );

      matchKV(
        line,
        [
          /\b(?:Build\.SUPPORTED_ABIS|ro\.product\.cpu\.abi|primaryCpuAbi)\s*[=:]\s*([a-z0-9_-]+)/i,
          /\b(arm64-v8a|armeabi-v7a|armeabi|x86_64|x86)\b/
        ],
        info,
        'abi'
      );

      matchKV(
        line,
        [
          /\b(?:packageName|applicationId)\s*[=:]\s*([a-zA-Z]\w*(?:\.[a-zA-Z]\w*)+)/i,
          /\bpackageName\s+([a-zA-Z]\w*(?:\.[a-zA-Z]\w*)+)\b/i
        ],
        info,
        'packageName'
      );

      matchKV(
        line,
        [
          /\b(?:versionName|App Version)\s*[=:]\s*([\w.-]+)/i,
          /[?&]app_version=([\w.-]+)/i,
          /versionName['"=:\s]+([\w.-]+)/i
        ],
        info,
        'appVersion'
      );

      matchKV(
        line,
        [/\b(?:versionCode|VERSION_CODE)\s*[=:]\s*(\d+)/i],
        info,
        'versionCode'
      );

      matchKV(
        line,
        [
          /\b(?:buildType|buildVariant|Build Type)\s*[=:]\s*(debug|release|[\w.-]+)/i,
          /\bBuild:\s*(debug|release)\b/i
        ],
        info,
        'buildType'
      );
    }

    if (info.packageName && /Exception$|Error$/.test(info.packageName)) {
      info.packageName = null;
    }

    // Reject system service applicationIds if somehow set
    if (
      info.packageName &&
      (/^android\./i.test(info.packageName) ||
        /@/.test(info.packageName) ||
        info.packageName === 'adbd' ||
        info.packageName === 'system_server')
    ) {
      info.packageName = null;
    }

    return info;
  }

  function displayValue(v) {
    return v == null || v === '' ? 'Not detected' : String(v);
  }

  return { FIELDS, empty, extract, displayValue };
})();

window.LSDeviceInfo = LSDeviceInfo;
