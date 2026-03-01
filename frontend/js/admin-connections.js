/* ============================================================
   admin-connections.js  —  Admin panel: DB connection management
   ============================================================ */

var defaultPorts = { postgresql: 5432, mysql: 3306, mssql: 1433, trino: 443 };
var SYSTEM_SCHEMAS = ["information_schema", "pg_catalog", "pg_toast", "auth", "extensions", "graphql", "graphql_public", "realtime", "storage", "supabase_functions", "supabase_migrations", "vault", "pgsodium", "pgsodium_masks", "mysql", "sys", "performance_schema", "INFORMATION_SCHEMA"];

function onDbTypeChange() {
    var t = document.getElementById("connType").value;
    document.getElementById("connPort").value = defaultPorts[t] || 5432;
}

async function fetchConnections() {
    await fetchTrinoStatus();
    try {
        var res = await fetch(API_BASE + "/api/db-connections", { headers: getAuthHeaders(), credentials: "include" });
        if (handleAuthError(res)) return;
        var data = await res.json();
        var container = document.getElementById("connList");
        if (data.success && data.connections && data.connections.length > 0) {
            currentConns = data.connections;
            container.innerHTML = data.connections.map(function (c) {
                var iconClass = {postgresql:"pg", mysql:"mysql", mssql:"mssql", trino:"trino"}[c.db_type] || "pg";
                var iconChar = {postgresql:"P", mysql:"M", mssql:"S", trino:"T"}[c.db_type] || "D";
                var typeLabel = {postgresql:"PostgreSQL", mysql:"MySQL", mssql:"MSSQL", trino:"Trino"}[c.db_type] || c.db_type;
                var tables = "[]";
                try { tables = JSON.parse(c.allowed_tables || "[]"); } catch (e) { tables = []; }
                var tableCount = Array.isArray(tables) ? tables.length : 0;

                var isTrino = c.db_type === "trino";
                var isTrinoActive = isTrino && trinoStatus.active && trinoStatus.conn_id === c.id;

                var trinoSwitch = "";
                if (isTrino) {
                    trinoSwitch = '<label class="trino-switch" title="' + t(isTrinoActive ? "admin.connections.trinoActiveTitle" : "admin.connections.trinoInactiveTitle") + '">' +
                        '<input type="checkbox" ' + (isTrinoActive ? "checked" : "") + ' onchange="toggleTrino(' + c.id + ', this.checked)">' +
                        '<span class="slider"></span>' +
                    "</label>";
                }

                var dashboardBtn = "";
                var restartBtn = "";
                if (isTrino) {
                    dashboardBtn = '<button class="btn-sm purple" onclick="window.open(\'https://' + escapeHtml(c.host) + "/ui/'" + ', \'_blank\')"><i class="fas fa-tachometer-alt"></i> Dashboard</button>';
                }
                if (isTrinoActive) {
                    restartBtn = '<button class="btn-sm" style="background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;" onclick="restartTrino()"><i class="fas fa-sync-alt"></i> Restart</button>';
                }

                return '<div class="conn-card' + (isTrinoActive ? " trino-active" : "") + '" style="' + (isTrinoActive ? "border-color: rgba(168,85,247,0.4); background: rgba(168,85,247,0.05);" : "") + '">' +
                    '<div class="conn-info">' +
                        '<div class="conn-icon ' + iconClass + '">' + iconChar + "</div>" +
                        "<div>" +
                            '<div class="conn-name">' +
                                '<span class="status-dot ' + (c.is_active ? "active" : "inactive") + '"></span>' +
                                escapeHtml(c.name) +
                                (isTrinoActive ? ' <span class="trino-badge on"><i class="fas fa-bolt"></i> ' + t("admin.users.trinoActive").toUpperCase() + '</span>' : "") +
                            "</div>" +
                            '<div class="conn-meta">' + typeLabel + " | " + escapeHtml(c.host) + ":" + c.port + " | " + tableCount + " " + t("sidebar.tables").toLowerCase() + "</div>" +
                        "</div>" +
                    "</div>" +
                    '<div class="conn-actions">' +
                        trinoSwitch +
                        restartBtn +
                        dashboardBtn +
                        '<button class="btn-sm info" onclick="discoverTables(' + c.id + ')"><i class="fas fa-search"></i> ' + t("admin.connections.discover") + '</button>' +
                        '<button class="btn-sm danger" onclick="deleteConnection(' + c.id + ')"><i class="fas fa-trash"></i></button>' +
                    "</div>" +
                "</div>" +
                (isTrino ? '<div id="railway-status-' + c.id + '" class="railway-status-section"></div>' : '') +
                '<div id="discover-' + c.id + '"></div>';
            }).join("");
            // Railway status kontrolu — Trino kartlari icin
            data.connections.forEach(function (c) {
                if (c.db_type === "trino") fetchRailwayStatus(c.id);
            });
        } else {
            container.innerHTML = '<p style="text-align:center; color: var(--text-muted); padding: 20px;">' + t("common.noResults") + '</p>';
        }
    } catch (err) { console.error("Baglantilar cekilemedi", err); }
}

