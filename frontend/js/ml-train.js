/* ============================================================
   ml-train.js — Egitim, Polling, Leaderboard, Gorsellestirme
   ============================================================ */

// Chart instances (memory leak prevention)
var _mlChartInstances = [];

// =================== START TRAINING ===================

async function startTraining() {
  if (!currentMLTask) { _showMLToast(t("ml.selectTaskToast"), "error"); return; }

  // Sync selections from DOM
  _syncAlgoSelection();
  onFeatureToggle();

  if (mlSelectedFeatures.length === 0) { _showMLToast(t("ml.selectFeature"), "error"); return; }
  if (mlSelectedAlgos.length === 0) { _showMLToast(t("ml.selectAlgo"), "error"); return; }
  if (!mlSelectedTarget) { _showMLToast(t("ml.selectTargetToast"), "error"); return; }

  var trainBtn = document.getElementById("trainBtn");
  if (trainBtn) {
    trainBtn.disabled = true;
    trainBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + t("ml.starting");
  }

  try {
    var payload = {
      ml_task_id: currentMLTask.id,
      problem_type: mlProblemType,
      target_column: mlSelectedTarget,
      feature_columns: mlSelectedFeatures,
      algorithms: mlSelectedAlgos,
      train_split: mlTrainSplit / 100,
      cv_folds: mlCVFolds,
    };

    var res = await fetch(API_BASE + "/api/ml/train", {
      method: "POST",
      headers: getAuthHeaders(),
      credentials: "include",
      body: JSON.stringify(payload),
    });

    if (handleAuthError(res)) return;
    var data = await res.json();

    if (!data.success) {
      _showMLToast(t("ml.trainFailed") + (data.detail || data.error || ""), "error");
      if (trainBtn) { trainBtn.disabled = false; trainBtn.innerHTML = '<i class="fas fa-play"></i> ' + t("ml.startTraining"); }
      return;
    }

    currentJobId = data.job_id;
    _showMLToast(t("ml.trainStarted"));

    // Leaderboard tab'a gec ve loading goster
    switchMLTab("leaderboard");
    _showTrainingProgress();

    // Polling baslat
    _startPolling(currentJobId);

  } catch (e) {
    _showMLToast(t("common.connectionError") + ": " + e.message, "error");
    if (trainBtn) { trainBtn.disabled = false; trainBtn.innerHTML = '<i class="fas fa-play"></i> ' + t("ml.startTraining"); }
  }
}


// =================== POLLING ===================

function _startPolling(jobId) {
  if (pollingInterval) clearInterval(pollingInterval);
  pollingInterval = setInterval(function () {
    _pollTrainingStatus(jobId);
  }, 2000);
}

async function _pollTrainingStatus(jobId) {
  try {
    var res = await fetch(API_BASE + "/api/ml/train/" + jobId + "/status", { headers: getAuthHeaders(), credentials: "include" });
    if (handleAuthError(res)) return;
    var data = await res.json();

    if (!data.success) return;

    if (data.status === "completed") {
      clearInterval(pollingInterval);
      pollingInterval = null;
      trainResults = data.results || {};
      _updateJobStatus("completed");

      // Sonuclari render et
      renderLeaderboard(trainResults);
      renderViz(trainResults);

      // Modelleri yeniden yukle
      loadSavedModels();

      // Train butonunu resetle
      var trainBtn = document.getElementById("trainBtn");
      if (trainBtn) { trainBtn.disabled = false; trainBtn.innerHTML = '<i class="fas fa-play"></i> ' + t("ml.startTraining"); }

      _showMLToast(t("ml.trainCompleted", {count: (trainResults.models ? trainResults.models.length : 0)}));

    } else if (data.status === "failed") {
      clearInterval(pollingInterval);
      pollingInterval = null;
      _updateJobStatus("failed");
      _showTrainingError(data.error_message || t("ml.trainError"));

      var trainBtn2 = document.getElementById("trainBtn");
      if (trainBtn2) { trainBtn2.disabled = false; trainBtn2.innerHTML = '<i class="fas fa-play"></i> ' + t("ml.startTraining"); }
    }
    // running -> devam
  } catch (e) {
    // Network hatasi — polling devam etsin
  }
}


// =================== TRAINING UI HELPERS ===================

function _showTrainingProgress() {
  var panel = document.getElementById("mlLeaderboardPanel");
  if (!panel) return;
  panel.innerHTML =
    '<div class="ml-training-indicator">' +
    '<div class="ml-training-spinner"></div>' +
    '<div class="ml-training-text">' + t("ml.trainingModels") + '</div>' +
    '<div class="ml-training-sub">' + t("ml.trainingAlgoCount", {count: mlSelectedAlgos.length}) + '</div>' +
    '<button class="ml-stop-btn" onclick="cancelTraining()" id="cancelBtn">' +
    '<i class="fas fa-stop"></i> ' + t("ml.stopTraining") +
    '</button>' +
    '</div>';
}

