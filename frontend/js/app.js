/* ============================================================
   app.js  —  Main app entry point, query handler, misc actions
   Sorgu artik sag paneldeki chat input'tan gonderilir.
   ============================================================ */

// DOM refs
var runBtn = document.getElementById("runBtn");
var queryInput = document.getElementById("queryInput");
var sqlOutput = document.getElementById("sqlOutput");
var resultContainer = document.getElementById("resultContainer");
var errorBox = document.getElementById("errorBox");
var resultsArea = document.getElementById("resultsArea");
var rowCount = document.getElementById("rowCount");
var skeletonArea = document.getElementById("skeletonArea");

// ── User Info ──
(function loadUserInfo() {
  var name = localStorage.getItem("username") || "user";
  var role = localStorage.getItem("role") || "user";
  var avatarEl = document.getElementById("userAvatar");
  var nameEl = document.getElementById("userName");
  var roleEl = document.getElementById("userRole");
  if (avatarEl) avatarEl.textContent = name.charAt(0).toUpperCase();
  if (nameEl) nameEl.textContent = "@" + name;
  if (roleEl) roleEl.textContent = role === "admin" ? "Admin" : t("common.user");
})();

// ── Connection Health Check ──
(async function checkConnection() {
  var dot = document.getElementById("connDot");
  var text = document.getElementById("connText");
  var dbBadge = document.getElementById("dbBadge");
  try {
    var res = await fetch(API_BASE + "/api/health");
    var data = await res.json();
    if (data.status === "ok") {
      if (dot) dot.classList.remove("disconnected");
      if (text) text.textContent = t("connection.connected");
      // LLM bilgisini goster
      if (data.llm && data.llm.active_provider) {
        var providerName = data.llm.active_provider.split("/")[0].toUpperCase();
        var isTrinoMode = data.db_mode === "trino" && data.trino_active;
        var hasTrinoAccess = localStorage.getItem('trino_access') === 'true' || localStorage.getItem('role') === 'admin';
        if (dbBadge) {
          if (isTrinoMode && hasTrinoAccess) {
            dbBadge.className = 'db-badge db-badge-trino';
            dbBadge.innerHTML = '<i class="fas fa-project-diagram"></i> Cross-DB'
              + ' <span class="llm-badge">' + providerName + '</span>';
          } else {
            var dbLabel = (data.db_type || "PostgreSQL").toUpperCase();
            dbBadge.className = 'db-badge db-badge-direct';
            dbBadge.innerHTML = '<i class="fas fa-database"></i> Direct · ' + dbLabel
              + ' <span class="llm-badge">' + providerName + '</span>';
          }
        }
      }
    } else {
      if (dot) dot.classList.add("disconnected");
      if (text) text.textContent = t("connection.error");
    }
  } catch (e) {
    if (dot) dot.classList.add("disconnected");
    if (text) text.textContent = t("connection.unreachable");
  }
})();

// ── Query Chips ──
function fillQuery(text) {
  queryInput.value = text;
  queryInput.focus();
  _autoResizeInput();
}

// ── Copy SQL ──
function copySQL() {
  var sql = sqlOutput.textContent;
  navigator.clipboard.writeText(sql).then(function () {
    var btn = document.querySelector("#sqlSection .btn-sm");
    if (!btn) return;
    var orig = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-check"></i> ' + t("common.copied");
    setTimeout(function () { btn.innerHTML = orig; }, 1500);
  });
}

// ── Skeleton ──
function showSkeleton() { if (skeletonArea) skeletonArea.style.display = "flex"; }
function hideSkeleton() { if (skeletonArea) skeletonArea.style.display = "none"; }

// ── Auto-resize textarea ──
function _autoResizeInput() {
  queryInput.style.height = "auto";
  queryInput.style.height = Math.min(queryInput.scrollHeight, 200) + "px";
}
queryInput.addEventListener("input", _autoResizeInput);

