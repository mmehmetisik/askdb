/* ========== Rapor Listesi (Toolbar Dropdown) ========== */
var _reports = [];
var _reportsLoaded = false;
var _deleteReportId = null;
var _deleteHasDeps = false;

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
            if (res.status === 401) return;
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
        var assignee = r.assignee_name ? " \u2192 " + r.assignee_name : "";

        html += '<div class="report-item ' + statusClass + '">';
        html += '  <div class="report-content" onclick="loadReport(' + r.id + ')">';
        html += '    <span class="report-title" title="' + escapeHtml(r.title) + assignee + '">' + escapeHtml(r.title) + '</span>';
        html += '    <span class="report-meta">';
        html += '      <span class="report-date">' + dateStr + '</span>';
        html += '      <span class="report-status-dot ' + statusClass + '"></span>';
        html += '      <span class="report-status-text">' + statusText + '</span>';
        if (r.row_count > 0) {
            html += '      <span class="report-rows">' + t("common.rowCount", {count: r.row_count}) + '</span>';
        }
        html += '    </span>';
        html += '  </div>';
        html += '  <button class="report-delete-btn" onclick="event.stopPropagation();deleteReport(' + r.id + ',\'' + escapeHtml(r.title).replace(/'/g, "\\'") + '\')" title="' + t("common.delete") + '">&times;</button>';
        html += '</div>';
    });
    container.innerHTML = html;
}

// ── Rapor verisini orta panele yukle ──
async function loadReport(reportId) {
    // Dropdown'u kapat
    closeReportsDropdown();

    try {
        var res = await fetch(API_BASE + "/api/reports/" + reportId, {
            headers: getAuthHeaders(),
            credentials: "include"
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        var data = await res.json();
        var report = data.report;

        hideEmptyState();
        var errorBox = document.getElementById("errorBox");
        if (errorBox) errorBox.style.display = "none";

        var sqlOutput = document.getElementById("sqlOutput");
        var sqlSection = document.getElementById("sqlSection");
        if (sqlSection) sqlSection.style.display = "block";
        if (sqlOutput) sqlOutput.textContent = report.original_sql || t("sql.noSql");

        var resultsArea = document.getElementById("resultsArea");
        if (resultsArea) resultsArea.style.display = "flex";
        var clearBtn = document.getElementById("clearResultsBtn");
        if (clearBtn) clearBtn.style.display = "inline-flex";

        lastResultData = report.result_data;
        lastColumnTypes = report.column_types || [];
        lastTruncated = false;
        sortColumn = -1;
        sortDirection = "asc";
        hiddenColumns = new Set();
        tableFilter = "";

        var tableToolbar = document.getElementById("tableToolbar");
        if (tableToolbar) tableToolbar.style.display = "none";
        var searchInput = document.getElementById("tableSearchInput");
        if (searchInput) searchInput.value = "";

        if (report.result_data && Array.isArray(report.result_data)) {
            renderTable(report.result_data);
        }

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

// ── Dropdown Toggle ──
function toggleReportsDropdown() {
    var dropdown = document.getElementById("reportsDropdown");
    if (!dropdown) return;
    dropdown.classList.toggle("show");
}

function closeReportsDropdown() {
    var dropdown = document.getElementById("reportsDropdown");
    if (dropdown) dropdown.classList.remove("show");
}

// Disari tiklaninca kapat
document.addEventListener("click", function(e) {
    var wrapper = document.querySelector(".reports-dropdown-wrapper");
    var dropdown = document.getElementById("reportsDropdown");
    if (dropdown && wrapper && !wrapper.contains(e.target)) {
        dropdown.classList.remove("show");
    }
});

// ── Delete Modal ──
async function deleteReport(reportId, title) {
    _deleteReportId = reportId;
    _deleteHasDeps = false;

    // Modal icerigi ayarla
    var titleEl = document.getElementById("deleteReportTitle");
    if (titleEl) titleEl.innerHTML = '<strong>' + escapeHtml(title) + '</strong><br><span style="font-size:0.78rem;color:var(--text-muted);">' + t("report.confirmDelete") + '</span>';

    var warningEl = document.getElementById("deleteReportWarning");
    if (warningEl) warningEl.style.display = "none";

    var confirmBtn = document.getElementById("deleteReportConfirmBtn");
    if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = '<i class="fas fa-trash-alt"></i> ' + t("report.deleteButton");
    }

    // Modal'i goster
    var modal = document.getElementById("deleteReportModal");
    if (modal) modal.style.display = "flex";

    // Dependency check
    try {
        var res = await fetch(API_BASE + "/api/reports/" + reportId + "/dependencies", {
            headers: getAuthHeaders(),
            credentials: "include"
        });
        if (res.ok) {
            var data = await res.json();
            if (data.has_dependencies) {
                _deleteHasDeps = true;
                var warningText = document.getElementById("deleteReportWarningText");
                if (warningText) {
                    warningText.textContent = t("report.deleteWarning", {
                        tasks: data.task_count,
                        models: data.model_count
                    });
                }
                if (warningEl) warningEl.style.display = "flex";
            }
        }
    } catch (e) {
        console.warn("[DEP CHECK] Hata:", e.message);
    }
}

function closeDeleteModal() {
    var modal = document.getElementById("deleteReportModal");
    if (modal) modal.style.display = "none";
    _deleteReportId = null;
    _deleteHasDeps = false;
}

async function confirmDeleteReport() {
    if (!_deleteReportId) return;

    var confirmBtn = document.getElementById("deleteReportConfirmBtn");
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + t("report.deleting");
    }

    try {
        var url = API_BASE + "/api/reports/" + _deleteReportId;
        if (_deleteHasDeps) url += "?force=true";

        var res = await fetch(url, {
            method: "DELETE",
            headers: getAuthHeaders(),
            credentials: "include"
        });
        if (!res.ok) {
            var errData = null;
            try { errData = await res.json(); } catch (e) { /* ignore */ }
            var msg = (errData && errData.detail) ? errData.detail : "HTTP " + res.status;
            alert(msg);
            if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = '<i class="fas fa-trash-alt"></i> ' + t("report.deleteButton");
            }
            return;
        }
        closeDeleteModal();
        loadReports();
    } catch (e) {
        console.error("[RAPOR SIL] Hata:", e.message);
        alert(t("common.error") + ": " + e.message);
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = '<i class="fas fa-trash-alt"></i> ' + t("report.deleteButton");
        }
    }
}

// ── Rapor gonderildikten sonra listeyi guncelle ──
function refreshReportsList() {
    loadReports();
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

// ── Init ──
document.addEventListener("DOMContentLoaded", function() {
    loadReports();
});