async function cancelTraining() {
  if (!currentJobId) return;
  var btn = document.getElementById("cancelBtn");
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + t("ml.stopping"); }

  try {
    var res = await fetch(API_BASE + "/api/ml/train/" + currentJobId + "/cancel", {
      method: "POST",
      headers: getAuthHeaders(),
      credentials: "include",
    });
    if (handleAuthError(res)) return;

    // Polling durdur
    if (pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; }

    // UI resetle
    _showTrainingError(t("ml.stoppedByUser"));
    _updateJobStatus("failed");

    var trainBtn = document.getElementById("trainBtn");
    if (trainBtn) { trainBtn.disabled = false; trainBtn.innerHTML = '<i class="fas fa-play"></i> ' + t("ml.startTraining"); }

    _showMLToast(t("ml.trainStopped"));
  } catch (e) {
    _showMLToast(t("ml.stopError") + e.message, "error");
  }
}

function _showTrainingError(msg) {
  var panel = document.getElementById("mlLeaderboardPanel");
  if (!panel) return;
  panel.innerHTML =
    '<div class="ml-empty-panel">' +
    '<i class="fas fa-exclamation-triangle" style="color:#ef4444;"></i>' +
    '<div class="ml-error-msg">' + escapeHtml(msg) + '</div>' +
    '<p style="margin-top:12px;">' + t("ml.configAndRetry") + '</p>' +
    '</div>';
}

function _updateJobStatus(status) {
  var el = document.getElementById("mlJobStatus");
  var actionsEl = document.getElementById("mlActions");
  if (!el || !actionsEl) return;
  actionsEl.style.display = "";
  var classes = { running: "ml-job-running", completed: "ml-job-completed", failed: "ml-job-failed" };
  var labels = { running: t("ml.jobRunning"), completed: t("ml.jobCompleted"), failed: t("ml.jobFailed") };
  el.className = "ml-job-status " + (classes[status] || "");
  el.textContent = labels[status] || status;
}


// =================== LEADERBOARD ===================

function renderLeaderboard(results) {
  var panel = document.getElementById("mlLeaderboardPanel");
  if (!panel) return;

  if (!results || !results.models || results.models.length === 0) {
    panel.innerHTML = '<div class="ml-empty-panel"><i class="fas fa-trophy"></i><p>' + t("ml.noResults") + '</p></div>';
    return;
  }

  var problemType = results.problem_type || mlProblemType;
  var models = results.models.slice(); // copy

  // Sort by primary metric
  var primaryMetric = problemType === "classification" ? "accuracy" : "r2";
  models.sort(function (a, b) {
    var va = (a.metrics && a.metrics[primaryMetric]) || 0;
    var vb = (b.metrics && b.metrics[primaryMetric]) || 0;
    return vb - va;
  });

  var metricCols = problemType === "classification"
    ? ["accuracy", "precision", "recall", "f1", "roc_auc"]
    : ["r2", "mae", "rmse", "mse"];

  var metricLabels = {
    accuracy: "Accuracy", precision: "Precision", recall: "Recall",
    f1: "F1 Score", roc_auc: "ROC-AUC",
    r2: "R\u00b2", mae: "MAE", rmse: "RMSE", mse: "MSE",
  };

  var html = '<div class="ml-config-section" style="padding:16px;">';
  html += '<h4><i class="fas fa-trophy"></i> Model Leaderboard</h4>';
  html += '<div style="overflow-x:auto;">';
  html += '<table class="ml-leaderboard-table">';

  // Header
  html += '<thead><tr>';
  html += '<th>#</th><th>Model</th>';
  metricCols.forEach(function (mc) {
    html += '<th>' + metricLabels[mc] + '</th>';
  });
  html += '<th>CV Score</th>';
  html += '</tr></thead>';

  // Body
  html += '<tbody>';
  models.forEach(function (m, idx) {
    var rank = idx + 1;
    var isBest = m.is_best || rank === 1;
    var rankClass = rank <= 3 ? " ml-rank-" + rank : "";

    html += '<tr class="' + (isBest ? "ml-best-row" : "") + '">';
    html += '<td><span class="ml-rank-badge' + rankClass + '">' + rank + '</span></td>';
    html += '<td><strong>' + escapeHtml(m.name || m.algorithm) + '</strong>';
    if (isBest) html += ' <i class="fas fa-crown" style="color:#f59e0b;font-size:0.75rem;"></i>';
    html += '</td>';

    metricCols.forEach(function (mc) {
      var val = (m.metrics && m.metrics[mc]) || 0;
      var colorClass = _metricColorClass(mc, val, problemType);
      html += '<td><span class="ml-metric-val ' + colorClass + '">' + _formatMetric(val, mc) + '</span></td>';
    });

    // CV Score
    var cv = m.cv_scores || {};
    html += '<td>';
    if (cv.mean !== undefined) {
      html += '<span class="ml-metric-val">' + _formatMetric(cv.mean, primaryMetric) + '</span>';
      html += '<div class="ml-cv-info">&plusmn; ' + (cv.std !== undefined ? cv.std.toFixed(3) : "?") + '</div>';
    } else {
      html += '<span class="ml-metric-val">-</span>';
    }
    html += '</td>';

    html += '</tr>';
  });
  html += '</tbody></table></div>';

  // Export buttons
  html += '<div class="ml-export-actions">';
  html += '<button class="ml-export-btn" onclick="exportNotebook()">';
  html += '<i class="fas fa-file-code"></i> Export as Notebook (.ipynb)';
  html += '</button>';
  html += '</div>';

  html += '</div>';

  panel.innerHTML = html;
}


