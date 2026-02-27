/* ============================================================
   dq-analysis.js  —  Column analysis engine (with percentiles + dual outlier detection)
   ============================================================ */

function calcPercentile(sorted, p) {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  var index = (p / 100) * (sorted.length - 1);
  var lower = Math.floor(index);
  var upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  var weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/**
 * isNull — Hem JSON null hem eski "NULL" string hem bos string'i yakalar.
 * Backend artik gercek null gonderiyor, ama geriye uyumluluk icin "NULL" string de kontrol edilir.
 */
function isNullValue(v) {
  return v === null || v === undefined || v === "NULL" || String(v).trim() === "";
}

function analyzeColumn(values, totalRows, serverType) {
  var nonNull = values.filter(function (v) { return !isNullValue(v); });
  var strValues = nonNull.map(function (v) { return String(v); });
  var uniqueVals = new Set(strValues.map(function (v) { return v.toLowerCase(); }));

  // ── Type Detection ──
  // Eger backend column_types gonderiyorsa, onu oncelikli kullan
  var nums = nonNull.map(function (v) { return parseFloat(v); }).filter(function (n) { return !isNaN(n); });
  var datePattern = /^\d{4}-\d{2}-\d{2}/;
  var emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var boolPattern = /^(true|false|yes|no|evet|hayir|0|1)$/i;

  var dates = nonNull.filter(function (v) { return datePattern.test(String(v)); });
  var emails = nonNull.filter(function (v) { return emailPattern.test(String(v)); });
  var bools = nonNull.filter(function (v) { return boolPattern.test(String(v)); });

  var colType = "text", subType = null;

  // Backend tip bilgisi varsa onu kullan
  if (serverType) {
    var st = serverType.toLowerCase();
    if (st.indexOf("int") !== -1 || st.indexOf("numeric") !== -1 || st.indexOf("float") !== -1 ||
        st.indexOf("decimal") !== -1 || st.indexOf("real") !== -1 || st.indexOf("double") !== -1) {
      colType = "numeric";
      subType = (st.indexOf("int") !== -1) ? "integer" : "decimal";
    } else if (st.indexOf("date") !== -1 || st.indexOf("timestamp") !== -1 || st.indexOf("time") !== -1) {
      colType = "date";
    } else if (st.indexOf("bool") !== -1) {
      colType = "text"; subType = "boolean";
    }
  }

  // Fallback: istatistiksel tip cikarimi (backend tipi yoksa veya text ise)
  if (colType === "text" && !subType) {
    if (nums.length > nonNull.length * 0.7) {
      colType = "numeric";
      subType = nums.every(function (n) { return Number.isInteger(n); }) ? "integer" : "decimal";
    } else if (dates.length > nonNull.length * 0.7) {
      colType = "date";
    } else if (emails.length > nonNull.length * 0.7) {
      colType = "text"; subType = "email";
    } else if (bools.length > nonNull.length * 0.7) {
      colType = "text"; subType = "boolean";
    }
  }

  // ── Completeness & Uniqueness ──
  var completeness = totalRows > 0 ? (nonNull.length / totalRows) * 100 : 0;
  var nullCount = totalRows - nonNull.length;
  var uniqueness = nonNull.length > 0 ? (uniqueVals.size / nonNull.length) * 100 : 0;
  var isUnique = uniqueVals.size === nonNull.length && totalRows > 1;

  // ── Frequency Analysis ──
  var freq = {};
  strValues.forEach(function (v) { freq[v] = (freq[v] || 0) + 1; });
  var topValues = Object.entries(freq)
    .sort(function (a, b) { return b[1] - a[1]; })
    .slice(0, 3)
    .map(function (e) { return { value: e[0], count: e[1], pct: ((e[1] / nonNull.length) * 100).toFixed(1) }; });

  // ── Numeric Stats + Percentiles ──
  var numStats = null;
  if (colType === "numeric" && nums.length > 0) {
    var sorted = nums.slice().sort(function (a, b) { return a - b; });
    var sum = nums.reduce(function (a, b) { return a + b; }, 0);
    var mean = sum / nums.length;
    var median = sorted.length % 2 === 0
      ? (sorted[Math.floor(sorted.length / 2) - 1] + sorted[Math.floor(sorted.length / 2)]) / 2
      : sorted[Math.floor(sorted.length / 2)];
    var variance = nums.reduce(function (a, b) { return a + Math.pow(b - mean, 2); }, 0) / nums.length;
    var stddev = Math.sqrt(variance);
    var q1 = calcPercentile(sorted, 25);
    var q3 = calcPercentile(sorted, 75);

    numStats = {
      min: sorted[0], max: sorted[sorted.length - 1],
      mean: mean, median: median, stddev: stddev, sum: sum,
      q1: q1, q3: q3, iqr: q3 - q1,
      range: sorted[sorted.length - 1] - sorted[0],
      p10: calcPercentile(sorted, 10),
      p25: q1,
      p50: median,
      p75: q3,
      p90: calcPercentile(sorted, 90),
      p99: calcPercentile(sorted, 99)
    };
  }

  // ── Text Stats ──
  var textStats = null;
  if (colType === "text" && strValues.length > 0) {
    var lengths = strValues.map(function (v) { return v.length; });
    textStats = {
      minLen: Math.min.apply(null, lengths),
      maxLen: Math.max.apply(null, lengths),
      avgLen: (lengths.reduce(function (a, b) { return a + b; }, 0) / lengths.length).toFixed(1),
      emptyStrings: strValues.filter(function (v) { return v.trim() === ""; }).length
    };
  }

  // ── Distribution Histogram ──
  var histogram = [];
  if (colType === "numeric" && nums.length > 1 && numStats) {
    var bucketCount = Math.min(8, Math.max(3, Math.ceil(nums.length / 3)));
    var hMin = numStats.min, hMax = numStats.max;
    var bucketSize = (hMax - hMin) / bucketCount || 1;
    var buckets = new Array(bucketCount).fill(0);
    nums.forEach(function (n) {
      var idx = Math.floor((n - hMin) / bucketSize);
      if (idx >= bucketCount) idx = bucketCount - 1;
      buckets[idx]++;
    });
    var maxBucket = Math.max.apply(null, buckets);
    histogram = buckets.map(function (count) {
      return { count: count, pct: maxBucket > 0 ? (count / maxBucket) * 100 : 0 };
    });
  } else if (colType === "text" && topValues.length > 0) {
    var maxFreq = topValues[0] ? topValues[0].count : 1;
    histogram = topValues.map(function (tv) {
      return {
        label: tv.value.length > 12 ? tv.value.slice(0, 12) + "\u2026" : tv.value,
        count: tv.count,
        pct: (tv.count / maxFreq) * 100
      };
    });
  }

  // ── Outlier Detection (Dual: Z-score + IQR) ──
  var outlierCount = 0, outlierThreshold = null;
  var outlierMethod = "none";
  if (colType === "numeric" && nums.length > 4 && numStats) {
    // Yontem 1: IQR (daha robust - asimetrik dagilimlar icin)
    var iqr = numStats.q3 - numStats.q1;
    var iqrLow = numStats.q1 - 1.5 * iqr;
    var iqrHigh = numStats.q3 + 1.5 * iqr;
    var iqrOutliers = nums.filter(function (n) { return n < iqrLow || n > iqrHigh; }).length;

    // Yontem 2: Z-score (normal dagilim icin)
    var zLow = numStats.mean - 2 * numStats.stddev;
    var zHigh = numStats.mean + 2 * numStats.stddev;
    var zOutliers = numStats.stddev > 0
      ? nums.filter(function (n) { return n < zLow || n > zHigh; }).length
      : 0;

    // Daha hassas olan yontemi sec (daha az outlier bulan = daha robust)
    // Ama eger IQR=0 ise (butun degerler ayni Q1/Q3), Z-score kullan
    if (iqr > 0) {
      outlierThreshold = { low: iqrLow, high: iqrHigh };
      outlierCount = iqrOutliers;
      outlierMethod = "IQR";
    } else if (numStats.stddev > 0) {
      outlierThreshold = { low: zLow, high: zHigh };
      outlierCount = zOutliers;
      outlierMethod = "Z-score";
    }
  }

  // ── Consistency ──
  var consistency = 100, consistencyNote = "";
  if (colType === "text" && nonNull.length > 1) {
    var cases = { upper: 0, lower: 0, capitalized: 0, mixed: 0 };
    strValues.forEach(function (v) {
      if (v === v.toUpperCase()) cases.upper++;
      else if (v === v.toLowerCase()) cases.lower++;
      else if (v.charAt(0) === v.charAt(0).toUpperCase()) cases.capitalized++;
      else cases.mixed++;
    });
    var dominant = Math.max(cases.upper, cases.lower, cases.capitalized, cases.mixed);
    consistency = (dominant / nonNull.length) * 100;
    if (cases.upper === dominant) consistencyNote = "BUYUK HARF";
    else if (cases.lower === dominant) consistencyNote = "kucuk harf";
    else if (cases.capitalized === dominant) consistencyNote = "Baslik Stili";
    else consistencyNote = "Karisik";
  } else if (colType === "numeric") {
    var decPlaces = nums.map(function (n) { var s = String(n); var d = s.indexOf("."); return d === -1 ? 0 : s.length - d - 1; });
    var uniqDec = new Set(decPlaces);
    consistency = uniqDec.size <= 2 ? 100 : Math.max(50, 100 - (uniqDec.size - 2) * 10);
    consistencyNote = uniqDec.size === 1 ? decPlaces[0] + " ondalik" : "Karisik format";
  }

  // ── Quality Score (weighted) ──
  var score = 0;
  score += completeness * 0.30;
  score += Math.min(uniqueness, 100) * 0.20;
  score += consistency * 0.20;
  if (colType === "numeric") {
    var outlierPenalty = totalRows > 0 ? (outlierCount / totalRows) * 100 : 0;
    score += (100 - outlierPenalty) * 0.15;
    score += (uniqueness > 0 ? 100 : 0) * 0.15;
  } else {
    score += 100 * 0.15;
    score += (nonNull.length > 0 ? 100 : 0) * 0.15;
  }
  score = Math.round(Math.min(Math.max(score, 0), 100));

  return {
    completeness: completeness, nullCount: nullCount, uniqueness: uniqueness,
    uniqueCount: uniqueVals.size, nonNullCount: nonNull.length, isUnique: isUnique,
    colType: colType, subType: subType,
    outlierCount: outlierCount, outlierThreshold: outlierThreshold, outlierMethod: outlierMethod,
    score: score, topValues: topValues, histogram: histogram,
    numStats: numStats, textStats: textStats,
    consistency: consistency, consistencyNote: consistencyNote
  };
}
