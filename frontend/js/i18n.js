/* ============================================================
   i18n.js  —  Internationalization module (TR/EN)
   IIFE — exposes window.I18n and window.t()
   ============================================================ */
var I18n = (function () {
  var _lang = "tr";
  var _strings = {};
  var _loaded = false;
  var _callbacks = [];

  function _detect() {
    var saved = localStorage.getItem("app_lang");
    if (saved && (saved === "tr" || saved === "en")) return saved;
    var nav = (navigator.language || "tr").toLowerCase();
    return nav.startsWith("en") ? "en" : "tr";
  }

  async function init() {
    _lang = _detect();
    await _loadStrings(_lang);
    _applyDOM();
    _loaded = true;
    _callbacks.forEach(function (fn) { try { fn(_lang); } catch (e) { /* ignore */ } });
  }

  async function _loadStrings(lang) {
    try {
      var basePath = "";
      var scripts = document.querySelectorAll("script[src*='i18n.js']");
      if (scripts.length > 0) {
        var src = scripts[0].getAttribute("src");
        basePath = src.substring(0, src.lastIndexOf("/js/"));
      }
      var resp = await fetch(basePath + "/locales/" + lang + ".json?v=1.0.2");
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      _strings = await resp.json();
    } catch (e) {
      console.warn("[i18n] Could not load " + lang + ".json:", e.message);
      _strings = {};
    }
  }

  function t(key, params) {
    var val = _resolve(key);
    if (val === undefined) return key;
    if (params) {
      Object.keys(params).forEach(function (k) {
        val = val.replace(new RegExp("\\{" + k + "\\}", "g"), params[k]);
      });
    }
    return val;
  }

  function _resolve(key) {
    var parts = key.split(".");
    var obj = _strings;
    for (var i = 0; i < parts.length; i++) {
      if (obj === undefined || obj === null) return undefined;
      obj = obj[parts[i]];
    }
    return typeof obj === "string" ? obj : undefined;
  }

  function _applyDOM() {
    // data-i18n → textContent
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var key = el.getAttribute("data-i18n");
      var val = _resolve(key);
      if (val !== undefined) el.textContent = val;
    });
    // data-i18n-placeholder → placeholder
    document.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) {
      var key = el.getAttribute("data-i18n-placeholder");
      var val = _resolve(key);
      if (val !== undefined) el.placeholder = val;
    });
    // data-i18n-title → title
    document.querySelectorAll("[data-i18n-title]").forEach(function (el) {
      var key = el.getAttribute("data-i18n-title");
      var val = _resolve(key);
      if (val !== undefined) el.title = val;
    });
    // data-i18n-html → innerHTML
    document.querySelectorAll("[data-i18n-html]").forEach(function (el) {
      var key = el.getAttribute("data-i18n-html");
      var val = _resolve(key);
      if (val !== undefined) el.innerHTML = val;
    });
  }

  async function setLang(lang) {
    if (lang !== "tr" && lang !== "en") return;
    _lang = lang;
    localStorage.setItem("app_lang", lang);
    await _loadStrings(lang);
    _applyDOM();
    _callbacks.forEach(function (fn) { fn(lang); });
  }

  function getLang() {
    return _lang;
  }

  function onChange(fn) {
    _callbacks.push(fn);
  }

  function getLocale() {
    return _lang === "tr" ? "tr-TR" : "en-US";
  }

  return {
    init: init,
    t: t,
    setLang: setLang,
    getLang: getLang,
    getLocale: getLocale,
    onChange: onChange,
    applyDOM: _applyDOM,
  };
})();

// Global shortcut
function t(key, params) {
  return I18n.t(key, params);
}

// Auto-init
I18n.init();
