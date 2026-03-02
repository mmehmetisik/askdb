import re
from backend.core.config import BUSINESS_LOGIC, FEW_SHOT_EXAMPLES, DB_TYPE, DB_MODE, logger, get_active_schema
from .providers import build_llm_chain

# LLM zincirini baslat
_chain = build_llm_chain()


def qualify_trino_tables(sql: str) -> str:
    """LLM bare tablo adlari uretirse, Trino icin catalog.schema.table formatina donustur.

    Ornek: FROM customers c → FROM musteri_pg.public.customers c
    """
    from backend.core.config import TRINO_TABLE_MAP
    if not TRINO_TABLE_MAP:
        return sql

    def _replacer(match):
        keyword = match.group(1)     # FROM / JOIN + bosluk
        table_name = match.group(2)  # bare tablo adi
        rest = match.group(3)        # sonraki bosluk/karakter
        qualified = TRINO_TABLE_MAP.get(table_name.lower())
        if qualified:
            return f"{keyword}{qualified}{rest}"
        return match.group(0)  # degistirme

    # FROM|JOIN sonrasi gelen bare tablo adlarini yakala
    # Zaten nitelikli olanlar (nokta iceren) eslesmez cunku \w noktayi icermez
    result = re.sub(
        r'((?:FROM|JOIN)\s+)(\w+)(\s)',
        _replacer,
        sql,
        flags=re.IGNORECASE,
    )

    if result != sql:
        logger.info(f"[TRINO QUALIFY] Bare table names replaced: {sql.strip()[:80]}... -> {result.strip()[:80]}...")

    return result

# Dialect bilgisi
_DIALECT_MAP = {
    "postgresql": "PostgreSQL",
    "postgres": "PostgreSQL",
    "mysql": "MySQL",
    "mssql": "Microsoft SQL Server (T-SQL)",
    "trino": "Trino (ANSI SQL)",
}


def _clean_sql(sql: str) -> str:
    """LLM ciktisindaki markdown isaretlerini temizle."""
    if sql.startswith("```sql"):
        sql = sql[6:]
    if sql.startswith("```"):
        sql = sql[3:]
    if sql.endswith("```"):
        sql = sql[:-3]
    return sql.strip()


def _get_dialect_name(db_type: str | None = None) -> str:
    if DB_MODE == "trino":
        return "Trino (ANSI SQL)"
    effective = (db_type or DB_TYPE).lower()
    return _DIALECT_MAP.get(effective, "PostgreSQL")


def _get_dialect_notes(db_type: str | None = None) -> str:
    """Dialect'e ozel notlar."""
    if DB_MODE == "trino":
        # Dinamik ornek olustur (hardcode tablo adi yok)
        from backend.core.config import TRINO_TABLE_MAP
        example = ""
        if TRINO_TABLE_MAP:
            first_bare = next(iter(TRINO_TABLE_MAP))
            first_full = TRINO_TABLE_MAP[first_bare]
            example = (
                f"- YANLIS: FROM {first_bare} → HATA VERIR!\n"
                f"- DOGRU:  FROM {first_full}\n"
            )
        return (
            "!! KRITIK: Trino'da tablo adlari HER ZAMAN catalog.schema.table formatinda yazilmali!\n"
            f"{example}"
            "- Schema'daki CREATE TABLE satirlarindaki tam isimleri AYNEN kullan.\n"
            "- JOIN yaparken de tam isim kullan.\n"
            "- Trino ANSI SQL kullanir.\n"
            "- LIMIT ile sonuc sinirla.\n"
            "- LOWER() ile buyuk/kucuk harf duyarsiz arama yap.\n"
            "- Sadece SELECT sorgusu yaz, Trino read-only.\n"
            "- CAST(x AS type) ile tip donusumu yap.\n"
            "- CURRENT_DATE, CURRENT_TIMESTAMP kullan."
        )
    dialect = (db_type or DB_TYPE).lower()
    if dialect in ("postgresql", "postgres"):
        return "- ILIKE buyuk/kucuk harf duyarsiz arama icin kullan.\n- LIMIT ile sonuc sinirla."
    elif dialect in ("mysql", "mariadb"):
        return (
            "- ILIKE KULLANMA, MySQL'de ILIKE YOK! Metin aramasi icin LIKE kullan (MySQL LIKE zaten case-insensitive).\n"
            "- INTERVAL 1 YEAR seklinde yaz (INTERVAL '1 year' DEGIL, tirnak kullanma).\n"
            "- INTERVAL 7 DAY seklinde yaz (INTERVAL '7 days' DEGIL).\n"
            "- NOW() veya CURDATE() kullan (CURRENT_DATE de calisir).\n"
            "- LIMIT ile sonuc sinirla.\n"
            "- Backtick (`) ile reserved kelimeleri koru.\n"
            "- PostgreSQL syntax'i KULLANMA, bu MySQL veritabani."
        )
    elif dialect == "mssql":
        return "- LIKE kullan (buyuk/kucuk harf duyarliligi collation'a bagli).\n- TOP N ile sonuc sinirla (LIMIT yok).\n- Tarih islemlerinde DATEADD/DATEDIFF kullan.\n- GETDATE() fonksiyonunu kullan (NOW() yok)."
    return ""


