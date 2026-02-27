/* ============================================================
   chart-panel.js  —  Grafik Olusturma Paneli (v2 - Backend Powered)
   X/Y eksen secimi, grafik turu, PNG export.
   Backend'den veri cekerek grafik olusturur.
   ============================================================ */

var customChart = null; // Aktif Chart.js instance
var _chartData = null;  // Grafik icin yuklenen ham veri

function renderEdaChart() {
  var panel = document.getElementById("edaChart");
  if (!panel || !edaResults) return;

  var headers = aHeaders || [];
  var html = '';

  html += '<div class="eda-section">';
  html += '<h4><i class="fas fa-chart-pie"></i> Grafik Olustur</h4>';

  html += '<div class="chart-builder">';

  // Chart type
  html += '<div class="chart-builder-row">';
  html += '<div class="filter-field">';
  html += '<label>Grafik Turu</label>';
  html += '<select id="chartTypeSelect">';
  html += '<option value="bar">Cubuk (Bar)</option>';
  html += '<option value="line">Cizgi (Line)</option>';
  html += '<option value="pie">Pasta (Pie)</option>';
  html += '<option value="doughnut">Halka (Doughnut)</option>';
  html += '<option value="scatter">Sacilim (Scatter)</option>';
  html += '</select></div>';

  // X axis
  html += '<div class="filter-field">';
  html += '<label>X Ekseni</label>';
  html += '<select id="chartXSelect">';
  headers.forEach(function (h, ci) {
    html += '<option value="' + ci + '">' + escapeHtml(String(h)) + '</option>';
  });
  html += '</select></div>';

  // Y axis
  html += '<div class="filter-field">';
  html += '<label>Y Ekseni</label>';
  html += '<select id="chartYSelect">';
  headers.forEach(function (h, ci) {
    html += '<option value="' + ci + '"' + (ci === 1 ? ' selected' : '') + '>' + escapeHtml(String(h)) + '</option>';
  });
  html += '</select></div>';

  html += '</div>'; // chart-builder-row

  // Aggregation
  html += '<div class="chart-builder-row">';
  html += '<div class="filter-field">';
  html += '<label>Y Agregasyon</label>';
  html += '<select id="chartAggSelect">';
  html += '<option value="count" selected>Sayi (Count)</option>';
  html += '<option value="sum">Toplam (Sum)</option>';
  html += '<option value="avg">Ortalama (Avg)</option>';
  html += '<option value="min">Minimum</option>';
  html += '<option value="max">Maximum</option>';
  html += '<option value="none">Yok (ilk 100 satir)</option>';
  html += '</select></div>';

  html += '<div class="filter-field">';
  html += '<label>Limit (Top N)</label>';
  html += '<input type="number" id="chartLimitInput" value="20" min="5" max="100">';
  html += '</div>';

  html += '<div class="filter-field" style="align-self:flex-end;">';
  html += '<button class="btn-clean btn-clean-bulk" onclick="generateCustomChart()"><i class="fas fa-chart-bar"></i> Grafik Olustur</button>';
  html += '</div>';
  html += '</div>'; // chart-builder-row

  html += '</div>'; // chart-builder

  // Chart canvas
  html += '<div class="custom-chart-area" id="customChartArea" style="display:none;">';
  html += '<div class="custom-chart-toolbar">';
  html += '<button class="btn-sm" onclick="exportChartPNG()"><i class="fas fa-image"></i> PNG</button>';
  html += '</div>';
  html += '<div class="custom-chart-container"><canvas id="customChartCanvas"></canvas></div>';
  html += '</div>';

  html += '</div>';

  panel.innerHTML = html;
}

