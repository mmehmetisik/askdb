/* ============================================================
   schema-tree.js  —  Database schema explorer (left sidebar)
   3 seviyeli agac: Connection > Schema > Table
   Tablo adina tiklaninca on-izleme yukler.
   ============================================================ */

var schemaData = null;
var schemaConnections = null;

// ── Fetch ──
async function loadSchema() {
  var indicator = document.getElementById("schemaLoading");
  if (indicator) indicator.style.display = "flex";

  try {
    var res = await fetch(API_BASE + "/api/schema", { headers: getAuthHeaders(), credentials: "include" });
    if (handleAuthError(res)) return;
    if (!res.ok) throw new Error("HTTP " + res.status);

    var data = await res.json();
    schemaData = data.tables || [];
    schemaConnections = data.connections || [];
    _schemaTrinoActive = !!data.trino_active;
    renderSchemaTree();
  } catch (e) {
    var container = document.getElementById("schemaTree");
    if (container) {
      container.innerHTML =
        '<div class="schema-empty"><i class="fas fa-exclamation-triangle"></i> ' + t("schema.loadError") + '</div>';
    }
  } finally {
    if (indicator) indicator.style.display = "none";
  }
}

// ── Render ──
function renderSchemaTree() {
  var container = document.getElementById("schemaTree");
  if (!container || !schemaData) return;

  if (schemaData.length === 0) {
    container.innerHTML =
      '<div class="schema-empty"><i class="fas fa-database"></i> ' + t("schema.noTables") + '</div>';
    return;
  }

  var html = "";

  // Tablolari connection bazinda grupla
  var connMap = {}; // connName -> { schemas: { schemaName: [tables] }, dbType, active }
  var connMeta = {}; // connName -> meta info

  // Connection metadata'yi hazirla
  if (schemaConnections && schemaConnections.length > 0) {
    schemaConnections.forEach(function (c) {
      connMeta[c.name] = { db_type: c.db_type, host: c.host, active: c.active };
    });
  }

  // Tablolari connection > schema > table olarak grupla
  schemaData.forEach(function (table) {
    var connName, schemaName, tableName;

    if (table.catalog) {
      // Trino modu: catalog.schema.table
      connName = table.catalog;
      schemaName = table.schema || "default";
      tableName = table.name;
    } else if (table.full_name && table.full_name.indexOf('.') > -1) {
      var parts = table.full_name.split('.');
      if (parts.length === 3) {
        connName = parts[0];
        schemaName = parts[1];
        tableName = parts[2];
      } else if (parts.length === 2) {
        connName = "default";
        schemaName = parts[0];
        tableName = parts[1];
      } else {
        connName = "default";
        schemaName = "public";
        tableName = table.name;
      }
    } else {
      connName = "default";
      schemaName = "public";
      tableName = table.name;
    }

    if (!connMap[connName]) connMap[connName] = {};
    if (!connMap[connName][schemaName]) connMap[connName][schemaName] = [];
    connMap[connName][schemaName].push(table);
  });

  var connNames = Object.keys(connMap).sort();
  var isMultiConn = connNames.length > 1 || (schemaConnections && schemaConnections.length > 1);

  connNames.forEach(function (connName, cIdx) {
    var schemas = connMap[connName];
    var meta = connMeta[connName] || {};
    var dbType = meta.db_type || '';
    var isActive = meta.active !== false;
    var typeLabel = { postgresql: 'PG', mysql: 'MySQL', mssql: 'MSSQL', trino: 'Trino' }[dbType] || dbType.toUpperCase() || '';
    var typeIcon = { postgresql: 'fa-database', mysql: 'fa-database', mssql: 'fa-database', trino: 'fa-project-diagram' }[dbType] || 'fa-database';

    // Toplam tablo sayisi
    var totalTables = 0;
    Object.keys(schemas).forEach(function (s) { totalTables += schemas[s].length; });

    var expanded = cIdx === 0 ? " expanded" : "";

    if (isMultiConn) {
      html += '<div class="schema-connection' + expanded + '">';
      html += '<div class="schema-connection-header" onclick="toggleSchemaConnection(this)">';
      html += '<i class="fas fa-chevron-right schema-arrow"></i>';
      html += '<span class="schema-conn-dot ' + (isActive ? 'active' : 'inactive') + '"></span>';
      html += '<i class="fas ' + typeIcon + '" style="font-size:0.8rem;"></i> ';
      html += '<span>' + escapeHtml(connName) + '</span>';
      if (typeLabel) html += '<span class="schema-conn-type">' + typeLabel + '</span>';
      html += '<span class="schema-conn-count">(' + totalTables + ')</span>';
      html += '</div>';
      html += '<div class="schema-connection-body">';
    }

    // Schema seviyesi
    var schemaNames = Object.keys(schemas).sort();
    var hasMultiSchema = schemaNames.length > 1;

    schemaNames.forEach(function (schemaName, sIdx) {
      var tables = schemas[schemaName];

      if (hasMultiSchema) {
        var schemaExpanded = sIdx === 0 && cIdx === 0 ? " expanded" : "";
        html += '<div class="schema-catalog-group' + schemaExpanded + '">';
        html += '<div class="schema-catalog-header" onclick="toggleCatalogGroup(this)">';
        html += '<i class="fas fa-chevron-right schema-arrow"></i>';
        html += '<i class="fas fa-folder" style="font-size:0.75rem;color:var(--text-muted);"></i> ';
        html += '<span>' + escapeHtml(schemaName) + '</span>';
        html += '<span style="color:var(--text-muted);font-size:0.72rem;margin-left:4px;">(' + tables.length + ')</span>';
        html += '</div>';
        html += '<div class="schema-catalog-tables">';
      }

      tables.forEach(function (table, tIdx) {
        var tableFqn = table.full_name || table.name;
        var shouldExpand = (cIdx === 0 && sIdx === 0 && tIdx === 0);
        html += _renderTableNode(table, tableFqn, shouldExpand);
      });

      if (hasMultiSchema) {
        html += '</div></div>';
      }
    });

    if (isMultiConn) {
      html += '</div></div>';
    }
  });

  container.innerHTML = html;
}

