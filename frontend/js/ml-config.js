/* ============================================================
   ml-config.js — ML Yapilandirma Paneli
   Problem tipi, feature secimi, algoritma secimi, split, CV.
   ============================================================ */

// Algoritma tanimlari (backend ile eslesir)
var ML_CLASSIFICATION_ALGOS = [
  { key: "logistic_regression", name: "Logistic Regression" },
  { key: "random_forest", name: "Random Forest" },
  { key: "gradient_boosting", name: "Gradient Boosting" },
  { key: "svm", name: "SVM (Support Vector Machine)" },
  { key: "knn", name: "KNN (K-Nearest Neighbors)" },
  { key: "decision_tree", name: "Decision Tree" },
];

var ML_REGRESSION_ALGOS = [
  { key: "linear_regression", name: "Linear Regression" },
  { key: "ridge", name: "Ridge Regression" },
  { key: "lasso", name: "Lasso Regression" },
  { key: "random_forest_regressor", name: "Random Forest Regressor" },
  { key: "gradient_boosting_regressor", name: "Gradient Boosting Regressor" },
  { key: "svr", name: "SVR (Support Vector Regression)" },
];

// Config state
var mlProblemType = "classification";
var mlSelectedTarget = "";
var mlSelectedFeatures = [];
var mlSelectedAlgos = [];
var mlTrainSplit = 80;
var mlCVFolds = 5;
var _lastMLTaskId = null;


