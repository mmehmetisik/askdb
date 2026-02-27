/* ============================================================
   eda-render.js  —  EDA tab rendering (6 tab)
   Kolay anlasilir grafikler, teknik detay yok.
   Tikla-goster etkilesimi: satir highlight.
   ============================================================ */

// ── Tab 1: Ozet ──
function renderEdaOverview() {
  var panel = document.getElementById("edaOverview");
  if (!panel || !edaResults) return;

  var r = edaResults;
  var healthScore = r.qualityScore || _calcHealthScore(r);
  var healthColor = healthScore >= 80 ? "var(--accent-green)" : healthScore >= 50 ? "var(--accent-warning)" : "#ef4444";

  var html = '<div class="eda-overview-grid">';

  // Summary cards
  html += _summaryCard("fa-table", "Satirlar", fmtNum(r.rowCount), "");
  html += _summaryCard("fa-columns", "Sutunlar", r.colCount, "");
  html += _summaryCard("fa-question-circle", "Eksik Deger", fmtNum(r.totalNulls), r.totalNulls > 0 ? "warn" : "ok");
  html += _summaryCard("fa-exclamation-triangle", "Aykiri Deger", fmtNum(r.totalOutliers), r.totalOutliers > 0 ? "warn" : "ok");
  html += _summaryCard("fa-clone", "Duplikasyon", fmtNum(r.duplicates.count), r.duplicates.count > 0 ? "warn" : "ok");
  html += '<div class="eda-card eda-health-card"><div class="eda-health-score" style="color:' + healthColor + '">' + healthScore + '</div><div class="eda-health-label">Veri Kalitesi</div></div>';

  html += '</div>';

  // Column type breakdown
  var typeCount = { numeric: 0, text: 0, date: 0, boolean: 0 };
  r.columns.forEach(function (c) { typeCount[c.colType] = (typeCount[c.colType] || 0) + 1; });

  html += '<div class="eda-section">';
  html += '<h4><i class="fas fa-tags"></i> Kolon Tipleri</h4>';
  html += '<div class="eda-type-bars">';
  var typeLabels = { numeric: "Sayisal", text: "Metin", date: "Tarih", boolean: "Boolean" };
  var typeColors = { numeric: "#3b82f6", text: "#22c55e", date: "#f59e0b", boolean: "#a855f7" };
  Object.keys(typeCount).forEach(function (t) {
    if (typeCount[t] === 0) return;
    var pct = (typeCount[t] / r.colCount * 100).toFixed(0);
    html += '<div class="eda-type-bar">';
    html += '<span class="eda-type-label">' + typeLabels[t] + '</span>';
    html += '<div class="eda-bar-track"><div class="eda-bar-fill" style="width:' + pct + '%;background:' + typeColors[t] + '"></div></div>';
    html += '<span class="eda-type-count">' + typeCount[t] + ' (' + pct + '%)</span>';
    html += '</div>';
  });
  html += '</div></div>';

  // Quick insights
  html += '<div class="eda-section">';
  html += '<h4><i class="fas fa-lightbulb"></i> Onemli Bulgular</h4>';
  html += '<div class="eda-insights-list">';

  var insights = _generateInsights(r);
  insights.forEach(function (insight) {
    html += '<div class="eda-insight eda-insight-' + insight.type + '">';
    html += '<i class="fas ' + insight.icon + '"></i> ' + insight.text;
    html += '</div>';
  });
  if (insights.length === 0) {
    html += '<div class="eda-insight eda-insight-success"><i class="fas fa-check-circle"></i> Veri genel olarak temiz gorunuyor.</div>';
  }

  html += '</div></div>';
  panel.innerHTML = html;
}