function _formatMetric(val, metricKey) {
  if (val === null || val === undefined) return "-";
  // Percentage metrics
  if (["accuracy", "precision", "recall", "f1", "roc_auc", "r2"].indexOf(metricKey) >= 0) {
    return (val * 100).toFixed(1) + "%";
  }
  return val.toFixed(4);
}

function _metricColorClass(metricKey, val, problemType) {
  if (["accuracy", "precision", "recall", "f1", "roc_auc"].indexOf(metricKey) >= 0) {
    if (val >= 0.85) return "ml-metric-good";
    if (val >= 0.65) return "ml-metric-ok";
    return "ml-metric-bad";
  }
  if (metricKey === "r2") {
    if (val >= 0.8) return "ml-metric-good";
    if (val >= 0.5) return "ml-metric-ok";
    return "ml-metric-bad";
  }
  return "";
}


// =================== VISUALIZATION ===================

function renderViz(results) {
  var panel = document.getElementById("mlVizPanel");
  if (!panel) return;

  // Destroy old charts
  _mlChartInstances.forEach(function (c) { try { c.destroy(); } catch (e) {} });
  _mlChartInstances = [];

  if (!results || !results.models || results.models.length === 0) {
    panel.innerHTML = '<div class="ml-empty-panel"><i class="fas fa-chart-area"></i><p>' + t("ml.noVizResults") + '</p></div>';
    return;
  }

  var problemType = results.problem_type || mlProblemType;
  var bestModel = results.models.find(function (m) { return m.is_best; }) || results.models[0];
  var featureNames = results.feature_names || [];

  var html = '<div class="ml-config-section" style="padding:12px 16px;">';
  html += '<h4><i class="fas fa-star"></i> ' + t("ml.bestModel") + ': ' + escapeHtml(bestModel.name || bestModel.algorithm) + '</h4>';
  html += '</div>';

  html += '<div class="ml-viz-grid">';

  // Confusion Matrix (classification only)
  if (problemType === "classification" && bestModel.confusion_matrix) {
    html += '<div class="ml-viz-card">';
    html += '<h4><i class="fas fa-th"></i> Confusion Matrix</h4>';
    html += '<div class="ml-cm-container"><canvas id="cmCanvas" width="320" height="320"></canvas></div>';
    html += '</div>';
  }

  // ROC Curve (classification, binary)
  if (problemType === "classification" && bestModel.roc_curve) {
    html += '<div class="ml-viz-card">';
    html += '<h4><i class="fas fa-chart-line"></i> ROC Curve</h4>';
    html += '<div class="ml-chart-container"><canvas id="rocCanvas"></canvas></div>';
    html += '</div>';
  }

  // Feature Importance
  if (bestModel.feature_importances && featureNames.length > 0) {
    html += '<div class="ml-viz-card">';
    html += '<h4><i class="fas fa-sort-amount-down"></i> Feature Importance</h4>';
    html += '<div class="ml-chart-container"><canvas id="fiCanvas"></canvas></div>';
    html += '</div>';
  }

  // Metric Comparison Bar Chart
  html += '<div class="ml-viz-card">';
  html += '<h4><i class="fas fa-chart-bar"></i> ' + t("ml.modelComparison") + '</h4>';
  html += '<div class="ml-chart-container"><canvas id="compareCanvas"></canvas></div>';
  html += '</div>';

  html += '</div>'; // grid end

  panel.innerHTML = html;

  // Render charts (use setTimeout to let DOM update)
  setTimeout(function () {
    if (problemType === "classification" && bestModel.confusion_matrix) {
      _drawConfusionMatrix("cmCanvas", bestModel.confusion_matrix, results.class_names);
    }
    if (problemType === "classification" && bestModel.roc_curve) {
      _drawROCCurve("rocCanvas", bestModel.roc_curve, bestModel.metrics ? bestModel.metrics.roc_auc : 0);
    }
    if (bestModel.feature_importances && featureNames.length > 0) {
      _drawFeatureImportance("fiCanvas", bestModel.feature_importances, featureNames);
    }
    _drawModelComparison("compareCanvas", results.models, problemType);
  }, 100);
}


// ---- Confusion Matrix (custom canvas) ----

