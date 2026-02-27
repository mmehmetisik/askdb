/* ============================================================
   dq-export.js  —  DQ Report HTML export
   ============================================================ */

function exportDqReport() {
  if (!lastResultData || !dqColumnAnalysis || dqColumnAnalysis.length === 0) return;

  var headers = lastResultData[0];
  var totalRows = lastResultData.length - 1;
  var analyses = dqColumnAnalysis;
  var dateStr = new Date().toLocaleDateString("tr-TR");
  var timeStr = new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });

  var avgScore = Math.round(analyses.reduce(function (a, b) { return a + b.score; }, 0) / analyses.length);
  var totalNulls = analyses.reduce(function (a, b) { return a + b.nullCount; }, 0);
  var totalOutliers = analyses.reduce(function (a, b) { return a + b.outlierCount; }, 0);

  // Duplicate check
  var rows = lastResultData.slice(1);
  var rowStrings = rows.map(function (r) { return JSON.stringify(r); });
  var duplicateRows = totalRows - new Set(rowStrings).size;

  var scoreClass = avgScore >= 80 ? "good" : avgScore >= 50 ? "warn" : "bad";

  // Build column sections
  var colSections = analyses.map(function (a, i) {
    var typeLabel = a.subType ? a.colType + " / " + a.subType : a.colType;
    var rows = "";
    rows += '<div class="sr"><span class="sl">Tamlik</span><span class="sv">' + a.completeness.toFixed(1) + "%</span></div>";
    rows += '<div class="sr"><span class="sl">NULL Sayisi</span><span class="sv ' + (a.nullCount > 0 ? "warn" : "") + '">' + a.nullCount + "</span></div>";
    rows += '<div class="sr"><span class="sl">Benzersiz</span><span class="sv">' + a.uniqueCount + " / " + a.nonNullCount + "</span></div>";
    rows += '<div class="sr"><span class="sl">Benzersizlik %</span><span class="sv">' + a.uniqueness.toFixed(1) + "%</span></div>";

    if (a.colType === "numeric") {
      rows += '<div class="sr"><span class="sl">Outlier</span><span class="sv ' + (a.outlierCount > 0 ? "warn" : "") + '">' + a.outlierCount + "</span></div>";
    }

    if (a.numStats) {
      rows += '<div class="sr"><span class="sl">Min</span><span class="sv">' + fmtNum(a.numStats.min) + "</span></div>";
      rows += '<div class="sr"><span class="sl">Max</span><span class="sv">' + fmtNum(a.numStats.max) + "</span></div>";
      rows += '<div class="sr"><span class="sl">Ortalama</span><span class="sv">' + fmtNum(a.numStats.mean) + "</span></div>";
      rows += '<div class="sr"><span class="sl">Medyan</span><span class="sv">' + fmtNum(a.numStats.median) + "</span></div>";
      rows += '<div class="sr"><span class="sl">Std Sapma</span><span class="sv">' + fmtNum(a.numStats.stddev) + "</span></div>";
      rows += '<div class="sr"><span class="sl">Q1 / Q3</span><span class="sv">' + fmtNum(a.numStats.q1) + " / " + fmtNum(a.numStats.q3) + "</span></div>";
      rows += '<div class="sr"><span class="sl">IQR</span><span class="sv">' + fmtNum(a.numStats.iqr) + "</span></div>";
      // Percentiles
      rows += '<div class="sr"><span class="sl">P10</span><span class="sv">' + fmtNum(a.numStats.p10) + "</span></div>";
      rows += '<div class="sr"><span class="sl">P25</span><span class="sv">' + fmtNum(a.numStats.p25) + "</span></div>";
      rows += '<div class="sr"><span class="sl">P50</span><span class="sv">' + fmtNum(a.numStats.p50) + "</span></div>";
      rows += '<div class="sr"><span class="sl">P75</span><span class="sv">' + fmtNum(a.numStats.p75) + "</span></div>";
      rows += '<div class="sr"><span class="sl">P90</span><span class="sv">' + fmtNum(a.numStats.p90) + "</span></div>";
      rows += '<div class="sr"><span class="sl">P99</span><span class="sv">' + fmtNum(a.numStats.p99) + "</span></div>";
    }

    if (a.textStats) {
      rows += '<div class="sr"><span class="sl">Min Uzunluk</span><span class="sv">' + a.textStats.minLen + "</span></div>";
      rows += '<div class="sr"><span class="sl">Max Uzunluk</span><span class="sv">' + a.textStats.maxLen + "</span></div>";
      rows += '<div class="sr"><span class="sl">Ort Uzunluk</span><span class="sv">' + a.textStats.avgLen + "</span></div>";
    }

    if (a.consistencyNote) {
      rows += '<div class="sr"><span class="sl">Tutarlilik</span><span class="sv">' + a.consistency.toFixed(0) + "% \u2014 " + a.consistencyNote + "</span></div>";
    }

    rows += '<div class="sr"><span class="sl">Kalite Skoru</span><span class="sv" style="font-weight:700;color:' + (a.score >= 80 ? "#22c55e" : a.score >= 50 ? "#f59e0b" : "#ef4444") + '">' + a.score + "/100</span></div>";

    // Top values
    var topHtml = "";
    if (a.topValues.length > 0) {
      topHtml = '<div class="tv"><div class="tv-title">En Sik Degerler</div>' +
        a.topValues.map(function (tv, r) {
          return '<div class="sr"><span class="sl">' + (r + 1) + ". " + escapeHtml(tv.value.length > 40 ? tv.value.slice(0, 40) + "\u2026" : tv.value) + '</span><span class="sv">' + tv.count + "x (" + tv.pct + "%)</span></div>";
        }).join("") +
        "</div>";
    }

    return '<div class="col-section">' +
      '<div class="col-head">' +
        '<span class="col-name">' + escapeHtml(headers[i]) + '</span>' +
        '<span class="col-type">' + typeLabel + "</span>" +
      "</div>" +
      '<div class="col-body">' + rows + topHtml + "</div></div>";
  }).join("");

  var html = '<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8">' +
    "<title>Data Quality Raporu - " + dateStr + "</title>" +
    "<style>" +
      "*{margin:0;padding:0;box-sizing:border-box}" +
      "body{font-family:'Segoe UI',-apple-system,sans-serif;background:#0f1117;color:#e2e8f0;padding:40px;max-width:1000px;margin:0 auto}" +
      ".header{text-align:center;margin-bottom:32px;padding-bottom:20px;border-bottom:1px solid rgba(255,255,255,0.08)}" +
      ".header h1{font-size:1.6rem;margin-bottom:6px;color:#4f8ff7}" +
      ".header .sub{color:#8892a8;font-size:0.82rem}" +
      ".badge{display:inline-block;font-size:1.3rem;font-weight:700;padding:8px 20px;border-radius:12px;margin:14px 0}" +
      ".good{background:rgba(34,197,94,0.1);color:#22c55e;border:1px solid rgba(34,197,94,0.2)}" +
      ".warn{color:#f59e0b}" +
      ".bad{background:rgba(239,68,68,0.1);color:#ef4444;border:1px solid rgba(239,68,68,0.2)}" +
      ".summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin:24px 0}" +
      ".scard{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:16px;text-align:center}" +
      ".scard .num{font-size:1.4rem;font-weight:700;color:#4f8ff7}" +
      ".scard .label{font-size:0.72rem;color:#8892a8;margin-top:4px}" +
      ".col-section{background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:10px;margin-bottom:14px;overflow:hidden}" +
      ".col-head{padding:12px 18px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(255,255,255,0.06);background:rgba(255,255,255,0.01)}" +
      ".col-name{font-weight:700;font-size:0.88rem}" +
      ".col-type{font-size:0.68rem;padding:2px 8px;border-radius:4px;background:rgba(79,143,247,0.1);color:#4f8ff7}" +
      ".col-body{padding:10px 18px}" +
      ".sr{display:flex;justify-content:space-between;padding:5px 0;font-size:0.8rem;border-bottom:1px solid rgba(255,255,255,0.03)}" +
      ".sl{color:#8892a8}.sv{font-weight:600}" +
      ".tv{margin-top:10px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.06)}" +
      ".tv-title{font-size:0.7rem;font-weight:700;color:#f59e0b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px}" +
      ".footer{text-align:center;margin-top:32px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.06);color:#8892a8;font-size:0.72rem}" +
      "@media print{body{background:#fff;color:#1e293b;padding:20px}.col-section{border-color:#e2e8f0}.sr{border-color:#f1f5f9}.sl{color:#64748b}}" +
    "</style></head><body>" +
    '<div class="header">' +
      "<h1>\ud83d\udee1\ufe0f Data Quality Raporu</h1>" +
      '<div class="sub">' + dateStr + " " + timeStr + " \u2022 " + totalRows.toLocaleString("tr-TR") + " satir \u2022 " + headers.length + " sutun</div>" +
      '<div class="badge ' + scoreClass + '">' + avgScore + " / 100</div>" +
    "</div>" +
    '<div class="summary">' +
      '<div class="scard"><div class="num">' + headers.length + '</div><div class="label">Sutun</div></div>' +
      '<div class="scard"><div class="num">' + totalRows.toLocaleString("tr-TR") + '</div><div class="label">Satir</div></div>' +
      '<div class="scard"><div class="num" style="color:' + (totalNulls > 0 ? "#f59e0b" : "#22c55e") + '">' + totalNulls + '</div><div class="label">NULL</div></div>' +
      '<div class="scard"><div class="num" style="color:' + (totalOutliers > 0 ? "#f59e0b" : "#22c55e") + '">' + totalOutliers + '</div><div class="label">Outlier</div></div>' +
      '<div class="scard"><div class="num" style="color:' + (duplicateRows > 0 ? "#f59e0b" : "#22c55e") + '">' + duplicateRows + '</div><div class="label">Duplicate</div></div>' +
    "</div>" +
    colSections +
    '<div class="footer">AskDB \u2022 Data Quality Report \u2022 ' + dateStr + "</div>" +
    "</body></html>";

  var blob = new Blob([html], { type: "text/html;charset=utf-8" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = "dq_rapor_" + new Date().toISOString().slice(0, 10) + ".html";
  a.click();
  URL.revokeObjectURL(url);
}
