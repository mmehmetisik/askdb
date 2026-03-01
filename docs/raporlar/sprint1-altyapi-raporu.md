# Sprint 1 — Altyapi ve Multi-DB Entegrasyon Raporu

**Tarih**: 1 Mart 2026
**Hazirlayan**: Mehmet ISIK (Product Owner + AI Team Lead)
**Durum**: Tamamlandi ✅

---

## Ozet

Sprint 1'in ilk gununde AskDB'nin **Multi-Database (Cross-DB)** altyapisini uretim ortamina (Railway) tasidim. Amac: Farkli veritabanlarindaki tablolari tek bir arayuzden dogal dille sorgulanabilir hale getirmek.

3 farkli veritabani basariyla baglandi:

| Baglanti Adi | Tip | Host | Tablo Sayisi |
|---|---|---|---|
| musteri_pg | PostgreSQL | Supabase (pgbouncer) | 2 (accounts, customers) |
| operasyon_db | MySQL | Aiven | 3 (branches, customer_visits, employees) |
| finans_mysql | MySQL | Aiven | 3 (credit_scores, loans, payments) |

**Trino Federation** uzerinden bu 8 tablo tek bir sorgu motorunda birlesti. Kullanicilar artik Cross-DB sekmesinden veritabanlari arasi JOIN sorgulari yapabilir.

---

## Karsilasilan Sorunlar ve Cozumleri

### 1. Aiven MySQL SSL Baglanti Hatasi

**Sorun**: Aiven uzerindeki MySQL veritabanlarina (operasyon_db, finans_mysql) baglanirken SSL sertifika dogrulama hatasi aliniyordu. Aiven self-signed sertifika kullandigi icin Python'un varsayilan SSL dogrulamasi reddediyordu.

**Cozum**: MySQL adapter'a SSL destegi eklendi. `ssl_enabled` parametresi ile self-signed sertifikalar icin `check_hostname=False` ve `verify_mode=CERT_NONE` ayarlari yapildi.

**Dosya**: `backend/sql/execution/adapters.py` — `MySQLAdapter.init()`

---

### 2. MySQL Tablo Kesfinde Buyuk/Kucuk Harf Sorunu

**Sorun**: MySQL'in `information_schema.tables` tablosunda sutun adlari buyuk harfle donuyor (`TABLE_NAME`), PostgreSQL'de kucuk harfle (`table_name`). Tablo kesif endpoint'i sadece kucuk harfi destekliyordu.

**Cozum**: Her iki formati da kontrol eden esnek bir okuma eklendi: `r.get("table_name") or r.get("TABLE_NAME")`.

**Dosya**: `backend/admin/routes.py` — `discover_tables()`

---

### 3. Direct Mode Multi-DB Adapter Mimarisi

**Sorun**: AskDB baslangicta tek bir veritabanina baglaniyordu. Birden fazla DB'yi ayni anda sorgulamak icin her baglantinin kendi adapter'ina ihtiyaci vardi.

**Cozum**: `init_direct_adapters()` sistemi kuruldu:
- Her `db_connections` kaydina ozel adapter olusturulur
- `_table_conn_map` ile hangi tablonun hangi baglantiya ait oldugu izlenir
- `resolve_adapter_for_tables()` sorgu sirasinda dogru adapter'a yonlendirir
- Farkli DB'lerdeki tablolar tek sorguda kullanilamaz — bunun icin Trino gerekir

**Dosyalar**: `backend/sql/execution/database.py` — `init_direct_adapters()`, `resolve_adapter_for_tables()`

---

### 4. Trino "Catalog 'hive' not found" Hatasi ⭐

**Bu Sprint'in en buyuk teknik sorunuydu.**

**Sorun**: Trino aktif edildiginde schema bilgisi cekilirken `Catalog 'hive' does not exist` hatasi aliniyordu. Tablolar gorunmuyor, Cross-DB sorgu atilamiyordu.

**Kok Neden Analizi**:
1. `get_trino_schema_info()` fonksiyonu, Trino'nun kendi `allowed_tables` listesi bossa diger baglantilarin tablolarini topluyordu
2. Bu tablolar duz isim olarak geliyordu (ornek: `credit_scores`, `customers`)
3. `parse_tables_by_catalog()` fonksiyonu duz isimleri varsayilan olarak `hive` katalogunua atiyordu
4. Railway'deki Trino sunucusunda `hive` katalogu tanimli degil — kataloglar `musteri_pg`, `operasyon_db`, `finans_mysql` olarak tanimli

**Cozum**: Tablo isimlerini Trino'nun `catalog.schema.table` formatina donusturecek mantik eklendi:
- PostgreSQL tablolari → `{conn_name}.public.{table}` (ornek: `musteri_pg.public.customers`)
- MySQL tablolari → `{conn_name}.{database_name}.{table}` (ornek: `finans_mysql.finans_db.credit_scores`)

**Dosya**: `backend/sql/execution/database.py` — `get_trino_schema_info()`

---

### 5. Railway Admin Panel "Not Authorized" Hatasi