function toggleSchemaConnection(header) {
  var parent = header.closest ? header.closest(".schema-connection") : header.parentElement;
  if (parent) parent.classList.toggle("expanded");
}

function _renderTableNode(table, tableFqn, expanded) {
  var expandedCls = expanded ? " expanded" : "";
  var isSelected = selectedTables.has(tableFqn);
  var selectedCls = isSelected ? " selected" : "";
  var displayName = table.name;
  var h = '';

  h += '<div class="schema-table' + expandedCls + selectedCls + '" data-table="' + escapeHtml(tableFqn) + '">';
  h += '<div class="schema-table-header">';
  h += '<button class="schema-checkbox' + (isSelected ? " checked" : "") +
       '" onclick="event.stopPropagation();toggleTableSelection(\'' +
       escapeHtml(tableFqn) + '\')" title="' + t("schema.selection") + '"><i class="fas fa-check"></i></button>';
  h += '<i class="fas fa-chevron-right schema-arrow" onclick="toggleSchemaTable(this.parentElement)"></i>';
  h += '<i class="fas fa-table schema-tbl-icon" onclick="toggleSchemaTable(this.parentElement)"></i>';
  h += '<span class="schema-tbl-name" onclick="loadTablePreview(\'' +
       escapeHtml(tableFqn) + '\')" title="' + t("schema.preview") + '">' +
       escapeHtml(displayName) + '</span>';
  h += '<span class="schema-col-count">' + table.columns.length + '</span>';
  h += '<button class="schema-preview-btn" onclick="event.stopPropagation();loadTablePreview(\'' +
       escapeHtml(tableFqn) + '\')" title="' + t("schema.preview") + '"><i class="fas fa-eye"></i></button>';
  h += '</div>';

  h += '<div class="schema-columns">';
  table.columns.forEach(function (col) {
    var icon = _colIcon(col);
    var cls = _typeCls(col.type);
    var tip = col.type + (col.is_pk ? " \u00b7 PK" : "") + (col.nullable ? " \u00b7 nullable" : "");
    h += '<div class="schema-col" title="' + tip + '" onclick="insertColumnRef(\'' +
         escapeHtml(tableFqn) + "','" + escapeHtml(col.name) + "')\">";
    h += '<i class="fas ' + icon + ' schema-col-icon ' + cls + '"></i>';
    h += '<span class="schema-col-name">' + escapeHtml(col.name) + '</span>';
    h += '<span class="schema-col-type">' + _shortType(col.type) + '</span>';
    h += '</div>';
  });
  h += '</div></div>';
  return h;
}

function toggleCatalogGroup(header) {
  var parent = header.closest ? header.closest(".schema-catalog-group") : header.parentElement;
  if (parent) parent.classList.toggle("expanded");
}

// ── Table Selection ──
function toggleTableSelection(tableName) {
  if (selectedTables.has(tableName)) {
    selectedTables.delete(tableName);
  } else {
    selectedTables.add(tableName);
  }
  renderSchemaTree();
  _renderSelectedBanner();
}

