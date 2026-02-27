/* ============================================================
   ml-predict.js — Tahmin Paneli
   Model sec, manuel veri gir veya CSV yukle, tahmin sonuclarini gor.
   ============================================================ */

var mlPredictMode = "manual";   // "manual" | "csv"
var mlCsvData = null;           // Parse edilmis CSV verisi [[headers], [row1], ...]
var mlPredictResults = null;    // Son tahmin sonuclari


function renderPredictPanel() {
  var panel = document.getElementById("mlPredictPanel");
  if (!panel) return;

  if (!savedModels || savedModels.length === 0) {
    panel.innerHTML =
      '<div class="ml-empty-panel">' +
      '<i class="fas fa-magic"></i>' +
      '<p>' + t("ml.noSavedModels") + '<br>' + t("ml.trainFirstHint") + '</p>' +
      '</div>';
    return;
  }

  var html = "";

  // 1. Model Secimi
  html += '<div class="ml-predict-section">';
  html += '<h4><i class="fas fa-robot"></i> ' + t("ml.selectModel") + '</h4>';
  html += '<select class="ml-predict-model-select" id="predictModelSelect">';
  savedModels.forEach(function (m) {
    var metricStr = "";
    if (m.metrics) {
      var key = m.problem_type === "classification" ? "accuracy" : "r2";
      if (m.metrics[key] !== undefined) {
        metricStr = " (" + (m.metrics[key] * 100).toFixed(1) + "%)";
      }
    }
    html += '<option value="' + m.id + '">' + escapeHtml(m.model_name) + ' [' + escapeHtml(m.algorithm) + ']' + metricStr;
    if (m.is_best) html += ' \u2605';
    html += '</option>';
  });
  html += '</select>';
  html += '</div>';

  // 2. Giris Tipi Tabs
  html += '<div class="ml-predict-section">';
  html += '<h4><i class="fas fa-keyboard"></i> ' + t("ml.dataInput") + '</h4>';
  html += '<div class="ml-predict-tabs">';
  html += '<button class="ml-predict-tab' + (mlPredictMode === "manual" ? " active" : "") + '" onclick="setPredictMode(\'manual\')"><i class="fas fa-edit"></i> ' + t("ml.manualInput") + '</button>';
  html += '<button class="ml-predict-tab' + (mlPredictMode === "csv" ? " active" : "") + '" onclick="setPredictMode(\'csv\')"><i class="fas fa-file-csv"></i> ' + t("ml.csvUpload") + '</button>';
  html += '</div>';

  // Manual Input Form
  html += '<div id="manualInputDiv" style="' + (mlPredictMode === "manual" ? "" : "display:none;") + '">';
  html += _renderManualForm();
  html += '<button class="ml-predict-btn" onclick="predictSingle()"><i class="fas fa-magic"></i> ' + t("ml.predict") + '</button>';
  html += '</div>';

  // CSV Upload
  html += '<div id="csvInputDiv" style="' + (mlPredictMode === "csv" ? "" : "display:none;") + '">';
  html += '<div class="ml-upload-zone" id="csvDropZone" onclick="document.getElementById(\'csvFileInput\').click()">';
  html += '<i class="fas fa-cloud-upload-alt"></i>';
  html += '<p><strong>' + t("ml.dragCsv") + '</strong> ' + t("ml.dragCsvOr") + '</p>';
  html += '<p style="font-size:0.78rem;">' + t("ml.dragCsvHint") + '</p>';
  html += '<input type="file" id="csvFileInput" accept=".csv,.txt" onchange="onCsvFileSelect(event)">';
  html += '</div>';
  html += '<div id="csvPreviewArea"></div>';
  html += '<div id="csvPredictBtnArea" style="display:none;">';
  html += '<button class="ml-predict-btn" onclick="predictBatch()"><i class="fas fa-magic"></i> ' + t("ml.batchPredict") + '</button>';
  html += '</div>';
  html += '</div>';

  html += '</div>';

  // 3. Sonuclar
  html += '<div class="ml-predict-section" id="predictResultsSection" style="display:none;">';
  html += '<h4><i class="fas fa-poll"></i> ' + t("ml.predictionResults") + '</h4>';
  html += '<div class="ml-predict-results" id="predictResultsDiv"></div>';
  html += '</div>';

  panel.innerHTML = html;

  // CSV drag-drop setup
  setTimeout(function () { _setupCsvDragDrop(); }, 50);
}


