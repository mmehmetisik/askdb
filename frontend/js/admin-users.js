/* ============================================================
   admin-users.js  —  Admin panel: user management
   ============================================================ */

async function fetchUsers() {
    try {
        var res = await fetch(API_BASE + "/api/users", { headers: getAuthHeaders(), credentials: "include" });
        if (handleAuthError(res)) return;
        var data = await res.json();
        var tbody = document.getElementById("usersTableBody");
        if (data.success && data.users.length > 0) {
            currentUsers = data.users;
            tbody.innerHTML = data.users.map(function (u) {
                var roleMap = {
                    admin: {color: "#f59e0b", bg: "rgba(245,158,11,0.1)", icon: "fa-crown", label: "Admin"},
                    analyst: {color: "#3b82f6", bg: "rgba(59,130,246,0.1)", icon: "fa-terminal", label: "Analyst"},
                    reporter: {color: "#22c55e", bg: "rgba(34,197,94,0.1)", icon: "fa-chart-bar", label: "Reporter"},
                    data_scientist: {color: "#a855f7", bg: "rgba(168,85,247,0.1)", icon: "fa-brain", label: "Data Scientist"}
                };
                var rm = roleMap[u.role] || roleMap.analyst;
                var roleBadge = '<span style="color:' + rm.color + '; background:' + rm.bg + '; padding: 4px 8px; border-radius: 6px;"><i class="fas ' + rm.icon + '"></i> ' + rm.label + "</span>";

                var isAdmin = u.role === "admin";
                var hasTrino = isAdmin || u.trino_access;
                var trinoBadge;
                if (isAdmin) {
                    trinoBadge = '<span class="trino-badge on" title="' + t("admin.users.trinoAlwaysTitle") + '"><i class="fas fa-check"></i> ' + t("admin.users.trinoAlways") + '</span>';
                } else {
                    trinoBadge = '<button class="trino-user-toggle ' + (hasTrino ? "granted" : "denied") + '" onclick="toggleTrinoAccess(' + u.id + ", " + !hasTrino + ')" title="' + t(hasTrino ? "common.delete" : "common.create") + '">' +
                        '<i class="fas ' + (hasTrino ? "fa-check-circle" : "fa-times-circle") + '"></i> ' +
                        t(hasTrino ? "admin.users.trinoActive" : "admin.users.trinoInactive") +
                        "</button>";
                }

                var profileName = u.profile_name || "";
                var profileBadge = profileName
                    ? '<span style="background:rgba(79,143,247,0.1); color:#60a5fa; padding:3px 8px; border-radius:6px; font-size:0.8rem; cursor:pointer;" onclick="changeUserProfile(' + u.id + ')" title="' + t("common.edit") + '"><i class="fas fa-shield-alt"></i> ' + escapeHtml(profileName) + "</span>"
                    : '<span style="color:var(--text-muted); font-size:0.8rem; cursor:pointer;" onclick="changeUserProfile(' + u.id + ')" title="' + t("admin.users.profile") + '">\u2014</span>';

                return "<tr>" +
                    "<td>" + escapeHtml(String(u.id)) + "</td>" +
                    '<td><span style="color: #3b82f6; font-weight: 600;">@' + escapeHtml(u.username) + "</span></td>" +
                    "<td>" + roleBadge + "</td>" +
                    "<td>" + trinoBadge + "</td>" +
                    "<td>" + profileBadge + "</td>" +
                    '<td style="font-size:0.82rem;">' + escapeHtml(new Date(u.created_at).toLocaleString(I18n.getLocale())) + "</td>" +
                    '<td><button onclick="deleteUser(' + u.id + ')" class="btn-delete"><i class="fas fa-trash"></i> ' + t("common.delete") + '</button></td>' +
                    "</tr>";
            }).join("");
        } else {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color: var(--text-muted);">' + t("common.noResults") + '</td></tr>';
        }
    } catch (err) { console.error("Kullanicilar cekilemedi", err); }
}

async function toggleTrinoAccess(userId, newValue) {
    try {
        var res = await fetch(API_BASE + "/api/users/" + userId + "/trino-access", {
            method: "PATCH",
            headers: getAuthHeaders(),
            credentials: "include",
            body: JSON.stringify({ trino_access: newValue })
        });
        var data = await res.json();
        if (data.success) fetchUsers();
        else alert(data.detail || t("common.error"));
    } catch (e) { alert(t("common.connectionError")); }
}

async function deleteUser(id) {
    var user = currentUsers.find(function (u) { return u.id === id; });
    var name = user ? user.username : "ID: " + id;
    if (!confirm(t("admin.users.confirmDelete", {name: name}))) return;
    try {
        var res = await fetch(API_BASE + "/api/users/" + id, { method: "DELETE", headers: getAuthHeaders(), credentials: "include" });
        if (handleAuthError(res)) return;
        var data = await res.json();
        if (data.success) fetchUsers(); else alert(data.detail || t("common.error"));
    } catch (e) { alert(t("common.connectionError")); }
}

document.getElementById("createUserForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    var u = document.getElementById("newUsername").value;
    var p = document.getElementById("newPassword").value;
    var r = document.getElementById("newRole").value;
    var tr = document.getElementById("newTrinoAccess").checked;
    var msg = document.getElementById("statusMsg");
    var btn = document.getElementById("createBtn");
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + t("common.loading");
    msg.style.display = "none";
    try {
        var res = await fetch(API_BASE + "/api/users", { method: "POST", headers: getAuthHeaders(), credentials: "include", body: JSON.stringify({ username: u, password: p, role: r, trino_access: tr }) });
        if (handleAuthError(res)) return;
        var data = await res.json();
        msg.style.display = "block";
        if (res.ok && data.success) {
            msg.style.color = "#4ade80";
            msg.innerHTML = '<i class="fas fa-check-circle"></i> ' + t("admin.users.created");
            document.getElementById("newUsername").value = "";
            document.getElementById("newPassword").value = "";
            document.getElementById("newTrinoAccess").checked = false;
            fetchUsers();
        } else {
            msg.style.color = "#fca5a5";
            msg.textContent = data.detail || data.message || t("common.error");
        }
    } catch (err) {
        msg.style.color = "#fca5a5";
        msg.innerHTML = '<i class="fas fa-wifi"></i> ' + t("common.connectionError");
        msg.style.display = "block";
    } finally {
        btn.disabled = false;
        btn.innerHTML = t("admin.users.createBtn") + ' <i class="fas fa-check"></i>';
    }
});