function renderMLConfig() {
  var panel = document.getElementById("mlConfigPanel");
  if (!panel || !currentMLTask) return;

  var task = currentMLTask;
  var data = task.data || [];
  if (!data || data.length < 2) {
    panel.innerHTML = '<div class="ml-empty-panel"><i class="fas fa-exclamation-triangle"></i><p>' + t("common.noResults") + '</p></div>';
    return;
  }

  var headers = data[0].map(function (h) { return String(h); });
  var rowCount = data.length - 1;
  var colCount = headers.length;
  var colTypes = task.column_types || [];

  // Auto-detect only on new task load (don't override user selections on re-render)
  if (_lastMLTaskId !== task.id) {
    _lastMLTaskId = task.id;
    var targetIdx = task.target_column;
    if (targetIdx !== null && targetIdx !== undefined && targetIdx >= 0 && targetIdx < headers.length) {
      mlSelectedTarget = headers[targetIdx];
    } else {
      mlSelectedTarget = headers[headers.length - 1];
    }
    mlProblemType = _autoDetectProblemType(data, mlSelectedTarget, headers, colTypes);
    mlSelectedFeatures = headers.filter(function (h) { return h !== mlSelectedTarget; });
  }

  var html = "";

  // 1. Veri Ozeti
  html += '<div class="ml-config-section">';
  html += '<h4><i class="fas fa-table"></i> ' + t("ml.dataSummary") + '</h4>';
  html += '<div class="ml-data-summary">';
  html += '<div class="ml-summary-card"><span class="ml-summary-num">' + fmtNum(rowCount) + '</span><span class="ml-summary-label">' + t("ml.rowLabel") + '</span></div>';
  html += '<div class="ml-summary-card"><span class="ml-summary-num">' + colCount + '</span><span class="ml-summary-label">' + t("ml.colLabel") + '</span></div>';
  html += '<div class="ml-summary-card"><span class="ml-summary-num">' + escapeHtml(mlSelectedTarget) + '</span><span class="ml-summary-label">' + t("ml.targetLabel") + '</span></div>';
  html += '<div class="ml-summary-card"><span class="ml-summary-num">' + (task.cleaning_steps ? task.cleaning_steps.length : 0) + '</span><span class="ml-summary-label">' + t("ml.cleaningLabel") + '</span></div>';
  html += '</div></div>';

  // 2. Hedef Degisken
  html += '<div class="ml-config-section">';
  html += '<h4><i class="fas fa-bullseye"></i> ' + t("ml.targetVariable") + '</h4>';
  html += '<select class="ml-target-select" id="mlTargetSelect" onchange="onTargetChange()">';
  headers.forEach(function (h) {
    html += '<option value="' + escapeHtml(h) + '"' + (h === mlSelectedTarget ? ' selected' : '') + '>' + escapeHtml(h) + '</option>';
  });
  html += '</select>';
  html += '</div>';

  // 3. Problem Tipi
  html += '<div class="ml-config-section">';
  html += '<h4><i class="fas fa-project-diagram"></i> ' + t("ml.problemType") + '</h4>';
  html += '<div class="ml-radio-group">';
  html += '<label class="ml-radio-item' + (mlProblemType === "classification" ? " selected" : "") + '" onclick="setProblemType(\'classification\')" id="radioClassification">';
  html += '<input type="radio" name="problemType" value="classification"' + (mlProblemType === "classification" ? " checked" : "") + '>';
  html += '<i class="fas fa-tags"></i> ' + t("ml.classification");
  html += '</label>';
  html += '<label class="ml-radio-item' + (mlProblemType === "regression" ? " selected" : "") + '" onclick="setProblemType(\'regression\')" id="radioRegression">';
  html += '<input type="radio" name="problemType" value="regression"' + (mlProblemType === "regression" ? " checked" : "") + '>';
  html += '<i class="fas fa-chart-line"></i> ' + t("ml.regression");
  html += '</label>';
  html += '</div></div>';

  // 4. Feature Secimi
  html += '<div class="ml-config-section">';
  html += '<h4><i class="fas fa-columns"></i> ' + t("ml.featureSelection") + '</h4>';
  html += '<div class="ml-feature-actions">';
  html += '<button onclick="selectAllFeatures(true)">' + t("ml.selectAll") + '</button>';
  html += '<button onclick="selectAllFeatures(false)">' + t("ml.selectNone") + '</button>';
  html += '</div>';
  html += '<div class="ml-feature-grid" id="featureGrid">';
  headers.forEach(function (h, i) {
    if (h === mlSelectedTarget) return;
    var colType = _getColType(i, colTypes);
    var typeClass = "ml-type-" + colType;
    var typeLabel = { numeric: t("ml.typeNumeric"), text: t("ml.typeText"), date: t("ml.typeDate"), boolean: t("ml.typeBoolean") }[colType] || colType;
    var checked = mlSelectedFeatures.indexOf(h) >= 0;
    html += '<label class="ml-feature-item">';
    html += '<input type="checkbox" value="' + escapeHtml(h) + '"' + (checked ? " checked" : "") + ' onchange="onFeatureToggle()">';
    html += '<span>' + escapeHtml(h) + '</span>';
    html += '<span class="ml-feature-type ' + typeClass + '">' + typeLabel + '</span>';
    html += '</label>';
  });
  html += '</div></div>';

  // 5. Algoritma Secimi
  html += '<div class="ml-config-section">';
  html += '<h4><i class="fas fa-microchip"></i> ' + t("ml.algoSelection") + '</h4>';
  html += '<div class="ml-feature-actions">';
  html += '<button onclick="selectAllAlgos(true)">' + t("ml.selectAll") + '</button>';
  html += '<button onclick="selectAllAlgos(false)">' + t("ml.selectNone") + '</button>';
  html += '</div>';
  html += '<div class="ml-algo-grid" id="algoGrid">';
  html += _renderAlgoGrid(mlProblemType);
  html += '</div></div>';

  // 6. Train/Test Split
  html += '<div class="ml-config-section">';
  html += '<h4><i class="fas fa-cut"></i> ' + t("ml.trainTestSplit") + '</h4>';
  html += '<div class="ml-slider-group">';
  html += '<input type="range" min="60" max="90" step="5" value="' + mlTrainSplit + '" id="splitSlider" oninput="onSplitChange()">';
  html += '<span class="ml-slider-label" id="splitLabel">' + t("ml.trainSplitLabel", {train: mlTrainSplit, test: (100 - mlTrainSplit)}) + '</span>';
  html += '</div></div>';

  // 7. Cross-Validation
  html += '<div class="ml-config-section">';
  html += '<h4><i class="fas fa-sync-alt"></i> Cross-Validation</h4>';
  html += '<select class="ml-cv-select" id="cvSelect" onchange="onCVChange()">';
  [2, 3, 5, 10].forEach(function (n) {
    html += '<option value="' + n + '"' + (n === mlCVFolds ? ' selected' : '') + '>' + n + '-Fold</option>';
  });
  html += '</select>';
  html += '</div>';

  // 8. Train Button
  html += '<div style="text-align:center;padding:10px 0;">';
  html += '<button class="ml-train-btn" onclick="startTraining()" id="trainBtn">';
  html += '<i class="fas fa-play"></i> ' + t("ml.startTraining");
  html += '</button>';
  html += '</div>';

  panel.innerHTML = html;

  // Default algo selection — tum algoritmalar secili baslat
  var algos = mlProblemType === "classification" ? ML_CLASSIFICATION_ALGOS : ML_REGRESSION_ALGOS;
  mlSelectedAlgos = algos.map(function (a) { return a.key; });
}


// =================== HELPERS ===================

