/* ============================================================
   ml-sender.js  —  ML'e Gonderme Altyapisi (v2 - Backend Powered)
   Temizlenmis veriyi ML sayfasina gondermek icin API entegrasyonu.
   Backend export endpoint'inden veri alir.
   ============================================================ */

async function openSendToMLModal() {
  if (!currentReport) {
    alert("Oncelikle bir rapor secin.");
    return;
  }

  var rowCount = aTotalRows || 0;
  var colCount = aHeaders ? aHeaders.length : 0;
  var opCount = aOperationHistory ? aOperationHistory.length : 0;

  var overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.id = "mlModal";
  overlay.onclick = function (e) { if (e.target === overlay) overlay.remove(); };

  var colOptions = '<option value="">Secilmedi</option>';
  if (aHeaders) {
    aHeaders.forEach(function (h, ci) {
      colOptions += '<option value="' + ci + '">' + escapeHtml(String(h)) + '</option>';
    });
  }

  overlay.innerHTML =
    '<div class="modal-card" style="width:500px;">' +
    '<div class="modal-header">' +
    '<h3><i class="fas fa-brain"></i> ML Studio\'ya Gonder</h3>' +
    '<button class="modal-close" onclick="closeSendToMLModal()"><i class="fas fa-times"></i></button>' +
    '</div>' +
    '<div class="modal-body">' +
    '<div class="modal-info" style="margin-bottom:16px;">' +
    '<i class="fas fa-info-circle"></i>' +
    '<span>Temizlenmis veri ML Studio\'ya gonderilecek. Data scientist bu veriyi modelleme icin kullanabilecek.</span>' +
    '</div>' +

    '<div class="ml-send-summary">' +
    '<div class="ml-send-stat"><span class="ml-send-num">' + fmtNum(rowCount) + '</span><span>Satir</span></div>' +
    '<div class="ml-send-stat"><span class="ml-send-num">' + colCount + '</span><span>Kolon</span></div>' +
    '<div class="ml-send-stat"><span class="ml-send-num">' + opCount + '</span><span>Temizleme</span></div>' +
    '</div>' +

    '<div class="modal-field">' +
    '<label>ML Gorev Basligi</label>' +
    '<input type="text" id="mlTaskTitle" value="' + escapeHtml(currentReport.title) + ' - ML" placeholder="Gorev basligi...">' +
    '</div>' +

    '<div class="modal-field">' +
    '<label>Aciklama / Not</label>' +
    '<textarea id="mlTaskNote" rows="3" placeholder="ML ekibi icin aciklama...">' +
    'Analiz tamamlandi. Veri temizlenmis ve filrelenmis haliyle gonderilmektedir.' +
    '</textarea>' +
    '</div>' +

    '<div class="modal-field">' +
    '<label>Hedef Kolon (opsiyonel)</label>' +
    '<select id="mlTargetCol">' + colOptions + '</select>' +
    '</div>' +

    '</div>' +
    '<div class="modal-footer">' +
    '<button class="btn-cancel" onclick="closeSendToMLModal()">Iptal</button>' +
    '<button class="btn-primary" onclick="sendToML()"><i class="fas fa-paper-plane"></i> Gonder</button>' +
    '</div>' +
    '</div>';

  document.body.appendChild(overlay);
}

function closeSendToMLModal() {
  var m = document.getElementById("mlModal");
  if (m) m.remove();
}

async function sendToML() {
  if (!currentReport) return;

  var titleEl = document.getElementById("mlTaskTitle");
  var noteEl = document.getElementById("mlTaskNote");
  var targetEl = document.getElementById("mlTargetCol");

  var title = titleEl ? titleEl.value.trim() : currentReport.title + " - ML";
  var note = noteEl ? noteEl.value.trim() : "";
  var targetCol = targetEl ? targetEl.value : "";

  if (!title) { alert("Lutfen bir baslik girin."); return; }

  // Backend'den temizlenmis veriyi al
  var exportData = null;
  try {
    var res = await fetch(API_BASE + "/api/analysis/" + currentReport.id + "/export", {
      method: "POST",
      headers: getAuthHeaders(),
      credentials: "include",
    });
    var result = await res.json();
    exportData = result.data;
  } catch (e) {
    alert("Veri yuklenemedi: " + e.message);
    return;
  }

  if (!exportData || exportData.length < 2) {
    alert("Gonderilecek veri yok.");
    return;
  }

  // Prepare payload
  var payload = {
    source_report_id: currentReport.id,
    title: title,
    note: note,
    target_column: targetCol ? parseInt(targetCol) : null,
    data: exportData,
    column_types: [],
    cleaning_steps: aOperationHistory ? aOperationHistory.map(function (h) { return h.description; }) : [],
    filters_applied: [],
    row_count: exportData.length - 1,
    col_count: exportData[0].length,
  };

  try {
    var res2 = await fetch(API_BASE + "/api/ml-tasks", {
      method: "POST",
      headers: getAuthHeaders(),
      credentials: "include",
      body: JSON.stringify(payload),
    });

    if (handleAuthError(res2)) return;
    var data = await res2.json();

    if (data.success) {
      closeSendToMLModal();
      _showMLToast("ML Studio'ya basariyla gonderildi!");
    } else {
      alert("Gonderme hatasi: " + (data.detail || data.error || "Bilinmeyen hata"));
    }
  } catch (e) {
    alert("Baglanti hatasi: " + e.message);
  }
}

function _showMLToast(msg) {
  var existing = document.querySelector(".toast-msg");
  if (existing) existing.remove();
  var t = document.createElement("div");
  t.className = "toast-msg toast-success show";
  t.innerHTML = '<i class="fas fa-brain"></i> ' + escapeHtml(msg);
  document.body.appendChild(t);
  setTimeout(function () { t.classList.remove("show"); setTimeout(function () { t.remove(); }, 300); }, 3000);
}
