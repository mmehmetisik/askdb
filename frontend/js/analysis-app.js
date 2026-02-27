/* ============================================================
   analysis-app.js  —  Analiz Workspace controller (v2 - Backend Powered)
   Tum veri islemleri backend'de (Pandas) yapilir.
   Frontend sadece sayfalanmis veri gosterir ve komut gonderir.
   ============================================================ */

// ── State ──
var currentReport = null;
var aCurrentPage = 1;
var aPageSize = 100;
var aTotalRows = 0;
var aTotalPages = 1;
var aHeaders = [];
var aSortCol = null;
var aSortDir = "asc";
var aSearchText = "";
var aEdaData = null;
var aOperationHistory = [];
var activeEdaTab = "overview";

// ── Init ──
(function initAnalysis() {
  _loadUserInfo();
  loadReports();
  if (document.documentElement.classList.contains("light")) {
    var btn = document.getElementById("themeToggleBtn");
    if (btn) btn.innerHTML = '<i class="fas fa-sun"></i>';
  }
  var _mlRole = localStorage.getItem("role");
  if (_mlRole === "data_scientist" || _mlRole === "admin") {
    var mlBtn = document.getElementById("mlNavBtn");
    if (mlBtn) mlBtn.style.display = "";
  }
})();

function _loadUserInfo() {
  var name = localStorage.getItem("username") || "user";
  var role = localStorage.getItem("role") || "reporter";
  var el = document.getElementById("userName");
  if (el) el.textContent = name;
  var roleEl = document.getElementById("userRole");
  var roleMap = { reporter: "Reporter", data_scientist: "Data Scientist", admin: "Admin" };
  if (roleEl) roleEl.textContent = roleMap[role] || role;
  var avatar = document.getElementById("userAvatar");
  if (avatar) avatar.textContent = name.charAt(0).toUpperCase();
}

// ── Reports List ──
async function loadReports() {
  var container = document.getElementById("reportList");
  if (!container) return;
  container.innerHTML = '<div class="schema-loading"><i class="fas fa-circle-notch fa-spin"></i> ' + t("common.loading") + '</div>';
  try {
    var res = await fetch(API_BASE + "/api/reports", { headers: getAuthHeaders(), credentials: "include" });
    if (handleAuthError(res)) return;
    var data = await res.json();
    if (!data.success || !data.reports || data.reports.length === 0) {
      container.innerHTML = '<div class="report-empty"><i class="fas fa-inbox"></i> ' + t("analysis.noReports") + '</div>';
      return;
    }
    var newCount = 0;
    var html = "";
    data.reports.forEach(function (r) {
      var rid = r.id || r[0];
      var title = r.title || r[1] || "\u2014";
      var status = r.status || r[7] || "new";
      var rowCount = r.row_count || r[4] || 0;
      var createdAt = r.created_at || r[8] || "";
      var creator = r.creator_name || r[9] || "";
      if (status === "new") newCount++;
      var statusIcon = { new: "fa-circle text-blue", in_progress: "fa-spinner fa-spin text-warning", completed: "fa-check-circle text-green", archived: "fa-archive text-muted" };
      var si = statusIcon[status] || statusIcon.new;
      var isActive = currentReport && currentReport.id === rid;
      html += '<div class="report-item' + (isActive ? " active" : "") + '" onclick="openReport(' + rid + ')">';
      html += '<div class="report-item-header"><i class="fas ' + si + '"></i>';
      html += '<span class="report-item-title">' + escapeHtml(title) + '</span></div>';
      html += '<div class="report-item-meta"><span>' + t("common.rowCount", {count: rowCount}) + '</span>';
      if (creator) html += '<span>• ' + escapeHtml(creator) + '</span>';
      if (createdAt) html += '<span>\u2022 ' + new Date(createdAt).toLocaleDateString(I18n.getLocale()) + '</span>';
      html += '</div></div>';
    });
    container.innerHTML = html;
    var badge = document.getElementById("reportBadge");
    if (badge) {
      badge.textContent = newCount;
      badge.style.display = newCount > 0 ? "inline-flex" : "none";
    }
  } catch (e) {
    container.innerHTML = '<div class="report-empty"><i class="fas fa-exclamation-triangle"></i> ' + t("analysis.loadError") + '</div>';
  }
}