**Sorun**: Admin paneldeki "Servisi Baslat" ve "Servisi Durdur" butonlari Railway API'den `Not Authorized` hatasi donuyordu.

**Kok Neden**: Railway platformu, kendi altyapisinin icinden (`serviceInstanceRedeploy` mutation'i) bazi islemleri kisitliyor. AskDB web servisi de Railway uzerinde calistigi icin bu kisitlamaya takiliyordu.

**Cozum**:
- Birincil yontem (`serviceInstanceRedeploy`) basarisiz olursa ikincil yontem (`deploymentRedeploy`) denenir
- Her iki yontem de basarisizsa kullaniciya Railway Dashboard linki gosterilir
- Hata mesajlari aciklayici hale getirildi

**Dosya**: `backend/admin/routes.py` — `trino_railway_start()`, `trino_railway_stop()`

---

### 6. Railway API NoneType Crash

**Sorun**: Railway API bazen `{"data": None, "errors": [...]}` donduruyordu. Kod `result.get("data", {})` kullanyordu — ama `data` anahtari varsa ve degeri `None` ise `.get()` default yerine `None` dondurur. Ardindan `None.get("service")` cagrilip `NoneType` hatasi olusuyordu.

**Cozum**: Tum Railway API erisim noktalarinda null-safe pattern uyguandi:
```python
# Eski (hatali):
result.get("data", {}).get("service", {})

# Yeni (guvenli):
(result.get("data") or {}).get("service") or {}
```

**Dosya**: `backend/admin/routes.py`

---

### 7. RAILWAY_TRINO_SERVICE_ID Bos Hatasi

**Sorun**: Trino servisini baslatmak/durdurmak icin gereken `RAILWAY_TRINO_SERVICE_ID` environment variable'i askdb-web servisinde tanimli degildi. Sonuc: "RAILWAY_TRINO_SERVICE_ID yapilandirilmamis" hatasi.

**Cozum**: Environment variable'a bagimlilik tamamen kaldirildi. Yeni `_get_trino_service_id()` fonksiyonu su siralamayla calisir:
1. Env variable varsa → onu kullan
2. Cache'te varsa → onu kullan
3. Ikisi de yoksa → Railway API'den projedeki servisleri listele, adinda "trino" geceni otomatik bul

Artik `RAILWAY_TRINO_SERVICE_ID` tanimlamaya **gerek yok**.

**Dosya**: `backend/admin/routes.py` — `_get_trino_service_id()`

---

### 8. pgbouncer Prepared Statement Catismasi

**Sorun**: musteri_pg (Supabase) pgbouncer kullandigi icin `prepared statement "__asyncpg_stmt_8__" already exists` hatasi olusuyordu. Sonuc: musteri_pg tablolari yuklenemiyordu, 10 tablo yerine 8 tablo gorunuyordu.

**Kok Neden**: asyncpg kutuphanesi varsayilan olarak prepared statement'lari cache'liyor. pgbouncer transaction pooling modunda baglantilari paylasiyor — onceki session'dan kalan prepared statement'lar cakisiyordu.

**Cozum**:
- `statement_cache_size=0` parametresi asyncpg pool'a eklendi
- `run_query()` metodunda explicit `prepare()` cagrisi kaldirildi, yerine `fetch()` kullanildi
- Column type bilgisi icin `_pg_python_type()` helper fonksiyonu yazildi (Python degerlerinden tip cikarimi yapar)

**Dosya**: `backend/sql/execution/adapters.py` — `PostgreSQLAdapter`

---

### 9. Trino Schema Yuklenemedi (Cross-DB Sayfasi)

**Sorun**: Cross-DB sekmesinde "Schema yuklenemedi" hatasi cikiyordu. Trino schema sorgusu sirasinda bir katalog hata verince TUM schema cagrisi cokuyordu.

**Cozum**:
- Trino adapter'da per-catalog hata yakalama eklendi — bir katalog basarisiz olsa bile digerlerinin tablolari gosterilir
- Schema endpoint'ine fallback eklendi — Trino schema patlarsa direct mode'a dusulur, bos sayfa yerine en azindan mevcut tablolar gosterilir
- Detayli loglama eklendi (hangi tablolar, hangi kataloglar, sonuc kac tablo)

**Dosyalar**:
- `backend/sql/execution/adapters.py` — `TrinoAdapter.get_schema_info()`
- `backend/sql/schema/routes.py` — `/api/schema` endpoint
- `backend/sql/execution/database.py` — `get_trino_schema_info()`

---

## LLM Prompt Guncellemeleri (BUSINESS_LOGIC + FEW_SHOT_EXAMPLES)

LLM'e gonderilen prompt'ta 3 kritik sorun vardi:

### BUSINESS_LOGIC (Cozuldu)
Eski `BUSINESS_LOGIC` prompt'u hardcoded tablo isimlerine referans veriyordu (customers, orders, order_items). Bu, farkli veritabanlari baglandiginda LLM'in yanlis tablolara yonelmesine neden olabilirdu.

**Yeni hali**: Tamamen jenerik SQL kurallari — ILIKE/LIKE kullanimi, tarih filtreleri, aggregation, JOIN, LIMIT gibi genel SQL en iyi pratikleri iceriyor. Hangi tablo olursa olsun gecerli.

### FEW_SHOT_EXAMPLES (Cozuldu)
Eski ornekler `orders.total_amount`, `order_items.quantity` gibi **mevcut tablolarla eslesmeyebilecek** hardcoded sutun isimleri iceriyordu. LLM bu orneklere bakarak olmayan sutunlar kullaninca `UndefinedColumnError` hatasi olusuyordu.

**Ornek**: LLM, few-shot'ta gordugu `total_amount` sutununu kullaniyordu ama gercek tabloda bu sutun yok → SQL hatasi.

**Yeni hali**: Jenerik SQL kalip ornekleri (`<tablo>`, `<sutun>` placeholder'lari ile). LLM artik gercek tablo/sutun isimlerini SCHEMA bilgisinden aliyor, few-shot orneklerinden degil.

### SCHEMA_INFO Statik Fallback (Cozuldu)
Eski statik schema, `customers`, `orders`, `order_items` tablolarini tanimliyordu. Dinamik schema yuklenemezse bu yanlis bilgi LLM'e gidiyordu.

**Yeni hali**: Statik schema kaldirilildi, yerine "dinamik olarak yuklenir" mesaji konuldu. Uygulama her zaman veritabanindan gercek schema'yi ceker.

**Dosya**: `backend/core/config.py` — `BUSINESS_LOGIC`, `FEW_SHOT_EXAMPLES`, `SCHEMA_INFO`

---

## Yapilan Commit'ler (Kronolojik)

| Commit | Aciklama |
|--------|----------|
| `f6c7e54` | MySQL/TiDB Cloud icin SSL destegi eklendi |
| `f132dcb` | Aiven self-signed sertifika icin MySQL SSL fix |
| `3e6b2c4` | MySQL tablo kesfinde buyuk/kucuk harf duzeltmesi |
| `931905e` | Direct modda multi-DB adapter destegi eklendi |
| `03971ae` | Admin panele Railway Trino servis kontrolu eklendi |
| `2af7b02` | Dinamik Trino aktivasyonunda schema kesfini duzeltme |
| `04e335d` | Railway API hata yonetimi iyilestirmesi |
| `7b06a68` | **Trino 'hive' katalog hatasini duzeltme** + BUSINESS_LOGIC jenerik |
| `886cfee` | Railway API NoneType crash fix + bos service ID kontrolu |
| `1e62887` | pgbouncer prepared statement catismasi fix |
| `5cc8020` | Railway Trino service ID otomatik kesfi |
| `fea26e8` | Trino schema per-catalog hata yakalama ve fallback |
| *(bekliyor)* | FEW_SHOT_EXAMPLES + SCHEMA_INFO jenerik hale getirildi |

---

## Mevcut Durum

### Calisan Ozellikler ✅
- 3 veritabani baglantisi (musteri_pg, operasyon_db, finans_mysql) — hepsi saglikli
- Trino Cross-DB federation — 8 tablo gorunuyor, sorgulama hazir
- Direct mode — tek DB sorgulari icin her baglantinin kendi adapter'i var (10 tablo)
- Admin panelden Railway Trino servis kontrolu (baslat/durdur/durum)
- Railway servis ID otomatik kesfi (env variable gereksiz)
- pgbouncer uyumlulugu (Supabase baglantilari sorunsuz)
- Schema fallback (Trino cokse bile direct mode calisir)
- LLM prompt'lari jenerik (hardcoded tablo referansi yok)

### Railway Maliyet Notu
Trino servisi Railway'de **kullanilmadigi surece durdurulmali** (para yazmasin). Admin panelden "Servisi Durdur" butonuyla kapatilabilir, gerektiginde "Servisi Baslat" ile 1-2 dakikada tekrar ayaga kalkar.

---

## Degisiklik Yapilan Dosyalar

| Dosya | Ne Degisti |
|-------|-----------|
| `backend/sql/execution/adapters.py` | MySQL SSL, pgbouncer fix, Trino per-catalog hata yakalama |
| `backend/sql/execution/database.py` | Multi-DB adapter, Trino hive fix, schema loglama |
| `backend/admin/routes.py` | Railway API entegrasyonu, auto-discover, NoneType fix |
| `backend/core/config.py` | BUSINESS_LOGIC jenerik hale getirildi |
| `backend/sql/schema/routes.py` | Trino schema fallback eklendi |
| `docs/kurallar.md` | Sprint suresi 7 gune, sorgu onay PO'ya guncellendi |

---

**Not**: Bu rapor Sprint 1'in ilk gunu yapilan altyapi calismasini kapsar. Ekip uyelerinin gorevleri (SQL test sorgulari, analiz modulu testleri, dokumantasyon vb.) Sprint boyunca devam edecektir.
