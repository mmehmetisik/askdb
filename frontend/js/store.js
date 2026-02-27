/* ============================================================
   store.js  —  Centralized state management with pub/sub
   Load this BEFORE all other JS files.
   ============================================================ */

var Store = (function () {
  "use strict";

  // ---------- PUB/SUB ----------
  var _listeners = {};

  function on(event, fn) {
    if (!_listeners[event]) _listeners[event] = [];
    _listeners[event].push(fn);
    return function off() {
      _listeners[event] = _listeners[event].filter(function (f) { return f !== fn; });
    };
  }

  function emit(event, data) {
    (_listeners[event] || []).forEach(function (fn) {
      try { fn(data); } catch (e) { console.error("[Store] listener error:", event, e); }
    });
  }

  // ---------- AUTH STATE ----------
  var _auth = {
    username: localStorage.getItem("username") || null,
    role: localStorage.getItem("role") || null,
  };

  function getAuth() { return Object.assign({}, _auth); }

  function setAuth(username, role) {
    _auth.username = username;
    _auth.role = role;
    if (username) {
      localStorage.setItem("username", username);
      localStorage.setItem("role", role);
    } else {
      localStorage.removeItem("username");
      localStorage.removeItem("role");
    }
    emit("auth:changed", getAuth());
  }

  function clearAuth() {
    setAuth(null, null);
    localStorage.clear();
    emit("auth:cleared");
  }

  // ---------- TABLE / QUERY STATE ----------
  var _table = {
    resultData: null,
    columnTypes: [],
    truncated: false,
    sortColumn: -1,
    sortDirection: "asc",
    hiddenColumns: new Set(),
    filter: "",
    page: 1,
    pageSize: 100,
  };

  function getTable() { return _table; }

  function setTableData(data, columnTypes, truncated) {
    _table.resultData = data;
    _table.columnTypes = columnTypes || [];
    _table.truncated = !!truncated;
    _table.sortColumn = -1;
    _table.sortDirection = "asc";
    _table.hiddenColumns = new Set();
    _table.filter = "";
    _table.page = 1;
    emit("table:dataChanged", _table);
  }

  function setTableSort(col, dir) {
    _table.sortColumn = col;
    _table.sortDirection = dir;
    emit("table:sorted", _table);
  }

  function setTablePage(page) {
    _table.page = page;
    emit("table:paged", _table);
  }

  function setTableFilter(text) {
    _table.filter = text;
    _table.page = 1;
    emit("table:filtered", _table);
  }

  function toggleHiddenColumn(idx) {
    if (_table.hiddenColumns.has(idx)) {
      _table.hiddenColumns.delete(idx);
    } else {
      _table.hiddenColumns.add(idx);
    }
    emit("table:columnsChanged", _table);
  }

  // ---------- QUERY HISTORY ----------
  var _history = {
    items: [],
    activeIndex: -1,
    previewMode: false,
  };

  function getHistory() { return _history; }

  function addHistoryItem(item) {
    _history.items.push(item);
    _history.activeIndex = _history.items.length - 1;
    emit("history:added", { item: item, index: _history.activeIndex });
  }

  function setActiveHistory(idx) {
    _history.activeIndex = idx;
    emit("history:selected", idx);
  }

  function setPreviewMode(val) {
    _history.previewMode = !!val;
    emit("history:previewMode", val);
  }

  // ---------- SCHEMA STATE ----------
  var _schema = {
    tables: [],
    connections: [],
    selectedTables: new Set(),
  };

  function getSchema() { return _schema; }

  function setSchemaData(tables, connections) {
    _schema.tables = tables || [];
    _schema.connections = connections || [];
    emit("schema:loaded", _schema);
  }

  function setSelectedTables(tableSet) {
    _schema.selectedTables = tableSet instanceof Set ? tableSet : new Set(tableSet);
    emit("schema:selectionChanged", _schema.selectedTables);
  }

  // ---------- PUBLIC API ----------
  return {
    // Pub/Sub
    on: on,
    emit: emit,

    // Auth
    getAuth: getAuth,
    setAuth: setAuth,
    clearAuth: clearAuth,

    // Table
    getTable: getTable,
    setTableData: setTableData,
    setTableSort: setTableSort,
    setTablePage: setTablePage,
    setTableFilter: setTableFilter,
    toggleHiddenColumn: toggleHiddenColumn,

    // History
    getHistory: getHistory,
    addHistoryItem: addHistoryItem,
    setActiveHistory: setActiveHistory,
    setPreviewMode: setPreviewMode,

    // Schema
    getSchema: getSchema,
    setSchemaData: setSchemaData,
    setSelectedTables: setSelectedTables,
  };
})();