// ── Open Report (backend-powered) ──
async function openReport(reportId) {
  try {
    // Rapor meta bilgisini al
    var res = await fetch(API_BASE + "/api/reports/" + reportId, { headers: getAuthHeaders(), credentials: "include" });
    if (handleAuthError(res)) return;
    var data = await res.json();
    if (!data.success || !data.report) { alert(t("analysis.reportLoadError")); return; }

    currentReport = data.report;
    aCurrentPage = 1;
    aSortCol = null;
    aSortDir = "asc";
    aSearchText = "";
    aOperationHistory = [];
    if (typeof _chartData !== "undefined") _chartData = null;

    // UI goster
    document.getElementById("analysisEmpty").style.display = "none";
    document.getElementById("analysisWorkspace").style.display = "flex";
    document.getElementById("reportHeaderTitle").innerHTML =
      '<i class="fas fa-file-alt"></i> ' + escapeHtml(currentReport.title);

    var meta = "";
    if (currentReport.creator_name) meta += t("analysis.sender") + currentReport.creator_name;
    if (currentReport.created_at) meta += " | " + new Date(currentReport.created_at).toLocaleDateString(I18n.getLocale());
    meta += " | " + t("common.rowCount", {count: (currentReport.row_count || 0)});
    if (currentReport.note) meta += ' | ' + t("analysis.note") + '"' + currentReport.note + '"';
    document.getElementById("reportMeta").textContent = meta;

    var statusBadge = document.getElementById("reportStatusBadge");
    var statusLabels = { new: t("analysis.statusNew"), in_progress: t("analysis.statusInProgress"), completed: t("analysis.statusCompleted"), archived: t("analysis.statusArchived") };
    if (statusBadge) {
      statusBadge.textContent = statusLabels[currentReport.status] || t("analysis.statusNew");
      statusBadge.className = "report-status-badge status-" + (currentReport.status || "new");
      statusBadge.style.display = "inline-flex";
    }
    document.getElementById("reportActions").style.display = "flex";

    // Backend'den sayfalanmis veri ve EDA al
    await Promise.all([
      loadPageData(),
      loadEdaFromBackend(),
      loadOperationHistory(),
    ]);

    switchEdaTab("overview");
    loadReports();
  } catch (e) {
    alert(t("common.error") + ": " + e.message);
  }
}