function _drawConfusionMatrix(canvasId, matrix, classNames) {
  var canvas = document.getElementById(canvasId);
  if (!canvas) return;
  var ctx = canvas.getContext("2d");

  var n = matrix.length;
  if (!classNames || classNames.length !== n) {
    classNames = [];
    for (var i = 0; i < n; i++) classNames.push("C" + i);
  }

  var cellSize = Math.min(60, Math.floor(280 / n));
  var margin = 50;
  canvas.width = margin + n * cellSize + 20;
  canvas.height = margin + n * cellSize + 40;

  var maxVal = 0;
  matrix.forEach(function (row) {
    row.forEach(function (v) { if (v > maxVal) maxVal = v; });
  });

  // Cells
  for (var r = 0; r < n; r++) {
    for (var c = 0; c < n; c++) {
      var x = margin + c * cellSize;
      var y = margin + r * cellSize;
      var val = matrix[r][c];
      var intensity = maxVal > 0 ? val / maxVal : 0;

      if (r === c) {
        ctx.fillStyle = "rgba(34, 197, 94, " + (0.2 + intensity * 0.6) + ")";
      } else {
        ctx.fillStyle = "rgba(239, 68, 68, " + (0.1 + intensity * 0.5) + ")";
      }
      ctx.fillRect(x, y, cellSize, cellSize);

      // Border
      ctx.strokeStyle = "rgba(148, 163, 184, 0.3)";
      ctx.strokeRect(x, y, cellSize, cellSize);

      // Value
      ctx.fillStyle = "#e2e8f0";
      ctx.font = "bold " + Math.max(11, Math.min(14, cellSize / 3.5)) + "px Inter";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(val), x + cellSize / 2, y + cellSize / 2);
    }
  }

  // Labels
  ctx.fillStyle = "#94a3b8";
  ctx.font = "11px Inter";
  for (var i = 0; i < n; i++) {
    var label = classNames[i].length > 8 ? classNames[i].substring(0, 7) + "..." : classNames[i];
    // Top labels (predicted)
    ctx.textAlign = "center";
    ctx.fillText(label, margin + i * cellSize + cellSize / 2, margin - 8);
    // Left labels (actual)
    ctx.textAlign = "right";
    ctx.fillText(label, margin - 6, margin + i * cellSize + cellSize / 2);
  }

  // Axis titles
  ctx.fillStyle = "#64748b";
  ctx.font = "bold 11px Inter";
  ctx.textAlign = "center";
  ctx.fillText(t("ml.predicted"), margin + (n * cellSize) / 2, margin - 28);
  ctx.save();
  ctx.translate(12, margin + (n * cellSize) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(t("ml.actual"), 0, 0);
  ctx.restore();
}


// ---- ROC Curve (Chart.js) ----

function _drawROCCurve(canvasId, rocData, auc) {
  var canvas = document.getElementById(canvasId);
  if (!canvas) return;

  var chartData = {
    datasets: [
      {
        label: "ROC (AUC = " + (auc ? (auc * 100).toFixed(1) + "%" : "?") + ")",
        data: rocData.fpr.map(function (f, i) { return { x: f, y: rocData.tpr[i] }; }),
        borderColor: "#6366f1",
        backgroundColor: "rgba(99, 102, 241, 0.1)",
        fill: true,
        pointRadius: 0,
        borderWidth: 2,
        tension: 0.1,
      },
      {
        label: "Rastgele",
        data: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
        borderColor: "rgba(148, 163, 184, 0.4)",
        borderDash: [5, 5],
        pointRadius: 0,
        borderWidth: 1,
        fill: false,
      },
    ],
  };

  var chart = new Chart(canvas, {
    type: "scatter",
    data: chartData,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      showLine: true,
      scales: {
        x: { title: { display: true, text: "False Positive Rate", color: "#94a3b8" }, min: 0, max: 1, grid: { color: "rgba(148,163,184,0.1)" }, ticks: { color: "#94a3b8" } },
        y: { title: { display: true, text: "True Positive Rate", color: "#94a3b8" }, min: 0, max: 1, grid: { color: "rgba(148,163,184,0.1)" }, ticks: { color: "#94a3b8" } },
      },
      plugins: { legend: { labels: { color: "#e2e8f0" } } },
    },
  });
  _mlChartInstances.push(chart);
}


// ---- Feature Importance (Chart.js horizontal bar) ----

function _drawFeatureImportance(canvasId, importances, featureNames) {
  var canvas = document.getElementById(canvasId);
  if (!canvas) return;

  // Pair and sort
  var pairs = featureNames.map(function (name, i) {
    return { name: name, value: importances[i] || 0 };
  });
  pairs.sort(function (a, b) { return b.value - a.value; });
  pairs = pairs.slice(0, 10); // Top 10

  var colors = [
    "#6366f1", "#8b5cf6", "#a855f7", "#c084fc",
    "#d8b4fe", "#e9d5ff", "#f0abfc", "#f9a8d4",
    "#fda4af", "#fecdd3",
  ];

  var chart = new Chart(canvas, {
    type: "bar",
    data: {
      labels: pairs.map(function (p) { return p.name; }),
      datasets: [{
        label: t("ml.importance"),
        data: pairs.map(function (p) { return p.value; }),
        backgroundColor: pairs.map(function (_, i) { return colors[i] || "#6366f1"; }),
        borderRadius: 4,
      }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { color: "rgba(148,163,184,0.1)" }, ticks: { color: "#94a3b8" } },
        y: { grid: { display: false }, ticks: { color: "#e2e8f0", font: { size: 11 } } },
      },
      plugins: { legend: { display: false } },
    },
  });
  _mlChartInstances.push(chart);
}