function _renderManualForm() {
  // Feature isimlerini al (trainResults veya ilk modelden)
  var featureNames = _getFeatureNames();
  if (featureNames.length === 0) {
    return '<p style="color:var(--text-muted);font-size:0.88rem;">' + t("ml.featureNotFoundLong") + '</p>';
  }

  var html = '<div class="ml-manual-form">';
  featureNames.forEach(function (fn) {
    html += '<div class="ml-manual-field">';
    html += '<label>' + escapeHtml(fn) + '</label>';
    html += '<input type="text" id="predict_' + _safeId(fn) + '" placeholder="' + t("ml.enterValue") + '">';
    html += '</div>';
  });
  html += '</div>';
  return html;
}

function _getFeatureNames() {
  // trainResults'tan al
  if (trainResults && trainResults.feature_names && trainResults.feature_names.length > 0) {
    return trainResults.feature_names;
  }
  // currentMLTask'tan (hedef haric) al
  if (currentMLTask && currentMLTask.data && currentMLTask.data.length > 0) {
    var headers = currentMLTask.data[0].map(function (h) { return String(h); });
    var targetIdx = currentMLTask.target_column;
    return headers.filter(function (_, i) { return i !== targetIdx; });
  }
  return [];
}

function _safeId(name) {
  return String(name).replace(/[^a-zA-Z0-9_]/g, "_");
}


// =================== PREDICT MODE ===================

function setPredictMode(mode) {
  mlPredictMode = mode;
  document.querySelectorAll(".ml-predict-tab").forEach(function (btn) {
    btn.classList.toggle("active", btn.textContent.toLowerCase().indexOf(mode === "manual" ? "manuel" : "csv") >= 0);
  });
  var manualDiv = document.getElementById("manualInputDiv");
  var csvDiv = document.getElementById("csvInputDiv");
  if (manualDiv) manualDiv.style.display = mode === "manual" ? "" : "none";
  if (csvDiv) csvDiv.style.display = mode === "csv" ? "" : "none";
}


// =================== SINGLE PREDICT ===================

async function predictSingle() {
  var featureNames = _getFeatureNames();
  if (featureNames.length === 0) { _showMLToast(t("ml.featureNotFound"), "error"); return; }

  var modelSelect = document.getElementById("predictModelSelect");
  if (!modelSelect) return;
  var modelId = parseInt(modelSelect.value);

  // Build data row
  var headers = featureNames.slice();
  var row = [];
  var hasEmpty = false;
  featureNames.forEach(function (fn) {
    var input = document.getElementById("predict_" + _safeId(fn));
    var val = input ? input.value.trim() : "";
    if (val === "") hasEmpty = true;
    row.push(val);
  });

  if (hasEmpty) {
    _showMLToast(t("ml.fillAllFields"), "error");
    return;
  }

  try {
    var res = await fetch(API_BASE + "/api/ml/predict", {
      method: "POST",
      headers: getAuthHeaders(),
      credentials: "include",
      body: JSON.stringify({
        model_id: modelId,
        data: [headers, row],
      }),
    });
    if (handleAuthError(res)) return;
    var data = await res.json();

    if (data.success) {
      _showPredictResults([headers, row], data.predictions, data.target_column);
      _showMLToast(t("ml.predictionSuccess"));
    } else {
      _showMLToast(t("ml.predictionError") + (data.detail || ""), "error");
    }
  } catch (e) {
    _showMLToast(t("common.connectionError") + ": " + e.message, "error");
  }
}


// =================== BATCH PREDICT (CSV) ===================

async function predictBatch() {
  if (!mlCsvData || mlCsvData.length < 2) { _showMLToast(t("ml.uploadCsv"), "error"); return; }

  var modelSelect = document.getElementById("predictModelSelect");
  if (!modelSelect) return;
  var modelId = parseInt(modelSelect.value);

  try {
    var res = await fetch(API_BASE + "/api/ml/predict", {
      method: "POST",
      headers: getAuthHeaders(),
      credentials: "include",
      body: JSON.stringify({
        model_id: modelId,
        data: mlCsvData,
      }),
    });
    if (handleAuthError(res)) return;
    var data = await res.json();

    if (data.success) {
      _showPredictResults(mlCsvData, data.predictions, data.target_column);
      _showMLToast(t("ml.batchPredictSuccess", {count: data.predictions.length}));
    } else {
      _showMLToast(t("ml.predictionError") + (data.detail || ""), "error");
    }
  } catch (e) {
    _showMLToast(t("common.connectionError") + ": " + e.message, "error");
  }
}


