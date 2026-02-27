/* ============================================================
   chart.js  —  Chart.js rendering (Bar / Pie / Line)
   ============================================================ */

var myChartInstance = null;

function setChartType(type) {
  currentChartType = type;
  document.querySelectorAll(".chart-type-btn").forEach(function (btn) {
    btn.classList.toggle("active", btn.dataset.type === type);
  });
  if (lastResultData) renderChart(lastResultData, type);
}

function renderChart(data, chartType) {
  var chartSection = document.getElementById("chartSection");
  chartType = chartType || "bar";

  if (!data || data.length < 2 || data[0].length < 2 || data[0][0] === "Sonuc Yok" || data[0][0] === "Hata") {
    chartSection.style.display = "none";
    return;
  }

  var labels = [], values = [];
  for (var i = 1; i < data.length; i++) {
    labels.push(data[i][0]);
    values.push(parseFloat(data[i][1]));
  }

  if (values.some(isNaN)) { chartSection.style.display = "none"; return; }

  chartSection.style.display = "block";
  if (myChartInstance) myChartInstance.destroy();

  var isLight = document.documentElement.classList.contains("light");
  var gridColor = isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.03)";
  var tickColor = isLight ? "#64748b" : "#8892a8";

  var colors = [
    "rgba(79,143,247,0.7)", "rgba(124,92,252,0.7)", "rgba(34,197,94,0.7)",
    "rgba(245,158,11,0.7)", "rgba(239,68,68,0.7)", "rgba(168,85,247,0.7)",
    "rgba(20,184,166,0.7)", "rgba(244,63,94,0.7)", "rgba(99,102,241,0.7)",
    "rgba(234,179,8,0.7)"
  ];
  var borderColors = colors.map(function (c) { return c.replace("0.7", "1"); });
  var isPie = chartType === "pie";

  var datasetConfig = {
    label: data[0][1], data: values,
    backgroundColor: isPie ? colors.slice(0, values.length) : "rgba(79,143,247,0.5)",
    borderColor: isPie ? borderColors.slice(0, values.length) : "rgba(79,143,247,0.9)",
    borderWidth: isPie ? 2 : 1,
    borderRadius: chartType === "bar" ? 4 : 0,
    hoverBackgroundColor: isPie ? undefined : "rgba(124,92,252,0.7)",
    tension: chartType === "line" ? 0.3 : 0,
    fill: chartType === "line",
    pointBackgroundColor: "rgba(79,143,247,0.9)",
    pointRadius: chartType === "line" ? 4 : 0,
  };

  var options = {
    responsive: true, maintainAspectRatio: true,
    plugins: {
      legend: {
        display: isPie, position: "right",
        labels: { color: tickColor, font: { family: "Inter", size: 11 }, padding: 12 },
      },
    },
  };

  if (!isPie) {
    options.scales = {
      y: { beginAtZero: true, ticks: { color: tickColor, font: { family: "Inter" } }, grid: { color: gridColor } },
      x: { ticks: { color: tickColor, font: { family: "Inter" } }, grid: { display: false } },
    };
  }

  var ctx = document.getElementById("myChart");
  myChartInstance = new Chart(ctx, {
    type: chartType === "pie" ? "doughnut" : chartType,
    data: { labels: labels, datasets: [datasetConfig] },
    options: options,
  });
}
