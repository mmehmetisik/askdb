/* ========== SQL Duzenleme ========== */
var sqlEditMode = false;

function toggleSqlEdit() {
    sqlEditMode = !sqlEditMode;
    var sqlOutput = document.getElementById("sqlOutput");
    var editArea = document.getElementById("sqlEditArea");
    var editBtn = document.getElementById("sqlEditBtn");
    var runEditBtn = document.getElementById("sqlRunEditBtn");

    if (sqlEditMode) {
        // Duzenleme moduna gec
        var currentSQL = sqlOutput.textContent || "";
        editArea.value = currentSQL;
        sqlOutput.style.display = "none";
        editArea.style.display = "block";
        runEditBtn.style.display = "inline-flex";
        editBtn.innerHTML = '<i class="fas fa-times"></i> ' + t("common.cancel");
        editBtn.classList.add("active");
        editArea.focus();
    } else {
        // Gosterim moduna don
        editArea.style.display = "none";
        sqlOutput.style.display = "block";
        runEditBtn.style.display = "none";
        editBtn.innerHTML = '<i class="fas fa-edit"></i> ' + t("common.edit");
        editBtn.classList.remove("active");
    }
}

async function executeEditedSQL() {
    var editArea = document.getElementById("sqlEditArea");
    var sql = editArea.value.trim();
    if (!sql) return;

    // Loading state
    var runBtn = document.getElementById("sqlRunEditBtn");
    var oldText = runBtn.innerHTML;
    runBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + t("common.wait");
    runBtn.disabled = true;

    try {
        var response = await fetch(API_BASE + "/api/execute-sql", {
            method: "POST",
            headers: getAuthHeaders(),
            credentials: "include",
            body: JSON.stringify({ sql: sql }),
        });

        if (handleAuthError(response)) return;

        var data = await response.json();

        if (!response.ok) {
            alert(t("sql.execError", {error: data.detail || t("common.error")}));
            return;
        }

        // Duzenleme modundan cik
        sqlEditMode = true; // toggleSqlEdit false yapsin
        toggleSqlEdit();

        // SQL goster
        document.getElementById("sqlOutput").textContent = data.sql;
        document.getElementById("sqlSection").style.display = "block";

        // Sonuclari render et
        if (data.result) {
            lastResultData = data.result;
            lastColumnTypes = data.column_types || [];
            sortColumn = -1;
            sortDirection = "asc";
            hiddenColumns = new Set();

            hideEmptyState();
            renderTable(data.result);

            if (data.truncated) {
                document.getElementById("truncatedWarning").style.display = "block";
            }
        }
    } catch (err) {
        alert(t("common.connectionError") + ": " + err.message);
    } finally {
        runBtn.innerHTML = oldText;
        runBtn.disabled = false;
    }
}