// ── Tab 2: Eksik Deger ──
function renderEdaMissing() {
  var panel = document.getElementById("edaMissing");
  if (!panel || !edaResults) return;

  var cols = edaResults.columns.filter(function (c) { return c.nullCount > 0; });
  cols.sort(function (a, b) { return b.nullCount - a.nullCount; });

  if (cols.length === 0) {
    panel.innerHTML = '<div class="eda-empty-tab"><i class="fas fa-check-circle text-green"></i><h4>Eksik deger bulunamadi!</h4><p>Tum kolonlar tamamen dolu.</p></div>';
    return;
  }

  var html = '<div class="eda-section">';
  html += '<div class="eda-missing-summary">Toplam <strong>' + fmtNum(edaResults.totalNulls) + '</strong> eksik deger, <strong>' + cols.length + '</strong> kolonda.</div>';

  cols.forEach(function (col) {
    var pct = col.completeness;
    var barColor = pct >= 95 ? "var(--accent-green)" : pct >= 80 ? "var(--accent-warning)" : "#ef4444";

    html += '<div class="eda-missing-row">';
    html += '<div class="eda-missing-info">';
    html += '<span class="eda-col-name">' + escapeHtml(col.name) + '</span>';
    html += '<span class="eda-missing-count">' + fmtNum(col.nullCount) + ' eksik (%' + (100 - pct).toFixed(1) + ')</span>';
    html += '</div>';
    html += '<div class="eda-bar-track"><div class="eda-bar-fill" style="width:' + pct + '%;background:' + barColor + '"></div></div>';
    html += '<button class="btn-show-rows" onclick="showMissingRows(' + col.index + ')"><i class="fas fa-eye"></i> Tabloda Goster</button>';
    html += '</div>';
  });

  html += '</div>';
  panel.innerHTML = html;
}

function showMissingRows(colIndex) {
  if (!edaResults) return;
  var col = edaResults.columns[colIndex];
  if (!col) return;
  // Backend sayfalama modunda: kolon basligi isaretle
  _highlightColumnHeader(col.name, "highlight-null");
}

// ── Tab 3: Aykiri Deger ──
function renderEdaOutlier() {
  var panel = document.getElementById("edaOutlier");
  if (!panel || !edaResults) return;

  var cols = edaResults.columns.filter(function (c) { return c.colType === "numeric" && c.outlierCount > 0; });
  cols.sort(function (a, b) { return b.outlierCount - a.outlierCount; });

  if (cols.length === 0) {
    var numCols = edaResults.columns.filter(function (c) { return c.colType === "numeric"; });
    if (numCols.length === 0) {
      panel.innerHTML = '<div class="eda-empty-tab"><i class="fas fa-info-circle text-blue"></i><h4>Sayisal kolon yok</h4><p>Aykiri deger analizi sadece sayisal kolonlar icin yapilir.</p></div>';
    } else {
      panel.innerHTML = '<div class="eda-empty-tab"><i class="fas fa-check-circle text-green"></i><h4>Aykiri deger bulunamadi!</h4><p>' + numCols.length + ' sayisal kolon incelendi, hepsi normal aralikta.</p></div>';
    }
    return;
  }

  var html = '<div class="eda-section">';
  html += '<div class="eda-missing-summary">Toplam <strong>' + fmtNum(edaResults.totalOutliers) + '</strong> aykiri deger, <strong>' + cols.length + '</strong> kolonda.</div>';

  cols.forEach(function (col) {
    var pct = col.total > 0 ? (col.outlierCount / col.total * 100).toFixed(1) : 0;

    html += '<div class="eda-outlier-card">';
    html += '<div class="eda-outlier-header">';
    html += '<span class="eda-col-name">' + escapeHtml(col.name) + '</span>';
    html += '<span class="eda-outlier-count">' + fmtNum(col.outlierCount) + ' aykiri (%' + pct + ')</span>';
    html += '<button class="btn-show-rows" onclick="showOutlierRows(' + col.index + ')"><i class="fas fa-eye"></i> Tabloda Goster</button>';
    html += '</div>';

    // Simple range bar
    if (col.stats && col.outlierBounds) {
      html += '<div class="eda-range-visual">';
      html += '<div class="eda-range-info">';
      html += '<span>Normal aralik: ' + fmtNum(col.outlierBounds.lower) + ' — ' + fmtNum(col.outlierBounds.upper) + '</span>';
      html += '<span>Gercek aralik: ' + fmtNum(col.stats.min) + ' — ' + fmtNum(col.stats.max) + '</span>';
      html += '</div>';

      // Mini distribution with outlier zones
      if (col.distribution && col.distribution.length > 0) {
        var maxCount = Math.max.apply(null, col.distribution.map(function (d) { return d.count; }));
        html += '<div class="eda-mini-dist">';
        col.distribution.forEach(function (bucket) {
          var h = maxCount > 0 ? (bucket.count / maxCount * 100) : 0;
          var isOutlier = bucket.min < col.outlierBounds.lower || bucket.max > col.outlierBounds.upper;
          var barCls = isOutlier ? "eda-dist-bar outlier" : "eda-dist-bar";
          html += '<div class="' + barCls + '" style="height:' + Math.max(4, h) + '%" title="' + bucket.label + ': ' + bucket.count + '"></div>';
        });
        html += '</div>';
      }
      html += '</div>';
    }
    html += '</div>';
  });

  html += '</div>';
  panel.innerHTML = html;
}

