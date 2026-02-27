# AskDB

Dogal dil ile veritabani sorgulama, analiz ve ML egitim platformu.

## Ozellikler

- **Dogal Dil → SQL**: Turkce/Ingilizce soru yazin, LLM otomatik SQL uretsin
- **Coklu LLM**: Groq, OpenAI, Anthropic destegi (fallback zinciri)
- **Coklu Veritabani**: PostgreSQL, MySQL, MSSQL + Trino federation
- **SQL Guvenlik**: AST-tabanli SQL dogrulama (sqlglot), sadece SELECT izni
- **Rol Tabanli Erisim**: admin, analyst, reporter, data_scientist rolleri
- **Rapor Sistemi**: Sorgu sonuclarini kaydet, kullanicilara gonder
- **Analiz Workspace**: Pandas tabanli veri temizleme ve EDA
- **ML Studio**: scikit-learn ile model egitimi, tahmin, model yonetimi
- **Tablo Profilleri**: Kullanici bazli tablo erisim kontrolu
- **Cache & Rate Limit**: In-memory veya Redis tabanli
- **API Versioning**: `/api/v1/*` (versiyonlu) + `/api/*` (legacy)
- **CSRF Korumasi**: Opsiyonel double-submit cookie pattern
- **Structured Logging**: JSON/text format, request ID tracing

## Hizli Baslangic

### Gereksinimler

- Python 3.11+
- PostgreSQL (veya Docker)
- En az bir LLM API key (Groq onerilen)

### Kurulum

```bash
# 1. Repoyu klonla
git clone <repo-url> && cd askdb

# 2. Virtual environment
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate

# 3. Bagimliliklari yukle
pip install -r requirements.txt

# 4. .env dosyasini olustur
cp .env.example .env
# .env dosyasini duzenle: JWT_SECRET, GROQ_API_KEY, POSTGRES_URL

# 5. Sunucuyu baslat
uvicorn backend.main:app --reload --port 8000
```

Tarayicida `http://localhost:8000` adresine gidin.
Varsayilan admin: `admin` / `Admin123!`

### Docker ile Kurulum

```bash
# .env dosyasini olustur
cp .env.example .env
# JWT_SECRET ve GROQ_API_KEY degerlerini gir

# Baslat (PostgreSQL otomatik ayaga kalkar)
docker compose up --build

# Redis ile (opsiyonel)
docker compose --profile with-redis up --build
```

## Ortam Degiskenleri

| Degisken | Zorunlu | Varsayilan | Aciklama |
|----------|---------|------------|----------|
| `JWT_SECRET` | Evet | — | JWT imzalama anahtari |
| `GROQ_API_KEY` | * | — | Groq LLM API key |
| `OPENAI_API_KEY` | * | — | OpenAI API key |
| `ANTHROPIC_API_KEY` | * | — | Anthropic API key |
| `POSTGRES_URL` | ** | — | PostgreSQL baglanti URL |
| `DB_TYPE` | Hayir | postgresql | Veritabani tipi |
| `DB_MODE` | Hayir | direct | `direct` veya `trino` |
| `ALLOWED_TABLES` | Hayir | customers,orders,order_items | Erisim izinli tablolar |
| `CORS_ORIGINS` | Hayir | localhost:5500,8000 | CORS originler |
| `SECURE_COOKIE` | Hayir | true | HTTPS cookie zorunlulugu |
| `CSRF_ENABLED` | Hayir | false | CSRF korumasi |
| `CACHE_TTL_SECONDS` | Hayir | 300 | Cache suresi (sn) |
| `REDIS_URL` | Hayir | — | Redis URL (bos = in-memory) |
| `LOG_FORMAT` | Hayir | text | `text` veya `json` |
| `LOG_LEVEL` | Hayir | INFO | Log seviyesi |

\* En az bir LLM API key gerekli.
\** `DB_MODE=direct` icin zorunlu.

## API Endpoint'leri

Tum endpoint'ler `/api/*` ve `/api/v1/*` prefix'leri ile erisilebilir.