function clearTableSelection() {
  selectedTables.clear();
  renderSchemaTree();
  _renderSelectedBanner();
}

function _renderSelectedBanner() {
  var banner = document.getElementById("selectedTablesBanner");
  if (!banner) return;

  if (selectedTables.size === 0) {
    banner.classList.remove("visible");
    return;
  }

  var html = '<span class="stb-label"><i class="fas fa-filter"></i> ' + t("schema.filter") + '</span>';
  selectedTables.forEach(function (name) {
    html += '<span class="stb-tag">' + escapeHtml(name) + '</span>';
  });
  html += '<button class="stb-clear" onclick="clearTableSelection()" title="' + t("schema.clearFilter") + '"><i class="fas fa-times"></i></button>';
  banner.innerHTML = html;
  banner.classList.add("visible");
}

// ── Table Preview ──
async function loadTablePreview(tableName) {
  hideEmptyState();
  var resultsArea = document.getElementById("resultsArea");
  var skeletonArea = document.getElementById("skeletonArea");
  var errorBox = document.getElementById("errorBox");
  var banner = document.getElementById("previewBanner");

  if (resultsArea) resultsArea.style.display = "none";
  if (errorBox) errorBox.style.display = "none";
  if (skeletonArea) skeletonArea.style.display = "flex";

  var aiSection = document.getElementById("aiSection");
  var chartSection = document.getElementById("chartSection");
  var dqSection = document.getElementById("dqSection");
  var sqlSection = document.getElementById("sqlSection");
  if (aiSection) aiSection.style.display = "none";
  if (chartSection) chartSection.style.display = "none";

  isPreviewMode = true;

  try {
    var res = await fetch(API_BASE + "/api/table-preview/" + encodeURIComponent(tableName), {
      headers: getAuthHeaders(),
      credentials: "include",
    });
    if (handleAuthError(res)) return;
    if (!res.ok) {
      var errData = null;
      try { errData = await res.json(); } catch (e) { /* */ }
      throw new Error((errData && errData.detail) ? errData.detail : "HTTP " + res.status);
    }

    var data = await res.json();
    if (skeletonArea) skeletonArea.style.display = "none";

    lastResultData = data.result;
    lastColumnTypes = data.column_types || [];
    lastTruncated = false;
    sortColumn = -1;
    sortDirection = "asc";
    hiddenColumns = new Set();
    tableFilter = "";

    if (banner) {
      document.getElementById("previewTableName").textContent = tableName;
      document.getElementById("previewRowInfo").textContent =
        t("schema.previewRows", {count: data.total_count});
      banner.style.display = "flex";
    }

    if (sqlSection) sqlSection.style.display = "none";

    if (resultsArea) resultsArea.style.display = "flex";
    var clearBtn = document.getElementById("clearResultsBtn");
    if (clearBtn) clearBtn.style.display = "inline-flex";
    if (data.result && Array.isArray(data.result)) {
      renderTable(data.result);
    }
  } catch (err) {
    if (skeletonArea) skeletonArea.style.display = "none";
    if (errorBox) {
      errorBox.innerHTML =
        '<b><i class="fas fa-exclamation-triangle"></i> ' + t("common.error") + ':</b> ' +
        escapeHtml(err.message);
      errorBox.style.display = "block";
    }
  }
}

function closePreview() {
  isPreviewMode = false;
  var banner = document.getElementById("previewBanner");
  var resultsArea = document.getElementById("resultsArea");
  if (banner) banner.style.display = "none";
  if (resultsArea) resultsArea.style.display = "none";

  if (activeHistoryIndex >= 0) {
    loadHistoryResult(activeHistoryIndex);
  } else {
    showEmptyState();
  }
}

// ── Interactions ──
function toggleSchemaTable(header) {
  var parent = header.closest ? header.closest(".schema-table") : header.parentElement;
  if (parent) parent.classList.toggle("expanded");
}

// ── Column Reference Tracking ──
var _columnRefs = [];       // [{table, column, conn}]
var _isColumnRefMode = false;
var _schemaTrinoActive = false;  // Updated from /api/schema response

function _getConnectionForTable(tableFqn) {
  if (!schemaData) return "default";
  for (var i = 0; i < schemaData.length; i++) {
    var tbl = schemaData[i];
    var fqn = tbl.full_name || tbl.name;
    if (fqn === tableFqn) return tbl.catalog || "default";
  }
  return "default";
}

function _resetColumnRefs() {
  _columnRefs = [];
  _isColumnRefMode = false;
}

