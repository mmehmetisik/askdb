/* ============================================================
   theme.js  —  Dark / Light tema toggle
   ============================================================ */

function initTheme() {
    var mode = localStorage.getItem("theme") || "dark";
    if (mode === "light") {
        document.documentElement.classList.add("light");
    } else {
        document.documentElement.classList.remove("light");
    }
    _updateThemeBtn(mode);
}

function toggleTheme() {
    var isLight = document.documentElement.classList.toggle("light");
    var mode = isLight ? "light" : "dark";
    localStorage.setItem("theme", mode);
    _updateThemeBtn(mode);
}

function _updateThemeBtn(mode) {
    var btn = document.getElementById("themeToggleBtn");
    if (btn) {
        btn.innerHTML = mode === "light"
            ? '<i class="fas fa-sun"></i>'
            : '<i class="fas fa-moon"></i>';
    }
}

// Eski colorScheme localStorage'i temizle
localStorage.removeItem("colorScheme");

initTheme();
