/* ============================================================
   dq-render.js  —  DQ panel rendering, box plot, filter toggles
   ============================================================ */

function renderDataQuality(data) {
  var section = document.getElementById("dqSection");
  var grid = document.getElementById("dqGrid");
  var overall = document.getElementById("dqOverall");
  var summary = document.getElementById("dqSummary");
  var insights = document.getElementById("dqInsights");
  var dqActions = document.getElementById("dqActions");

  if (!section || !grid || !data || data.length < 2 || data[0][0] === "Hata" || data[0][0] === "Sonuc Yok") {
    if (section) section.style.display = "none";
    return;
  }

  var headers = data[0];
  var rows = data.slice(1);
  var totalRows = rows.length;
  var colCount = headers.length;

  // Analyze every column — backend column_types varsa kullan
  dqColumnAnalysis = [];
  var analyses = headers.map(function (header, colIndex) {
    var values = rows.map(function (r) { return r[colIndex]; });
    var serverType = (lastColumnTypes && lastColumnTypes.length > colIndex) ? lastColumnTypes[colIndex] : null;
    var analysis = analyzeColumn(values, totalRows, serverType);
    dqColumnAnalysis.push(analysis);
    return analysis;
  });

  // Duplicate rows
  var rowStrings = rows.map(function (r) { return JSON.stringify(r); });
  var uniqueRows = new Set(rowStrings);
  var duplicateRows = totalRows - uniqueRows.size;

  // Overall
  var avgScore = analyses.length > 0
    ? Math.round(analyses.reduce(function (a, b) { return a + b.score; }, 0) / analyses.length) : 0;
  var totalNulls = analyses.reduce(function (a, b) { return a + b.nullCount; }, 0);
  var totalOutliers = analyses.reduce(function (a, b) { return a + b.outlierCount; }, 0);

  // ── Summary Bar ──
  if (summary) {
    summary.innerHTML =
      '<div class="dq-summary-item"><i class="fas fa-columns"></i><span><strong>' + colCount + "</strong> Sutun</span></div>" +
      '<div class="dq-summary-item"><i class="fas fa-list"></i><span><strong>' + totalRows.toLocaleString("tr-TR") + "</strong> Satir</span></div>" +
      '<div class="dq-summary-item ' + (totalNulls > 0 ? "dq-warn" : "") + '"><i class="fas fa-ban"></i><span><strong>' + totalNulls + "</strong> NULL</span></div>" +
      '<div class="dq-summary-item ' + (totalOutliers > 0 ? "dq-warn" : "") + '"><i class="fas fa-exclamation-triangle"></i><span><strong>' + totalOutliers + "</strong> Outlier</span></div>" +
      '<div class="dq-summary-item ' + (duplicateRows > 0 ? "dq-warn" : "") + '"><i class="fas fa-clone"></i><span><strong>' + duplicateRows + "</strong> Duplicate</span></div>";
  }

  // ── Action Buttons ──
  if (dqActions) {
    var btns = "";
    if (totalNulls > 0) {
      btns += '<button class="dq-filter-btn dq-null-btn ' + (nullFilterActive ? "active" : "") + '" onclick="toggleNullFilter()" title="NULL iceren satirlari filtrele"><i class="fas fa-ban"></i> NULL Filtre <span class="dq-filter-count">' + totalNulls + "</span></button>";
    }
    if (totalOutliers > 0) {
      btns += '<button class="dq-filter-btn dq-outlier-btn ' + (outlierFilterActive ? "active" : "") + '" onclick="toggleOutlierFilter()" title="Outlier satirlarini filtrele"><i class="fas fa-chart-line"></i> Outlier Filtre <span class="dq-filter-count">' + totalOutliers + "</span></button>";
    }
    btns += '<button class="dq-filter-btn dq-export-btn" onclick="exportDqReport()" title="DQ Raporu Indir"><i class="fas fa-file-export"></i> Rapor</button>';
    dqActions.innerHTML = btns;
  }

  // ── Column Cards ──
  var cards = [];
  analyses.forEach(function (a, i) {
    var header = headers[i];
    var barClass = a.score >= 80 ? "dq-bar-green" : a.score >= 50 ? "dq-bar-yellow" : "dq-bar-red";
    var scoreColor = a.score >= 80 ? "#22c55e" : a.score >= 50 ? "#f59e0b" : "#ef4444";
    var typeBadgeClass = a.subType === "email" ? "dq-type-email"
      : a.subType === "boolean" ? "dq-type-boolean"
        : a.colType === "numeric" ? "dq-type-numeric"
          : a.colType === "date" ? "dq-type-date" : "dq-type-text";
    var typeLabel = a.subType ? a.colType + " \u00b7 " + a.subType : a.colType;

    // Histogram
    var histHtml = "";
    if (a.histogram.length > 0) {
      if (a.colType === "numeric") {
        histHtml = '<div class="dq-histogram">' +
          a.histogram.map(function (h) { return '<div class="dq-hist-bar" style="height:' + Math.max(h.pct, 4) + '%" title="' + h.count + ' deger"></div>'; }).join("") +
          "</div>";
      } else {
        histHtml = '<div class="dq-freq-bars">' +
          a.histogram.map(function (h) {
            return '<div class="dq-freq-row"><span class="dq-freq-label">' + escapeHtml(h.label) + '</span>' +
              '<div class="dq-freq-track"><div class="dq-freq-fill" style="width:' + h.pct + '%"></div></div>' +
              '<span class="dq-freq-count">' + h.count + "</span></div>";
          }).join("") +
          "</div>";
      }
    }

    // ── Box Plot (numeric only) ──
    var boxPlotHtml = "";
    if (a.numStats && a.colType === "numeric" && a.numStats.range > 0) {
      var ns = a.numStats;
      var range = ns.max - ns.min;
      var toPos = function (val) { return ((val - ns.min) / range * 100).toFixed(1); };
      var whiskerLow = Math.max(ns.min, ns.q1 - 1.5 * ns.iqr);
      var whiskerHigh = Math.min(ns.max, ns.q3 + 1.5 * ns.iqr);

      boxPlotHtml =
        '<div class="dq-detail-group">' +
          '<div class="dq-detail-title"><i class="fas fa-chart-bar"></i> Box Plot</div>' +
          '<div class="dq-boxplot">' +
            '<div class="dq-boxplot-labels">' +
              "<span>" + fmtNum(ns.min) + "</span>" +
              '<span style="color:var(--accent-orange)">' + fmtNum(ns.median) + "</span>" +
              "<span>" + fmtNum(ns.max) + "</span>" +
            "</div>" +
            '<div class="dq-boxplot-track">' +
              '<div class="dq-boxplot-whisker" style="left:' + toPos(whiskerLow) + "%;right:" + (100 - parseFloat(toPos(whiskerHigh))) + '%"></div>' +
              '<div class="dq-boxplot-box" style="left:' + toPos(ns.q1) + "%;width:" + (parseFloat(toPos(ns.q3)) - parseFloat(toPos(ns.q1))) + '%"></div>' +
              '<div class="dq-boxplot-median" style="left:' + toPos(ns.median) + '%"></div>' +
              '<div class="dq-boxplot-dot" style="left:0%" title="Min: ' + fmtNum(ns.min) + '"></div>' +
              '<div class="dq-boxplot-dot" style="left:100%" title="Max: ' + fmtNum(ns.max) + '"></div>' +
            "</div>" +
          "</div>" +
        "</div>";
    }

    // ── Percentile Visual ──
    var pctHtml = "";
    if (a.numStats && a.colType === "numeric" && a.numStats.range > 0) {
      var ns2 = a.numStats;
      var pRange = ns2.max - ns2.min;
      var pctValues = [
        { label: "P10", val: ns2.p10 }, { label: "P25", val: ns2.p25 },
        { label: "P50", val: ns2.p50 }, { label: "P75", val: ns2.p75 },
        { label: "P90", val: ns2.p90 }, { label: "P99", val: ns2.p99 }
      ];

      var markers = "";
      if (pRange > 0) {
        markers = pctValues.map(function (p) {
          var left = ((p.val - ns2.min) / pRange * 100).toFixed(1);
          return '<div class="dq-pct-marker" style="left:' + left + '%">' +
            '<div class="dq-pct-dot"></div>' +
            '<div class="dq-pct-label">' + p.label + "</div></div>";
        }).join("");
      }

      pctHtml =
        '<div class="dq-detail-group">' +
          '<div class="dq-detail-title"><i class="fas fa-percentage"></i> Yuzdelikler (Percentile)</div>' +
          '<div class="dq-percentile-bar"><div class="dq-pct-track">' + markers + "</div></div>" +
          '<div class="dq-pct-grid">' +
            pctValues.map(function (p) {
              return '<div class="dq-stat"><span class="dq-stat-label">' + p.label + '</span><span class="dq-stat-val">' + fmtNum(p.val) + "</span></div>";
            }).join("") +
          "</div>" +
        "</div>";
    }

    // ── Detail Section ──
    var detailHtml = boxPlotHtml;

    // Numeric stats
    if (a.numStats) {
      detailHtml +=
        '<div class="dq-detail-group">' +
          '<div class="dq-detail-title"><i class="fas fa-calculator"></i> Istatistik</div>' +
          '<div class="dq-stats-grid">' +
            '<div class="dq-stat"><span class="dq-stat-label">Min</span><span class="dq-stat-val">' + fmtNum(a.numStats.min) + "</span></div>" +
            '<div class="dq-stat"><span class="dq-stat-label">Max</span><span class="dq-stat-val">' + fmtNum(a.numStats.max) + "</span></div>" +
            '<div class="dq-stat"><span class="dq-stat-label">Ortalama</span><span class="dq-stat-val">' + fmtNum(a.numStats.mean) + "</span></div>" +
            '<div class="dq-stat"><span class="dq-stat-label">Medyan</span><span class="dq-stat-val">' + fmtNum(a.numStats.median) + "</span></div>" +
            '<div class="dq-stat"><span class="dq-stat-label">Std Sapma</span><span class="dq-stat-val">' + fmtNum(a.numStats.stddev) + "</span></div>" +
            '<div class="dq-stat"><span class="dq-stat-label">Aralik</span><span class="dq-stat-val">' + fmtNum(a.numStats.range) + "</span></div>" +
            '<div class="dq-stat"><span class="dq-stat-label">Q1</span><span class="dq-stat-val">' + fmtNum(a.numStats.q1) + "</span></div>" +
            '<div class="dq-stat"><span class="dq-stat-label">Q3</span><span class="dq-stat-val">' + fmtNum(a.numStats.q3) + "</span></div>" +
          "</div></div>";

      // Percentile section
      detailHtml += pctHtml;
    }

    // Text stats
    if (a.textStats) {
      detailHtml +=
        '<div class="dq-detail-group">' +
          '<div class="dq-detail-title"><i class="fas fa-font"></i> Metin Analizi</div>' +
          '<div class="dq-stats-grid">' +
            '<div class="dq-stat"><span class="dq-stat-label">Min Uzunluk</span><span class="dq-stat-val">' + a.textStats.minLen + "</span></div>" +
            '<div class="dq-stat"><span class="dq-stat-label">Max Uzunluk</span><span class="dq-stat-val">' + a.textStats.maxLen + "</span></div>" +
            '<div class="dq-stat"><span class="dq-stat-label">Ort Uzunluk</span><span class="dq-stat-val">' + a.textStats.avgLen + "</span></div>" +
            (a.textStats.emptyStrings > 0 ? '<div class="dq-stat"><span class="dq-stat-label">Bos String</span><span class="dq-stat-val dq-val-warn">' + a.textStats.emptyStrings + "</span></div>" : "") +
          "</div></div>";
    }

    // Top values
    if (a.topValues.length > 0) {
      detailHtml +=
        '<div class="dq-detail-group">' +
          '<div class="dq-detail-title"><i class="fas fa-trophy"></i> En Sik Degerler</div>' +
          '<div class="dq-top-values">' +
            a.topValues.map(function (tv, rank) {
              return '<div class="dq-top-row">' +
                '<span class="dq-top-rank">' + (rank + 1) + ".</span>" +
                '<span class="dq-top-val">' + escapeHtml(tv.value.length > 30 ? tv.value.slice(0, 30) + "\u2026" : tv.value) + "</span>" +
                '<span class="dq-top-count">' + tv.count + "x (" + tv.pct + "%)</span></div>";
            }).join("") +
          "</div></div>";
    }

    // Consistency
    if (a.consistencyNote) {
      var cBarClass = a.consistency >= 80 ? "dq-bar-green" : a.consistency >= 50 ? "dq-bar-yellow" : "dq-bar-red";
      detailHtml +=
        '<div class="dq-detail-group">' +
          '<div class="dq-detail-title"><i class="fas fa-check-double"></i> Tutarlilik</div>' +
          '<div class="dq-consistency">' +
            '<div class="dq-bar-track" style="width:100%"><div class="dq-bar-fill ' + cBarClass + '" style="width:' + a.consistency + '%"></div></div>' +
            '<span class="dq-consistency-label">' + a.consistency.toFixed(0) + "% \u2014 " + a.consistencyNote + "</span>" +
          "</div></div>";
    }

    cards.push(
      '<div class="dq-card" id="dqCard' + i + '">' +
        '<div class="dq-card-header" onclick="toggleDqCard(' + i + ')">' +
          '<div class="dq-col-name">' + escapeHtml(header) +
            '<span class="dq-type-badge ' + typeBadgeClass + '">' + typeLabel + "</span>" +
          "</div>" +
          '<div class="dq-card-right">' +
            '<span class="dq-score-pill" style="background:' + scoreColor + "20;color:" + scoreColor + ";border:1px solid " + scoreColor + '33">' + a.score + "</span>" +
            '<i class="fas fa-chevron-down dq-expand-icon"></i>' +
          "</div>" +
        "</div>" +
        '<div class="dq-card-body">' +
          '<div class="dq-metrics-row">' +
            '<div class="dq-metric-compact">' +
              '<span class="dq-metric-label">Tamlik</span>' +
              '<div class="dq-bar-track"><div class="dq-bar-fill ' + barClass + '" style="width:' + a.completeness + '%"></div></div>' +
              '<span class="dq-metric-val">' + a.completeness.toFixed(0) + "%</span>" +
            "</div>" +
            '<div class="dq-metric-compact">' +
              '<span class="dq-metric-label">Benzrsz</span>' +
              '<span class="dq-metric-val">' + a.uniqueCount + "/" + a.nonNullCount + "</span>" +
            "</div>" +
            (a.colType === "numeric" ? '<div class="dq-metric-compact"><span class="dq-metric-label">Outlier</span><span class="dq-metric-val ' + (a.outlierCount > 0 ? "dq-val-warn" : "") + '">' + a.outlierCount + "</span></div>" : "") +
            (a.isUnique ? '<span class="dq-type-badge dq-type-boolean" title="Potansiyel PK"><i class="fas fa-key" style="font-size:0.55rem"></i> PK</span>' : "") +
          "</div>" +
          histHtml +
        "</div>" +
        '<div class="dq-card-detail" id="dqDetail' + i + '">' + detailHtml + "</div>" +
      "</div>"
    );
  });

  grid.innerHTML = cards.join("");

  // Overall badge
  var scoreClass = avgScore >= 80 ? "dq-score-high" : avgScore >= 50 ? "dq-score-mid" : "dq-score-low";
  overall.className = "dq-overall " + scoreClass;
  overall.innerHTML = '<i class="fas fa-star"></i> ' + avgScore + "/100";

  // ── Insights ──
  if (insights) {
    var tips = generateDqInsights(analyses, headers, totalRows, duplicateRows);
    if (tips.length > 0) {
      insights.innerHTML =
        '<div class="dq-insights-title"><i class="fas fa-lightbulb"></i> Oneriler & Bulgular</div>' +
        tips.map(function (t) {
          return '<div class="dq-insight ' + t.severity + '"><i class="fas ' + t.icon + '"></i><span>' + t.text + "</span></div>";
        }).join("");
      insights.style.display = "block";
    } else {
      insights.style.display = "none";
    }
  }

  section.style.display = "block";
  highlightTableOutliers();
}