async function toggleTrino(connId, activate) {
    try {
        var url = activate
            ? API_BASE + "/api/trino/activate/" + connId
            : API_BASE + "/api/trino/deactivate";
        var res = await fetch(url, { method: "POST", headers: getAuthHeaders(), credentials: "include" });
        var data = await res.json();
        if (data.success) {
            fetchConnections();
        } else {
            alert(data.detail || data.message || t("common.error"));
            fetchConnections();
        }
    } catch (e) {
        alert(t("common.connectionError") + ": " + e.message);
        fetchConnections();
    }
}

async function restartTrino() {
    if (!confirm("Trino baglantisi yeniden baslatilacak. Devam edilsin mi?")) return;
    try {
        var res = await fetch(API_BASE + "/api/trino/restart", { method: "POST", headers: getAuthHeaders(), credentials: "include" });
        var data = await res.json();
        if (data.success) {
            alert("Trino basariyla yeniden baslatildi!");
            fetchConnections();
        } else {
            alert(data.detail || data.message || "Restart basarisiz.");
            fetchConnections();
        }
    } catch (e) {
        alert("Baglanti hatasi: " + e.message);
        fetchConnections();
    }
}

async function fetchRailwayStatus(connId) {
    var container = document.getElementById("railway-status-" + connId);
    if (!container) return;
    try {
        var res = await fetch(API_BASE + "/api/trino/railway/status", { headers: getAuthHeaders(), credentials: "include" });
        var data = await res.json();
        if (!data.configured) { container.innerHTML = ""; return; }

        var statusColor, statusText, actionBtn;
        if (data.running) {
            statusColor = "#4ade80";
            statusText = '<i class="fas fa-circle" style="font-size:0.6rem;color:#4ade80;"></i> Railway: <strong>Calisiyor</strong>';
            actionBtn = '<button class="btn-sm" style="background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff;padding:6px 14px !important;" onclick="stopRailwayTrino()"><i class="fas fa-stop"></i> Servisi Durdur</button>';
        } else if (data.deploying) {
            statusColor = "#f59e0b";
            statusText = '<i class="fas fa-spinner fa-spin" style="font-size:0.6rem;color:#f59e0b;"></i> Railway: <strong>Deploy ediliyor...</strong>';
            actionBtn = '<button class="btn-sm" disabled style="opacity:0.5;padding:6px 14px !important;"><i class="fas fa-hourglass-half"></i> Bekleniyor</button>';
        } else {
            statusColor = "#ef4444";
            statusText = '<i class="fas fa-circle" style="font-size:0.6rem;color:#ef4444;"></i> Railway: <strong>Durduruldu</strong> <span style="font-size:0.75rem;color:#4ade80;">(para yazmiyor)</span>';
            actionBtn = '<button class="btn-sm" style="background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff;padding:6px 14px !important;" onclick="startRailwayTrino()"><i class="fas fa-play"></i> Servisi Baslat</button>';
        }

        container.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;margin:0 0 8px 0;background:rgba(100,100,140,0.1);border-radius:10px;border:1px solid rgba(100,100,140,0.15);">' +
            '<span style="font-size:0.85rem;color:var(--text-secondary);">' + statusText + '</span>' +
            '<div style="display:flex;gap:8px;align-items:center;">' +
                actionBtn +
                '<button class="btn-sm" style="padding:6px 10px !important;background:rgba(100,100,140,0.15);color:var(--text-secondary);" onclick="fetchRailwayStatus(' + connId + ')"><i class="fas fa-sync-alt"></i></button>' +
            '</div>' +
        '</div>';
    } catch (e) {
        container.innerHTML = "";
        console.error("Railway status check failed", e);
    }
}

