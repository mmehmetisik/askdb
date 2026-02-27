/* ============================================================
   stats.js  —  Numeric statistics bar
   ============================================================ */

function renderStats(data) {
  var statsBar = document.getElementById("statsBar");
  if (!statsBar || !data || data.length < 2 || data[0][0] === "Hata" || data[0][0] === "Sonuc Yok") {
    if (statsBar) statsBar.style.display = "none";
    return;
  }

  var headers = data[0];
  var rows = data.slice(1);
  var statItems = [];

  headers.forEach(function (header, colIndex) {
    var nums = rows.map(function (r) { return parseFloat(r[colIndex]); }).filter(function (n) { return !isNaN(n); });
    if (nums.length === 0 || nums.length < rows.length * 0.5) return;

    var min = Math.min.apply(null, nums);
    var max = Math.max.apply(null, nums);
    var sum = nums.reduce(function (a, b) { return a + b; }, 0);
    var avg = sum / nums.length;

    statItems.push(
      '<span class="stat-item"><span class="stat-label">' + escapeHtml(header) + ":</span>" +
      ' Min <span class="stat-value">' + fmtNum(min) + "</span>" +
      ' Max <span class="stat-value">' + fmtNum(max) + "</span>" +
      ' Ort <span class="stat-value">' + fmtNum(avg) + "</span>" +
      ' Top <span class="stat-value">' + fmtNum(sum) + "</span></span>"
    );
  });

  if (statItems.length > 0) {
    statsBar.innerHTML = statItems.join("");
    statsBar.style.display = "flex";
  } else {
    statsBar.style.display = "none";
  }
}
