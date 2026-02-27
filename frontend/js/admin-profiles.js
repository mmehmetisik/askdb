/* ============================================================
   admin-profiles.js  —  Admin panel: table access profiles
   ============================================================ */

async function fetchProfiles() {
    try {
        var res = await fetch(API_BASE + "/api/table-profiles", { headers: getAuthHeaders(), credentials: "include" });
        var data = await res.json();
        var container = document.getElementById("profileList");
        if (data.success && data.profiles && data.profiles.length > 0) {
            allProfiles = data.profiles;
            container.innerHTML = '<div class="profile-grid">' + data.profiles.map(function (p) {
                var tables = [];
                try { tables = JSON.parse(p.allowed_tables || "[]"); } catch (e) {}
                return '<div class="profile-card">' +
                    '<div class="profile-card-header">' +
                        '<span class="profile-card-name"><i class="fas fa-shield-alt" style="color:var(--accent-secondary);"></i> ' + escapeHtml(p.name) + "</span>" +
                        '<div class="profile-card-actions">' +
                            '<button class="btn-sm info" onclick="editProfile(' + p.id + ')"><i class="fas fa-edit"></i></button>' +
                            '<button class="btn-sm danger" onclick="deleteProfile(' + p.id + ')"><i class="fas fa-trash"></i></button>' +
                        "</div>" +
                    "</div>" +
                    '<div class="profile-card-desc">' + escapeHtml(p.description || t("admin.profiles.noDescription")) + "</div>" +
                    '<div class="profile-card-count"><i class="fas fa-table"></i> ' + t("admin.profiles.tableAccess", {count: tables.length}) + "</div>" +
                "</div>";
            }).join("") + "</div>";
        } else {
            allProfiles = [];
            container.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding:20px;">' + t("common.noResults") + '</p>';
        }
        updateProfileDropdowns();
        loadProfileTables();
    } catch (e) { console.error("Profiller yuklenemedi", e); }
}

function updateProfileDropdowns() {
    var selects = [document.getElementById("newProfileId")];
    selects.forEach(function (sel) {
        if (!sel) return;
        var current = sel.value;
        sel.innerHTML = '<option value="">' + t("admin.users.profileNone") + '</option>';
        allProfiles.forEach(function (p) {
            sel.innerHTML += '<option value="' + p.id + '">' + escapeHtml(p.name) + "</option>";
        });
        sel.value = current;
    });
}

async function loadProfileTables() {
    var area = document.getElementById("profileTablesArea");
    if (!area) return;
    try {
        var res = await fetch(API_BASE + "/api/db-connections", { headers: getAuthHeaders(), credentials: "include" });
        var data = await res.json();
        if (data.success && data.connections) {
            var tables = [];
            data.connections.forEach(function (c) {
                var tbl = [];
                try { tbl = JSON.parse(c.allowed_tables || "[]"); } catch (e) {}
                tbl.forEach(function (name) {
                    if (tables.indexOf(name) < 0) tables.push(name);
                });
            });
            allAllowedTables = tables;
            if (tables.length === 0) {
                area.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">' + t("admin.profiles.noTablesAvailable") + '</p>';
                return;
            }
            area.innerHTML = tables.map(function (t) {
                return '<label class="table-check" onclick="toggleTableCheck(this)">' +
                    '<input type="checkbox" value="' + escapeHtml(t) + '">' +
                    '<i class="fas fa-table" style="font-size:0.72rem;"></i> ' + escapeHtml(t) +
                    "</label>";
            }).join("");
        }
    } catch (e) {
        area.innerHTML = '<p style="color:#fca5a5;">' + t("admin.profiles.tablesLoadError") + '</p>';
    }
}

document.getElementById("createProfileForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    var msg = document.getElementById("profileStatusMsg");
    var name = document.getElementById("profileName").value;
    var desc = document.getElementById("profileDesc").value;
    var area = document.getElementById("profileTablesArea");
    var tables = [];
    area.querySelectorAll('input[type="checkbox"]:checked').forEach(function (cb) { tables.push(cb.value); });

    msg.style.display = "block";
    msg.style.color = "#f59e0b";
    msg.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + t("common.loading");
    try {
        var res = await fetch(API_BASE + "/api/table-profiles", {
            method: "POST",
            headers: getAuthHeaders(),
            credentials: "include",
            body: JSON.stringify({ name: name, description: desc, allowed_tables: tables })
        });
        var data = await res.json();
        if (data.success) {
            msg.style.color = "#4ade80";
            msg.innerHTML = '<i class="fas fa-check-circle"></i> ' + t("admin.profiles.created");
            document.getElementById("profileName").value = "";
            document.getElementById("profileDesc").value = "";
            area.querySelectorAll('input[type="checkbox"]').forEach(function (cb) { cb.checked = false; cb.closest(".table-check").classList.remove("selected"); });
            fetchProfiles();
        } else {
            msg.style.color = "#fca5a5";
            msg.textContent = data.detail || t("common.error");
        }
    } catch (e) {
        msg.style.color = "#fca5a5";
        msg.innerHTML = '<i class="fas fa-wifi"></i> ' + t("common.connectionError");
    }
});

async function deleteProfile(id) {
    if (!confirm(t("admin.profiles.confirmDelete"))) return;
    try {
        var res = await fetch(API_BASE + "/api/table-profiles/" + id, { method: "DELETE", headers: getAuthHeaders(), credentials: "include" });
        var data = await res.json();
        if (data.success) fetchProfiles();
        else alert(data.detail || t("common.error"));
    } catch (e) { alert(t("common.connectionError")); }
}

async function editProfile(id) {
    var profile = allProfiles.find(function (p) { return p.id === id; });
    if (!profile) return;
    var tables = [];
    try { tables = JSON.parse(profile.allowed_tables || "[]"); } catch (e) {}
    var newName = prompt(t("admin.profiles.profileNamePrompt"), profile.name);
    if (!newName) return;
    try {
        var res = await fetch(API_BASE + "/api/table-profiles/" + id, {
            method: "PUT",
            headers: getAuthHeaders(),
            credentials: "include",
            body: JSON.stringify({ name: newName, description: profile.description, allowed_tables: tables })
        });
        var data = await res.json();
        if (data.success) fetchProfiles();
        else alert(data.detail || t("common.error"));
    } catch (e) { alert(t("common.connectionError")); }
}

async function changeUserProfile(userId) {
    var options = ["0 - " + t("admin.users.profileNone")];
    allProfiles.forEach(function (p) { options.push(p.id + " - " + p.name); });
    var choice = prompt(t("admin.users.selectProfile") + "\n" + options.join("\n"));
    if (choice === null) return;
    var profileId = parseInt(choice) || null;
    if (choice.trim() === "0") profileId = null;
    try {
        var res = await fetch(API_BASE + "/api/users/" + userId + "/profile", {
            method: "PATCH",
            headers: getAuthHeaders(),
            credentials: "include",
            body: JSON.stringify({ table_profile_id: profileId })
        });
        var data = await res.json();
        if (data.success) fetchUsers();
        else alert(data.detail || t("common.error"));
    } catch (e) { alert(t("common.connectionError")); }
}
