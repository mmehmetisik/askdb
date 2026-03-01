import os
from dotenv import load_dotenv

load_dotenv()

# ---------- LOGGING ----------
from .logging_config import setup_logging
logger = setup_logging()

# ---------- ENV ----------
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
DATABASE_URL = os.getenv("POSTGRES_URL") or os.getenv("DATABASE_URL", "")
DB_TYPE = os.getenv("DB_TYPE", "postgresql")
DB_MODE = os.getenv("DB_MODE", "direct")  # "direct" veya "trino"

# ---------- TRINO ----------
TRINO_URL = os.getenv("TRINO_URL", "")
TRINO_CATALOG = os.getenv("TRINO_CATALOG", "")
TRINO_SCHEMA = os.getenv("TRINO_SCHEMA", "")

# ---------- AUTH DB (Trino modu icin) ----------
AUTH_DATABASE_URL = os.getenv("AUTH_DATABASE_URL", "")
AUTH_DB_TYPE = os.getenv("AUTH_DB_TYPE", "postgresql")

JWT_SECRET = os.getenv("JWT_SECRET")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 24
DEFAULT_ADMIN_PASSWORD = os.getenv("DEFAULT_ADMIN_PASSWORD", "Admin123!")
SECURE_COOKIE = os.getenv("SECURE_COOKIE", "true").lower() == "true"
MAX_QUERY_ROWS = int(os.getenv("MAX_QUERY_ROWS", "5000"))
CORS_ORIGINS = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5500,http://127.0.0.1:5500,http://localhost:8000,http://127.0.0.1:8000",
).split(",")

# ---------- LLM AYARLARI ----------
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "groq")  # groq,openai,anthropic
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")

# ---------- CACHE & RATE LIMIT ----------
CACHE_TTL_SECONDS = int(os.getenv("CACHE_TTL_SECONDS", "300"))
MAX_CACHE_SIZE = int(os.getenv("MAX_CACHE_SIZE", "100"))
RATE_LIMIT_USER = int(os.getenv("RATE_LIMIT_USER", "20"))
RATE_LIMIT_ADMIN = int(os.getenv("RATE_LIMIT_ADMIN", "60"))
RATE_LIMIT_WINDOW = int(os.getenv("RATE_LIMIT_WINDOW", "60"))

# ---------- REDIS (opsiyonel) ----------
REDIS_URL = os.getenv("REDIS_URL", "")  # ornek: redis://localhost:6379/0

# ---------- RAILWAY API (Trino servis kontrolu) ----------
RAILWAY_API_TOKEN = os.getenv("RAILWAY_API_TOKEN", "")
RAILWAY_PROJECT_ID = os.getenv("RAILWAY_TRINO_PROJECT_ID", "") or os.getenv("RAILWAY_PROJECT_ID", "")
RAILWAY_TRINO_SERVICE_ID = os.getenv("RAILWAY_TRINO_SERVICE_ID", "")
RAILWAY_TRINO_ENV_ID = os.getenv("RAILWAY_TRINO_ENV_ID", "")

# ---------- TABLO ERISIM KONTROLU ----------
def parse_tables_by_catalog(tables: set) -> dict[str, dict[str, set[str]]]:
    """Parse any table set into Trino catalog structure (catalog.schema.table)."""
    by_catalog: dict[str, dict[str, set[str]]] = {}
    for t in tables:
        parts = t.split(".")
        if len(parts) == 3:
            catalog, schema, table = parts
        elif len(parts) == 2:
            catalog = TRINO_CATALOG or "hive"
            schema, table = parts
        else:
            catalog = TRINO_CATALOG or "hive"
            schema = TRINO_SCHEMA or "default"
            table = parts[0]
        by_catalog.setdefault(catalog, {}).setdefault(schema, set()).add(table)
    return by_catalog


def _parse_allowed_tables():
    """Parse ALLOWED_TABLES env var into flat set + catalog dict."""
    raw = os.getenv("ALLOWED_TABLES", "customers,orders,order_items")
    tables = {t.strip() for t in raw.split(",") if t.strip()}
    by_catalog = parse_tables_by_catalog(tables) if DB_MODE == "trino" else {}
    return tables, by_catalog

ALLOWED_TABLES, ALLOWED_TABLES_BY_CATALOG = _parse_allowed_tables()

# ---------- ZORUNLU DEGISKENLER ----------
_has_llm = any([GROQ_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY])
if not _has_llm:
    raise RuntimeError("En az bir LLM API key gerekli! (GROQ_API_KEY, OPENAI_API_KEY, veya ANTHROPIC_API_KEY)")

if DB_MODE == "trino":
    if not TRINO_URL:
        raise RuntimeError("DB_MODE=trino icin TRINO_URL gerekli!")
    if not AUTH_DATABASE_URL:
        raise RuntimeError("DB_MODE=trino icin AUTH_DATABASE_URL gerekli! (app_users icin yazilabilir DB)")
elif DB_MODE == "direct":
    if not DATABASE_URL:
        raise RuntimeError("POSTGRES_URL veya DATABASE_URL ortam degiskeni gerekli!")
