/* ============================================================
   report-send.js  —  Sorgu ekranindan rapor gonderme
   ============================================================ */

async function openReportModal() {
  var modal = document.getElementById("reportModal");
  if (!modal) return;

  // Rapor bilgisini doldur
  var rowCount = lastResultData ? lastResultData.length - 1 : 0;
  var colCount = lastResultData && lastResultData[0] ? lastResultData[0].length : 0;
  document.getElementById("reportDataInfo").textContent = t("report.dataInfo", {rows: rowCount, cols: colCount});
  document.getElementById("reportTitle").value = "";
  document.getElementById("reportNote").value = "";

  // Reporter listesini yukle
  var select = document.getElementById("reportAssignee");
  select.innerHTML = '<option value="">' + t("common.loading") + '</option>';

  try {
    var res = await fetch(API_BASE + "/api/reporters", { headers: getAuthHeaders(), credentials: "include" });
    if (res.ok) {
      var data = await res.json();
      if (data.users && data.users.length > 0) {
        var html = '<option value="">-- ' + t("report.assignee") + ' --</option>';
        data.users.forEach(function (u) {
          var uid = u.id || (typeof u === "object" ? u[0] : u);
          var uname = u.username || (typeof u === "object" ? u[1] : u);
          var urole = u.role || (typeof u === "object" ? u[2] : "");
          html += '<option value="' + uid + '">' + escapeHtml(uname) + ' (' + urole + ')</option>';
        });
        select.innerHTML = html;
      } else {
        select.innerHTML = '<option value="">-</option>';
      }
    }
  } catch (e) {
    select.innerHTML = '<option value="">' + t("common.error") + '</option>';
  }

  modal.style.display = "flex";
}

function closeReportModal() {
  var modal = document.getElementById("reportModal");
  if (modal) modal.style.display = "none";
}

async function sendReport() {
  var title = document.getElementById("reportTitle").value.trim();
  if (!title) {
    alert(t("report.titleRequired"));
    return;
  }

  var assigneeId = document.getElementById("reportAssignee").value;
  var note = document.getElementById("reportNote").value.trim();
  var btn = document.getElementById("sendReportSubmit");

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + t("common.loading");

  try {
    // Son sorgunun SQL'ini bul
    var sql = "";
    var sqlOutput = document.getElementById("sqlOutput");
    if (sqlOutput) sql = sqlOutput.textContent || "";

    var body = {
      title: title,
      assigned_to: assigneeId ? parseInt(assigneeId) : null,
      note: note,
      original_sql: sql,
      result_data: lastResultData || [],
      column_types: lastColumnTypes || [],
      row_count: lastResultData ? lastResultData.length - 1 : 0,
    };

    var res = await fetch(API_BASE + "/api/reports", {
      method: "POST",
      headers: getAuthHeaders(),
      credentials: "include",
      body: JSON.stringify(body),
    });

    if (handleAuthError(res)) return;
    var data = await res.json();

    if (res.ok && data.success) {
      closeReportModal();
      _showToast(t("report.sendSuccess"), "success");
      // Sidebar rapor listesini guncelle
      if (typeof refreshReportsList === "function") refreshReportsList();
    } else {
      alert(data.detail || t("report.sendError"));
    }
  } catch (e) {
    alert(t("common.serverError", {status: ""}) + " " + e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane"></i> ' + t("common.send");
  }
}

function _showToast(msg, type) {
  var toast = document.createElement("div");
  toast.className = "toast-msg toast-" + (type || "info");
  toast.innerHTML = '<i class="fas fa-check-circle"></i> ' + escapeHtml(msg);
  document.body.appendChild(toast);
  setTimeout(function () { toast.classList.add("show"); }, 10);
  setTimeout(function () {
    toast.classList.remove("show");
    setTimeout(function () { toast.remove(); }, 300);
  }, 3000);
}