// ── Card Expand/Collapse ──
function toggleDqCard(index) {
  var card = document.getElementById("dqCard" + index);
  if (card) card.classList.toggle("expanded");
}

// ── Highlight Table Cells ──
function highlightTableOutliers() {
  if (!dqColumnAnalysis || dqColumnAnalysis.length === 0) return;
  var tbody = document.querySelector("#resultContainer tbody");
  if (!tbody) return;

  var trs = tbody.querySelectorAll("tr");
  trs.forEach(function (tr) {
    var tds = tr.children;
    for (var ci = 0; ci < tds.length; ci++) {
      var td = tds[ci];
      var dq = dqColumnAnalysis[ci];
      if (!dq) continue;
      if (td.textContent === "NULL" || td.textContent.trim() === "") {
        td.classList.add("cell-null");
      } else if (dq.colType === "numeric" && dq.outlierThreshold) {
        var num = parseFloat(td.textContent);
        if (!isNaN(num) && (num < dq.outlierThreshold.low || num > dq.outlierThreshold.high)) {
          td.classList.add("cell-outlier");
        }
      }
    }
  });
}

// ── Filter Toggles ──
function toggleOutlierFilter() {
  outlierFilterActive = !outlierFilterActive;
  if (outlierFilterActive) nullFilterActive = false;
  if (lastResultData) renderTable(lastResultData);
  refreshDqFilterBtnStates();
}

