/* ============================================================
   column-filter.js  —  Kolon Bazli Filtreleme (v2 - Backend Powered)
   Backend search API'sini kullanir. Karmasik filtreler icin
   basit arama kutusuna yonlendirir.
   ============================================================ */

var columnFilters = []; // [{colName, type, operator, value, value2}]
var filterCombineMode = "and"; // "and" | "or"

function renderEdaFilter() {
  var panel = document.getElementById("edaFilter");
  if (!panel || !edaResults) return;

  var headers = aHeaders || [];
  var html = '';

  // ── Hizli Arama ──
  html += '<div class="eda-section">';
  html += '<h4><i class="fas fa-search"></i> Hizli Arama</h4>';
  html += '<p style="font-size:0.78rem;color:var(--text-muted);margin-bottom:12px;">Tum kolonlarda arama yapar. Buyuk veride de hizli calisir (backend tabanli).</p>';
  html += '<div class="filter-add-form">';
  html += '<div class="filter-field" style="flex:1">';
  html += '<input type="text" id="filterQuickSearch" placeholder="Ara... (tum kolonlar)" value="' + escapeHtml(aSearchText || "") + '">';
  html += '</div>';
  html += '<button class="btn-clean btn-clean-bulk" onclick="applyQuickFilter()"><i class="fas fa-search"></i> Ara</button>';
  if (aSearchText) {
    html += '<button class="btn-clean btn-clean-danger" onclick="clearQuickFilter()"><i class="fas fa-times"></i> Temizle</button>';
  }
  html += '</div></div>';

  // ── Kolon Detaylari ──
  html += '<div class="eda-section">';
  html += '<h4><i class="fas fa-filter"></i> Kolon Bilgileri</h4>';
  html += '<div class="cleaning-cards">';

  edaResults.columns.forEach(function (col) {
    html += '<div class="cleaning-card">';
    html += '<div class="cleaning-card-header">';
    html += '<span class="eda-col-name">' + escapeHtml(col.name) + '</span>';
    var typeLabel = {numeric: "Sayisal", text: "Metin", date: "Tarih", boolean: "Boolean"};
    html += '<span class="eda-type-badge eda-type-' + col.colType + '">' + (typeLabel[col.colType] || col.colType) + '</span>';
    html += '</div>';
    html += '<div style="font-size:0.72rem;color:var(--text-muted);display:flex;gap:12px;flex-wrap:wrap;">';
    html += '<span>Toplam: ' + fmtNum(col.total) + '</span>';
    html += '<span>Eksik: ' + fmtNum(col.nullCount) + '</span>';
    html += '<span>Benzersiz: ' + fmtNum(col.uniqueCount) + '</span>';
    if (col.colType === "numeric" && col.stats) {
      html += '<span>Min: ' + fmtNum(col.stats.min) + '</span>';
      html += '<span>Max: ' + fmtNum(col.stats.max) + '</span>';
    }
    if (col.colType === "date" && col.stats && col.stats.min) {
      html += '<span>' + col.stats.min + ' — ' + col.stats.max + '</span>';
    }
    html += '</div>';

    // Top values
    if (col.topValues && col.topValues.length > 0) {
      html += '<div style="margin-top:6px;display:flex;gap:4px;flex-wrap:wrap;">';
      col.topValues.slice(0, 5).forEach(function (tv) {
        html += '<span style="font-size:0.68rem;padding:2px 6px;background:var(--bg-primary);border-radius:4px;color:var(--text-muted);cursor:pointer;" onclick="filterByValue(\'' + escapeHtml(tv.value) + '\')">';
        html += escapeHtml(String(tv.value).substring(0, 20));
        html += ' (' + tv.count + ')';
        html += '</span>';
      });
      html += '</div>';
    }

    html += '</div>';
  });

  html += '</div></div>';

  panel.innerHTML = html;
}

function applyQuickFilter() {
  var input = document.getElementById("filterQuickSearch");
  if (!input) return;
  var val = input.value.trim();
  // Analysis-app.js'deki arama mekanizmasini kullan
  if (typeof aSearchText !== "undefined") {
    aSearchText = val;
  }
  var searchBox = document.getElementById("aTableSearch");
  if (searchBox) searchBox.value = val;
  aCurrentPage = 1;
  if (typeof loadPageData === "function") loadPageData();
}

function clearQuickFilter() {
  aSearchText = "";
  var searchBox = document.getElementById("aTableSearch");
  if (searchBox) searchBox.value = "";
  var filterBox = document.getElementById("filterQuickSearch");
  if (filterBox) filterBox.value = "";
  aCurrentPage = 1;
  if (typeof loadPageData === "function") loadPageData();
  renderEdaFilter();
}

function filterByValue(value) {
  var input = document.getElementById("filterQuickSearch");
  if (input) input.value = value;
  applyQuickFilter();
}

function setFilterMode(mode) {
  filterCombineMode = mode;
  renderEdaFilter();
}

function clearAllFilters() {
  columnFilters = [];
  clearQuickFilter();
}
