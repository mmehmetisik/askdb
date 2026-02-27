/* ============================================================
   helpers.js  —  Global state aliases & utility functions
   State is managed by Store (store.js) — these vars provide
   backwards-compatible global access.
   ============================================================ */

var API_BASE = "";

// Backwards-compatible global aliases — read from Store, write via Store.
// Existing code can still read these vars; new code should use Store directly.
var lastResultData = null;
var lastColumnTypes = [];
var lastTruncated = false;
var sortColumn = -1;
var sortDirection = "asc";
var hiddenColumns = new Set();
var tableFilter = "";

var queryHistory = [];
var activeHistoryIndex = -1;
var isPreviewMode = false;

var selectedTables = new Set();

// Sync Store → global vars on state changes
if (typeof Store !== "undefined") {
  Store.on("table:dataChanged", function (t) {
    lastResultData = t.resultData;
    lastColumnTypes = t.columnTypes;
    lastTruncated = t.truncated;
    sortColumn = t.sortColumn;
    sortDirection = t.sortDirection;
    hiddenColumns = t.hiddenColumns;
    tableFilter = t.filter;
  });
  Store.on("table:sorted", function (t) { sortColumn = t.sortColumn; sortDirection = t.sortDirection; });
  Store.on("table:filtered", function (t) { tableFilter = t.filter; });
  Store.on("table:columnsChanged", function (t) { hiddenColumns = t.hiddenColumns; });
  Store.on("history:added", function (d) { queryHistory = Store.getHistory().items; activeHistoryIndex = d.index; });
  Store.on("history:selected", function (idx) { activeHistoryIndex = idx; });
  Store.on("history:previewMode", function (v) { isPreviewMode = v; });
  Store.on("schema:selectionChanged", function (s) { selectedTables = s; });
}

function escapeHtml(text) {
  var div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function fmtNum(n) {
  if (typeof n !== "number") return n;
  var locale = typeof I18n !== "undefined" ? I18n.getLocale() : "tr-TR";
  return Number.isInteger(n)
    ? n.toLocaleString(locale)
    : n.toLocaleString(locale, { maximumFractionDigits: 2 });
}

/**
 * displayValue — Hucre degerini gosterim icin formatlayici.
 * null/undefined → "NULL" gosterir, diger degerleri olduklari gibi dondurur.
 */
function displayValue(v) {
  if (v === null || v === undefined) return "NULL";
  return String(v);
}

function getAuthHeaders() {
  var headers = {
    "Content-Type": "application/json",
  };
  if (typeof I18n !== "undefined") {
    headers["X-Lang"] = I18n.getLang();
  }
  if (typeof QueryProgress !== "undefined") {
    headers["X-Session-ID"] = QueryProgress.getSessionId();
  }
  return headers;
}

function _getCookie(name) {
  var match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return match ? match[2] : null;
}

/**
 * fetchAuth — fetch wrapper that always includes credentials: "include"
 * so the HttpOnly cookie is sent automatically.
 * Also attaches CSRF token header on state-changing requests.
 */
function fetchAuth(url, options) {
  options = options || {};
  options.credentials = "include";
  // CSRF: send token header on POST/PUT/DELETE/PATCH
  var method = (options.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    var csrf = _getCookie("csrf_token");
    if (csrf) {
      options.headers = options.headers || {};
      if (options.headers instanceof Headers) {
        options.headers.set("X-CSRF-Token", csrf);
      } else {
        options.headers["X-CSRF-Token"] = csrf;
      }
    }
  }
  return fetch(url, options);
}

function handleAuthError(res) {
  if (res.status === 401) {
    fetch(API_BASE + "/api/logout", { method: "POST", credentials: "include" }).finally(function () {
      localStorage.clear();
      window.location.href = "login.html";
    });
    return true;
  }
  return false;
}

/** Show/hide empty state in center panel */
function showEmptyState() {
  var el = document.getElementById("emptyState");
  if (el) el.style.display = "flex";
}

function hideEmptyState() {
  var el = document.getElementById("emptyState");
  if (el) el.style.display = "none";
}