function toggleNullFilter() {
  nullFilterActive = !nullFilterActive;
  if (nullFilterActive) outlierFilterActive = false;
  if (lastResultData) renderTable(lastResultData);
  refreshDqFilterBtnStates();
}

function refreshDqFilterBtnStates() {
  document.querySelectorAll(".dq-null-btn").forEach(function (btn) {
    btn.classList.toggle("active", nullFilterActive);
  });
  document.querySelectorAll(".dq-outlier-btn").forEach(function (btn) {
    btn.classList.toggle("active", outlierFilterActive);
  });
}

// ── DQ Insights Generator ──
function generateDqInsights(analyses, headers, totalRows, duplicateRows) {
  var tips = [];

  if (duplicateRows > 0) {
    tips.push({ icon: "fa-clone", text: "<strong>" + duplicateRows + "</strong> tekrarlanan satir bulundu. Veri tekrarini kontrol edin.", severity: "dq-insight-warn" });
  }

  analyses.forEach(function (a, i) {
    if (a.completeness < 90 && a.completeness > 0) {
      tips.push({ icon: "fa-exclamation-circle", text: "<strong>" + headers[i] + "</strong> sutununda %" + (100 - a.completeness).toFixed(0) + " eksik veri (" + a.nullCount + " NULL).", severity: a.completeness < 50 ? "dq-insight-error" : "dq-insight-warn" });
    }
  });

  analyses.forEach(function (a, i) {
    if (a.completeness === 0) {
      tips.push({ icon: "fa-times-circle", text: "<strong>" + headers[i] + "</strong> sutunu tamamen bos (tum degerler NULL).", severity: "dq-insight-error" });
    }
  });

  analyses.forEach(function (a, i) {
    if (a.outlierCount > 0) {
      var pct = ((a.outlierCount / totalRows) * 100).toFixed(1);
      var method = a.outlierMethod || "Z-score";
      tips.push({ icon: "fa-chart-line", text: "<strong>" + headers[i] + "</strong> sutununda <strong>" + a.outlierCount + "</strong> aykiri deger (%" + pct + ") tespit edildi (" + method + " yontemi).", severity: "dq-insight-info" });
    }
  });

  analyses.forEach(function (a, i) {
    if (a.isUnique && totalRows > 1) {
      tips.push({ icon: "fa-key", text: "<strong>" + headers[i] + "</strong> tum degerleri benzersiz \u2014 potansiyel birincil anahtar (PK).", severity: "dq-insight-good" });
    }
  });

  analyses.forEach(function (a, i) {
    if (a.uniqueness < 10 && a.nonNullCount > 5) {
      tips.push({ icon: "fa-tags", text: "<strong>" + headers[i] + "</strong> dusuk benzersizlik (" + a.uniqueCount + " farkli deger) \u2014 kategorik veri olabilir.", severity: "dq-insight-info" });
    }
  });

  analyses.forEach(function (a, i) {
    if (a.consistency < 70 && a.colType === "text") {
      tips.push({ icon: "fa-spell-check", text: "<strong>" + headers[i] + "</strong> sutununda format tutarsizligi (%" + a.consistency.toFixed(0) + ") \u2014 veri standardizasyonu onerilir.", severity: "dq-insight-warn" });
    }
  });

  analyses.forEach(function (a, i) {
    if (a.numStats && a.numStats.range > 0) {
      var cv = a.numStats.stddev / Math.abs(a.numStats.mean || 1);
      if (cv > 1.5) {
        tips.push({ icon: "fa-balance-scale-right", text: "<strong>" + headers[i] + "</strong> yuksek degiskenlik (CV: " + cv.toFixed(2) + ") \u2014 dagilim dengesiz olabilir.", severity: "dq-insight-info" });
      }
    }
  });

  var avgScore = analyses.reduce(function (a, b) { return a + b.score; }, 0) / analyses.length;
  if (avgScore >= 90 && duplicateRows === 0 && tips.filter(function (t) { return t.severity !== "dq-insight-good"; }).length === 0) {
    tips.push({ icon: "fa-check-circle", text: "Veri kalitesi mukemmel! Tum sutunlar yuksek kalite standartlarini karsilamaktadir.", severity: "dq-insight-good" });
  }

  return tips;
}
