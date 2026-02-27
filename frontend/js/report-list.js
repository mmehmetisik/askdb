/* ========== Rapor Listesi (Sol Sidebar) ========== */
var _reports = [];
var _reportsLoaded = false;

// ── API'den raporlari cek ──
async function loadReports() {
    var container = document.getElementById("reportsList");
    if (!container) return;

    try {
        var res = await fetch(API_BASE + "/api/reports", {
            headers: getAuthHeaders(),
            credentials: "include"
        });
        if (!res.ok) {
            if (res.status === 401) return; // yetkisiz, sessizce gec
            throw new Error("HTTP " + res.status);
        }
        var data = await res.json();
        _reports = data.reports || [];
        _reportsLoaded = true;
        renderReports();
    } catch (e) {
        console.warn("[RAPORLAR] Yuklenemedi:", e.message);
        container.innerHTML = '<div class="reports-empty"><i class="fas fa-exclamation-circle"></i> ' + t("common.error") + '</div>';
    }
}

// ── Render ──
function renderReports() {
    var container = document.getElementById("reportsList");
    if (!container) return;

    // Badge
    var badge = document.getElementById("reportsBadge");
    if (badge) {
        badge.textContent = _reports.length;
        badge.style.display = _reports.length > 0 ? "inline-flex" : "none";
    }

    if (_reports.length === 0) {
        container.innerHTML = '<div class="reports-empty">' + t("report.noReports") + '</div>';
        return;
    }

    var html = "";
    _reports.forEach(function(r) {
        var statusClass = "status-" + (r.status || "new");
        var statusText = _statusLabel(r.status);
        var dateStr = _reportDate(r.created_at);
        var assignee = r.assignee_name ? " → " + r.assignee_name : "";

        html += '<div class="report-item ' + statusClass + '" onclick="loadReport(' + r.id + ')" title="' + escapeHtml(r.title) + assignee + '">';
        html += '  <div class="report-content">';
        html += '    <span class="report-title">' + escapeHtml(r.title) + '</span>';
        html += '    <span class="report-meta">';
        html += '      <span class="report-date">' + dateStr + '</span>';
        html += '      <span class="report-status-dot ' + statusClass + '"></span>';
        html += '      <span class="report-status-text">' + statusText + '</span>';
        if (r.row_count > 0) {
            html += '      <span class="report-rows">' + t("common.rowCount", {count: r.row_count}) + '</span>';
        }
        html += '    </span>';
        html += '  </div>';
        html += '</div>';
    });
    container.innerHTML = html;
}

// ── Rapor verisini orta panele yukle ──
async function loadReport(reportId) {
    try {
        var res = await fetch(API_BASE + "/api/reports/" + reportId, {
            headers: getAuthHeaders(),
            credentials: "include"
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        var data = await res.json();
        var report = data.report;

        // Orta paneli hazirla
        hideEmptyState();
        var errorBox = document.getElementById("errorBox");
        if (errorBox) errorBox.style.display = "none";

        // SQL goster
        var sqlOutput = document.getElementById("sqlOutput");
        var sqlSection = document.getElementById("sqlSection");
        if (sqlSection) sqlSection.style.display = "block";
        if (sqlOutput) sqlOutput.textContent = report.original_sql || t("sql.noSql");

        // Sonuclari goster
        var resultsArea = document.getElementById("resultsArea");
        if (resultsArea) resultsArea.style.display = "flex";
        var clearBtn = document.getElementById("clearResultsBtn");
        if (clearBtn) clearBtn.style.display = "inline-flex";

        // State guncelle
        lastResultData = report.result_data;
        lastColumnTypes = report.column_types || [];
        lastTruncated = false;
        sortColumn = -1;
        sortDirection = "asc";
        hiddenColumns = new Set();
        tableFilter = "";

        // Table toolbar reset
        var tableToolbar = document.getElementById("tableToolbar");
        if (tableToolbar) tableToolbar.style.display = "none";
        var searchInput = document.getElementById("tableSearchInput");
        if (searchInput) searchInput.value = "";

        // Tabloyu render et
        if (report.result_data && Array.isArray(report.result_data)) {
            renderTable(report.result_data);
        }

        // Preview banner goster
        var banner = document.getElementById("previewBanner");
        var bannerName = document.getElementById("previewTableName");
        var bannerInfo = document.getElementById("previewRowInfo");
        if (banner) {
            banner.style.display = "flex";
            if (bannerName) bannerName.textContent = "Rapor: " + report.title;
            if (bannerInfo) bannerInfo.textContent = t("common.rowCount", {count: report.row_count || 0}) + " | " + _statusLabel(report.status);
        }

    } catch (e) {
        console.error("[RAPOR] Yuklenemedi:", e.message);
    }
}

// ── Toggle (Ac/Kapat) ──
function toggleReportsPanel() {
    var section = document.querySelector(".reports-section");
    if (!section) return;
    section.classList.toggle("collapsed");
    localStorage.setItem("reportsCollapsed", section.classList.contains("collapsed") ? "1" : "0");
}

function _restoreReportsState() {
    var collapsed = localStorage.getItem("reportsCollapsed");
    if (collapsed === "1") {
        var section = document.querySelector(".reports-section");
        if (section) section.classList.add("collapsed");
    }
}

// ── Yardimci Fonksiyonlar ──
function _statusLabel(status) {
    var map = {
        "new": t("analysis.statusNew"),
        "in_progress": t("analysis.start"),
        "completed": t("chat.completed"),
        "archived": "Arsiv"
    };
    return map[status] || status || t("analysis.statusNew");
}

function _reportDate(dateStr) {
    if (!dateStr) return "";
    var d = new Date(dateStr);
    return d.toLocaleDateString(I18n.getLocale(), { day: "numeric", month: "short" });
}

// ── Rapor gonderildikten sonra listeyi guncelle ──
function refreshReportsList() {
    loadReports();
}

// ── Init ──
document.addEventListener("DOMContentLoaded", function() {
    loadReports();
    _restoreReportsState();
});
