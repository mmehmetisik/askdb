/* ============================================================
   chat-history.js  —  WhatsApp-style chat panel (right sidebar)
   Tek sorumluluk: Sorgu gecmisini sohbet balonlari ile gosterir.
   Balon tiklaninca ilgili sorgu sonucu center panele yuklenir.
   ============================================================ */

// ── Storage ──
function _loadHistory() {
  try {
    queryHistory = JSON.parse(localStorage.getItem("queryHistory") || "[]");
  } catch (e) {
    queryHistory = [];
  }
}

function _saveHistory() {
  localStorage.setItem("queryHistory", JSON.stringify(queryHistory));
}

function getHistory() {
  return queryHistory;
}

/**
 * saveToHistory — Yeni bir sorgu sonucunu gecmise ekler.
 * result, columnTypes, rowCount ve queryTime bilgilerini de saklar.
 */
function saveToHistory(question, sql, result, columnTypes, rowCount, queryTime) {
  _loadHistory();
  queryHistory.unshift({
    question: question,
    sql: sql,
    result: result || null,
    columnTypes: columnTypes || [],
    rowCount: rowCount || 0,
    queryTime: queryTime || 0,
    time: Date.now(),
  });
  if (queryHistory.length > 30) queryHistory.length = 30;
  _saveHistory();

  // Yeni eklenen sonuc aktif olsun
  activeHistoryIndex = 0;
  renderChatHistory();
}

// ── Render ──
function renderChatHistory() {
  var container = document.getElementById("chatMessages");
  if (!container) return;
  _loadHistory();

  if (queryHistory.length === 0) {
    container.innerHTML =
      '<div class="chat-empty">' +
      '<i class="fas fa-comments"></i>' +
      "<span>" + t("chat.empty") + "</span>" +
      '<span class="chat-empty-sub">' + t("chat.emptyDescription").replace("\\n", "<br>") + '</span>' +
      "</div>";
    _updateBadge(0);
    return;
  }

  // Oldest first → newest at bottom (like WhatsApp)
  var reversed = queryHistory.slice().reverse();
  var html = "";
  var lastDateStr = "";

  reversed.forEach(function (h, i) {
    var realIdx = queryHistory.length - 1 - i;
    var dateStr = _formatDate(h.time);
    var timeStr = _formatTime(h.time);
    var isActive = realIdx === activeHistoryIndex;

    // Date separator
    if (dateStr !== lastDateStr) {
      html += '<div class="chat-date-sep"><span>' + dateStr + "</span></div>";
      lastDateStr = dateStr;
    }

    // User bubble (question) — right side
    html += '<div class="chat-bubble chat-user">';
    html += '<div class="chat-text">' + escapeHtml(h.question) + "</div>";
    html += '<div class="chat-meta"><span class="chat-time">' + timeStr + "</span></div>";
    html += "</div>";

    // System bubble (result summary) — left side, no SQL code
    if (h.sql && h.sql !== "HATA") {
      var activeClass = isActive ? " active-result" : "";
      html += '<div class="chat-bubble chat-system' + activeClass + '" onclick="loadHistoryResult(' + realIdx + ')">';

      // Result meta — compact summary
      html += '<div class="chat-result-meta">';
      html += '<span class="meta-success"><i class="fas fa-check-circle"></i> ' + (h.rowCount > 0 ? t("common.rowCount", {count: h.rowCount}) : t("chat.completed")) + "</span>";
      if (h.queryTime > 0) {
        html += '<span class="meta-time"><i class="fas fa-stopwatch"></i> ' + h.queryTime.toFixed(2) + "s</span>";
      }
      html += '<span class="meta-view"><i class="fas fa-eye"></i> ' + t("chat.view") + '</span>';
      html += "</div>";

      html += '<div class="chat-meta">';
      html +=
        '<button class="chat-action" onclick="event.stopPropagation();rerunQuery(' +
        realIdx +
        ')" title="' + t("chat.rerun") + '"><i class="fas fa-redo-alt"></i></button>';
      html +=
        '<button class="chat-action chat-action-del" onclick="event.stopPropagation();deleteHistoryItem(' +
        realIdx +
        ')" title="' + t("common.delete") + '"><i class="fas fa-trash-alt"></i></button>';
      html += "</div></div>";
    }
  });

  container.innerHTML = html;
  container.scrollTop = container.scrollHeight;
  _updateBadge(queryHistory.length);
}

