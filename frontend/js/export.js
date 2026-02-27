/* ========== Export Secenekleri (CSV, Excel, JSON, PDF) ========== */

function toggleExportMenu() {
    var dropdown = document.getElementById("exportDropdown");
    if (dropdown) {
        dropdown.classList.toggle("show");
    }
}

// Disari tiklaninca kapat
document.addEventListener("click", function(e) {
    var wrapper = document.querySelector(".export-dropdown-wrapper");
    var dropdown = document.getElementById("exportDropdown");
    if (dropdown && wrapper && !wrapper.contains(e.target)) {
        dropdown.classList.remove("show");
    }
});

function exportCSV() {
    if (!lastResultData || lastResultData.length < 2) return;
    var headers = lastResultData[0];
    var csvRows = [headers.map(h => '"' + String(h).replace(/"/g, '""') + '"').join(",")];
    for (var i = 1; i < lastResultData.length; i++) {
        csvRows.push(
            lastResultData[i].map(function(cell) {
                if (cell === null || cell === undefined) return '""';
                return '"' + String(cell).replace(/"/g, '""') + '"';
            }).join(",")
        );
    }
    var csvContent = "\uFEFF" + csvRows.join("\n");
    _downloadFile(csvContent, t("export.filename") + ".csv", "text/csv;charset=utf-8");
    _closeExportMenu();
}

function exportJSON() {
    if (!lastResultData || lastResultData.length < 2) return;
    var headers = lastResultData[0];
    var jsonData = [];
    for (var i = 1; i < lastResultData.length; i++) {
        var obj = {};
        for (var j = 0; j < headers.length; j++) {
            obj[headers[j]] = lastResultData[i][j];
        }
        jsonData.push(obj);
    }
    var jsonContent = JSON.stringify(jsonData, null, 2);
    _downloadFile(jsonContent, t("export.filename") + ".json", "application/json;charset=utf-8");
    _closeExportMenu();
}

function exportExcel() {
    if (!lastResultData || lastResultData.length < 2) return;
    if (typeof XLSX === "undefined") {
        alert(t("export.excelError"));
        return;
    }
    var ws = XLSX.utils.aoa_to_sheet(lastResultData);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, t("export.sheetName"));
    XLSX.writeFile(wb, t("export.filename") + ".xlsx");
    _closeExportMenu();
}

function exportPDF() {
    if (!lastResultData || lastResultData.length < 2) return;
    if (typeof jspdf === "undefined" && typeof window.jspdf === "undefined") {
        alert(t("export.pdfError"));
        return;
    }

    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ orientation: "landscape" });

    // Baslik
    doc.setFontSize(14);
    doc.text(t("export.pdfTitle"), 14, 15);
    doc.setFontSize(9);
    doc.text(t("export.pdfDate", {date: new Date().toLocaleString(I18n.getLocale())}), 14, 22);

    // Tablo
    var headers = lastResultData[0];
    var body = lastResultData.slice(1).map(function(row) {
        return row.map(function(cell) {
            if (cell === null || cell === undefined) return "NULL";
            return String(cell);
        });
    });

    doc.autoTable({
        head: [headers],
        body: body,
        startY: 28,
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: [79, 143, 247], textColor: 255 },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        margin: { left: 10, right: 10 },
    });

    doc.save(t("export.filename") + ".pdf");
    _closeExportMenu();
}

function _downloadFile(content, filename, type) {
    var blob = new Blob([content], { type: type });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function _closeExportMenu() {
    var dropdown = document.getElementById("exportDropdown");
    if (dropdown) dropdown.classList.remove("show");
}
