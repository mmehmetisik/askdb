/* ========== Sorgu Favorileri ========== */
var favorites = [];
var FAVORITES_KEY = "queryFavorites";
var MAX_FAVORITES = 50;

function loadFavorites() {
    try {
        var stored = localStorage.getItem(FAVORITES_KEY);
        favorites = stored ? JSON.parse(stored) : [];
    } catch (e) {
        favorites = [];
    }
    renderFavorites();
    updateFavoriteBtn();
}

function saveFavorites() {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
}

function addFavorite(question, sql) {
    if (!question) return;
    // Zaten varsa ekleme
    if (favorites.some(f => f.question === question)) return;

    favorites.unshift({
        id: Date.now(),
        question: question,
        sql: sql || "",
        timestamp: new Date().toISOString(),
    });

    if (favorites.length > MAX_FAVORITES) {
        favorites = favorites.slice(0, MAX_FAVORITES);
    }

    saveFavorites();
    renderFavorites();
    updateFavoriteBtn();
}

function removeFavorite(id) {
    favorites = favorites.filter(f => f.id !== id);
    saveFavorites();
    renderFavorites();
    updateFavoriteBtn();
}

function toggleFavorite() {
    var sqlOutput = document.getElementById("sqlOutput");
    var question = "";
    var sql = sqlOutput ? sqlOutput.textContent : "";

    // Son sorguyu bul
    if (queryHistory && queryHistory.length > 0) {
        question = queryHistory[0].question;
    } else {
        var input = document.getElementById("queryInput");
        question = input ? input.value.trim() : "";
    }

    if (!question) return;

    var existing = favorites.find(f => f.question === question);
    if (existing) {
        removeFavorite(existing.id);
    } else {
        addFavorite(question, sql);
    }
}

function isFavorited(question) {
    return favorites.some(f => f.question === question);
}

function updateFavoriteBtn() {
    var btn = document.getElementById("favBtn");
    if (!btn) return;

    var question = "";
    if (queryHistory && queryHistory.length > 0) {
        question = queryHistory[0].question;
    }

    if (question && isFavorited(question)) {
        btn.innerHTML = '<i class="fas fa-star"></i>';
        btn.classList.add("favorited");
        btn.title = t("favorites.remove");
    } else {
        btn.innerHTML = '<i class="far fa-star"></i>';
        btn.classList.remove("favorited");
        btn.title = t("favorites.add");
    }
}

function rerunFavorite(id) {
    var fav = favorites.find(f => f.id === id);
    if (!fav) return;
    var input = document.getElementById("queryInput");
    if (input) {
        input.value = fav.question;
        input.style.height = "auto";
        input.style.height = input.scrollHeight + "px";
    }
    // Sorguyu calistir
    if (typeof runQuery === "function") {
        runQuery();
    }
}

function renderFavorites() {
    var container = document.getElementById("favoritesList");
    if (!container) return;

    var badge = document.getElementById("favoritesBadge");
    if (badge) {
        badge.textContent = favorites.length;
        badge.style.display = favorites.length > 0 ? "inline-flex" : "none";
    }

    if (favorites.length === 0) {
        container.innerHTML = '<div class="favorites-empty">' + t("favorites.empty") + '</div>';
        return;
    }

    var html = "";
    favorites.forEach(function(fav) {
        var time = new Date(fav.timestamp);
        var timeStr = time.toLocaleDateString(I18n.getLocale(), { day: "numeric", month: "short" });
        html += '<div class="favorite-item" title="' + escapeHtml(fav.question) + '">';
        html += '  <div class="favorite-content" onclick="rerunFavorite(' + fav.id + ')">';
        html += '    <span class="favorite-text">' + escapeHtml(fav.question) + '</span>';
        html += '    <span class="favorite-time">' + timeStr + '</span>';
        html += '  </div>';
        html += '  <button class="favorite-delete" onclick="removeFavorite(' + fav.id + ')" title="' + t("common.delete") + '">';
        html += '    <i class="fas fa-times"></i>';
        html += '  </button>';
        html += '</div>';
    });
    container.innerHTML = html;
}

// ── Toggle (Ac/Kapat) ──
function toggleFavoritesPanel() {
    var section = document.querySelector(".favorites-section");
    if (!section) return;
    section.classList.toggle("collapsed");
    // Durumu hatirla
    localStorage.setItem("favoritesCollapsed", section.classList.contains("collapsed") ? "1" : "0");
}

function _restoreFavoritesState() {
    var collapsed = localStorage.getItem("favoritesCollapsed");
    if (collapsed === "1") {
        var section = document.querySelector(".favorites-section");
        if (section) section.classList.add("collapsed");
    }
}

// Sayfa yuklendiginde favorileri yukle
document.addEventListener("DOMContentLoaded", function() {
    loadFavorites();
    _restoreFavoritesState();
});

// i18n yuklendikten sonra yeniden render et (async timing fix)
if (typeof I18n !== "undefined") {
    I18n.onChange(function () { renderFavorites(); });
}