// ── Load history result into center panel ──
function loadHistoryResult(index) {
  _loadHistory();
  var h = queryHistory[index];
  if (!h) return;

  activeHistoryIndex = index;
  isPreviewMode = false;

  // Hide preview banner
  var banner = document.getElementById("previewBanner");
  if (banner) banner.style.display = "none";

  hideEmptyState();

  var resultsArea = document.getElementById("resultsArea");
  var sqlOutput = document.getElementById("sqlOutput");
  var sqlSection = document.getElementById("sqlSection");
  var errorBox = document.getElementById("errorBox");
  if (errorBox) errorBox.style.display = "none";
  if (sqlSection) sqlSection.style.display = "block";

  // Reset state
  lastColumnTypes = h.columnTypes || [];
  lastTruncated = false;
  sortColumn = -1;
  sortDirection = "asc";
  hiddenColumns = new Set();
  tableFilter = "";
  var tableToolbar = document.getElementById("tableToolbar");
  if (tableToolbar) tableToolbar.style.display = "none";
  var searchInput = document.getElementById("tableSearchInput");
  if (searchInput) searchInput.value = "";

  // SQL
  if (sqlOutput) sqlOutput.textContent = h.sql || t("sql.noSql");
  if (resultsArea) resultsArea.style.display = "flex";
  var clearBtn = document.getElementById("clearResultsBtn");
  if (clearBtn) clearBtn.style.display = "inline-flex";

  // Table
  if (h.result && Array.isArray(h.result)) {
    lastResultData = h.result;
    renderTable(h.result);
  }

  // Timer
  var timer = document.getElementById("queryTimer");
  var timerValue = document.getElementById("queryTimerValue");
  if (timer && h.queryTime > 0) {
    timerValue.textContent = h.queryTime.toFixed(2) + "s";
    timer.style.display = "flex";
  }

  // Update active bubble highlight
  renderChatHistory();
}

// ── Actions ──
function rerunQuery(index) {
  _loadHistory();
  if (!queryHistory[index]) return;
  var input = document.getElementById("queryInput");
  if (input) {
    input.value = queryHistory[index].question;
    input.focus();
  }
}

function deleteHistoryItem(index) {
  _loadHistory();
  queryHistory.splice(index, 1);
  _saveHistory();
  if (activeHistoryIndex === index) {
    activeHistoryIndex = -1;
  } else if (activeHistoryIndex > index) {
    activeHistoryIndex--;
  }
  renderChatHistory();
}

function clearHistory() {
  if (queryHistory.length === 0) return;
  queryHistory = [];
  activeHistoryIndex = -1;
  localStorage.removeItem("queryHistory");
  renderChatHistory();
}

// ── Typing Indicator ──
function showTypingIndicator() {
  var el = document.getElementById("typingIndicator");
  if (el) el.classList.add("visible");
  // Scroll chat to bottom
  var msgs = document.getElementById("chatMessages");
  if (msgs) setTimeout(function () { msgs.scrollTop = msgs.scrollHeight; }, 50);
}

function hideTypingIndicator() {
  var el = document.getElementById("typingIndicator");
  if (el) el.classList.remove("visible");
  var step = document.getElementById("typingStep");
  if (step) step.textContent = "";
}

// ── Helpers ──
function _truncSQL(sql, max) {
  return sql.length > max ? sql.substring(0, max) + "\u2026" : sql;
}

function _formatTime(ts) {
  return new Date(ts).toLocaleTimeString(I18n.getLocale(), {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function _formatDate(ts) {
  var d = new Date(ts);
  var now = new Date();
  var diff = Math.floor((now - d) / 86400000);
  if (diff === 0) return t("chat.today");
  if (diff === 1) return t("chat.yesterday");
  return d.toLocaleDateString(I18n.getLocale(), { day: "2-digit", month: "long" });
}

function _updateBadge(count) {
  var badge = document.getElementById("historyBadge");
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count;
    badge.style.display = "inline";
  } else {
    badge.style.display = "none";
  }
}

// Legacy compat
function renderHistory() {
  renderChatHistory();
}

// ── Init ──
_loadHistory();
renderChatHistory();

// i18n yuklendikten sonra yeniden render et (async timing fix)
if (typeof I18n !== "undefined") {
  I18n.onChange(function () { renderChatHistory(); });
}