async function stopRailwayTrino() {
    if (!confirm("Trino servisi Railway'de durdurulacak.\n\n• Cross-DB sorgulari calismayacak\n• Para yazmayacak\n\nDevam edilsin mi?")) return;
    try {
        var res = await fetch(API_BASE + "/api/trino/railway/stop", { method: "POST", headers: getAuthHeaders(), credentials: "include" });
        var data = await res.json();
        if (data.success) {
            alert(data.message);
            fetchConnections();
        } else {
            alert(data.detail || data.message || "Durdurma basarisiz.");
        }
    } catch (e) {
        alert("Baglanti hatasi: " + e.message);
    }
}

async function startRailwayTrino() {
    if (!confirm("Trino servisi Railway'de baslatilacak.\n\nDeploy 1-2 dakika surebilir.\nDevam edilsin mi?")) return;
    try {
        var res = await fetch(API_BASE + "/api/trino/railway/start", { method: "POST", headers: getAuthHeaders(), credentials: "include" });
        var data = await res.json();
        if (data.success) {
            alert(data.message);
            fetchConnections();
        } else {
            alert(data.detail || data.message || "Baslatma basarisiz.");
        }
    } catch (e) {
        alert("Baglanti hatasi: " + e.message);
    }
}

async function testConnection() {
    var msg = document.getElementById("connStatusMsg");
    msg.style.display = "block";
    msg.style.color = "#f59e0b";
    msg.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + t("common.loading");
    try {
        var body = {
            db_type: document.getElementById("connType").value,
            host: document.getElementById("connHost").value,
            port: parseInt(document.getElementById("connPort").value),
            database_name: document.getElementById("connDatabase").value,
            username: document.getElementById("connUser").value,
            password: document.getElementById("connPassword").value,
            ssl_enabled: true
        };
        var res = await fetch(API_BASE + "/api/db-connections/test", { method: "POST", headers: getAuthHeaders(), credentials: "include", body: JSON.stringify(body) });
        var data = await res.json();
        if (data.success) {
            msg.style.color = "#4ade80";
            msg.innerHTML = '<i class="fas fa-check-circle"></i> ' + t("admin.connections.testSuccess");
        } else {
            msg.style.color = "#fca5a5";
            msg.innerHTML = '<i class="fas fa-times-circle"></i> ' + escapeHtml(data.message);
        }
    } catch (err) {
        msg.style.color = "#fca5a5";
        msg.innerHTML = '<i class="fas fa-wifi"></i> ' + t("common.connectionError");
    }
}

document.getElementById("createConnForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    var msg = document.getElementById("connStatusMsg");
    msg.style.display = "block";
    msg.style.color = "#f59e0b";
    msg.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + t("common.loading");
    try {
        var body = {
            name: document.getElementById("connName").value,
            db_type: document.getElementById("connType").value,
            host: document.getElementById("connHost").value,
            port: parseInt(document.getElementById("connPort").value),
            database_name: document.getElementById("connDatabase").value,
            username: document.getElementById("connUser").value,
            password: document.getElementById("connPassword").value,
            ssl_enabled: true
        };
        var res = await fetch(API_BASE + "/api/db-connections", { method: "POST", headers: getAuthHeaders(), credentials: "include", body: JSON.stringify(body) });
        var data = await res.json();
        if (data.success) {
            msg.style.color = "#4ade80";
            msg.innerHTML = '<i class="fas fa-check-circle"></i> ' + t("admin.connections.created");
            document.getElementById("connName").value = "";
            document.getElementById("connHost").value = "";
            document.getElementById("connDatabase").value = "";
            document.getElementById("connUser").value = "";
            document.getElementById("connPassword").value = "";
            fetchConnections();
        } else {
            msg.style.color = "#fca5a5";
            msg.innerHTML = '<i class="fas fa-times-circle"></i> ' + escapeHtml(data.detail || data.message || t("common.error"));
        }
    } catch (err) {
        msg.style.color = "#fca5a5";
        msg.innerHTML = '<i class="fas fa-wifi"></i> ' + t("common.connectionError");
    }
});

async function deleteConnection(id) {
    if (!confirm(t("admin.connections.confirmDelete"))) return;
    try {
        var res = await fetch(API_BASE + "/api/db-connections/" + id, { method: "DELETE", headers: getAuthHeaders(), credentials: "include" });
        var data = await res.json();
        if (data.success) fetchConnections();
        else alert(data.detail || t("common.error"));
    } catch (e) { alert(t("common.connectionError")); }
}