function showOutlierRows(colIndex) {
  if (!edaResults) return;
  var col = edaResults.columns[colIndex];
  if (!col) return;
  _highlightColumnHeader(col.name, "highlight-outlier");
}

// ── Tab 4: Dagilim ──
function renderEdaDistribution() {
  var panel = document.getElementById("edaDistribution");
  if (!panel || !edaResults) return;

  var html = '<div class="eda-dist-grid">';

  edaResults.columns.forEach(function (col) {
    if (col.distribution.length === 0) return;

    html += '<div class="eda-dist-card">';
    html += '<div class="eda-dist-card-header">';
    html += '<span class="eda-col-name">' + escapeHtml(col.name) + '</span>';
    var typeBadge = { numeric: "Sayisal", text: "Metin", date: "Tarih", boolean: "Boolean" };
    html += '<span class="eda-type-badge eda-type-' + col.colType + '">' + (typeBadge[col.colType] || col.colType) + '</span>';
    html += '</div>';

    // Chart — canvas
    var canvasId = "distChart_" + col.index;
    html += '<div class="eda-chart-container"><canvas id="' + canvasId + '"></canvas></div>';

    // Key stats
    if (col.colType === "numeric" && col.stats.mean !== undefined) {
      html += '<div class="eda-dist-stats">';
      html += '<span>Ort: ' + fmtNum(col.stats.mean) + '</span>';
      html += '<span>Med: ' + fmtNum(col.stats.median) + '</span>';
      html += '<span>Min: ' + fmtNum(col.stats.min) + '</span>';
      html += '<span>Max: ' + fmtNum(col.stats.max) + '</span>';
      html += '</div>';
    } else if (col.colType === "date" && col.stats.range_days !== undefined) {
      html += '<div class="eda-dist-stats">';
      html += '<span>' + col.stats.min + ' — ' + col.stats.max + '</span>';
      html += '<span>' + col.stats.range_days + ' gun</span>';
      html += '</div>';
    }

    html += '</div>';
  });

  html += '</div>';
  panel.innerHTML = html;

  // Render charts after DOM update
  setTimeout(function () { _renderDistributionCharts(); }, 50);
}

var _distChartInstances = []; // Track chart instances for cleanup

function _renderDistributionCharts() {
  if (!edaResults) return;

  // Destroy previous chart instances
  _distChartInstances.forEach(function (c) { try { c.destroy(); } catch (e) {} });
  _distChartInstances = [];

  edaResults.columns.forEach(function (col) {
    if (col.distribution.length === 0) return;

    var canvasId = "distChart_" + col.index;
    var ctx = document.getElementById(canvasId);
    if (!ctx) return;

    var labels = col.distribution.map(function (d) {
      var l = d.label;
      return l.length > 15 ? l.substring(0, 12) + "..." : l;
    });
    var values = col.distribution.map(function (d) { return d.count; });

    var isLight = document.documentElement.classList.contains("light");
    var gridColor = isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.04)";
    var tickColor = isLight ? "#64748b" : "#8892a8";

    var chartType, bgColor, borderColor;
    if (col.colType === "date") {
      chartType = "line";
      bgColor = "rgba(245,158,11,0.2)";
      borderColor = "rgba(245,158,11,0.8)";
    } else if (col.colType === "text" || col.colType === "boolean") {
      if (col.distribution.length <= 6) {
        chartType = "doughnut";
        bgColor = ["rgba(79,143,247,0.7)", "rgba(34,197,94,0.7)", "rgba(245,158,11,0.7)", "rgba(168,85,247,0.7)", "rgba(239,68,68,0.7)", "rgba(20,184,166,0.7)"];
        borderColor = bgColor.map(function (c) { return c.replace("0.7", "1"); });
      } else {
        chartType = "bar";
        bgColor = "rgba(34,197,94,0.5)";
        borderColor = "rgba(34,197,94,0.9)";
      }
    } else {
      chartType = "bar";
      bgColor = "rgba(79,143,247,0.5)";
      borderColor = "rgba(79,143,247,0.9)";
    }

    var isPie = chartType === "doughnut";
    var options = {
      responsive: true, maintainAspectRatio: true,
      plugins: {
        legend: { display: isPie, position: "right", labels: { color: tickColor, font: { size: 10 } } },
      },
    };
    if (!isPie) {
      options.scales = {
        y: { beginAtZero: true, ticks: { color: tickColor, font: { size: 9 } }, grid: { color: gridColor } },
        x: { ticks: { color: tickColor, font: { size: 9 }, maxRotation: 45 }, grid: { display: false } },
      };
    }

    var chartInstance = new Chart(ctx, {
      type: chartType,
      data: {
        labels: labels,
        datasets: [{
          label: col.name,
          data: values,
          backgroundColor: bgColor,
          borderColor: borderColor,
          borderWidth: isPie ? 2 : 1,
          borderRadius: chartType === "bar" ? 3 : 0,
          tension: chartType === "line" ? 0.3 : 0,
          fill: chartType === "line",
          pointRadius: chartType === "line" ? 3 : 0,
        }],
      },
      options: options,
    });
    _distChartInstances.push(chartInstance);
  });
}