// =================== CSV PARSING ===================

function onCsvFileSelect(event) {
  var file = event.target.files[0];
  if (!file) return;
  _parseCsvFile(file);
}

function _setupCsvDragDrop() {
  var zone = document.getElementById("csvDropZone");
  if (!zone) return;
  zone.addEventListener("dragover", function (e) {
    e.preventDefault();
    zone.classList.add("dragover");
  });
  zone.addEventListener("dragleave", function () {
    zone.classList.remove("dragover");
  });
  zone.addEventListener("drop", function (e) {
    e.preventDefault();
    zone.classList.remove("dragover");
    var file = e.dataTransfer.files[0];
    if (file) _parseCsvFile(file);
  });
}

function _parseCsvFile(file) {
  var reader = new FileReader();
  reader.onload = function (e) {
    var text = e.target.result;
    var lines = text.split(/\r?\n/).filter(function (l) { return l.trim() !== ""; });
    if (lines.length < 2) {
      _showMLToast(t("ml.csvMinRows"), "error");
      return;
    }

    mlCsvData = lines.map(function (line) {
      return _parseCsvLine(line);
    });

    _showCsvPreview(mlCsvData);

    var btnArea = document.getElementById("csvPredictBtnArea");
    if (btnArea) btnArea.style.display = "";
  };
  reader.readAsText(file);
}

function _parseCsvLine(line) {
  // Basit CSV parser (virgul ve noktali virgul, tirnak destegi)
  var result = [];
  var current = "";
  var inQuotes = false;
  var delimiter = line.indexOf(";") > line.indexOf(",") ? ";" : ",";

  for (var i = 0; i < line.length; i++) {
    var ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function _showCsvPreview(data) {
  var area = document.getElementById("csvPreviewArea");
  if (!area) return;

  var maxRows = Math.min(6, data.length);
  var html = '<div class="ml-csv-preview"><table>';
  // Header
  html += '<thead><tr>';
  data[0].forEach(function (h) {
    html += '<th>' + escapeHtml(String(h)) + '</th>';
  });
  html += '</tr></thead>';
  // Body
  html += '<tbody>';
  for (var i = 1; i < maxRows; i++) {
    html += '<tr>';
    data[i].forEach(function (v) {
      html += '<td>' + escapeHtml(String(v)) + '</td>';
    });
    html += '</tr>';
  }
  html += '</tbody></table></div>';
  html += '<p style="font-size:0.78rem;color:var(--text-muted);margin-top:4px;">' +
    t("ml.csvLoaded", {rows: (data.length - 1), cols: data[0].length}) + '</p>';

  area.innerHTML = html;
}


// =================== RESULTS DISPLAY ===================

function _showPredictResults(inputData, predictions, targetColumn) {
  var section = document.getElementById("predictResultsSection");
  var div = document.getElementById("predictResultsDiv");
  if (!section || !div) return;

  section.style.display = "";

  var headers = inputData[0];
  var rows = inputData.slice(1);

  var html = '<table>';
  // Header
  html += '<thead><tr>';
  headers.forEach(function (h) {
    html += '<th>' + escapeHtml(String(h)) + '</th>';
  });
  html += '<th class="ml-pred-col"><i class="fas fa-magic"></i> ' + escapeHtml(targetColumn || t("ml.predicted")) + '</th>';
  html += '</tr></thead>';

  // Body
  html += '<tbody>';
  rows.forEach(function (row, i) {
    html += '<tr>';
    row.forEach(function (v) {
      html += '<td>' + escapeHtml(String(v)) + '</td>';
    });
    var pred = predictions[i] !== undefined ? predictions[i] : "-";
    html += '<td class="ml-pred-col"><strong>' + escapeHtml(String(pred)) + '</strong></td>';
    html += '</tr>';
  });
  html += '</tbody></table>';

  div.innerHTML = html;
}