async function discoverTables(connId) {
    var area = document.getElementById("discover-" + connId);
    area.innerHTML = '<div class="discover-area"><i class="fas fa-spinner fa-spin"></i> ' + t("admin.connections.discoverLoading") + '</div>';
    try {
        var res = await fetch(API_BASE + "/api/db-connections/" + connId + "/discover", { method: "POST", headers: getAuthHeaders(), credentials: "include" });
        var data = await res.json();
        if (data.success && data.tables && data.tables.length > 0) {
            var conn = currentConns.find(function (c) { return c.id === connId; });
            var existing = [];
            try { existing = JSON.parse(conn.allowed_tables || "[]"); } catch (e) {}

            var tree = {};
            data.tables.forEach(function (t) {
                var parts = t.full_name.split(".");
                var catalog, schema, table;
                if (parts.length === 3) { catalog = parts[0]; schema = parts[1]; table = parts[2]; }
                else if (parts.length === 2) { catalog = conn.name || "default"; schema = parts[0]; table = parts[1]; }
                else { catalog = conn.name || "default"; schema = "default"; table = parts[0]; }
                if (!tree[catalog]) tree[catalog] = {};
                if (!tree[catalog][schema]) tree[catalog][schema] = [];
                tree[catalog][schema].push({ full_name: t.full_name, table: table });
            });

            var html = '<div class="discover-area" data-conn-id="' + connId + '">';
            html += '<div class="discover-toolbar">';
            html += '<input type="text" class="discover-search" placeholder="' + t("admin.connections.searchPlaceholder") + '" oninput="filterDiscoverTables(this)">';
            html += '<label class="discover-system-toggle"><input type="checkbox" checked onchange="toggleSystemTables(this)"> ' + t("admin.connections.hideSystemTables") + '</label>';
            html += "</div>";
            html += '<div class="discover-tree">';

            Object.keys(tree).sort().forEach(function (cat) {
                var schemas = tree[cat];
                var catTableCount = 0;
                Object.keys(schemas).forEach(function (s) { catTableCount += schemas[s].length; });

                html += '<div class="discover-catalog expanded" data-catalog="' + escapeHtml(cat) + '">';
                html += '<div class="discover-catalog-header" onclick="this.parentElement.classList.toggle(\'expanded\')">';
                html += '<i class="fas fa-chevron-right arrow"></i>';
                html += '<i class="fas fa-server" style="color:var(--accent-primary);font-size:0.8rem;"></i> ';
                html += "<strong>" + escapeHtml(cat) + '</strong> <span style="color:var(--text-muted);font-size:0.78rem;">(' + catTableCount + ")</span>";
                html += '<button class="discover-select-all" onclick="event.stopPropagation();selectAllInCatalog(this,\'' + escapeHtml(cat) + "')\">" + t("admin.connections.selectAll") + "</button>";
                html += "</div>";
                html += '<div class="discover-catalog-tables">';

                Object.keys(schemas).sort().forEach(function (sch) {
                    var tables = schemas[sch];
                    var isSystem = SYSTEM_SCHEMAS.indexOf(sch) >= 0;
                    var schClass = isSystem ? " system-schema" : "";

                    html += '<div class="discover-schema expanded' + schClass + '" data-schema="' + escapeHtml(sch) + '"' + (isSystem ? ' style="display:none;"' : "") + ">";
                    html += '<div class="discover-schema-header" onclick="this.parentElement.classList.toggle(\'expanded\')">';
                    html += '<i class="fas fa-chevron-right arrow"></i>';
                    html += '<i class="fas fa-folder" style="font-size:0.75rem;"></i> ' + escapeHtml(sch) + " (" + tables.length + ")";
                    if (isSystem) html += ' <span style="font-size:0.7rem;color:#f59e0b;">sistem</span>';
                    html += "</div>";
                    html += '<div class="discover-schema-tables">';

                    tables.forEach(function (t) {
                        var checked = existing.indexOf(t.full_name) >= 0;
                        html += '<label class="table-check' + (checked ? " selected" : "") + '" data-fullname="' + escapeHtml(t.full_name) + '" onclick="toggleTableCheck(this)">';
                        html += '<input type="checkbox" value="' + escapeHtml(t.full_name) + '"' + (checked ? " checked" : "") + ">";
                        html += '<i class="fas fa-table" style="font-size:0.72rem;"></i> ' + escapeHtml(t.table);
                        html += "</label>";
                    });

                    html += "</div></div>";
                });

                html += "</div></div>";
            });

            html += "</div>";
            html += '<div class="discover-count">' + t("admin.connections.selectedCount", {count: '<strong id="discoverSelectedCount-' + connId + '">0</strong>', total: data.tables.length}) + '</div>';
            html += '<button class="btn-sm success" onclick="saveAllowedTables(' + connId + ', this)" style="padding:8px 16px !important;"><i class="fas fa-save"></i> ' + t("admin.connections.saveSelection") + '</button>';
            html += "</div>";
            area.innerHTML = html;
            updateDiscoverCount(connId);
        } else {
            area.innerHTML = '<div class="discover-area" style="color:#fca5a5;"><i class="fas fa-exclamation-triangle"></i> ' + escapeHtml(data.message || t("admin.connections.noTablesFound")) + "</div>";
        }
    } catch (e) {
        area.innerHTML = '<div class="discover-area" style="color:#fca5a5;"><i class="fas fa-wifi"></i> ' + t("common.connectionError") + '</div>';
    }
}

