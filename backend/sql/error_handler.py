"""
AskDB — Zengin Hata Siniflandirma ve Kullanici Dostu Mesaj Uretimi

Her hata turunu tanir, kategorize eder, kullaniciya anlasilir mesaj ve oneri sunar.
"""

import re


# ---------------------------------------------------------------------------
# Hata Kategorileri
# ---------------------------------------------------------------------------

class ErrorCategory:
    TIMEOUT = "timeout"
    CONNECTION = "connection"
    SQL_SYNTAX = "sql_syntax"
    TABLE_NOT_FOUND = "table_not_found"
    COLUMN_NOT_FOUND = "column_not_found"
    PERMISSION = "permission"
    TRINO_CATALOG = "trino_catalog"
    TRINO_SCHEMA = "trino_schema"
    TRINO_SERVER = "trino_server"
    LLM_GENERATION = "llm_generation"
    SAFETY_BLOCK = "safety_block"
    RATE_LIMIT = "rate_limit"
    UNKNOWN = "unknown"


# ---------------------------------------------------------------------------
# Hata Siniflandirma Kurallari
# ---------------------------------------------------------------------------

_ERROR_PATTERNS = [
    # Timeout / Gateway hatalari
    {
        "patterns": [r"502\s*bad\s*gateway", r"504\s*gateway\s*timeout", r"timeout", r"timed?\s*out"],
        "category": ErrorCategory.TIMEOUT,
        "title_tr": "Zaman Asimi",
        "title_en": "Query Timeout",
        "message_tr": "Sorgu cok uzun surdu ve zaman asimina ugradi.",
        "message_en": "Query took too long and timed out.",
        "suggestion_tr": "Daha az tablo ile sorgulayın, LIMIT ekleyin veya sorguyu basitlestirin.",
        "suggestion_en": "Try fewer tables, add LIMIT, or simplify the query.",
        "severity": "warning",
    },
    # Trino sunucu baslangic
    {
        "patterns": [r"server.is.still.initializing", r"SERVER_STARTING_UP"],
        "category": ErrorCategory.TRINO_SERVER,
        "title_tr": "Trino Sunucu Baslatiliyor",
        "title_en": "Trino Server Starting Up",
        "message_tr": "Trino sunucusu henuz hazir degil, baslatiliyor.",
        "message_en": "Trino server is still initializing.",
        "suggestion_tr": "Lutfen 30-60 saniye bekleyip tekrar deneyin.",
        "suggestion_en": "Please wait 30-60 seconds and try again.",
        "severity": "info",
    },
    # Tablo bulunamadi
    {
        "patterns": [r"relation\s+[\"']?\w+[\"']?\s+does\s+not\s+exist", r"Table\s+.*not\s+found",
                      r"UndefinedTableError", r"TABLE_NOT_FOUND"],
        "category": ErrorCategory.TABLE_NOT_FOUND,
        "title_tr": "Tablo Bulunamadi",
        "title_en": "Table Not Found",
        "message_tr": "Sorguda kullanilan tablo veritabaninda bulunamadi.",
        "message_en": "A table used in the query was not found in the database.",
        "suggestion_tr": "Sol paneldeki tablo listesinden mevcut tablolari kontrol edin.",
        "suggestion_en": "Check available tables in the left panel.",
        "severity": "error",
    },
    # Kolon bulunamadi
    {
        "patterns": [r"column\s+[\"']?\w+[\"']?\s+does\s+not\s+exist", r"UndefinedColumnError",
                      r"COLUMN_NOT_FOUND", r"Unknown\s+column"],
        "category": ErrorCategory.COLUMN_NOT_FOUND,
        "title_tr": "Kolon Bulunamadi",
        "title_en": "Column Not Found",
        "message_tr": "Sorguda kullanilan bir kolon tabloda bulunamadi.",
        "message_en": "A column used in the query does not exist in the table.",
        "suggestion_tr": "Tablo detaylarini acarak mevcut kolonlari kontrol edin.",
        "suggestion_en": "Expand the table to check available columns.",
        "severity": "error",
    },
    # Trino katalog hatasi
    {
        "patterns": [r"CATALOG_NOT_FOUND", r"catalog\s+.*not\s+found", r"catalog\s+.*does\s+not\s+exist"],
        "category": ErrorCategory.TRINO_CATALOG,
        "title_tr": "Trino Katalog Bulunamadi",
        "title_en": "Trino Catalog Not Found",
        "message_tr": "Trino'da belirtilen katalog (veritabani baglantisi) bulunamadi.",
        "message_en": "The specified Trino catalog (database connection) was not found.",
        "suggestion_tr": "Admin panelinden Trino katalog ayarlarini kontrol edin.",
        "suggestion_en": "Check Trino catalog settings in the admin panel.",
        "severity": "error",
    },
    # Trino schema hatasi
    {
        "patterns": [r"SCHEMA_NOT_FOUND", r"schema\s+.*does\s+not\s+exist", r"MISSING_SCHEMA_NAME"],
        "category": ErrorCategory.TRINO_SCHEMA,
        "title_tr": "Trino Sema Bulunamadi",
        "title_en": "Trino Schema Not Found",
        "message_tr": "Trino'da belirtilen sema bulunamadi.",
        "message_en": "The specified schema was not found in Trino.",
        "suggestion_tr": "Tablo adlarinin tam formatta (katalog.sema.tablo) oldugundan emin olun.",
        "suggestion_en": "Ensure table names are fully qualified (catalog.schema.table).",
        "severity": "error",
    },
    # SQL syntax hatasi
    {
        "patterns": [r"syntax\s+error", r"SYNTAX_ERROR", r"ProgrammingError", r"mismatched\s+input"],
        "category": ErrorCategory.SQL_SYNTAX,
        "title_tr": "SQL Sozdizimi Hatasi",
        "title_en": "SQL Syntax Error",
        "message_tr": "Uretilen SQL sorgusunda sozdizimi hatasi var.",
        "message_en": "The generated SQL query contains a syntax error.",
        "suggestion_tr": "Sorunuzu farkli sekilde ifade etmeyi deneyin veya SQL'i manuel duzenleyin.",
        "suggestion_en": "Try rephrasing your question or manually edit the SQL.",
        "severity": "warning",
    },
    # Baglanti hatasi
    {
        "patterns": [r"ConnectionRefusedError", r"ConnectionError", r"connect\s+failed",
                      r"could\s+not\s+connect", r"OperationalError.*connect"],
        "category": ErrorCategory.CONNECTION,
        "title_tr": "Baglanti Hatasi",
        "title_en": "Connection Error",
        "message_tr": "Veritabanina baglantilamadi.",
        "message_en": "Could not connect to the database.",
        "suggestion_tr": "Veritabani sunucusunun erisilebiir oldugunu kontrol edin.",
        "suggestion_en": "Verify that the database server is reachable.",
        "severity": "error",
    },
    # Yetki hatasi
    {
        "patterns": [r"permission\s+denied", r"access\s+denied", r"PERMISSION_DENIED",
                      r"InsufficientPrivilegesError"],
        "category": ErrorCategory.PERMISSION,
        "title_tr": "Yetki Hatasi",
        "title_en": "Permission Denied",
        "message_tr": "Bu islemi yapmak icin yeterli yetkiniz yok.",
        "message_en": "You do not have sufficient permissions for this operation.",
        "suggestion_tr": "Yoneticinizle iletisime gecin.",
        "suggestion_en": "Contact your administrator.",
        "severity": "error",
    },
]