| Metod | Yol | Yetki | Aciklama |
|-------|-----|-------|----------|
| POST | `/login` | Herkese acik | Giris yap |
| POST | `/logout` | Herkese acik | Cikis yap |
| GET | `/me` | Auth | Mevcut kullanici bilgisi |
| GET | `/health` | Herkese acik | Sistem saglik kontrolu |
| POST | `/query` | Auth | Dogal dil → SQL |
| POST | `/execute-sql` | Auth | SQL calistir |
| GET | `/schema` | Auth | Tablo sema bilgisi |
| GET | `/users` | Admin | Kullanici listesi |
| POST | `/users` | Admin | Kullanici olustur |
| GET | `/reports` | Auth | Rapor listesi |
| POST | `/reports` | Auth | Rapor kaydet |
| GET | `/cache-stats` | Admin | Cache istatistikleri |
| GET | `/stats/overview` | Admin | Sorgu istatistikleri |
| GET | `/ml/models` | DataSci | ML model listesi |
| POST | `/ml/train` | DataSci | ML egitimi baslat |

## Kullanici Rolleri

| Rol | Sorgu | Rapor | Analiz | ML Studio | Admin Panel |
|-----|-------|-------|--------|-----------|-------------|
| admin | Evet | Evet | Evet | Evet | Evet |
| analyst | Evet | Gonderme | — | — | — |
| reporter | — | Goruntuleme | Evet | — | — |
| data_scientist | — | Goruntuleme | Evet | Evet | — |

## Test

```bash
# Tum testleri calistir
pytest

# Detayli cikti
pytest -v

# Sadece guvenlik testleri
pytest tests/test_security.py -v
```

## Proje Yapisi (Modular Monolith)

```
askdb/
├── backend/
│   ├── main.py                        # FastAPI app, lifespan, router mount
│   ├── core/                          # Cekirdek altyapi
│   │   ├── config.py                  # Ortam degiskenleri, schema
│   │   ├── logging_config.py          # Structured logging, request ID
│   │   ├── middleware.py              # RequestIdMiddleware
│   │   ├── csrf.py                    # CSRF middleware
│   │   ├── i18n.py                    # Backend i18n destegi
│   │   ├── models.py                  # Pydantic modeller
│   │   └── locales/                   # Ceviri dosyalari (tr/en)
│   ├── auth/                          # Kimlik dogrulama
│   │   ├── service.py                 # JWT, bcrypt, role guards
│   │   └── routes.py                  # Login/logout/me
│   ├── sql/                           # SQL sorgulama motoru
│   │   ├── routes.py                  # Text-to-SQL + execute
│   │   ├── rate_limit.py              # Rate limiting
│   │   ├── execution/                 # Veritabani islemleri
│   │   │   ├── database.py            # DB pool, query execution
│   │   │   ├── adapters.py            # PG/MySQL/MSSQL/Trino adaptors
│   │   │   ├── security.py            # SQL guvenlik (sqlglot AST)
│   │   │   └── migrations.py          # Tablo olusturma, seed
│   │   ├── llm/                       # LLM entegrasyonu
│   │   │   ├── service.py             # LLM provider (Groq/OpenAI/Anthropic)
│   │   │   └── providers.py           # Provider factory
│   │   ├── cache/                     # Sorgu cache
│   │   │   └── service.py             # In-memory + Redis cache
│   │   ├── schema/                    # Sema yonetimi
│   │   │   └── routes.py              # Schema, health, preview
│   │   └── websocket/                 # Canli ilerleme
│   │       └── progress.py            # WebSocket progress manager
│   ├── analysis/                      # Veri analizi modulu
│   │   ├── engine.py                  # Pandas veri isleme
│   │   └── routes.py                  # Analysis workspace API
│   ├── ml/                            # Makine ogrenmesi modulu
│   │   ├── engine.py                  # scikit-learn training engine
│   │   └── routes.py                  # ML Studio API
│   ├── admin/                         # Yonetim paneli
│   │   ├── routes.py                  # Cache, DB conn, stats, profiles
│   │   └── user_routes.py             # User CRUD
│   └── reports/                       # Raporlama
│       └── routes.py                  # Report CRUD
├── frontend/
│   ├── index.html                     # Sorgu sayfasi
│   ├── admin.html                     # Admin paneli
│   ├── analysis.html                  # Analiz workspace
│   ├── ml.html                        # ML Studio
│   └── js/                            # Frontend JavaScript
├── tests/
│   ├── conftest.py                    # Fixtures, MockAdapter
│   ├── test_security.py               # SQL guvenlik testleri (59 test)
│   ├── test_auth.py                   # Auth endpoint testleri
│   ├── test_query.py                  # Query endpoint testleri
│   └── test_admin.py                  # RBAC testleri
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
├── .env.example
└── .gitignore
```
