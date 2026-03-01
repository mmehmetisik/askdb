# SSL Baglanti Duzeltmesi — TiDB Cloud (MySQL Uyumlu)

**Yazan**: Mehmet ISIK (PO + AI Team Lead)
**Tarih**: 1 Mart 2026
**Sprint**: 1
**Commit**: `f6c7e54` — Add SSL support for MySQL/TiDB Cloud connections

---

## Sorun

TiDB Cloud (MySQL uyumlu) veritabanini admin panelinden eklemeye calistigimizda asagidaki hatayi aldik:

```
Baglanti basarisiz: OperationalError: (1105, 'Connections using insecure transport are prohibited.
See https://docs.pingcap.com/tidbcloud/secure-connections-to-serverless-tier-clusters')
```

TiDB Cloud serverless cluster'lari guvenlik geregi **sadece SSL/TLS baglantilari** kabul ediyor. Sifresiz (plain text) baglanti reddediliyor.

### Baglanti Bilgileri

| Alan | Deger |
|------|-------|
| **Host** | gateway01.eu-central-1.prod.aws.tidbcloud.com |
| **Port** | 4000 |
| **Veritabani** | operasyon |
| **Kullanici** | 2ccqDANmLLwEsPe.root |
| **SSL** | Gerekli (zorunlu) |
| **Tablolar** | branches (1K), employees (100K), customer_visits (900K) |

---

## Neden Oldu?

AskDB'nin MySQL adapter'i (`MySQLAdapter`) baglanti havuzu olustururken SSL parametresi gondermiyor:

```python
# ESKI KOD — SSL destegi yok
self.pool = await aiomysql.create_pool(
    minsize=2, maxsize=10, connect_timeout=30, **params
)
```

`aiomysql` kutuphanesine `ssl` parametresi verilmedigi icin baglanti duz metin (plain text) olarak kurulmaya calisiliyor. TiDB Cloud bunu reddediyor.

Ayrica admin panelindeki **"Baglantiyi Test Et"** ve **"Tablo Kesfet"** endpointleri de `ssl_enabled` bilgisini adapter'a iletmiyordu.

---

## Ne Yapildi?

### 1. MySQLAdapter'a SSL Destegi Eklendi

**Dosya**: `backend/sql/execution/adapters.py`

```python
# YENI KOD — SSL destegi eklendi
class MySQLAdapter(DatabaseAdapter):
    def __init__(self, url: str, ssl_enabled: bool = False):
        self.url = url
        self.ssl_enabled = ssl_enabled
        # ...

    async def init(self):
        import aiomysql
        params = self._parse_url()
        # SSL destegi (TiDB Cloud vb. icin gerekli)
        if self.ssl_enabled:
            import ssl as _ssl
            ssl_ctx = _ssl.create_default_context()
            params["ssl"] = ssl_ctx
        self.pool = await aiomysql.create_pool(
            minsize=2, maxsize=10, connect_timeout=30, **params
        )
```

`ssl.create_default_context()` Python'un yerlesik SSL modulu ile guvenli bir SSL context olusturur. Bu context sistem CA sertifikalarini kullanir, yani TiDB Cloud gibi public CA sertifikasi kullanan servislerle sorunsuz calisir.

### 2. create_adapter Fonksiyonu Guncellendi

```python
# ONCESI
def create_adapter(db_type: str, url: str) -> DatabaseAdapter:

# SONRASI
def create_adapter(db_type: str, url: str, ssl_enabled: bool = False) -> DatabaseAdapter:
```

`ssl_enabled` parametresi artik `MySQLAdapter`'a iletiliyor.

### 3. Admin Endpointleri Guncellendi

**Dosya**: `backend/admin/routes.py`

Iki endpoint guncellendi:

- **`POST /api/db-connections/test`** — Artik `req.ssl_enabled` degerini `create_adapter()`'a iletiyor
- **`POST /api/db-connections/{conn_id}/discover`** — Veritabanindan okunan `ssl_enabled` degerini adapter'a iletiyor

Ek olarak URL olusturma kismi iyilestirildi:
- `urllib.parse.quote_plus` ile kullanici adi ve sifre URL-encode ediliyor (ozel karakterler icin)
- PostgreSQL icin `ssl_enabled=True` ise URL'e `?sslmode=require` ekleniyor

---

## Etkilenen Dosyalar

| Dosya | Degisiklik |
|-------|-----------|
| `backend/sql/execution/adapters.py` | MySQLAdapter'a `ssl_enabled` parametresi + SSL context |
| `backend/sql/execution/adapters.py` | `create_adapter()` fonksiyonuna `ssl_enabled` parametresi |
| `backend/admin/routes.py` | `test_db_connection` — SSL bilgisi adapter'a iletiliyor |
| `backend/admin/routes.py` | `discover_tables` — SSL bilgisi adapter'a iletiliyor |
| `backend/admin/routes.py` | URL'lerde `quote_plus` ile ozel karakter destegi |

---

## Test

- 59/59 birim testi basariyla gecti
- TiDB Cloud baglantisininda SSL ile test edilmesi gerekiyor (admin paneli > Veritabanlari > Test Et)

---

## Frontend Tarafinda

Admin panelindeki form zaten `ssl_enabled: true` olarak gonderiyor (varsayilan). Yani kullanicinin ekstra bir islem yapmasina gerek yok — MySQL/MariaDB baglantilari otomatik olarak SSL ile kurulacak.

Ileriki sprintlerde formda bir SSL toggle'i eklenebilir, boylece SSL gerektirmeyen veritabanlari icin kapatilabilir.

---

## Onemli Notlar

- Bu duzeltme **tum MySQL/MariaDB uyumlu veritabanlarini** kapsiyor (TiDB Cloud, PlanetScale, AWS Aurora vb.)
- PostgreSQL icin SSL zaten URL parametresi (`?sslmode=require`) uzerinden calisiyor
- Trino baglantilarinda SSL ayri bir mekanizma ile yonetiliyor
- `ssl_enabled` veritabaninda `db_connections` tablosunda saklanir, yani her baglanti icin ayri ayri SSL durumu tutulur
