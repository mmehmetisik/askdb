/* ============================================================
   table.js  —  Table rendering, sorting, filtering, pagination
   ============================================================ */

// Sayfalama state
var currentPage = 1;
var pageSize = 100;

function renderTable(data) {
  var resultContainer = document.getElementById("resultContainer");
  var rowCount = document.getElementById("rowCount");

  if (!data || data.length === 0 || data[0][0] === "Sonuc Yok") {
    resultContainer.innerHTML =
      '<p style="padding:2rem;text-align:center;color:var(--text-muted);">' +
      '<i class="fas fa-inbox" style="font-size:1.5rem;display:block;margin-bottom:8px;"></i>' + t("common.noResults") + '</p>';
    rowCount.textContent = t("common.rowCount", {count: 0});
    return;
  }

  if (data[0][0] === "Hata") {
    var errorBox = document.getElementById("errorBox");
    errorBox.innerHTML = '<b><i class="fas fa-database"></i> ' + t("sql.sqlError") + '</b> <code>' + escapeHtml(displayValue(data[1][0])) + "</code>";
    errorBox.style.display = "block";
    resultContainer.innerHTML = "";
    return;
  }

  var tableToolbar = document.getElementById("tableToolbar");
  if (tableToolbar) tableToolbar.style.display = "flex";

  buildColumnDropdown(data[0]);

  var table = document.createElement("table");
  var thead = document.createElement("thead");
  var tbody = document.createElement("tbody");

  // Header
  var headerRow = document.createElement("tr");
  data[0].forEach(function (h, colIndex) {
    var th = document.createElement("th");
    var isActive = colIndex === sortColumn;
    var icon = isActive ? (sortDirection === "asc" ? "fa-sort-up" : "fa-sort-down") : "fa-sort";
    th.innerHTML = escapeHtml(h) + ' <i class="fas ' + icon + ' sort-icon"></i>';
    if (isActive) th.classList.add("sort-active");
    if (hiddenColumns.has(colIndex)) th.classList.add("col-hidden");
    th.addEventListener("click", function () { sortTable(colIndex); });
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Sort
  var rows = data.slice(1);
  if (sortColumn >= 0) {
    rows = rows.slice().sort(function (a, b) {
      var valA = a[sortColumn], valB = b[sortColumn];
      if (valA === null && valB === null) return 0;
      if (valA === null) return 1;
      if (valB === null) return -1;
      var numA = parseFloat(valA), numB = parseFloat(valB);
      if (!isNaN(numA) && !isNaN(numB)) return sortDirection === "asc" ? numA - numB : numB - numA;
      valA = String(valA || "").toLowerCase();
      valB = String(valB || "").toLowerCase();
      if (valA < valB) return sortDirection === "asc" ? -1 : 1;
      if (valA > valB) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }

  // Text search filter
  var filter = tableFilter.toLowerCase().trim();
  if (filter) {
    rows = rows.filter(function (row) {
      return row.some(function (cell, ci) {
        if (hiddenColumns.has(ci)) return false;
        return displayValue(cell).toLowerCase().includes(filter);
      });
    });
  }

  var totalFiltered = rows.length;

  // Sayfalama
  var totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;
  var startIdx = (currentPage - 1) * pageSize;
  var endIdx = Math.min(startIdx + pageSize, totalFiltered);
  var pageRows = rows.slice(startIdx, endIdx);

  // Satirlari render et
  pageRows.forEach(function (row) {
    var tr = document.createElement("tr");
    row.forEach(function (cell, ci) {
      var td = document.createElement("td");
      td.textContent = displayValue(cell);
      if (hiddenColumns.has(ci)) td.classList.add("col-hidden");
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  // Empty state for filters
  if (filter && totalFiltered === 0) {
    var trEmpty = document.createElement("tr");
    trEmpty.classList.add("filter-no-match");
    var tdEmpty = document.createElement("td");
    var visibleColCount = data[0].length - hiddenColumns.size;
    tdEmpty.colSpan = visibleColCount || data[0].length;
    tdEmpty.textContent = t("common.noSearchResults", {query: tableFilter});
    trEmpty.appendChild(tdEmpty);
    tbody.appendChild(trEmpty);
  }

  table.appendChild(tbody);
  resultContainer.innerHTML = "";
  resultContainer.appendChild(table);

  // Sayfalama kontrolu (sadece 1 sayfadan fazla ise goster)
  if (totalFiltered > pageSize) {
    var paginationDiv = document.createElement("div");
    paginationDiv.className = "table-pagination";
    paginationDiv.innerHTML = _buildPaginationHtml(currentPage, totalPages, totalFiltered);
    resultContainer.appendChild(paginationDiv);
  }

  // Satir bilgisi
  var total = data.length - 1;
  if (filter) {
    rowCount.textContent = t("common.rowFiltered", {filtered: totalFiltered, total: total});
  } else if (totalFiltered > pageSize) {
    rowCount.textContent = t("common.rowRange", {start: startIdx + 1, end: endIdx, total: total});
  } else {
    rowCount.textContent = t("common.rowCount", {count: total});
  }
}

function _buildPaginationHtml(page, totalPages, totalRows) {
  var html = '<div style="display:flex;align-items:center;justify-content:center;gap:8px;padding:12px 0;border-top:1px solid var(--border-color);">';

  html += '<button onclick="goToPage(' + (page - 1) + ')" ' + (page <= 1 ? 'disabled' : '') + ' style="padding:4px 10px;border-radius:6px;border:1px solid var(--border-color);background:var(--bg-secondary);color:var(--text-primary);cursor:pointer;font-size:12px;">';
  html += '<i class="fas fa-chevron-left"></i></button>';

  var start = Math.max(1, page - 2);
  var end = Math.min(totalPages, page + 2);
  if (start > 1) {
    html += '<button onclick="goToPage(1)" style="padding:4px 10px;border-radius:6px;border:1px solid var(--border-color);background:var(--bg-secondary);color:var(--text-primary);cursor:pointer;font-size:12px;">1</button>';
    if (start > 2) html += '<span style="color:var(--text-muted);font-size:12px;">...</span>';
  }
  for (var i = start; i <= end; i++) {
    var active = i === page;
    html += '<button onclick="goToPage(' + i + ')" style="padding:4px 10px;border-radius:6px;border:1px solid ' + (active ? 'var(--accent-primary)' : 'var(--border-color)') + ';background:' + (active ? 'var(--accent-primary)' : 'var(--bg-secondary)') + ';color:' + (active ? '#fff' : 'var(--text-primary)') + ';cursor:pointer;font-size:12px;font-weight:' + (active ? '600' : '400') + ';">' + i + '</button>';
  }
  if (end < totalPages) {
    if (end < totalPages - 1) html += '<span style="color:var(--text-muted);font-size:12px;">...</span>';
    html += '<button onclick="goToPage(' + totalPages + ')" style="padding:4px 10px;border-radius:6px;border:1px solid var(--border-color);background:var(--bg-secondary);color:var(--text-primary);cursor:pointer;font-size:12px;">' + totalPages + '</button>';
  }

  html += '<button onclick="goToPage(' + (page + 1) + ')" ' + (page >= totalPages ? 'disabled' : '') + ' style="padding:4px 10px;border-radius:6px;border:1px solid var(--border-color);background:var(--bg-secondary);color:var(--text-primary);cursor:pointer;font-size:12px;">';
  html += '<i class="fas fa-chevron-right"></i></button>';

  html += '<span style="color:var(--text-muted);font-size:11px;margin-left:8px;">' + t("common.rowCount", {count: totalRows}) + '</span>';
  html += '</div>';
  return html;
}

function goToPage(page) {
  currentPage = page;
  if (lastResultData) renderTable(lastResultData);
  var rc = document.getElementById("resultContainer");
  if (rc) rc.scrollTop = 0;
}

function sortTable(colIndex) {
  if (sortColumn === colIndex) {
    sortDirection = sortDirection === "asc" ? "desc" : "asc";
  } else {
    sortColumn = colIndex;
    sortDirection = "asc";
  }
  currentPage = 1;
  if (lastResultData) renderTable(lastResultData);
}

// ── Table Search ──
(function initTableSearch() {
  document.addEventListener("input", function (e) {
    if (e.target.id === "tableSearchInput") {
      tableFilter = e.target.value;
      currentPage = 1;
      if (lastResultData) renderTable(lastResultData);
    }
  });
})();

// ── Column Toggle ──
function buildColumnDropdown(headers) {
  var dropdown = document.getElementById("columnDropdown");
  if (!dropdown) return;
  dropdown.innerHTML = headers
    .map(function (h, i) {
      var checked = !hiddenColumns.has(i) ? "checked" : "";
      return '<label><input type="checkbox" ' + checked + ' onchange="toggleColumn(' + i + ', this.checked)">' + escapeHtml(h) + "</label>";
    })
    .join("");
}

function toggleColumn(colIndex, visible) {
  if (visible) hiddenColumns.delete(colIndex);
  else hiddenColumns.add(colIndex);
  if (lastResultData) renderTable(lastResultData);
}

function toggleColumnDropdown() {
  var dropdown = document.getElementById("columnDropdown");
  if (dropdown) dropdown.classList.toggle("open");
}

document.addEventListener("click", function (e) {
  var wrapper = document.querySelector(".column-toggle-wrapper");
  var dropdown = document.getElementById("columnDropdown");
  if (dropdown && wrapper && !wrapper.contains(e.target)) {
    dropdown.classList.remove("open");
  }
});
