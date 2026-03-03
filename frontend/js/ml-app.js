/* ============================================================
   ml-app.js — ML Studio Ana Controller
   Sayfa init, sidebar, tab yonetimi, state.
   ============================================================ */

// Global ML state
var currentMLTask = null;       // Aktif ML task (veri dahil)
var currentJobId = null;        // Aktif egitim job ID
var trainResults = null;        // Son egitim sonuclari
var savedModels = [];           // Kaydedilmis model listesi
var activeMLTab = "config";     // Aktif tab
var pollingInterval = null;     // Polling timer

// =================== INIT ===================

(function initML() {
  _loadUserInfo();
  loadMLTasks();
  loadSavedModels();

  // Theme icon fix
  if (document.documentElement.classList.contains("light")) {
    var btn = document.getElementById("themeToggleBtn");
    if (btn) btn.innerHTML = '<i class="fas fa-sun"></i>';
  }
})();


function _loadUserInfo() {
  var name = localStorage.getItem("username") || "user";
  var role = localStorage.getItem("role") || "data_scientist";
  var avatarEl = document.getElementById("userAvatar");
  var nameEl = document.getElementById("userName");
  var roleEl = document.getElementById("userRole");

  if (avatarEl) avatarEl.textContent = name.charAt(0).toUpperCase();
  if (nameEl) nameEl.textContent = name;
  if (roleEl) {
    var roleMap = { admin: "Admin", data_scientist: "Data Scientist" };
    roleEl.textContent = roleMap[role] || role;
  }
}


// =================== SIDEBAR: ML TASKS ===================

async function loadMLTasks() {
  var listEl = document.getElementById("taskList");
  var badgeEl = document.getElementById("taskBadge");
  if (!listEl) return;

  listEl.innerHTML = '<div class="schema-loading"><i class="fas fa-circle-notch fa-spin"></i> ' + t("common.loading") + '</div>';

  try {
    var res = await fetch(API_BASE + "/api/ml-tasks", { headers: getAuthHeaders(), credentials: "include" });
    if (handleAuthError(res)) return;
    var data = await res.json();

    if (!data.success || !data.tasks || data.tasks.length === 0) {
      listEl.innerHTML = '<div class="schema-empty"><i class="fas fa-inbox"></i> ' + t("ml.noTasks") + '</div>';
      if (badgeEl) badgeEl.style.display = "none";
      return;
    }

    if (badgeEl) {
      badgeEl.textContent = data.tasks.length;
      badgeEl.style.display = "inline";
    }

    var html = "";
    data.tasks.forEach(function (task) {
      var tid = task.id || task[0];
      var title = task.title || task[2] || "Isimsiz";
      var rowCount = task.row_count || task[10] || 0;
      var colCount = task.col_count || task[11] || 0;
      var status = task.status || task[12] || "pending";
      var createdAt = task.created_at || task[13] || "";
      var creator = task.creator_name || task[15] || "";

      var isActive = currentMLTask && currentMLTask.id === tid;
      var dateStr = "";
      if (createdAt) {
        try {
          var d = new Date(createdAt);
          dateStr = d.toLocaleDateString(I18n.getLocale(), { day: "numeric", month: "short" });
        } catch (e) { dateStr = ""; }
      }

      html += '<div class="report-item' + (isActive ? " active" : "") + '" onclick="openMLTask(' + tid + ')">';
      html += '<div style="display:flex;align-items:center;gap:8px;">';
      html += '<i class="fas fa-database" style="color:var(--accent-primary);font-size:0.85rem;"></i>';
      html += '<div style="flex:1;min-width:0;">';
      html += '<div style="font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(title) + '</div>';
      html += '<div style="font-size:0.72rem;color:var(--text-muted);">' + t("common.rowCount", {count: fmtNum(rowCount)}) + ', ' + colCount + ' ' + t("ml.colLabel").toLowerCase();
      if (dateStr) html += ' &middot; ' + dateStr;
      html += '</div>';
      html += '</div></div></div>';
    });

    listEl.innerHTML = html;
  } catch (e) {
    listEl.innerHTML = '<div class="schema-empty"><i class="fas fa-exclamation-triangle"></i> ' + t("analysis.loadError") + '</div>';
  }
}


// =================== SIDEBAR: SAVED MODELS ===================