# ---------------------------------------------------------------------------
# Ana Fonksiyonlar
# ---------------------------------------------------------------------------

def classify_error(error: Exception, stage: str = "unknown", lang: str = "tr") -> dict:
    """
    Bir Exception'i siniflandirir ve zengin hata bilgisi dondurur.

    Args:
        error: Yakalanan exception
        stage: Hatanin olustugu asama (llm_generation, sql_validation, sql_execution, vb.)
        lang: Kullanici dili (tr/en)

    Returns:
        dict: Zengin hata bilgisi
    """
    err_name = type(error).__name__
    err_msg = str(error) or err_name
    err_full = f"{err_name}: {err_msg}"

    # Pattern eslestirme
    matched = None
    for rule in _ERROR_PATTERNS:
        for pattern in rule["patterns"]:
            if re.search(pattern, err_full, re.IGNORECASE):
                matched = rule
                break
        if matched:
            break

    # Eslesmezse genel hata
    if not matched:
        matched = {
            "category": ErrorCategory.UNKNOWN,
            "title_tr": "Beklenmeyen Hata",
            "title_en": "Unexpected Error",
            "message_tr": "Beklenmeyen bir hata olustu.",
            "message_en": "An unexpected error occurred.",
            "suggestion_tr": "Sorgunuzu farkli sekilde ifade etmeyi deneyin.",
            "suggestion_en": "Try rephrasing your query.",
            "severity": "error",
        }

    # Asama bilgisi
    stage_labels = {
        "llm_generation": {"tr": "SQL Uretimi", "en": "SQL Generation"},
        "sql_validation": {"tr": "Guvenlik Kontrolu", "en": "Security Validation"},
        "sql_execution": {"tr": "Sorgu Calistirma", "en": "Query Execution"},
        "trino_connection": {"tr": "Trino Baglantisi", "en": "Trino Connection"},
        "cache_check": {"tr": "Onbellek Kontrolu", "en": "Cache Check"},
        "unknown": {"tr": "Bilinmiyor", "en": "Unknown"},
    }

    stage_info = stage_labels.get(stage, stage_labels["unknown"])

    suffix = "_tr" if lang == "tr" else "_en"

    return {
        "error_category": matched["category"],
        "error_title": matched[f"title{suffix}"],
        "error_message": matched[f"message{suffix}"],
        "error_suggestion": matched[f"suggestion{suffix}"],
        "error_severity": matched.get("severity", "error"),
        "error_stage": stage_info.get(lang, stage),
        "error_raw": err_full[:500],
        "error_type": err_name,
    }


def format_error_result(error_info: dict, lang: str = "tr") -> list:
    """
    classify_error sonucunu frontend icin legacy result formatina donustur.
    Detayli hata bilgisi satirlar halinde doner.
    """
    header = "SQL Hatasi" if lang == "tr" else "SQL Error"
    severity_icons = {"error": "❌", "warning": "⚠️", "info": "ℹ️"}
    icon = severity_icons.get(error_info["error_severity"], "❌")

    rows = [
        [f"{icon} {error_info['error_title']}"],
        [f"Asama: {error_info['error_stage']}"],
        [f"Detay: {error_info['error_raw']}"],
        [f"Oneri: {error_info['error_suggestion']}"],
    ]

    return [[header]] + rows
