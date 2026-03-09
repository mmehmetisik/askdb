# backend/sql/llm/service.py

## Amac
Dogal dil sorularini SQL'e ceviren LLM entegrasyon katmani. Schema, is kurallari ve dialect bilgisiyle prompt olusturur. Hata durumunda retry mekanizmasi sunar.

## Bagimliliklari
- `backend.core.config` -- BUSINESS_LOGIC, FEW_SHOT_EXAMPLES, get_active_schema
- `backend.sql.llm.providers` -- build_llm_chain, LLMChain

## Fonksiyonlar / Class'lar

| Fonksiyon | Parametreler | Donus | Aciklama |
|---|---|---|---|
| `generate_sql` | question, selected_tables, db_type, use_trino | str | Sorudan SQL uretir |
| `retry_safe_sql` | question, bad_sql, db_type | str | Tehlikeli SQL icin guvenli SELECT ister |
| `retry_fix_sql` | question, bad_sql, error_msg, ... | str | Hata alindiginda LLM'den duzeltme ister |
| `interpret_results` | question, sql, result | str | Sorgu sonucunu Turkce yorumlar |
| `qualify_trino_tables` | sql | str | Tablo adlarini Trino formatina cevirir |
| `get_llm_info` | - | dict | Aktif LLM provider bilgisi |

## Ornek Kullanim

```python
sql = await generate_sql("En cok satan urun?", ["products"], "postgresql")
```

## Degisiklik Gecmisi

| Tarih | Aciklama |
|---|---|
| 1 Mart 2026 | Ilk surum |