async function generateCustomChart() {
  if (!currentReport) return;

  var chartType = document.getElementById("chartTypeSelect").value;
  var xCol = parseInt(document.getElementById("chartXSelect").value);
  var yCol = parseInt(document.getElementById("chartYSelect").value);
  var agg = document.getElementById("chartAggSelect").value;
  var limit = parseInt(document.getElementById("chartLimitInput").value) || 20;

  var headers = aHeaders || [];

  // Backend'den veri al (henuz yuklenmemisse)
  if (!_chartData) {
    try {
      var res = await fetch(API_BASE + "/api/analysis/" + currentReport.id + "/export", {
        method: "POST",
        headers: getAuthHeaders(),
        credentials: "include",
      });
      var result = await res.json();
      _chartData = result.data; // [[headers], [row1], ...]
    } catch (e) {
      alert("Veri yuklenemedi: " + e.message);
      return;
    }
  }

  if (!_chartData || _chartData.length < 2) {
    alert("Grafik icin yeterli veri yok.");
    return;
  }

  var chartHeaders = _chartData[0];
  var rows = _chartData.slice(1);

  var labels = [];
  var values = [];

  if (agg === "none") {
    // Raw values — first 100
    var sliced = rows.slice(0, Math.min(limit, 100));
    labels = sliced.map(function (r) {
      var v = r[xCol];
      var s = v === null ? "NULL" : String(v);
      return s.length > 20 ? s.substring(0, 17) + "..." : s;
    });

    if (chartType === "scatter") {
      values = sliced.map(function (r) {
        return { x: parseFloat(r[xCol]) || 0, y: parseFloat(r[yCol]) || 0 };
      });
    } else {
      values = sliced.map(function (r) { return parseFloat(r[yCol]) || 0; });
    }
  } else {
    // Aggregation: group by X column
    var groups = {};
    rows.forEach(function (r) {
      var key = r[xCol] === null ? "NULL" : String(r[xCol]);
      if (!groups[key]) groups[key] = [];
      groups[key].push(parseFloat(r[yCol]) || 0);
    });

    var entries = Object.keys(groups).map(function (key) {
      var vals = groups[key];
      var aggVal;
      switch (agg) {
        case "count": aggVal = vals.length; break;
        case "sum": aggVal = vals.reduce(function (s, v) { return s + v; }, 0); break;
        case "avg": aggVal = vals.reduce(function (s, v) { return s + v; }, 0) / vals.length; break;
        case "min": aggVal = Math.min.apply(null, vals); break;
        case "max": aggVal = Math.max.apply(null, vals); break;
        default: aggVal = vals.length;
      }
      return { key: key, value: Math.round(aggVal * 100) / 100 };
    });

    // Sort by value desc and limit
    entries.sort(function (a, b) { return b.value - a.value; });
    entries = entries.slice(0, limit);

    labels = entries.map(function (e) {
      return e.key.length > 20 ? e.key.substring(0, 17) + "..." : e.key;
    });
    values = entries.map(function (e) { return e.value; });
  }

  // Show chart area
  var area = document.getElementById("customChartArea");
  if (area) area.style.display = "block";

  // Destroy old chart
  if (customChart) { customChart.destroy(); customChart = null; }

  var ctx = document.getElementById("customChartCanvas");
  if (!ctx) return;

  var isLight = document.documentElement.classList.contains("light");
  var gridColor = isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.04)";
  var tickColor = isLight ? "#64748b" : "#8892a8";

  var colors = [
    "rgba(79,143,247,0.7)", "rgba(34,197,94,0.7)", "rgba(245,158,11,0.7)",
    "rgba(168,85,247,0.7)", "rgba(239,68,68,0.7)", "rgba(20,184,166,0.7)",
    "rgba(244,114,182,0.7)", "rgba(99,102,241,0.7)", "rgba(16,185,129,0.7)",
    "rgba(251,146,60,0.7)"
  ];

  var isPie = chartType === "pie" || chartType === "doughnut";
  var isScatter = chartType === "scatter";

  var dataset = {
    label: chartHeaders[yCol] + (agg !== "none" ? " (" + agg + ")" : ""),
    data: values,
    backgroundColor: isPie ? colors.slice(0, values.length) : colors[0],
    borderColor: isPie ? colors.map(function (c) { return c.replace("0.7", "1"); }) : colors[0].replace("0.7", "1"),
    borderWidth: isPie ? 2 : 1,
    borderRadius: chartType === "bar" ? 4 : 0,
    tension: chartType === "line" ? 0.3 : 0,
    fill: chartType === "line",
    pointRadius: (chartType === "line" || isScatter) ? 4 : 0,
  };

  var options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      title: {
        display: true,
        text: chartHeaders[xCol] + " vs " + chartHeaders[yCol] + (agg !== "none" ? " (" + agg + ")" : ""),
        color: tickColor,
        font: { size: 13, weight: "600" },
      },
      legend: { display: isPie, position: "right", labels: { color: tickColor, font: { size: 10 } } },
    },
  };

  if (!isPie && !isScatter) {
    options.scales = {
      y: { beginAtZero: true, ticks: { color: tickColor, font: { size: 10 } }, grid: { color: gridColor } },
      x: { ticks: { color: tickColor, font: { size: 10 }, maxRotation: 45 }, grid: { display: false } },
    };
  }
  if (isScatter) {
    options.scales = {
      x: { title: { display: true, text: chartHeaders[xCol], color: tickColor }, ticks: { color: tickColor }, grid: { color: gridColor } },
      y: { title: { display: true, text: chartHeaders[yCol], color: tickColor }, ticks: { color: tickColor }, grid: { color: gridColor } },
    };
  }

  customChart = new Chart(ctx, {
    type: chartType,
    data: { labels: isPie || !isScatter ? labels : undefined, datasets: [dataset] },
    options: options,
  });
}

function exportChartPNG() {
  if (!customChart) return;
  var url = customChart.toBase64Image("image/png", 1.0);
  var a = document.createElement("a");
  a.href = url;
  a.download = (currentReport ? currentReport.title : "grafik") + ".png";
  a.click();
}
