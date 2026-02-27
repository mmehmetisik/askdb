/* ============================================================
   admin-stats.js  —  Admin panel: query statistics
   ============================================================ */

async function fetchStats() {
    try {
        var results = await Promise.all([
            fetch(API_BASE + "/api/stats/overview", { headers: getAuthHeaders(), credentials: "include" }),
            fetch(API_BASE + "/api/stats/by-user", { headers: getAuthHeaders(), credentials: "include" }),
            fetch(API_BASE + "/api/stats/by-table", { headers: getAuthHeaders(), credentials: "include" })
        ]);
        var overview = await results[0].json();
        var users = await results[1].json();
        var tables = await results[2].json();

        // Overview
        if (overview.success) {
            document.getElementById("statTotal").textContent = overview.total_queries || 0;
            document.getElementById("statAvgTime").textContent = Math.round(overview.avg_time_ms || 0) + "ms";
            document.getElementById("statErrorRate").textContent = (overview.error_rate || 0).toFixed(1) + "%";
            document.getElementById("statTrinoRate").textContent = (overview.trino_rate || 0).toFixed(1) + "%";
            document.getElementById("statCacheRate").textContent = (overview.cache_rate || 0).toFixed(1) + "%";
        }

        // By User
        var userStats = users.stats || users.data || [];
        if (users.success && userStats.length > 0) {
            var maxQ = Math.max.apply(null, userStats.map(function (u) { return u.query_count; }));
            document.getElementById("statsUserBody").innerHTML = userStats.map(function (u) {
                var pct = maxQ > 0 ? (u.query_count / maxQ * 100) : 0;
                return "<tr>" +
                    "<td><strong>@" + escapeHtml(u.username) + "</strong></td>" +
                    "<td>" + u.query_count + "</td>" +
                    "<td>" + (u.avg_time_ms || 0) + "ms</td>" +
                    "<td>" + (u.error_count || 0) + "</td>" +
                    '<td><div class="stat-bar-container"><div class="stat-bar blue" style="width:' + pct + '%;"></div></div></td>' +
                    "</tr>";
            }).join("");
        } else {
            document.getElementById("statsUserBody").innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);">' + t("common.noResults") + '</td></tr>';
        }

        // By Table
        var tableStats = tables.tables || tables.data || [];
        if (tables.success && tableStats.length > 0) {
            var maxT = Math.max.apply(null, tableStats.map(function (t) { return t.count; }));
            document.getElementById("statsTableBody").innerHTML = tableStats.map(function (t) {
                var pct = maxT > 0 ? (t.count / maxT * 100) : 0;
                return "<tr>" +
                    '<td><i class="fas fa-table" style="color:var(--accent-primary);margin-right:6px;"></i>' + escapeHtml(t.name || t.table_name) + "</td>" +
                    "<td>" + t.count + "</td>" +
                    '<td><div class="stat-bar-container"><div class="stat-bar green" style="width:' + pct + '%;"></div></div></td>' +
                    "</tr>";
            }).join("");
        } else {
            document.getElementById("statsTableBody").innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--text-muted);">' + t("common.noResults") + '</td></tr>';
        }
    } catch (e) { console.error("Stats yuklenemedi", e); }
}
