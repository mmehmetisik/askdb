/* ============================================================
   eda-engine.js  —  EDA Bridge (Backend → Frontend)
   Backend'den gelen EDA verisini eda-render.js'in beklediği
   edaResults formatına çevirir ve render fonksiyonlarını çağırır.
   ============================================================ */

var edaResults = null; // eda-render.js tarafindan kullanilir

/**
 * Backend EDA verisini alir, edaResults formatina donusturur,
 * tum EDA tab'larini renderlar.
 * analysis-app.js'deki loadEdaFromBackend() tarafindan cagirilir.
 */
function renderEdaFromBackend(backendData) {
  if (!backendData) {
    edaResults = null;
    return;
  }

  var columns = [];
  var backendCols = backendData.columns || [];

  for (var i = 0; i < backendCols.length; i++) {
    var bc = backendCols[i];

    // Distribution'i frontend formatina donustur
    var distribution = [];
    if (bc.distribution && bc.distribution.length > 0) {
      bc.distribution.forEach(function (d) {
        distribution.push({
          label: d.range || d.label || "",
          count: d.count || 0,
          min: d.min || 0,
          max: d.max || 0,
        });
      });
    }

    // Top values formatina donustur
    var topValues = [];
    if (bc.top_values && bc.top_values.length > 0) {
      bc.top_values.forEach(function (tv) {
        var total = bc.total - bc.null_count;
        topValues.push({
          value: tv.value,
          count: tv.count,
          pct: total > 0 ? (tv.count / total * 100) : 0,
        });
      });
    }

    // Backend stats'i dogrudan kullan
    var stats = bc.stats || {};

    // Outlier bounds
    var outlierBounds = null;
    if (bc.outlier_bounds) {
      outlierBounds = { lower: bc.outlier_bounds.lower, upper: bc.outlier_bounds.upper };
    }

    // Kolon tipini backend'in degerlerini frontend karsiligina cevir
    var colType = bc.col_type || "text";

    columns.push({
      index: i,
      name: bc.name,
      colType: colType,
      total: bc.total || 0,
      nullCount: bc.null_count || 0,
      nullIndices: [],  // Backend buyuk veri icin indeks gondermiyor
      completeness: bc.completeness ? (bc.completeness * 100) : 100,
      uniqueCount: bc.unique_count || 0,
      uniqueness: bc.uniqueness ? (bc.uniqueness * 100) : 0,
      outlierCount: bc.outlier_count || 0,
      outlierIndices: [],  // Backend buyuk veri icin indeks gondermiyor
      outlierBounds: outlierBounds,
      stats: stats,
      topValues: topValues,
      distribution: distribution,
    });
  }

  // Korelasyonlari cevir
  var correlations = [];
  if (backendData.correlations && backendData.correlations.length > 0) {
    backendData.correlations.forEach(function (c) {
      // "strong" → "guclu", "medium" → "orta", "weak" → "zayif"
      var strengthMap = { strong: "guclu", medium: "orta", weak: "zayif" };
      var dirMap = { positive: "pozitif", negative: "negatif" };
      correlations.push({
        col1: c.col1,
        col2: c.col2,
        value: c.value,
        strength: strengthMap[c.strength] || c.strength,
        direction: dirMap[c.direction] || c.direction,
      });
    });
  }

  edaResults = {
    rowCount: backendData.row_count || 0,
    colCount: backendData.col_count || 0,
    columns: columns,
    duplicates: {
      count: backendData.duplicate_count || 0,
      indices: [],  // Backend indeks gondermiyor (buyuk veri icin)
    },
    correlations: correlations,
    totalNulls: backendData.total_nulls || 0,
    totalOutliers: backendData.total_outliers || 0,
    qualityScore: backendData.quality_score || 0,
  };

  // Tum tab'lari renderla
  renderEdaOverview();
  renderEdaMissing();
  renderEdaOutlier();
  renderEdaDistribution();
  renderEdaCorrelation();
  renderEdaDuplicates();
  if (typeof renderEdaCleaning === "function") renderEdaCleaning();
  if (typeof renderEdaFilter === "function") renderEdaFilter();
  if (typeof renderEdaChart === "function") renderEdaChart();
}

/**
 * Eski uyumluluk: runFullEDA artik backend'e yonlendirir.
 * Dogrudan cagrilirsa loadEdaFromBackend tetikler.
 */
function runFullEDA() {
  // Backend-powered: eger aEdaData varsa onu kullan
  if (typeof aEdaData !== "undefined" && aEdaData) {
    renderEdaFromBackend(aEdaData);
    return;
  }
  // Fallback: eger currentReport varsa backend'den EDA al
  if (typeof loadEdaFromBackend === "function") {
    loadEdaFromBackend();
  }
}