// ── Sayfalanmis Veri Yukle ──
async function loadPageData() {
  if (!currentReport) return;
  var container = document.getElementById("analysisTableContainer");
  if (!container) return;
  container.innerHTML = '<div class="schema-loading" style="padding:40px;text-align:center"><i class="fas fa-circle-notch fa-spin"></i> ' + t("common.loading") + '</div>';

  try {
    var params = new URLSearchParams({
      page: aCurrentPage,
      size: aPageSize,
      sort_dir: aSortDir,
    });
    if (aSortCol) params.set("sort_col", aSortCol);
    if (aSearchText) params.set("search", aSearchText);

    var res = await fetch(API_BASE + "/api/analysis/" + currentReport.id + "/data?" + params, { headers: getAuthHeaders(), credentials: "include" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    var data = await res.json();

    aHeaders = data.headers || [];
    aTotalRows = data.total_rows || 0;
    aTotalPages = data.total_pages || 1;
    aCurrentPage = data.page || 1;

    renderAnalysisTable(data.headers, data.rows);
    renderPagination();
  } catch (e) {
    container.innerHTML = '<div class="report-empty"><i class="fas fa-exclamation-triangle"></i> ' + t("common.error") + ': ' + escapeHtml(e.message) + '</div>';
  }
}

// ── Tablo Render ──
function renderAnalysisTable(headers, rows) {
  var container = document.getElementById("analysisTableContainer");
  if (!container || !headers || !rows) return;

  var html = '<table class="analysis-data-table"><thead><tr>';
  html += '<th class="row-action-col">#</th>';
  headers.forEach(function (h) {
    var sortIcon = "";
    if (aSortCol === h) sortIcon = aSortDir === "asc" ? ' <i class="fas fa-sort-up"></i>' : ' <i class="fas fa-sort-down"></i>';
    html += '<th class="sortable-th col-header-clickable" data-col="' + escapeHtml(h) + '"';
    html += ' onclick="onColumnHeaderClick(event, \'' + escapeHtml(h) + '\')"';
    html += ' oncontextmenu="onColumnHeaderClick(event, \'' + escapeHtml(h) + '\'); return false;">';
    html += escapeHtml(String(h)) + sortIcon + '</th>';
  });
  html += '</tr></thead><tbody>';

  var startIdx = (aCurrentPage - 1) * aPageSize;
  rows.forEach(function (row, ri) {
    html += '<tr>';
    html += '<td class="row-action-col"><span class="row-num">' + (startIdx + ri + 1) + '</span></td>';
    row.forEach(function (cell) {
      var val = cell == null ? "NULL" : String(cell);
      var cls = cell == null ? ' class="cell-null"' : '';
      html += '<td' + cls + '>' + escapeHtml(val) + '</td>';
    });
    html += '</tr>';
  });
  html += '</tbody></table>';
  container.innerHTML = html;

  var rc = document.getElementById("aRowCount");
  if (rc) rc.textContent = t("common.rowCount", {count: aTotalRows});
}

// ── Sayfalama UI ──
function renderPagination() {
  var container = document.getElementById("paginationContainer");
  if (!container) return;

  if (aTotalPages <= 1) {
    container.innerHTML = "";
    return;
  }

  var html = '<div class="pagination-bar">';
  html += '<button class="pg-btn" onclick="goToPage(1)" ' + (aCurrentPage <= 1 ? "disabled" : "") + '><i class="fas fa-angle-double-left"></i></button>';
  html += '<button class="pg-btn" onclick="goToPage(' + (aCurrentPage - 1) + ')" ' + (aCurrentPage <= 1 ? "disabled" : "") + '><i class="fas fa-angle-left"></i></button>';
  html += '<span class="pg-info">' + t("analysis.pageOf", {current: aCurrentPage, total: aTotalPages}) + '</span>';
  html += '<button class="pg-btn" onclick="goToPage(' + (aCurrentPage + 1) + ')" ' + (aCurrentPage >= aTotalPages ? "disabled" : "") + '><i class="fas fa-angle-right"></i></button>';
  html += '<button class="pg-btn" onclick="goToPage(' + aTotalPages + ')" ' + (aCurrentPage >= aTotalPages ? "disabled" : "") + '><i class="fas fa-angle-double-right"></i></button>';
  html += '</div>';
  container.innerHTML = html;
}

function goToPage(page) {
  if (page < 1 || page > aTotalPages) return;
  aCurrentPage = page;
  loadPageData();
}

// ── Siralama ──
function sortAnalysisTable(colName) {
  if (aSortCol === colName) {
    aSortDir = aSortDir === "asc" ? "desc" : "asc";
  } else {
    aSortCol = colName;
    aSortDir = "asc";
  }
  aCurrentPage = 1;
  loadPageData();
}

// ── Arama ──
var _searchTimeout = null;
function filterAnalysisTable() {
  var val = (document.getElementById("aTableSearch") || {}).value || "";
  clearTimeout(_searchTimeout);
  _searchTimeout = setTimeout(function () {
    aSearchText = val;
    aCurrentPage = 1;
    loadPageData();
  }, 400);
}

// ── EDA Backend'den Yukle ──
async function loadEdaFromBackend() {
  if (!currentReport) return;
  try {
    var res = await fetch(API_BASE + "/api/analysis/" + currentReport.id + "/eda", { headers: getAuthHeaders(), credentials: "include" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    aEdaData = await res.json();
    // EDA render (eda-render.js'deki fonksiyonlar backend formatini kullanacak)
    if (typeof renderEdaFromBackend === "function") {
      renderEdaFromBackend(aEdaData);
    }
  } catch (e) {
    console.warn("[EDA] Backend EDA yuklenemedi:", e);
  }
}

// ── Islem Gecmisi ──
async function loadOperationHistory() {
  if (!currentReport) return;
  try {
    var res = await fetch(API_BASE + "/api/analysis/" + currentReport.id + "/history", { headers: getAuthHeaders(), credentials: "include" });
    if (!res.ok) return;
    var data = await res.json();
    aOperationHistory = data.operations || [];
    renderOperationHistory();
  } catch (e) { /* silent */ }
}

function renderOperationHistory() {
  var container = document.getElementById("operationHistory");
  if (!container) return;

  if (aOperationHistory.length === 0) {
    container.innerHTML = '<div class="op-history-empty"><i class="fas fa-history"></i> ' + t("analysis.noOperations") + '</div>';
    return;
  }

  var html = '';
  aOperationHistory.forEach(function (op, i) {
    html += '<div class="op-history-item">';
    html += '<span class="op-num">' + (i + 1) + '.</span>';
    html += '<span class="op-desc">' + escapeHtml(op.description) + '</span>';
    html += '<span class="op-affected">' + t("common.rowCount", {count: op.affected_rows}) + '</span>';
    html += '</div>';
  });

  html += '<div class="op-history-actions">';
  html += '<button class="btn-op-undo" onclick="undoLastOperation()"><i class="fas fa-undo"></i> ' + t("analysis.undo") + '</button>';
  html += '<button class="btn-op-reset" onclick="resetAllOperations()"><i class="fas fa-trash-restore"></i> ' + t("analysis.resetAll") + '</button>';
  html += '</div>';

  container.innerHTML = html;
}

// ── Kolon Basligi Tiklama → Context Menu ──
function onColumnHeaderClick(event, colName) {
  event.preventDefault();
  event.stopPropagation();

  // Shift+click = sort
  if (event.shiftKey) {
    sortAnalysisTable(colName);
    return;
  }

  showColumnMenu(colName, event.clientX, event.clientY);
}

function showColumnMenu(colName, x, y) {
  closeColumnMenu();

  // Kolon profili al
  var colProfile = null;
  if (aEdaData && aEdaData.columns) {
    colProfile = aEdaData.columns.find(function (c) { return c.name === colName; });
  }

  var colType = colProfile ? colProfile.col_type : "text";
  var nullCount = colProfile ? colProfile.null_count : 0;
  var outlierCount = colProfile ? (colProfile.outlier_count || 0) : 0;

  var html = '<div class="col-menu" id="columnContextMenu" style="left:' + x + 'px;top:' + y + 'px">';

  // Header
  html += '<div class="col-menu-header">';
  html += '<span class="col-menu-icon">' + (colType === "numeric" ? "#" : colType === "date" ? "📅" : "Aa") + '</span>';
  html += '<span class="col-menu-name">' + escapeHtml(colName) + '</span>';
  html += '<span class="col-menu-type">' + colType + '</span>';
  html += '</div>';

  // Stats
  html += '<div class="col-menu-stats">';
  if (nullCount > 0) html += '<div class="col-stat-item stat-warning"><i class="fas fa-exclamation-circle"></i> ' + t("analysis.missingCount", {count: nullCount}) + '</div>';
  else html += '<div class="col-stat-item stat-ok"><i class="fas fa-check-circle"></i> ' + t("analysis.noMissing") + '</div>';
  if (outlierCount > 0) html += '<div class="col-stat-item stat-warning"><i class="fas fa-chart-bar"></i> ' + t("analysis.outlierCount", {count: outlierCount}) + '</div>';
  html += '</div>';

  html += '<div class="col-menu-divider"></div>';

  // Operasyonlar - Eksik Deger
  if (nullCount > 0) {
    html += '<div class="col-menu-group">' + t("analysis.missingValues") + '</div>';
    if (colType === "numeric") {
      html += _menuItem("fill_mean", colName, "fa-calculator", t("analysis.fillMean"));
      html += _menuItem("fill_median", colName, "fa-minus", t("analysis.fillMedian"));
    }
    html += _menuItem("fill_mode", colName, "fa-chart-bar", t("analysis.fillMode"));
    html += _menuItem("fill_ffill", colName, "fa-arrow-down", t("analysis.fillFfill"));
    html += _menuItem("fill_bfill", colName, "fa-arrow-up", t("analysis.fillBfill"));
    html += _menuItem("fill_constant", colName, "fa-pen", t("analysis.fillConstant"), true);
    html += _menuItem("drop_null_rows", colName, "fa-trash", t("analysis.dropNullRows"));
    html += '<div class="col-menu-divider"></div>';
  }

  // Operasyonlar - Aykiri Deger (sadece numeric)
  if (colType === "numeric" && outlierCount > 0) {
    html += '<div class="col-menu-group">' + t("analysis.outlierValues") + '</div>';
    html += _menuItem("clip_outliers_iqr", colName, "fa-compress-arrows-alt", t("analysis.clipOutliersIqr"));
    html += _menuItem("replace_outliers_median", colName, "fa-exchange-alt", t("analysis.replaceOutliersMedian"));
    html += _menuItem("drop_outlier_rows", colName, "fa-trash", t("analysis.dropOutlierRows"));
    html += '<div class="col-menu-divider"></div>';
  }

  // Operasyonlar - Genel
  html += '<div class="col-menu-group">' + t("analysis.editGroup") + '</div>';
  if (colType === "text") {
    html += _menuItem("trim_whitespace", colName, "fa-eraser", t("analysis.trimWhitespace"));
    html += _menuItem("change_case", colName, "fa-font", t("analysis.changeCase"), true);
    html += _menuItem("find_replace", colName, "fa-search", t("analysis.findReplace"), true);
  }
  html += _menuItem("rename_column", colName, "fa-i-cursor", t("analysis.renameColumn"), true);
  html += _menuItem("drop_column", colName, "fa-times-circle", t("analysis.dropColumn"));

  // Siralama
  html += '<div class="col-menu-divider"></div>';
  html += '<div class="col-menu-item" onclick="closeColumnMenu();sortAnalysisTable(\'' + escapeHtml(colName) + '\')"><i class="fas fa-sort-alpha-down"></i> ' + t("analysis.sortAsc") + '</div>';
  html += '<div class="col-menu-item" onclick="closeColumnMenu();aSortDir=\'desc\';sortAnalysisTable(\'' + escapeHtml(colName) + '\')"><i class="fas fa-sort-alpha-up"></i> ' + t("analysis.sortDesc") + '</div>';

  html += '</div>';

  document.body.insertAdjacentHTML("beforeend", html);

  // Menu disina tiklaninca kapat
  setTimeout(function () {
    document.addEventListener("click", _closeMenuOnOutsideClick);
  }, 50);

  // Ekran disina tasmamasi icin pozisyon ayarla
  var menu = document.getElementById("columnContextMenu");
  if (menu) {
    var rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 10) + "px";
    if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 10) + "px";
  }
}

function _menuItem(operation, colName, icon, label, hasParams) {
  if (hasParams) {
    return '<div class="col-menu-item" onclick="promptAndApply(\'' + operation + '\',\'' + escapeHtml(colName) + '\')"><i class="fas ' + icon + '"></i> ' + label + '</div>';
  }
  return '<div class="col-menu-item" onclick="previewAndApply(\'' + operation + '\',\'' + escapeHtml(colName) + '\',{})"><i class="fas ' + icon + '"></i> ' + label + '</div>';
}

function closeColumnMenu() {
  var menu = document.getElementById("columnContextMenu");
  if (menu) menu.remove();
  document.removeEventListener("click", _closeMenuOnOutsideClick);
}

function _closeMenuOnOutsideClick(e) {
  var menu = document.getElementById("columnContextMenu");
  if (menu && !menu.contains(e.target)) closeColumnMenu();
}

// ── Parametre Isteme (sabit deger, harf donusumu, bul-degistir, yeniden adlandir) ──
function promptAndApply(operation, colName) {
  closeColumnMenu();
  var params = {};

  if (operation === "fill_constant") {
    var val = prompt(t("analysis.promptFillConstant"));
    if (val === null) return;
    params.value = val;
  } else if (operation === "change_case") {
    var choice = prompt(t("analysis.promptCaseChange"));
    if (!choice) return;
    params.case = choice === "2" ? "upper" : choice === "3" ? "title" : "lower";
  } else if (operation === "find_replace") {
    var find = prompt(t("analysis.promptFindValue"));
    if (!find) return;
    var replace = prompt(t("analysis.promptReplaceValue"));
    if (replace === null) return;
    params.find = find;
    params.replace = replace;
  } else if (operation === "rename_column") {
    var newName = prompt(t("analysis.promptNewColumnName"), colName);
    if (!newName || newName === colName) return;
    params.new_name = newName;
  }

  previewAndApply(operation, colName, params);
}

// ── Onizleme ve Uygulama ──
async function previewAndApply(operation, colName, params) {
  closeColumnMenu();
  if (!currentReport) return;

  try {
    // Onizleme
    var res = await fetch(API_BASE + "/api/analysis/" + currentReport.id + "/preview", {
      method: "POST",
      headers: getAuthHeaders(),
      credentials: "include",
      body: JSON.stringify({ operation: operation, column: colName, params: params }),
    });
    if (!res.ok) {
      var err = await res.json().catch(function () { return {}; });
      alert(t("common.error") + ": " + (err.detail || err.message || ""));
      return;
    }
    var preview = await res.json();

    // Onizleme mesaji
    var msg = preview.description + "\n\n" + t("analysis.affectedRows", {count: preview.affected_rows});
    if (preview.examples && preview.examples.length > 0) {
      msg += "\n\n" + t("analysis.examples");
      preview.examples.forEach(function (ex) {
        if (ex.before !== undefined) {
          msg += "\n  " + t("analysis.rowN", {n: (ex.row + 1)}) + ex.before + " \u2192 " + ex.after;
        } else if (ex.message) {
          msg += "\n  " + ex.message;
        }
      });
    }
    msg += "\n\n" + t("analysis.applyConfirm");

    if (!confirm(msg)) return;

    // Uygula
    var applyRes = await fetch(API_BASE + "/api/analysis/" + currentReport.id + "/apply", {
      method: "POST",
      headers: getAuthHeaders(),
      credentials: "include",
      body: JSON.stringify({ operation: operation, column: colName, params: params }),
    });
    if (!applyRes.ok) {
      var applyErr = await applyRes.json().catch(function () { return {}; });
      alert(t("common.error") + ": " + (applyErr.detail || applyErr.message || ""));
      return;
    }
    var result = await applyRes.json();

    // Tabloyu ve EDA'yi yenile
    await Promise.all([
      loadPageData(),
      loadEdaFromBackend(),
      loadOperationHistory(),
    ]);

    // Basari bildirimi
    _showToast(result.description);

  } catch (e) {
    alert(t("analysis.operationError") + e.message);
  }
}

// ── Geri Al ──
async function undoLastOperation() {
  if (!currentReport) return;
  try {
    var res = await fetch(API_BASE + "/api/analysis/" + currentReport.id + "/undo", {
      method: "POST",
      headers: getAuthHeaders(),
      credentials: "include",
    });
    var data = await res.json();
    if (data.success) {
      await Promise.all([loadPageData(), loadEdaFromBackend(), loadOperationHistory()]);
      _showToast(data.message);
    } else {
      alert(data.message || t("analysis.undoFailed"));
    }
  } catch (e) {
    alert(t("analysis.undoError") + e.message);
  }
}

// ── Tumu Sifirla ──
async function resetAllOperations() {
  if (!currentReport) return;
  if (!confirm(t("analysis.resetConfirm"))) return;
  try {
    var res = await fetch(API_BASE + "/api/analysis/" + currentReport.id + "/reset", {
      method: "POST",
      headers: getAuthHeaders(),
      credentials: "include",
    });
    var data = await res.json();
    if (data.success) {
      await Promise.all([loadPageData(), loadEdaFromBackend(), loadOperationHistory()]);
      _showToast(t("analysis.resetDone"));
    }
  } catch (e) {
    alert(t("analysis.resetError") + e.message);
  }
}

// ── Toast Bildirimi ──
function _showToast(message) {
  var existing = document.getElementById("analysisToast");
  if (existing) existing.remove();

  var toast = document.createElement("div");
  toast.id = "analysisToast";
  toast.className = "analysis-toast";
  toast.innerHTML = '<i class="fas fa-check-circle"></i> ' + escapeHtml(message);
  document.body.appendChild(toast);

  setTimeout(function () { toast.classList.add("show"); }, 10);
  setTimeout(function () {
    toast.classList.remove("show");
    setTimeout(function () { toast.remove(); }, 300);
  }, 3000);
}

// ── EDA Tab Switching ──
function switchEdaTab(tab) {
  activeEdaTab = tab;
  document.querySelectorAll(".eda-tab").forEach(function (t) {
    t.classList.toggle("active", t.dataset.tab === tab);
  });
  document.querySelectorAll(".eda-panel").forEach(function (p) {
    p.classList.remove("active");
  });
  var panel = document.getElementById("eda" + tab.charAt(0).toUpperCase() + tab.slice(1));
  if (panel) panel.classList.add("active");
}

// ── Status ──
function markInProgress() { _updateReportStatus("in_progress"); }
function markCompleted() { _updateReportStatus("completed"); }

async function _updateReportStatus(status) {
  if (!currentReport) return;
  try {
    await fetch(API_BASE + "/api/reports/" + currentReport.id, {
      method: "PUT",
      headers: getAuthHeaders(),
      credentials: "include",
      body: JSON.stringify({ status: status }),
    });
    currentReport.status = status;
    var badge = document.getElementById("reportStatusBadge");
    var labels = { new: t("analysis.statusNew"), in_progress: t("analysis.statusInProgress"), completed: t("analysis.statusCompleted"), archived: t("analysis.statusArchived") };
    if (badge) {
      badge.textContent = labels[status] || status;
      badge.className = "report-status-badge status-" + status;
    }
    loadReports();
  } catch (e) { /* silent */ }
}

// ── Export ──
async function exportAnalysisExcel() {
  if (!currentReport) return;
  if (typeof XLSX === "undefined") { alert(t("export.excelError")); return; }

  try {
    var res = await fetch(API_BASE + "/api/analysis/" + currentReport.id + "/export", {
      method: "POST",
      headers: getAuthHeaders(),
      credentials: "include",
    });
    var result = await res.json();
    var ws = XLSX.utils.aoa_to_sheet(result.data);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Analiz");
    XLSX.writeFile(wb, (currentReport.title || "analiz").replace(/[^a-zA-Z0-9_\-. ]/g, "_") + ".xlsx");
  } catch (e) {
    alert("Export hatasi: " + e.message);
  }
}

async function exportAnalysisPDF() {
  if (!currentReport) return;
  if (typeof window.jspdf === "undefined") { alert(t("export.pdfError")); return; }

  try {
    var res = await fetch(API_BASE + "/api/analysis/" + currentReport.id + "/export", {
      method: "POST",
      headers: getAuthHeaders(),
      credentials: "include",
    });
    var result = await res.json();
    var data = result.data;
    if (!data || data.length < 2) return;

    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(14);
    doc.text(currentReport.title || t("analysis.analysisReport"), 14, 15);
    doc.setFontSize(9);
    doc.text(t("analysis.date", {date: new Date().toLocaleString(I18n.getLocale())}) + " | " + t("common.rowCount", {count: result.row_count}), 14, 22);

    doc.autoTable({
      head: [data[0]],
      body: data.slice(1).map(function (row) {
        return row.map(function (c) { return c == null ? "NULL" : String(c); });
      }),
      startY: 28,
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [79, 143, 247] },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      margin: { left: 10, right: 10 },
    });
    doc.save((currentReport.title || "analiz").replace(/[^a-zA-Z0-9_\-. ]/g, "_") + ".pdf");
  } catch (e) {
    alert("PDF export hatasi: " + e.message);
  }
}

// ── Theme & Logout ──
function toggleThemeAnalysis() {
  var isLight = document.documentElement.classList.toggle("light");
  localStorage.setItem("theme", isLight ? "light" : "dark");
  var btn = document.getElementById("themeToggleBtn");
  if (btn) btn.innerHTML = isLight ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
}

function logoutAnalysis() {
  fetch(API_BASE + "/api/logout", { method: "POST", credentials: "include" }).finally(function () {
    localStorage.clear();
    window.location.href = "login.html";
  });
}

// ── Duplicate Remove (global) ──
async function removeDuplicatesFromMenu() {
  if (!currentReport) return;
  previewAndApply("remove_duplicates", null, {});
}