function _autoDetectProblemType(data, targetCol, headers, colTypes) {
  var targetIdx = headers.indexOf(targetCol);
  if (targetIdx < 0) return "classification";

  // Kolon tipi bilgisi varsa kullan
  if (colTypes && colTypes[targetIdx]) {
    var ct = String(colTypes[targetIdx]).toLowerCase();
    if (ct === "text" || ct === "boolean") return "classification";
  }

  // Unique deger sayisina bak
  var uniqueVals = {};
  var numericCount = 0;
  var totalCount = 0;
  for (var i = 1; i < data.length && i <= 200; i++) {
    var val = data[i][targetIdx];
    if (val === null || val === undefined || val === "" || val === "NULL") continue;
    uniqueVals[String(val)] = true;
    totalCount++;
    if (!isNaN(Number(val))) numericCount++;
  }

  var uniqueCount = Object.keys(uniqueVals).length;

  // Cok az unique deger -> classification
  if (uniqueCount <= 15 && uniqueCount < totalCount * 0.3) return "classification";
  // Cogunluk numerik ve cok unique -> regression
  if (numericCount > totalCount * 0.8 && uniqueCount > 15) return "regression";

  return "classification"; // Default
}

function _getColType(index, colTypes) {
  if (!colTypes || !colTypes[index]) return "text";
  var ct = String(colTypes[index]).toLowerCase();
  if (ct.indexOf("int") >= 0 || ct.indexOf("float") >= 0 || ct.indexOf("numeric") >= 0 || ct.indexOf("double") >= 0 || ct.indexOf("decimal") >= 0) return "numeric";
  if (ct.indexOf("date") >= 0 || ct.indexOf("time") >= 0) return "date";
  if (ct.indexOf("bool") >= 0) return "boolean";
  return "text";
}

function _renderAlgoGrid(problemType) {
  var algos = problemType === "classification" ? ML_CLASSIFICATION_ALGOS : ML_REGRESSION_ALGOS;
  var html = "";
  algos.forEach(function (a) {
    html += '<label class="ml-algo-item selected" id="algo_' + a.key + '">';
    html += '<input type="checkbox" value="' + a.key + '" checked onchange="onAlgoToggle()">';
    html += '<span>' + escapeHtml(a.name) + '</span>';
    html += '</label>';
  });
  return html;
}


// =================== EVENT HANDLERS ===================

function onTargetChange() {
  var sel = document.getElementById("mlTargetSelect");
  if (!sel) return;
  mlSelectedTarget = sel.value;

  if (currentMLTask && currentMLTask.data) {
    var headers = currentMLTask.data[0].map(function (h) { return String(h); });
    // Problem tipini yeniden algila
    mlProblemType = _autoDetectProblemType(currentMLTask.data, mlSelectedTarget, headers, currentMLTask.column_types);
    // Feature listesini guncelle (yeni hedef haric)
    mlSelectedFeatures = headers.filter(function (h) { return h !== mlSelectedTarget; });
  }

  // Re-render (full)
  renderMLConfig();
}

function setProblemType(type) {
  mlProblemType = type;
  renderMLConfig();
}

function selectAllFeatures(selectAll) {
  var checkboxes = document.querySelectorAll("#featureGrid input[type='checkbox']");
  checkboxes.forEach(function (cb) { cb.checked = selectAll; });
  onFeatureToggle();
}

function onFeatureToggle() {
  mlSelectedFeatures = [];
  document.querySelectorAll("#featureGrid input[type='checkbox']:checked").forEach(function (cb) {
    mlSelectedFeatures.push(cb.value);
  });
}

function selectAllAlgos(selectAll) {
  var checkboxes = document.querySelectorAll("#algoGrid input[type='checkbox']");
  checkboxes.forEach(function (cb) {
    cb.checked = selectAll;
    cb.closest(".ml-algo-item").classList.toggle("selected", selectAll);
  });
  _syncAlgoSelection();
}

function onAlgoToggle() {
  document.querySelectorAll("#algoGrid input[type='checkbox']").forEach(function (cb) {
    cb.closest(".ml-algo-item").classList.toggle("selected", cb.checked);
  });
  _syncAlgoSelection();
}

function _syncAlgoSelection() {
  mlSelectedAlgos = [];
  document.querySelectorAll("#algoGrid input[type='checkbox']:checked").forEach(function (cb) {
    mlSelectedAlgos.push(cb.value);
  });
}

function onSplitChange() {
  var slider = document.getElementById("splitSlider");
  var label = document.getElementById("splitLabel");
  if (!slider) return;
  mlTrainSplit = parseInt(slider.value);
  if (label) label.textContent = t("ml.trainSplitLabel", {train: mlTrainSplit, test: (100 - mlTrainSplit)});
}

function onCVChange() {
  var sel = document.getElementById("cvSelect");
  if (sel) mlCVFolds = parseInt(sel.value);
}