// ── Tab 5: Korelasyon ──
function renderEdaCorrelation() {
  var panel = document.getElementById("edaCorrelation");
  if (!panel || !edaResults) return;

  var corrs = edaResults.correlations;
  if (!corrs || corrs.length === 0) {
    var numCount = edaResults.columns.filter(function (c) { return c.colType === "numeric"; }).length;
    if (numCount < 2) {
      panel.innerHTML = '<div class="eda-empty-tab"><i class="fas fa-info-circle text-blue"></i><h4>Yeterli sayisal kolon yok</h4><p>Korelasyon analizi icin en az 2 sayisal kolon gerekli.</p></div>';
    } else {
      panel.innerHTML = '<div class="eda-empty-tab"><i class="fas fa-check-circle text-green"></i><h4>Korelasyon hesaplandi</h4><p>Anlamli korelasyon bulunamadi.</p></div>';
    }
    return;
  }

  var html = '<div class="eda-section">';
  html += '<div class="eda-corr-list">';

  corrs.forEach(function (c) {
    var absVal = Math.abs(c.value);
    var color = absVal >= 0.7 ? "#ef4444" : absVal >= 0.4 ? "#f59e0b" : "#22c55e";
    var dirText = c.direction === "pozitif" ? "Biri artinca digeri de artar" : "Biri artinca digeri azalir";

    html += '<div class="eda-corr-item">';
    html += '<div class="eda-corr-header">';
    html += '<span class="eda-corr-cols">' + escapeHtml(c.col1) + ' ↔ ' + escapeHtml(c.col2) + '</span>';
    html += '<span class="eda-corr-value" style="color:' + color + '">' + c.value.toFixed(2) + '</span>';
    html += '</div>';
    html += '<div class="eda-bar-track"><div class="eda-bar-fill" style="width:' + (absVal * 100) + '%;background:' + color + '"></div></div>';
    html += '<div class="eda-corr-explain">';
    html += '<span class="eda-corr-strength">' + c.strength.toUpperCase() + ' ' + c.direction + ' iliski</span>';
    html += '<span class="eda-corr-desc">' + dirText + '</span>';
    html += '</div>';
    html += '</div>';
  });

  html += '</div></div>';
  panel.innerHTML = html;
}

// ── Tab 6: Duplikasyon ──
function renderEdaDuplicates() {
  var panel = document.getElementById("edaDuplicates");
  if (!panel || !edaResults) return;

  var dups = edaResults.duplicates;
  if (dups.count === 0) {
    panel.innerHTML = '<div class="eda-empty-tab"><i class="fas fa-check-circle text-green"></i><h4>Duplike satir bulunamadi!</h4><p>' + fmtNum(edaResults.rowCount) + ' satirdan hicbiri tekrar etmiyor.</p></div>';
    return;
  }

  var pct = edaResults.rowCount > 0 ? (dups.count / edaResults.rowCount * 100).toFixed(1) : 0;

  var html = '<div class="eda-section">';
  html += '<div class="eda-dup-summary">';
  html += '<div class="eda-dup-stat"><span class="eda-dup-number">' + fmtNum(dups.count) + '</span><span>Duplike Satir</span></div>';
  html += '<div class="eda-dup-stat"><span class="eda-dup-number">%' + pct + '</span><span>Oran</span></div>';
  html += '</div>';
  html += '<button class="btn-show-rows btn-lg" onclick="showDuplicateRows()"><i class="fas fa-eye"></i> Tabloda Goster (' + dups.count + ' satir)</button>';
  html += '</div>';

  panel.innerHTML = html;
}