async function loadSavedModels() {
  var listEl = document.getElementById("modelList");
  var badgeEl = document.getElementById("modelBadge");
  if (!listEl) return;

  try {
    var res = await fetch(API_BASE + "/api/ml/models", { headers: getAuthHeaders(), credentials: "include" });
    if (handleAuthError(res)) return;
    var data = await res.json();

    savedModels = data.success ? (data.models || []) : [];

    if (savedModels.length === 0) {
      listEl.innerHTML = '<div class="schema-empty" style="font-size:0.78rem;padding:12px;"><i class="fas fa-robot"></i> ' + t("ml.noModels") + '</div>';
      if (badgeEl) badgeEl.style.display = "none";
      return;
    }

    if (badgeEl) {
      badgeEl.textContent = savedModels.length;
      badgeEl.style.display = "inline";
    }

    var html = "";
    savedModels.forEach(function (m) {
      html += '<div class="ml-model-item" title="' + escapeHtml(m.model_name + " - " + m.algorithm) + '">';
      html += '<i class="fas fa-robot"></i>';
      html += '<div style="flex:1;min-width:0;">';
      html += '<div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(m.model_name) + '</div>';
      html += '<div class="ml-model-algo">' + escapeHtml(m.algorithm) + '</div>';
      html += '</div>';
      if (m.is_best) html += '<i class="fas fa-crown ml-model-best" title="En iyi model"></i>';
      html += '</div>';
    });

    listEl.innerHTML = html;
  } catch (e) {
    listEl.innerHTML = '<div class="schema-empty" style="font-size:0.78rem;"><i class="fas fa-exclamation-triangle"></i> ' + t("analysis.loadError") + '</div>';
  }
}


// =================== OPEN ML TASK ===================

async function openMLTask(taskId) {
  var emptyEl = document.getElementById("mlEmpty");
  var workspaceEl = document.getElementById("mlWorkspace");
  var titleEl = document.getElementById("mlHeaderTitle");
  var metaEl = document.getElementById("mlMeta");

  try {
    var res = await fetch(API_BASE + "/api/ml/tasks/" + taskId, { headers: getAuthHeaders(), credentials: "include" });
    if (handleAuthError(res)) return;
    var data = await res.json();

    if (!data.success || !data.task) {
      _showMLToast(t("ml.taskLoadError"), "error");
      return;
    }

    currentMLTask = data.task;
    trainResults = null;
    currentJobId = null;
    if (pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; }

    // UI guncelle
    if (emptyEl) emptyEl.style.display = "none";
    if (workspaceEl) workspaceEl.style.display = "";
    if (titleEl) titleEl.innerHTML = '<i class="fas fa-brain"></i> ' + escapeHtml(currentMLTask.title || t("ml.tasks"));
    if (metaEl) {
      metaEl.textContent = t("common.rowCount", {count: fmtNum(currentMLTask.row_count || 0)}) + ", " +
        (currentMLTask.col_count || 0) + " " + t("ml.colLabel").toLowerCase();
    }

    // Sidebar aktif goster
    loadMLTasks();

    // Config panelini render et
    switchMLTab("config");
    renderMLConfig();

  } catch (e) {
    _showMLToast(t("common.connectionError") + ": " + e.message, "error");
  }
}


// =================== TAB SWITCHING ===================

function switchMLTab(tab) {
  activeMLTab = tab;

  // Tab butonlari
  document.querySelectorAll(".eda-tab").forEach(function (btn) {
    btn.classList.toggle("active", btn.getAttribute("data-tab") === tab);
  });

  // Paneller
  var panels = {
    config: "mlConfigPanel",
    leaderboard: "mlLeaderboardPanel",
    viz: "mlVizPanel",
    predict: "mlPredictPanel",
  };
  Object.keys(panels).forEach(function (key) {
    var el = document.getElementById(panels[key]);
    if (el) el.classList.toggle("active", key === tab);
  });

  // Tab icerigini render et (lazily)
  if (tab === "leaderboard" && trainResults) {
    renderLeaderboard(trainResults);
  } else if (tab === "viz" && trainResults) {
    renderViz(trainResults);
  } else if (tab === "predict") {
    renderPredictPanel();
  }
}


// =================== THEME & LOGOUT ===================

function toggleThemeML() {
  var isLight = document.documentElement.classList.toggle("light");
  var mode = isLight ? "light" : "dark";
  localStorage.setItem("theme", mode);
  var btn = document.getElementById("themeToggleBtn");
  if (btn) btn.innerHTML = isLight ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
}

function logoutML() {
  fetch(API_BASE + "/api/logout", { method: "POST", credentials: "include" }).finally(function () {
    localStorage.clear();
    window.location.href = "login.html";
  });
}


// =================== TOAST ===================

function _showMLToast(msg, type) {
  var existing = document.querySelector(".toast-msg");
  if (existing) existing.remove();
  var t = document.createElement("div");
  t.className = "toast-msg " + (type === "error" ? "toast-error" : "toast-success") + " show";
  var icon = type === "error" ? "exclamation-triangle" : "check-circle";
  t.innerHTML = '<i class="fas fa-' + icon + '"></i> ' + escapeHtml(msg);
  document.body.appendChild(t);
  setTimeout(function () {
    t.classList.remove("show");
    setTimeout(function () { t.remove(); }, 300);
  }, 3000);
}
