/* ============================================================
   data-cleaning.js  —  Veri Temizleme Paneli (v2 - Backend Powered)
   Tum islemler backend API uzerinden yapilir.
   previewAndApply() analysis-app.js'den cagirilir.
   ============================================================ */

function renderEdaCleaning() {
  var panel = document.getElementById("edaCleaning");
  if (!panel || !edaResults) return;

  var html = '';

  // ── Section 1: NULL Doldurma ──
  var nullCols = edaResults.columns.filter(function (c) { return c.nullCount > 0; });

  html += '<div class="eda-section">';
  html += '<h4><i class="fas fa-fill-drip"></i> Eksik Deger Doldurma</h4>';

  if (nullCols.length === 0) {
    html += '<div class="cleaning-ok"><i class="fas fa-check-circle"></i> Eksik deger yok, temizleme gerekmiyor.</div>';
  } else {
    html += '<div class="cleaning-cards">';
    nullCols.forEach(function (col) {
      var isNumeric = col.colType === "numeric";
      html += '<div class="cleaning-card">';
      html += '<div class="cleaning-card-header">';
      html += '<span class="eda-col-name">' + escapeHtml(col.name) + '</span>';
      html += '<span class="cleaning-null-count">' + fmtNum(col.nullCount) + ' eksik</span>';
      html += '</div>';
      html += '<div class="cleaning-card-actions">';

      if (isNumeric) {
        var meanVal = col.stats && col.stats.mean !== undefined ? fmtNum(col.stats.mean) : "?";
        var medVal = col.stats && col.stats.median !== undefined ? fmtNum(col.stats.median) : "?";
        html += '<button class="btn-clean" onclick="cleanOp(\'fill_mean\',\'' + escapeHtml(col.name) + '\')"><i class="fas fa-calculator"></i> Ort (' + meanVal + ')</button>';
        html += '<button class="btn-clean" onclick="cleanOp(\'fill_median\',\'' + escapeHtml(col.name) + '\')"><i class="fas fa-arrows-alt-h"></i> Med (' + medVal + ')</button>';
      }

      html += '<button class="btn-clean" onclick="cleanOp(\'fill_mode\',\'' + escapeHtml(col.name) + '\')"><i class="fas fa-chart-bar"></i> Mod';
      if (col.topValues && col.topValues.length > 0) html += ' (' + escapeHtml(String(col.topValues[0].value).substring(0, 15)) + ')';
      html += '</button>';

      html += '<button class="btn-clean" onclick="cleanOpParam(\'fill_constant\',\'' + escapeHtml(col.name) + '\')"><i class="fas fa-pen"></i> Sabit</button>';
      html += '<button class="btn-clean" onclick="cleanOp(\'fill_ffill\',\'' + escapeHtml(col.name) + '\')"><i class="fas fa-arrow-down"></i> Onceki</button>';
      html += '<button class="btn-clean" onclick="cleanOp(\'fill_bfill\',\'' + escapeHtml(col.name) + '\')"><i class="fas fa-arrow-up"></i> Sonraki</button>';
      html += '</div></div>';
    });
    html += '</div>';
  }
  html += '</div>';

  // ── Section 2: Outlier Clipping ──
  var outlierCols = edaResults.columns.filter(function (c) { return c.colType === "numeric" && c.outlierCount > 0; });

  html += '<div class="eda-section">';
  html += '<h4><i class="fas fa-cut"></i> Aykiri Deger Islemleri</h4>';

  if (outlierCols.length === 0) {
    html += '<div class="cleaning-ok"><i class="fas fa-check-circle"></i> Aykiri deger yok.</div>';
  } else {
    html += '<div class="cleaning-cards">';
    outlierCols.forEach(function (col) {
      html += '<div class="cleaning-card">';
      html += '<div class="cleaning-card-header">';
      html += '<span class="eda-col-name">' + escapeHtml(col.name) + '</span>';
      html += '<span class="cleaning-outlier-count">' + fmtNum(col.outlierCount) + ' aykiri</span>';
      html += '</div>';
      if (col.outlierBounds) {
        html += '<div class="cleaning-range">Normal aralik: ' + fmtNum(col.outlierBounds.lower) + ' — ' + fmtNum(col.outlierBounds.upper) + '</div>';
      }
      html += '<div class="cleaning-card-actions">';
      html += '<button class="btn-clean" onclick="cleanOp(\'clip_outliers_iqr\',\'' + escapeHtml(col.name) + '\')"><i class="fas fa-compress-arrows-alt"></i> IQR Kirp</button>';
      html += '<button class="btn-clean" onclick="cleanOp(\'replace_outliers_median\',\'' + escapeHtml(col.name) + '\')"><i class="fas fa-exchange-alt"></i> Medyan</button>';
      html += '<button class="btn-clean btn-clean-danger" onclick="cleanOp(\'drop_outlier_rows\',\'' + escapeHtml(col.name) + '\')"><i class="fas fa-trash"></i> Satirlari Sil</button>';
      html += '</div></div>';
    });
    html += '</div>';
  }
  html += '</div>';

  // ── Section 3: Duplicate Silme ──
  html += '<div class="eda-section">';
  html += '<h4><i class="fas fa-clone"></i> Duplike Satir Silme</h4>';

  if (edaResults.duplicates.count === 0) {
    html += '<div class="cleaning-ok"><i class="fas fa-check-circle"></i> Duplike satir yok.</div>';
  } else {
    html += '<div class="cleaning-dup-info">';
    html += '<span class="cleaning-dup-count">' + fmtNum(edaResults.duplicates.count) + '</span> duplike satir bulundu.';
    html += '</div>';
    html += '<button class="btn-clean btn-clean-bulk" onclick="openDupModal()"><i class="fas fa-eye"></i> Duplikeleri Incele ve Sil</button>';
  }
  html += '</div>';

  // ── Section 4: Genel Temizlik ──
  var textCols = edaResults.columns.filter(function (c) { return c.colType === "text"; });

  if (textCols.length > 0) {
    html += '<div class="eda-section">';
    html += '<h4><i class="fas fa-magic"></i> Metin Temizleme</h4>';
    html += '<div class="cleaning-cards">';
    textCols.forEach(function (col) {
      html += '<div class="cleaning-card">';
      html += '<div class="cleaning-card-header">';
      html += '<span class="eda-col-name">' + escapeHtml(col.name) + '</span>';
      html += '<span class="cleaning-null-count">' + fmtNum(col.uniqueCount) + ' benzersiz</span>';
      html += '</div>';
      html += '<div class="cleaning-card-actions">';
      html += '<button class="btn-clean" onclick="cleanOp(\'trim_whitespace\',\'' + escapeHtml(col.name) + '\')"><i class="fas fa-eraser"></i> Bosluk Temizle</button>';
      html += '<button class="btn-clean" onclick="cleanOpParam(\'change_case\',\'' + escapeHtml(col.name) + '\')"><i class="fas fa-font"></i> Harf Donusumu</button>';
      html += '<button class="btn-clean" onclick="cleanOpParam(\'find_replace\',\'' + escapeHtml(col.name) + '\')"><i class="fas fa-search"></i> Bul & Degistir</button>';
      html += '</div></div>';
    });
    html += '</div></div>';
  }

  // ── Section 5: Islem Gecmisi ──
  html += '<div class="eda-section">';
  html += '<h4><i class="fas fa-history"></i> Islem Gecmisi</h4>';
  html += '<div id="cleaningOpHistory"></div>';
  html += '</div>';

  panel.innerHTML = html;

  // Islem gecmisini renderla
  _renderCleaningHistory();
}

