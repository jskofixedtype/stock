/*
 * storage.js — localStorage 로드/저장 유틸 (stock.ib.* 네임스페이스)
 * window.IBStore 로 노출.
 */
(function (root) {
  'use strict';

  var PREFIX = 'stock.ib.';
  var KEYS = {
    settings: PREFIX + 'settings',
    history: PREFIX + 'history',
    apiKey: PREFIX + 'apiKey'
  };

  function available() {
    try {
      var k = PREFIX + '__test';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      return true;
    } catch (e) {
      return false;
    }
  }

  function get(key, def) {
    if (!available()) return def;
    try {
      var raw = localStorage.getItem(key);
      return raw == null ? def : JSON.parse(raw);
    } catch (e) {
      return def;
    }
  }

  function set(key, val) {
    if (!available()) return false;
    try {
      localStorage.setItem(key, JSON.stringify(val));
      return true;
    } catch (e) {
      return false;
    }
  }

  root.IBStore = {
    KEYS: KEYS,
    available: available,
    loadSettings: function () { return get(KEYS.settings, null); },
    saveSettings: function (s) { return set(KEYS.settings, s); },
    loadHistory: function () { return get(KEYS.history, []); },
    saveHistory: function (h) { return set(KEYS.history, h); },
    loadApiKey: function () { return get(KEYS.apiKey, ''); },
    saveApiKey: function (k) { return set(KEYS.apiKey, k); }
  };
})(typeof window !== 'undefined' ? window : this);