// ── Main Query Handler ──
async function runQuery() {
  var query = queryInput.value.trim();
  if (!query) return;

  // Disable input
  runBtn.disabled = true;
  queryInput.disabled = true;
  queryInput.value = "";
  _autoResizeInput();

  // Clear center panel
  hideEmptyState();
  isPreviewMode = false;
  var banner = document.getElementById("previewBanner");
  if (banner) banner.style.display = "none";
  errorBox.style.display = "none";
  resultsArea.style.display = "none";
  var sqlSection = document.getElementById("sqlSection");
  if (sqlSection) sqlSection.style.display = "block";
  resultContainer.innerHTML = "";
  rowCount.textContent = "";
  var tableToolbar = document.getElementById("tableToolbar");
  if (tableToolbar) tableToolbar.style.display = "none";
  var searchInput = document.getElementById("tableSearchInput");
  if (searchInput) searchInput.value = "";
  var truncWarn = document.getElementById("truncatedWarning");
  if (truncWarn) truncWarn.style.display = "none";

  // SQL edit modunu kapat
  if (sqlEditMode) {
    sqlEditMode = true;
    toggleSqlEdit();
  }

  // Reset state
  lastResultData = null;
  lastColumnTypes = [];
  lastTruncated = false;
  sortColumn = -1;
  sortDirection = "asc";
  hiddenColumns = new Set();
  tableFilter = "";

  showSkeleton();
  showTypingIndicator();

  var startTime = performance.now();

  try {
    var payload = { query: query };
    if (selectedTables.size > 0) {
      payload.selected_tables = Array.from(selectedTables);
    }
    var res = await fetch(API_BASE + "/api/query", {
      method: "POST",
      headers: getAuthHeaders(),
      credentials: "include",
      body: JSON.stringify(payload),
    });

    if (handleAuthError(res)) return;

    if (!res.ok) {
      var errData = null;
      try { errData = await res.json(); } catch (e) { /* ignore */ }
      var errMsg = (errData && errData.detail) ? errData.detail : t("common.serverError", {status: res.status});
      throw new Error(errMsg);
    }

    var data = await res.json();
    var elapsed = (performance.now() - startTime) / 1000;

    hideSkeleton();
    hideTypingIndicator();

    // Cache durumunu logla
    var cacheHeader = res.headers.get("X-Cache");
    if (cacheHeader === "HIT") {
      console.log("[CACHE] Sonuc cache'ten geldi");
    }

    // Backend meta verileri sakla
    lastColumnTypes = data.column_types || [];
    lastTruncated = data.truncated || false;

    // SQL
    sqlOutput.textContent = data.sql || t("sql.notGenerated");
    resultsArea.style.display = "flex";
    var clearBtn = document.getElementById("clearResultsBtn");
    if (clearBtn) clearBtn.style.display = "inline-flex";

    // Row count
    var dataRowCount = 0;
    if (data.result && Array.isArray(data.result) && data.result.length > 1) {
      dataRowCount = data.result.length - 1;
    }

    // Table
    if (data.result) {
      lastResultData = data.result;
      currentPage = 1; // Yeni sorgu — ilk sayfaya don
      if (Array.isArray(data.result)) {
        renderTable(data.result);
      } else {
        var p = document.createElement("p");
        p.style.padding = "1rem";
        p.textContent = data.result;
        resultContainer.appendChild(p);
      }
    }

    // Show "Rapora Gonder" button
    var sendReportBtn = document.getElementById("sendReportBtn");
    if (sendReportBtn && dataRowCount > 0) {
      var role = localStorage.getItem("role");
      if (role === "admin" || role === "analyst") {
        sendReportBtn.style.display = "inline-flex";
      }
    }

    // Truncated warning
    if (data.truncated) {
      if (truncWarn) truncWarn.style.display = "block";
    }

    // Timer
    var timer = document.getElementById("queryTimer");
    var timerValue = document.getElementById("queryTimerValue");
    if (timer) {
      timerValue.textContent = elapsed.toFixed(2) + "s";
      timer.style.display = "flex";
    }

    // Save to chat history
    saveToHistory(query, data.sql, data.result, data.column_types, dataRowCount, elapsed);

    // Favori durumunu guncelle
    updateFavoriteBtn();

  } catch (err) {
    hideSkeleton();
    hideTypingIndicator();
    errorBox.innerHTML = '<b><i class="fas fa-exclamation-triangle"></i> ' + t("common.error") + ':</b> ' + escapeHtml(err.message);
    errorBox.style.display = "block";

    // Save error to history
    saveToHistory(query, t("chat.errorLabel"), null, [], 0, 0);
  } finally {
    runBtn.disabled = false;
    queryInput.disabled = false;
    queryInput.focus();
  }
}

// ── WebSocket Progress ──
(function initProgress() {
  if (typeof QueryProgress === "undefined") return;
  QueryProgress.connect();
  QueryProgress.onProgress(function (msg) {
    var stepEl = document.getElementById("typingStep");
    if (!stepEl) return;
    if (msg.step === "complete") {
      stepEl.textContent = "";
      return;
    }
    var key = "ws." + msg.step.replace(/_([a-z])/g, function (_, c) { return c.toUpperCase(); });
    stepEl.textContent = t(key);
  });
})();

// ── Button & keyboard handlers ──
runBtn.addEventListener("click", runQuery);

queryInput.addEventListener("keydown", function (e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    runQuery();
  }
});

// ── Clear Results ──
function clearResults() {
  if (resultsArea) resultsArea.style.display = "none";
  if (errorBox) errorBox.style.display = "none";
  var banner = document.getElementById("previewBanner");
  if (banner) banner.style.display = "none";
  var timer = document.getElementById("queryTimer");
  if (timer) timer.style.display = "none";
  var clearBtn = document.getElementById("clearResultsBtn");
  if (clearBtn) clearBtn.style.display = "none";
  var truncWarn = document.getElementById("truncatedWarning");
  if (truncWarn) truncWarn.style.display = "none";

  isPreviewMode = false;
  activeHistoryIndex = -1;
  lastResultData = null;
  lastColumnTypes = [];
  lastTruncated = false;

  showEmptyState();
  renderChatHistory();
}

// ── Panel Toggles ──
function toggleSidebar() {
  var layout = document.querySelector(".app-layout");
  var btn = document.getElementById("toggleSidebar");
  layout.classList.toggle("sidebar-collapsed");
  if (btn) btn.classList.toggle("active");
}

function toggleChatPanel() {
  var layout = document.querySelector(".app-layout");
  var btn = document.getElementById("toggleChat");
  layout.classList.toggle("chat-collapsed");
  if (btn) btn.classList.toggle("active");
}

// ── Logout ──
function logout() {
  fetch(API_BASE + "/api/logout", { method: "POST", credentials: "include" }).finally(function () {
    localStorage.clear();
    window.location.href = "login.html";
  });
}
