/* ============================================================
   admin-app.js  —  Admin panel: common utils, tab switching, init
   Requires: store.js (loaded before this file)
   ============================================================ */

// API_BASE shared via store.js / helpers.js — no duplicate declaration needed
if (typeof API_BASE === "undefined") var API_BASE = "";
var currentUsers = [];
var currentConns = [];
var trinoStatus = { active: false, conn_id: null };
var allProfiles = [];
var allAllowedTables = [];

function escapeHtml(text) {
    var div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

function getAuthHeaders() {
    var headers = { "Content-Type": "application/json" };
    if (typeof I18n !== "undefined") {
        headers["X-Lang"] = I18n.getLang();
    }
    return headers;
}

function handleAuthError(res) {
    if (res.status === 401) {
        fetch(API_BASE + "/api/logout", { method: "POST", credentials: "include" }).finally(function () {
            localStorage.clear();
            window.location.href = "login.html";
        });
        return true;
    }
    return false;
}

function logout() {
    fetch(API_BASE + "/api/logout", { method: "POST", credentials: "include" }).finally(function () {
        localStorage.clear();
        window.location.href = "login.html";
    });
}

// ── Tab Switch ──
function switchTab(tab) {
    document.querySelectorAll(".admin-tab").forEach(function (t) { t.classList.remove("active"); });
    document.querySelectorAll(".tab-content").forEach(function (t) { t.classList.remove("active"); });
    document.getElementById("tab-" + tab).classList.add("active");
    event.target.closest(".admin-tab").classList.add("active");
    if (tab === "databases") fetchConnections();
    if (tab === "stats") fetchStats();
    if (tab === "profiles") fetchProfiles();
}

// ── Trino Status ──
async function fetchTrinoStatus() {
    try {
        var res = await fetch(API_BASE + "/api/trino/status", { headers: getAuthHeaders(), credentials: "include" });
        if (res.ok) {
            trinoStatus = await res.json();
        }
    } catch (e) { /* ignore */ }
}

// ── Init ──
window.addEventListener("DOMContentLoaded", function () {
    fetchUsers();
    fetch(API_BASE + "/api/table-profiles", { headers: getAuthHeaders(), credentials: "include" })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (data.success && data.profiles) {
                allProfiles = data.profiles;
                updateProfileDropdowns();
            }
        }).catch(function () {});
});
