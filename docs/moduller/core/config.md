# config.py

## Amac
Uygulamanin tum konfigurasyonunu `.env` dosyasindan yukler, zorunlu degiskenleri dogrular ve dinamik schema yonetimini saglar.

## Bagimliliklari
- `os`, `dotenv` -- ortam degiskenleri
- `backend.core.logging_config` -- logger kurulumu
- `backend.sql.execution.database` -- dinamik schema icin (runtime)

## Fonksiyonlar / Class'lar

| Fonksiyon | Donus | Aciklama |
|---|---|---|
| `parse_tables_by_catalog` | `dict` | Tablo isimlerini Trino catalog yapisina ayristirir |
| `_parse_allowed_tables` | `tuple` | ALLOWED_TABLES env degerini parse eder |
| `get_all_allowed_tables_sync` | `set[str]` | Statik + dinamik izinli tablolari birlestirir |
| `build_dynamic_schema` | `str` | DB'den CREATE TABLE formati uretir (async) |
| `get_active_schema` | `str` | Dinamik veya statik schema dondurur |

## Onemli Sabitler

| Degisken | Varsayilan | Aciklama |
|---|---|---|
| `DB_MODE` | `"direct"` | direct veya trino |
| `LLM_PROVIDER` | `"groq"` | groq, openai, anthropic |
| `JWT_EXPIRY_HOURS` | `24` | Token gecerlilik suresi |
| `MAX_QUERY_ROWS` | `5000` | Sorgu sonuc limiti |

## Ornek Kullanim

```python
from backend.core.config import get_active_schema, ALLOWED_TABLES, logger
schema = get_active_schema()
```

## Degisiklik Gecmisi

| Tarih | Aciklama |
|---|---|
| 1 Mart 2026 | Ilk surum |