function _renderCleaningHistory() {
  var container = document.getElementById("cleaningOpHistory");
  if (!container) return;

  if (!aOperationHistory || aOperationHistory.length === 0) {
    container.innerHTML = '<div class="cleaning-ok"><i class="fas fa-check-circle"></i> Henuz islem yapilmadi.</div>';
    return;
  }

  var html = '<div class="op-history-list">';
  aOperationHistory.forEach(function (op, i) {
    html += '<div class="op-history-item">';
    html += '<span class="op-num">' + (i + 1) + '.</span>';
    html += '<span class="op-desc">' + escapeHtml(op.description) + '</span>';
    html += '<span class="op-affected">' + fmtNum(op.affected_rows) + ' satir</span>';
    html += '</div>';
  });
  html += '</div>';

  html += '<div class="op-history-actions">';
  html += '<button class="btn-clean" onclick="undoLastOperation()"><i class="fas fa-undo"></i> Geri Al</button>';
  html += '<button class="btn-clean btn-clean-danger" onclick="resetAllOperations()"><i class="fas fa-trash-restore"></i> Tumu Sifirla</button>';
  html += '</div>';

  container.innerHTML = html;
}

/**
 * Parametresiz operasyonlar — dogrudan previewAndApply'a gonder
 */
function cleanOp(operation, colName) {
  if (typeof previewAndApply === "function") {
    previewAndApply(operation, colName, {});
  }
}

/**
 * Parametreli operasyonlar — promptAndApply'a gonder
 */
function cleanOpParam(operation, colName) {
  if (typeof promptAndApply === "function") {
    promptAndApply(operation, colName);
  }
}