function showDuplicateRows() {
  if (!edaResults) return;
  // Sayfalama modunda satir indeksleri yok — bilgi mesaji goster
  if (typeof _showToast === "function") {
    _showToast(edaResults.duplicates.count + " duplike satir var. Temizleme icin Temizleme tab'ini kullanin.");
  }
}

// ── Helpers ──
function _summaryCard(icon, label, value, status) {
  var cls = status === "warn" ? " eda-card-warn" : status === "ok" ? " eda-card-ok" : "";
  return '<div class="eda-card' + cls + '"><i class="fas ' + icon + '"></i><div class="eda-card-value">' + value + '</div><div class="eda-card-label">' + label + '</div></div>';
}

function _calcHealthScore(r) {
  if (r.rowCount === 0) return 0;
  var totalCells = r.rowCount * r.colCount;
  var nullPenalty = totalCells > 0 ? (r.totalNulls / totalCells) * 40 : 0;
  var outlierPenalty = totalCells > 0 ? (r.totalOutliers / totalCells) * 30 : 0;
  var dupPenalty = r.rowCount > 0 ? (r.duplicates.count / r.rowCount) * 30 : 0;
  return Math.max(0, Math.round(100 - nullPenalty - outlierPenalty - dupPenalty));
}

function _generateInsights(r) {
  var insights = [];

  // Eksik deger uyarilari
  r.columns.forEach(function (c) {
    if (c.completeness < 80) {
      insights.push({ type: "danger", icon: "fa-exclamation-circle", text: '"' + c.name + '" kolonunda %' + (100 - c.completeness).toFixed(0) + " eksik deger var." });
    } else if (c.completeness < 95 && c.nullCount > 0) {
      insights.push({ type: "warning", icon: "fa-exclamation-triangle", text: '"' + c.name + '" kolonunda ' + c.nullCount + " eksik deger var." });
    }
  });

  // Aykiri deger
  r.columns.forEach(function (c) {
    if (c.outlierCount > 0) {
      var pct = (c.outlierCount / c.total * 100).toFixed(1);
      insights.push({ type: "warning", icon: "fa-chart-line", text: '"' + c.name + '" kolonunda ' + c.outlierCount + " aykiri deger var (%" + pct + ")." });
    }
  });

  // Duplikasyon
  if (r.duplicates.count > 0) {
    insights.push({ type: "warning", icon: "fa-clone", text: r.duplicates.count + " duplike satir tespit edildi." });
  }

  // Guclu korelasyon
  r.correlations.forEach(function (c) {
    if (Math.abs(c.value) >= 0.7) {
      insights.push({ type: "info", icon: "fa-project-diagram", text: '"' + c.col1 + '" ve "' + c.col2 + '" arasinda guclu ' + c.direction + " iliski var (" + c.value.toFixed(2) + ")." });
    }
  });

  // Potansiyel PK
  r.columns.forEach(function (c) {
    if (c.uniqueness === 100 && c.nullCount === 0 && c.total > 5) {
      insights.push({ type: "info", icon: "fa-key", text: '"' + c.name + '" tum degerler benzersiz — potansiyel ID/anahtar kolon.' });
    }
  });

  return insights;
}

/**
 * Buyuk veri modunda satir indeksleri yok.
 * Bunun yerine ilgili kolon basligini kisa sureligine vurgular.
 */
function _highlightColumnHeader(colName, cls) {
  var ths = document.querySelectorAll(".analysis-data-table th");
  ths.forEach(function (th) {
    var col = th.getAttribute("data-col");
    if (col === colName) {
      th.classList.add(cls);
      setTimeout(function () { th.classList.remove(cls); }, 3000);
    }
  });
  // Null iceren hucreleri mevcut sayfada isaretle
  if (cls === "highlight-null") {
    var table = document.querySelector(".analysis-data-table");
    if (!table) return;
    var headerCells = table.querySelectorAll("thead th");
    var colIdx = -1;
    headerCells.forEach(function (th, i) {
      if (th.getAttribute("data-col") === colName) colIdx = i;
    });
    if (colIdx >= 0) {
      var rows = table.querySelectorAll("tbody tr");
      rows.forEach(function (row) {
        var cells = row.querySelectorAll("td");
        if (cells[colIdx] && cells[colIdx].classList.contains("cell-null")) {
          row.classList.add("highlight-null");
          setTimeout(function () { row.classList.remove("highlight-null"); }, 3000);
        }
      });
    }
  }
}