// ---- Model Comparison (Chart.js grouped bar) ----

function _drawModelComparison(canvasId, models, problemType) {
  var canvas = document.getElementById(canvasId);
  if (!canvas) return;

  var primaryMetric = problemType === "classification" ? "accuracy" : "r2";
  var metricLabel = problemType === "classification" ? "Accuracy" : "R\u00b2";

  var labels = models.map(function (m) { return m.name || m.algorithm; });
  var values = models.map(function (m) { return (m.metrics && m.metrics[primaryMetric]) || 0; });

  var bgColors = models.map(function (m) {
    return m.is_best ? "rgba(245, 158, 11, 0.7)" : "rgba(99, 102, 241, 0.5)";
  });

  var chart = new Chart(canvas, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [{
        label: metricLabel,
        data: values,
        backgroundColor: bgColors,
        borderRadius: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { min: 0, max: 1, grid: { color: "rgba(148,163,184,0.1)" }, ticks: { color: "#94a3b8" } },
        x: { grid: { display: false }, ticks: { color: "#e2e8f0", font: { size: 10 }, maxRotation: 45 } },
      },
      plugins: { legend: { display: false } },
    },
  });
  _mlChartInstances.push(chart);
}


// =================== EXPORT AS NOTEBOOK ===================

function exportNotebook() {
  if (!currentMLTask || !trainResults) {
    _showMLToast(t("ml.trainFirstExport"), "error");
    return;
  }

  var task = currentMLTask;
  var results = trainResults;
  var problemType = results.problem_type || mlProblemType;
  var target = mlSelectedTarget;
  var features = mlSelectedFeatures;
  var algos = mlSelectedAlgos;
  var split = mlTrainSplit / 100;
  var cvFolds = mlCVFolds;
  var bestModel = results.models ? results.models.find(function(m) { return m.is_best; }) || results.models[0] : null;

  var algoImports = _nbAlgoImports(algos, problemType);
  var algoDict = _nbAlgoDict(algos, problemType);

  var cells = [];

  // Cell 1: Title
  cells.push(_nbMarkdown([
    "# " + (task.title || "ML Training") + " — Notebook",
    "",
    "**Auto-generated by AskDB ML Studio**",
    "",
    "| | |",
    "|---|---|",
    "| **Problem Type** | " + problemType + " |",
    "| **Target** | `" + target + "` |",
    "| **Features** | " + features.length + " columns |",
    "| **Algorithms** | " + algos.length + " |",
    "| **Train/Test Split** | " + Math.round(split * 100) + "/" + Math.round((1 - split) * 100) + " |",
    "| **CV Folds** | " + cvFolds + " |",
    bestModel ? "| **Best Model** | " + (bestModel.name || bestModel.algorithm) + " |" : ""
  ]));

  // Cell 2: Imports
  cells.push(_nbCode([
    "import pandas as pd",
    "import numpy as np",
    "import matplotlib.pyplot as plt",
    "import seaborn as sns",
    "from sklearn.model_selection import train_test_split, cross_val_score",
    "from sklearn.preprocessing import LabelEncoder, StandardScaler",
    "from sklearn.impute import SimpleImputer",
    "from sklearn.metrics import (",
    problemType === "classification"
      ? "    accuracy_score, precision_score, recall_score, f1_score,\n    roc_auc_score, confusion_matrix, classification_report, roc_curve"
      : "    r2_score, mean_absolute_error, mean_squared_error",
    ")",
    algoImports,
    "import warnings",
    "warnings.filterwarnings('ignore')",
    "",
    "print('Libraries loaded successfully!')"
  ]));

  // Cell 3-4: Load Data
  cells.push(_nbMarkdown(["## 1. Load Data"]));

  var dataLines = _nbBuildDataLines(task.data);
  cells.push(_nbCode([
    "# Data from ML Task: " + (task.title || ""),
    "from io import StringIO",
    "",
    "csv_data = \"\"\"" + dataLines + "\"\"\"",
    "",
    "df = pd.read_csv(StringIO(csv_data))",
    "print(f'Dataset: {df.shape[0]} rows, {df.shape[1]} columns')",
    "df.head(10)"
  ]));

  // Cell 5-7: EDA
  cells.push(_nbMarkdown(["## 2. Exploratory Data Analysis"]));

  cells.push(_nbCode([
    "print('=== Data Types ===')",
    "print(df.dtypes)",
    "print('\\n=== Missing Values ===')",
    "print(df.isnull().sum())",
    "print('\\n=== Describe ===')",
    "df.describe()"
  ]));

  cells.push(_nbCode([
    "# Target distribution",
    "target_col = '" + target + "'",
    "print(f'Target: {target_col}')",
    "print(df[target_col].value_counts())",
    "",
    "plt.figure(figsize=(8, 4))",
    problemType === "classification"
      ? "df[target_col].value_counts().plot(kind='bar', color='#6366f1', edgecolor='white')"
      : "df[target_col].hist(bins=20, color='#6366f1', edgecolor='white')",
    "plt.title(f'Distribution of {target_col}')",
    "plt.tight_layout()",
    "plt.show()"
  ]));

  // Cell 8-9: Preprocessing
  cells.push(_nbMarkdown(["## 3. Preprocessing"]));

  cells.push(_nbCode([
    "feature_cols = " + JSON.stringify(features),
    "target_col = '" + target + "'",
    "",
    "X = df[feature_cols].copy()",
    "y = df[target_col].copy()",
    "",
    "# Encode target if categorical",
    "target_encoder = None",
    "if y.dtype == 'object':",
    "    target_encoder = LabelEncoder()",
    "    y = pd.Series(target_encoder.fit_transform(y), name=target_col)",
    "    print(f'Target classes: {dict(zip(target_encoder.classes_, target_encoder.transform(target_encoder.classes_)))}')",
    "",
    "# Separate numeric and categorical",
    "numeric_cols = X.select_dtypes(include=[np.number]).columns.tolist()",
    "categorical_cols = X.select_dtypes(exclude=[np.number]).columns.tolist()",
    "print(f'Numeric: {numeric_cols}')",
    "print(f'Categorical: {categorical_cols}')",
    "",
    "# Impute",
    "if numeric_cols:",
    "    X[numeric_cols] = SimpleImputer(strategy='median').fit_transform(X[numeric_cols])",
    "if categorical_cols:",
    "    X[categorical_cols] = SimpleImputer(strategy='most_frequent').fit_transform(X[categorical_cols])",
    "",
    "# Encode categoricals",
    "label_encoders = {}",
    "for col in categorical_cols:",
    "    le = LabelEncoder()",
    "    X[col] = le.fit_transform(X[col].astype(str))",
    "    label_encoders[col] = le",
    "",
    "# Scale numerics",
    "scaler = StandardScaler()",
    "if numeric_cols:",
    "    X[numeric_cols] = scaler.fit_transform(X[numeric_cols])",
    "",
    "print(f'\\nPreprocessed shape: {X.shape}')",
    "X.head()"
  ]));

  // Cell 10-11: Split
  cells.push(_nbMarkdown(["## 4. Train / Test Split"]));

  cells.push(_nbCode([
    "X_train, X_test, y_train, y_test = train_test_split(",
    "    X, y, test_size=" + (1 - split).toFixed(2) + ", random_state=42)",
    "",
    "print(f'Train: {X_train.shape[0]} samples')",
    "print(f'Test:  {X_test.shape[0]} samples')"
  ]));

  // Cell 12-13: Training
  cells.push(_nbMarkdown(["## 5. Model Training & Comparison"]));

  var trainBlock = problemType === "classification"
    ? "    acc = accuracy_score(y_test, y_pred)\n    prec = precision_score(y_test, y_pred, average='weighted', zero_division=0)\n    rec = recall_score(y_test, y_pred, average='weighted', zero_division=0)\n    f1 = f1_score(y_test, y_pred, average='weighted', zero_division=0)\n    cv = cross_val_score(model, X, y, cv=" + cvFolds + ", scoring='accuracy')\n    results.append({'Model': name, 'Accuracy': acc, 'Precision': prec, 'Recall': rec, 'F1': f1, 'CV Mean': cv.mean(), 'CV Std': cv.std()})\n    print(f'  Accuracy: {acc:.4f} | F1: {f1:.4f} | CV: {cv.mean():.4f} +/- {cv.std():.4f}')"
    : "    r2 = r2_score(y_test, y_pred)\n    mae = mean_absolute_error(y_test, y_pred)\n    rmse = np.sqrt(mean_squared_error(y_test, y_pred))\n    cv = cross_val_score(model, X, y, cv=" + cvFolds + ", scoring='r2')\n    results.append({'Model': name, 'R2': r2, 'MAE': mae, 'RMSE': rmse, 'CV Mean': cv.mean(), 'CV Std': cv.std()})\n    print(f'  R2: {r2:.4f} | MAE: {mae:.4f} | CV: {cv.mean():.4f} +/- {cv.std():.4f}')";

  var sortLine = problemType === "classification"
    ? "leaderboard = leaderboard.sort_values('Accuracy', ascending=False).reset_index(drop=True)"
    : "leaderboard = leaderboard.sort_values('R2', ascending=False).reset_index(drop=True)";

  cells.push(_nbCode([
    "models = " + algoDict,
    "",
    "results = []",
    "trained_models = {}",
    "",
    "for name, model in models.items():",
    "    print(f'Training {name}...')",
    "    model.fit(X_train, y_train)",
    "    y_pred = model.predict(X_test)",
    "    trained_models[name] = model",
    "",
    trainBlock,
    "",
    "leaderboard = pd.DataFrame(results)",
    sortLine,
    "leaderboard.index += 1",
    "leaderboard.index.name = 'Rank'",
    "print('\\n=== LEADERBOARD ===')",
    "leaderboard"
  ]));

  // Cell 14-17: Visualizations
  cells.push(_nbMarkdown(["## 6. Visualizations"]));

  var pMetric = problemType === "classification" ? "Accuracy" : "R2";
  cells.push(_nbCode([
    "fig, ax = plt.subplots(figsize=(10, 5))",
    "colors = ['#f59e0b' if i == 0 else '#6366f1' for i in range(len(leaderboard))]",
    "ax.barh(leaderboard['Model'], leaderboard['" + pMetric + "'], color=colors, edgecolor='white')",
    "ax.set_xlabel('" + pMetric + "')",
    "ax.set_title('Model Comparison')",
    "ax.invert_yaxis()",
    "plt.tight_layout()",
    "plt.show()"
  ]));

  if (problemType === "classification") {
    cells.push(_nbCode([
      "best_name = leaderboard.iloc[0]['Model']",
      "best_model = trained_models[best_name]",
      "y_pred_best = best_model.predict(X_test)",
      "",
      "print(f'Best Model: {best_name}')",
      "print(classification_report(y_test, y_pred_best, zero_division=0))",
      "",
      "cm = confusion_matrix(y_test, y_pred_best)",
      "fig, ax = plt.subplots(figsize=(6, 5))",
      "sns.heatmap(cm, annot=True, fmt='d', cmap='Blues', ax=ax,",
      "            xticklabels=target_encoder.classes_ if target_encoder else 'auto',",
      "            yticklabels=target_encoder.classes_ if target_encoder else 'auto')",
      "ax.set_xlabel('Predicted'); ax.set_ylabel('Actual')",
      "ax.set_title(f'Confusion Matrix — {best_name}')",
      "plt.tight_layout(); plt.show()"
    ]));

    cells.push(_nbCode([
      "# ROC Curve (binary only)",
      "if len(np.unique(y_test)) == 2 and hasattr(trained_models[leaderboard.iloc[0]['Model']], 'predict_proba'):",
      "    bm = trained_models[leaderboard.iloc[0]['Model']]",
      "    y_proba = bm.predict_proba(X_test)[:, 1]",
      "    fpr, tpr, _ = roc_curve(y_test, y_proba)",
      "    auc = roc_auc_score(y_test, y_proba)",
      "    fig, ax = plt.subplots(figsize=(7, 6))",
      "    ax.plot(fpr, tpr, color='#6366f1', lw=2, label=f'ROC (AUC = {auc:.3f})')",
      "    ax.plot([0, 1], [0, 1], 'k--', lw=1, alpha=0.5)",
      "    ax.set_xlabel('FPR'); ax.set_ylabel('TPR')",
      "    ax.set_title('ROC Curve'); ax.legend()",
      "    plt.tight_layout(); plt.show()",
      "else:",
      "    print('ROC curve requires binary classification with predict_proba support')"
    ]));
  } else {
    cells.push(_nbCode([
      "best_name = leaderboard.iloc[0]['Model']",
      "y_pred_best = trained_models[best_name].predict(X_test)",
      "fig, ax = plt.subplots(figsize=(7, 6))",
      "ax.scatter(y_test, y_pred_best, alpha=0.6, color='#6366f1')",
      "ax.plot([y_test.min(), y_test.max()], [y_test.min(), y_test.max()], 'r--', lw=2)",
      "ax.set_xlabel('Actual'); ax.set_ylabel('Predicted')",
      "ax.set_title(f'Actual vs Predicted — {best_name}')",
      "plt.tight_layout(); plt.show()"
    ]));
  }

  // Feature importance
  cells.push(_nbCode([
    "best_name = leaderboard.iloc[0]['Model']",
    "best_model = trained_models[best_name]",
    "",
    "if hasattr(best_model, 'feature_importances_'):",
    "    fi = pd.DataFrame({'Feature': feature_cols, 'Importance': best_model.feature_importances_}).sort_values('Importance', ascending=True)",
    "    fig, ax = plt.subplots(figsize=(8, max(4, len(feature_cols)*0.4)))",
    "    ax.barh(fi['Feature'], fi['Importance'], color=plt.cm.viridis(np.linspace(0.3, 0.9, len(fi))), edgecolor='white')",
    "    ax.set_title(f'Feature Importance — {best_name}')",
    "    plt.tight_layout(); plt.show()",
    "elif hasattr(best_model, 'coef_'):",
    "    coefs = np.abs(best_model.coef_.flatten()) if best_model.coef_.ndim > 1 else np.abs(best_model.coef_)",
    "    fi = pd.DataFrame({'Feature': feature_cols, '|Coef|': coefs}).sort_values('|Coef|', ascending=True)",
    "    fig, ax = plt.subplots(figsize=(8, max(4, len(feature_cols)*0.4)))",
    "    ax.barh(fi['Feature'], fi['|Coef|'], color='#6366f1', edgecolor='white')",
    "    ax.set_title(f'Feature Coefficients — {best_name}')",
    "    plt.tight_layout(); plt.show()",
    "else:",
    "    print(f'{best_name} does not provide feature importances')"
  ]));

  // Next steps
  cells.push(_nbMarkdown([
    "## 7. Next Steps",
    "",
    "Customize this notebook:",
    "- **Hyperparameter tuning**: `GridSearchCV`, `RandomizedSearchCV`",
    "- **Feature engineering**: polynomial features, interactions",
    "- **More algorithms**: XGBoost, LightGBM, CatBoost",
    "- **Ensemble**: Voting, Stacking, Blending",
    "- **Save model**: `import joblib; joblib.dump(best_model, 'model.pkl')`"
  ]));

  // Build .ipynb
  var notebook = {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {
      kernelspec: { display_name: "Python 3", language: "python", name: "python3" },
      language_info: { name: "python", version: "3.10.0", mimetype: "text/x-python", file_extension: ".py" }
    },
    cells: cells
  };

  // Download file
  var blob = new Blob([JSON.stringify(notebook, null, 2)], { type: "application/json" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = (task.title || "ml_notebook").replace(/[^a-zA-Z0-9_-]/g, "_") + ".ipynb";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  _showMLToast(t("ml.notebookDownloaded"));
}


// =================== NOTEBOOK HELPERS ===================

function _nbMarkdown(lines) {
  return { cell_type: "markdown", metadata: {}, source: lines.filter(function(l) { return l !== ""; }).join("\n") };
}

function _nbCode(lines) {
  return { cell_type: "code", execution_count: null, metadata: {}, outputs: [], source: lines.join("\n") };
}

function _nbBuildDataLines(data) {
  if (!data || data.length === 0) return "";
  var lines = [];
  data.forEach(function(row) {
    var cells = row.map(function(cell) {
      if (cell === null || cell === undefined) return "";
      var s = String(cell);
      if (s.indexOf(",") >= 0 || s.indexOf('"') >= 0 || s.indexOf("\n") >= 0) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    });
    lines.push(cells.join(","));
  });
  return lines.join("\\n");
}

function _nbAlgoImports(algos, problemType) {
  var imports = [], added = {};
  algos.forEach(function(key) {
    var imp = "";
    if (problemType === "classification") {
      switch(key) {
        case "logistic_regression": imp = "from sklearn.linear_model import LogisticRegression"; break;
        case "random_forest": imp = "from sklearn.ensemble import RandomForestClassifier"; break;
        case "gradient_boosting": imp = "from sklearn.ensemble import GradientBoostingClassifier"; break;
        case "svm": imp = "from sklearn.svm import SVC"; break;
        case "knn": imp = "from sklearn.neighbors import KNeighborsClassifier"; break;
        case "decision_tree": imp = "from sklearn.tree import DecisionTreeClassifier"; break;
      }
    } else {
      switch(key) {
        case "linear_regression": imp = "from sklearn.linear_model import LinearRegression"; break;
        case "ridge": imp = "from sklearn.linear_model import Ridge"; break;
        case "lasso": imp = "from sklearn.linear_model import Lasso"; break;
        case "random_forest_regressor": imp = "from sklearn.ensemble import RandomForestRegressor"; break;
        case "gradient_boosting_regressor": imp = "from sklearn.ensemble import GradientBoostingRegressor"; break;
        case "svr": imp = "from sklearn.svm import SVR"; break;
      }
    }
    if (imp && !added[imp]) { imports.push(imp); added[imp] = true; }
  });
  return imports.join("\n");
}

function _nbAlgoDict(algos, problemType) {
  var entries = [];
  algos.forEach(function(key) {
    if (problemType === "classification") {
      switch(key) {
        case "logistic_regression": entries.push("    'Logistic Regression': LogisticRegression(max_iter=1000, random_state=42)"); break;
        case "random_forest": entries.push("    'Random Forest': RandomForestClassifier(n_estimators=100, random_state=42)"); break;
        case "gradient_boosting": entries.push("    'Gradient Boosting': GradientBoostingClassifier(n_estimators=100, random_state=42)"); break;
        case "svm": entries.push("    'SVM': SVC(probability=True, random_state=42)"); break;
        case "knn": entries.push("    'KNN': KNeighborsClassifier(n_neighbors=5)"); break;
        case "decision_tree": entries.push("    'Decision Tree': DecisionTreeClassifier(random_state=42)"); break;
      }
    } else {
      switch(key) {
        case "linear_regression": entries.push("    'Linear Regression': LinearRegression()"); break;
        case "ridge": entries.push("    'Ridge': Ridge(random_state=42)"); break;
        case "lasso": entries.push("    'Lasso': Lasso(random_state=42)"); break;
        case "random_forest_regressor": entries.push("    'Random Forest': RandomForestRegressor(n_estimators=100, random_state=42)"); break;
        case "gradient_boosting_regressor": entries.push("    'Gradient Boosting': GradientBoostingRegressor(n_estimators=100, random_state=42)"); break;
        case "svr": entries.push("    'SVR': SVR()"); break;
      }
    }
  });
  return "{\n" + entries.join(",\n") + "\n}";
}