else:
    raise RuntimeError(f"Gecersiz DB_MODE: {DB_MODE}. 'direct' veya 'trino' kullanin.")

if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET ortam degiskeni gerekli! Guvenlik icin benzersiz bir secret belirleyin.")

# ---------- SCHEMA & PROMPTS ----------
# Statik schema — varsayilan fallback. Dinamik schema DB'den calisma zamaninda cekilir.
# NOT: Bu sadece dinamik schema yuklenemediginde kullanilir. Normal calismada DB'den otomatik cekilir.
SCHEMA_INFO = "(Schema bilgisi dinamik olarak veritabanindan yuklenir. Statik schema mevcut degil.)"

# Dinamik schema icin global degisken (calisma zamaninda doldurulur)
DYNAMIC_SCHEMA: str = ""

BUSINESS_LOGIC = """
- Tablo ve sutun isimlerini YALNIZCA verilen schema bilgisinden sec. Schema'da bulunmayan tablo veya sutun ASLA kullanma.
- Isim aramalarinda buyuk/kucuk harf duyarsiz arama yap (PostgreSQL: ILIKE, MySQL: LIKE, MSSQL: LIKE).
- Tarih filtrelerinde tablodaki tarih/zaman sutunlarini kullan.
- 'Son X gun' ifadelerinde uygun tarih sutununu ve CURRENT_DATE - INTERVAL kullan.
- Aggregation gerektiren sorularda GROUP BY ile SUM, AVG, COUNT, MAX, MIN kullan.
- Sonuclari anlamli siralama ile dondur (genellikle buyukten kucuge DESC).
- NULL degerleri icin COALESCE veya IS NULL / IS NOT NULL kullan.
- Metin aramalarinda '%keyword%' wildcard kalibini kullan.
- Sonuc sayisini LIMIT ile sinirla (gereksiz buyuk sonuc kumesi dondurme).
- Birden fazla tablo arasi iliskili sorgularda uygun JOIN turunu sec.
- Sayisal degerler icin SUM (toplam), COUNT (adet), AVG (ortalama) ayrimi yap.
- 'En cok/en az' ifadelerinde ORDER BY ... DESC/ASC LIMIT 1 veya MAX/MIN kullan.
"""

FEW_SHOT_EXAMPLES = """
Asagidaki ornekler SQL kaliplarini gostermektedir. Gercek tablo ve sutun isimlerini YUKARIDAKI SCHEMA bilgisinden al.

Soru: Toplam kayit sayisi kac?
SQL: SELECT COUNT(*) AS toplam FROM <tablo>;

Soru: Son 7 gundeki kayitlar neler?
SQL: SELECT * FROM <tablo> WHERE <tarih_sutunu> >= CURRENT_DATE - INTERVAL '7 days' ORDER BY <tarih_sutunu> DESC;

Soru: En yuksek degere sahip ilk 5 kayit?
SQL: SELECT * FROM <tablo> ORDER BY <sayisal_sutun> DESC LIMIT 5;

Soru: Kategoriye gore toplam ve ortalama nedir?
SQL: SELECT <kategori_sutunu>, COUNT(*) AS adet, SUM(<deger_sutunu>) AS toplam, AVG(<deger_sutunu>) AS ortalama FROM <tablo> GROUP BY <kategori_sutunu> ORDER BY toplam DESC;

Soru: Iki tablo arasindaki iliskili verileri getir
SQL: SELECT a.*, b.<sutun> FROM <tablo_a> a JOIN <tablo_b> b ON a.<ortak_id> = b.<ortak_id> ORDER BY a.<sutun> DESC LIMIT 20;

Soru: Belirli bir isimdeki kayitlari bul
SQL: SELECT * FROM <tablo> WHERE <metin_sutunu> ILIKE '%arama_kelimesi%';
"""


async def build_dynamic_schema() -> str:
    """Veritabanindan dinamik schema bilgisi olustur."""
    global DYNAMIC_SCHEMA
    try:
        from backend.sql.execution.database import get_schema_info
        tables = await get_schema_info()
        if not tables:
            return SCHEMA_INFO  # Fallback to static

        lines = []
        for table in tables:
            cols = []
            for col in table["columns"]:
                pk = " PRIMARY KEY" if col.get("is_pk") else ""
                nullable = "" if col.get("nullable") else " NOT NULL"
                cols.append(f"  {col['name']} {col['type'].upper()}{pk}{nullable}")
            # Trino modunda catalog.schema.table formati kullan
            tbl_name = table.get("full_name") or table["name"]
            lines.append(f"CREATE TABLE {tbl_name} (\n" + ",\n".join(cols) + "\n);")

        DYNAMIC_SCHEMA = "\n\n".join(lines)
        logger.info(f"[SCHEMA] Dynamic schema built ({len(tables)} tables)")
        return DYNAMIC_SCHEMA
    except Exception as e:
        logger.warning(f"[SCHEMA] Dynamic schema build failed, using static: {e}")
        return SCHEMA_INFO


def get_active_schema() -> str:
    """Aktif schema'yi dondur (dinamik varsa onu, yoksa statik)."""
    return DYNAMIC_SCHEMA if DYNAMIC_SCHEMA else SCHEMA_INFO