function _rebuildColumnRefText(input) {
  if (_columnRefs.length === 0) { input.value = ""; return; }

  // Group by table
  var byTable = {};
  var tableOrder = [];
  _columnRefs.forEach(function (ref) {
    if (!byTable[ref.table]) { byTable[ref.table] = []; tableOrder.push(ref.table); }
    byTable[ref.table].push(ref.column);
  });

  var andWord = t("schema.columnRefAnd");
  var parts = [];
  tableOrder.forEach(function (tbl) {
    var cols = byTable[tbl];
    var colText;
    if (cols.length === 1) {
      colText = cols[0];
    } else if (cols.length === 2) {
      colText = cols[0] + andWord + cols[1];
    } else {
      colText = cols.slice(0, -1).join(", ") + andWord + cols[cols.length - 1];
    }
    parts.push(t("schema.columnRefMulti", { table: tbl, columns: colText }));
  });

  if (parts.length === 1) {
    input.value = parts[0];
  } else {
    input.value = parts.join(andWord.trim() === "ve" ? " ve " : " and ");
  }
}

function insertColumnRef(table, column) {
  var input = document.getElementById("queryInput");
  if (!input) return;

  var conn = _getConnectionForTable(table);

  // Cross-DB check (only in column-ref mode with existing refs)
  if (_columnRefs.length > 0 && _isColumnRefMode) {
    var existingConns = {};
    _columnRefs.forEach(function (r) { existingConns[r.conn] = true; });
    if (!existingConns[conn]) {
      // Different DB — check Trino
      if (!_schemaTrinoActive) {
        _showCrossDbToast();
        return;
      }
    }
    // Check duplicate
    var dup = _columnRefs.some(function (r) { return r.table === table && r.column === column; });
    if (dup) return;
  }

  if (!input.value.trim() || _isColumnRefMode) {
    if (!_isColumnRefMode) {
      // First click — start ref mode
      _columnRefs = [];
      _isColumnRefMode = true;
    }
    _columnRefs.push({ table: table, column: column, conn: conn });
    _rebuildColumnRefText(input);
  } else {
    // User has typed manually — just append with space separator
    var pos = input.selectionStart || input.value.length;
    var before = input.value.substring(0, pos);
    var after = input.value.substring(pos);
    var sep = before.endsWith(" ") ? "" : " ";
    input.value = before + sep + column + after;
  }
  input.focus();
  if (typeof _autoResizeInput === "function") _autoResizeInput();
}

function _showCrossDbToast() {
  var msg = t("schema.crossDbWarning");
  // Use existing toast if available, otherwise fallback to alert-style banner
  var existing = document.getElementById("crossDbToast");
  if (existing) existing.remove();
  var toast = document.createElement("div");
  toast.id = "crossDbToast";
  toast.style.cssText = "position:fixed;bottom:80px;left:50%;transform:translateX(-50%);"
    + "background:#f59e0b;color:#000;padding:10px 20px;border-radius:8px;z-index:9999;"
    + "font-size:0.85rem;font-weight:600;box-shadow:0 4px 12px rgba(0,0,0,.3);";
  toast.innerHTML = '<i class="fas fa-exclamation-triangle"></i> ' + escapeHtml(msg);
  document.body.appendChild(toast);
  setTimeout(function () { if (toast.parentNode) toast.remove(); }, 3500);
}

// ── Helpers ──
function _colIcon(col) {
  if (col.is_pk) return "fa-key";
  var t = col.type;
  if (t.indexOf("int") > -1 || t.indexOf("numeric") > -1 || t.indexOf("double") > -1)
    return "fa-hashtag";
  if (t.indexOf("timestamp") > -1 || t.indexOf("date") > -1) return "fa-calendar";
  if (t.indexOf("bool") > -1) return "fa-toggle-on";
  return "fa-font";
}

function _typeCls(type) {
  if (type.indexOf("int") > -1 || type.indexOf("numeric") > -1 || type.indexOf("double") > -1)
    return "type-numeric";
  if (type.indexOf("timestamp") > -1 || type.indexOf("date") > -1) return "type-date";
  if (type.indexOf("bool") > -1) return "type-boolean";
  return "type-text";
}

function _shortType(type) {
  var map = {
    "character varying": "varchar",
    "timestamp without time zone": "timestamp",
    "timestamp with time zone": "timestamptz",
    "double precision": "float8",
    integer: "int4",
    bigint: "int8",
    smallint: "int2",
    boolean: "bool",
  };
  return map[type] || type;
}

// ── Init ──
loadSchema();