async def generate_sql(question: str, selected_tables: list[str] | None = None,
                       db_type: str | None = None, use_trino: bool = False) -> str:
    # Trino modunda full_name'li schema kullan
    if use_trino:
        from backend.core.config import TRINO_DYNAMIC_SCHEMA
        schema = TRINO_DYNAMIC_SCHEMA or get_active_schema()
    else:
        schema = get_active_schema()
    dialect = _get_dialect_name(db_type)
    dialect_notes = _get_dialect_notes(db_type)

    table_hint = ""
    if selected_tables:
        table_hint = f"\n[ODAKLANILACAK TABLOLAR]\nKullanici su tablolari secti: {', '.join(selected_tables)}. Sorguyu ONCELIKLE bu tablolar uzerinden olustur. Gerekirse bu tablolari JOIN ile birlestir.\n"

    prompt = f"""Sen uzman bir {dialect} gelistiricisisin.
Asagidaki veritabani semasina, is kurallarina ve ornek sorgulara gore kullanicinin sorusunu cevaplayacak en dogru SQL sorgusunu yaz.
Sadece SQL sorgusu uret.
Kesinlikle aciklama yazma.
Markdown (```sql vb.) KULLANMA.

[VERITABANI TIPI]
{dialect}

[DIALECT KURALLARI]
{dialect_notes}

[VERITABANI SEMASI]
{schema}
{table_hint}
[IS KURALLARI VE SOZLUK]
{BUSINESS_LOGIC}

[ORNEK SORGULAR]
{FEW_SHOT_EXAMPLES}

[KULLANICI SORUSU]
Soru: {question}
SQL:"""

    response = await _chain.generate(
        messages=[{"role": "user", "content": prompt}],
        temperature=0,
        max_tokens=512,
    )
    result = _clean_sql(response)
    logger.info(f"[LLM] Provider: {_chain.active_provider_name}")
    return result


async def retry_safe_sql(question: str, bad_sql: str,
                         db_type: str | None = None) -> str:
    """Tehlikeli SQL geldiginde LLM'den sadece SELECT sorgusu iste."""
    schema = get_active_schema()
    dialect = _get_dialect_name(db_type)

    prompt = f"""Onceki sorgun tehlikeli komutlar iceriyordu ve REDDEDILDI:
{bad_sql}

KURALLAR:
- SADECE SELECT veya WITH ... SELECT sorgusu yaz.
- DELETE, UPDATE, INSERT, DROP, ALTER, TRUNCATE gibi komutlar YASAK.
- Sadece veri OKUMA islemi yap.
- Aciklama yazma, sadece SQL ver.
- Markdown kullanma.
- Veritabani tipi: {dialect}

[VERITABANI SEMASI]
{schema}

Kullanici sorusu: {question}
Guvenli SQL:"""

    response = await _chain.generate(
        messages=[{"role": "user", "content": prompt}],
        temperature=0,
        max_tokens=512,
    )
    return _clean_sql(response)


async def retry_fix_sql(question: str, bad_sql: str, error_msg: str,
                        selected_tables: list[str] | None = None,
                        db_type: str | None = None) -> str:
    """SQL calistirilirken hata alindiysa, hatayi LLM'e gosterip duzeltmesini iste."""
    schema = get_active_schema()
    dialect = _get_dialect_name(db_type)

    table_hint = ""
    if selected_tables:
        table_hint = f"\nKullanicinin sectigi tablolar: {', '.join(selected_tables)}. SADECE bu tablolardaki sutunlari kullan.\n"

    trino_warning = ""
    if DB_MODE == "trino":
        from backend.core.config import TRINO_TABLE_MAP
        example = ""
        if TRINO_TABLE_MAP:
            first_bare = next(iter(TRINO_TABLE_MAP))
            first_full = TRINO_TABLE_MAP[first_bare]
            example = f"\n- YANLIS: FROM {first_bare}\n- DOGRU:  FROM {first_full}"
        trino_warning = (
            "\n!! KRITIK: Trino'da tablo adlari HER ZAMAN catalog.schema.table formatinda yazilmali!"
            f"{example}"
            "\n- Schema'daki CREATE TABLE satirlarindaki tam isimleri AYNEN kullan.\n"
        )

    prompt = f"""Onceki SQL sorgun veritabaninda calistirilirken HATA aldi:

SQL: {bad_sql}
HATA: {error_msg}

BU HATAYI DUZELT. Kurallar:
- YALNIZCA asagidaki schema'daki tablo ve sutun isimlerini kullan.
- Schema'da OLMAYAN tablo veya sutun ASLA kullanma.
- Sadece SELECT sorgusu yaz. Aciklama yazma. Markdown kullanma.
- Veritabani tipi: {dialect}
{trino_warning}{table_hint}
[VERITABANI SEMASI]
{schema}

Kullanici sorusu: {question}
Duzeltilmis SQL:"""

    response = await _chain.generate(
        messages=[{"role": "user", "content": prompt}],
        temperature=0,
        max_tokens=512,
    )
    return _clean_sql(response)


async def interpret_results(question: str, sql: str, result: list) -> str:
    """Sorgu sonucunu Turkce olarak yorumla."""
    try:
        result_preview = str(result[:11])
        response = await _chain.generate(
            messages=[{"role": "user", "content": f"""Asagidaki SQL sorgu sonucunu Turkce olarak kisa ve net yorumla.
Kullanicinin sorusu: {question}
SQL: {sql}
Sonuc (ilk 10 satir): {result_preview}
Toplam satir: {len(result)-1}

2-3 cumle ile ozetini yaz. Rakamlar varsa vurgula. Emoji kullanma."""}],
            temperature=0.3,
            max_tokens=200,
        )
        logger.info(f"[AI YORUM] {response}")
        return response
    except Exception as e:
        logger.warning(f"[AI YORUM HATASI] {e}")
        return ""


def get_llm_info() -> dict:
    """Aktif LLM bilgisini dondur."""
    return {
        "active_provider": _chain.active_provider_name,
        "provider_count": len(_chain.providers),
        "providers": [p.name() for p in _chain.providers],
    }