function toggleTableCheck(label) {
    var cb = label.querySelector("input");
    setTimeout(function () {
        if (cb.checked) label.classList.add("selected");
        else label.classList.remove("selected");
        var area = label.closest(".discover-area");
        if (area) {
            var connId = area.getAttribute("data-conn-id");
            if (connId) updateDiscoverCount(parseInt(connId));
        }
    }, 10);
}

function updateDiscoverCount(connId) {
    var area = document.querySelector('.discover-area[data-conn-id="' + connId + '"]');
    if (!area) return;
    var countEl = document.getElementById("discoverSelectedCount-" + connId);
    if (countEl) {
        var count = 0;
        area.querySelectorAll(".table-check input:checked").forEach(function () { count++; });
        countEl.textContent = count;
    }
}

function filterDiscoverTables(input) {
    var query = input.value.toLowerCase();
    var area = input.closest(".discover-area");
    area.querySelectorAll(".table-check").forEach(function (label) {
        var name = (label.getAttribute("data-fullname") || "").toLowerCase();
        label.style.display = name.indexOf(query) >= 0 ? "" : "none";
    });
}

function toggleSystemTables(checkbox) {
    var area = checkbox.closest(".discover-area");
    var hidden = checkbox.checked;
    area.querySelectorAll(".system-schema").forEach(function (el) {
        el.style.display = hidden ? "none" : "";
    });
}

function selectAllInCatalog(btn, catalogName) {
    var catalog = btn.closest(".discover-catalog");
    var checks = catalog.querySelectorAll('.table-check input[type="checkbox"]');
    var allChecked = true;
    checks.forEach(function (cb) { if (!cb.checked) allChecked = false; });
    checks.forEach(function (cb) {
        cb.checked = !allChecked;
        var label = cb.closest(".table-check");
        if (cb.checked) label.classList.add("selected");
        else label.classList.remove("selected");
    });
    btn.textContent = allChecked ? t("admin.connections.selectAll") : t("admin.connections.clearSelection");
    var area = catalog.closest(".discover-area");
    if (area) {
        var connId = area.getAttribute("data-conn-id");
        if (connId) updateDiscoverCount(parseInt(connId));
    }
}

async function saveAllowedTables(connId, btn) {
    var area = btn.closest(".discover-area");
    var checks = area.querySelectorAll('input[type="checkbox"]:checked');
    var tables = [];
    checks.forEach(function (cb) { tables.push(cb.value); });
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + t("common.loading");
    try {
        var res = await fetch(API_BASE + "/api/db-connections/" + connId + "/tables", {
            method: "PUT",
            headers: getAuthHeaders(),
            credentials: "include",
            body: JSON.stringify({ allowed_tables: tables })
        });
        var data = await res.json();
        if (data.success) {
            btn.innerHTML = '<i class="fas fa-check"></i> ' + t("admin.connections.saved");
            fetchConnections();
        } else {
            btn.innerHTML = '<i class="fas fa-times"></i> ' + t("common.error");
        }
    } catch (e) {
        btn.innerHTML = '<i class="fas fa-times"></i> ' + t("common.connectionError");
    }
}
