# logging_config.py

## Amac
Merkezi log yapilandirmasi saglar. Text veya JSON format, request ID izleme ve opsiyonel dosya rotasyonu destekler.

## Bagimliliklari
- `os`, `json`, `logging` -- standart kutuphane
- `logging.handlers.RotatingFileHandler` -- dosya rotasyonu
- `contextvars.ContextVar` -- request ID paylasimi

## Fonksiyonlar / Class'lar

| Oge | Aciklama |
|---|---|
| `request_id_var` | Middleware ile paylasilan ContextVar |
| `_RequestIdFilter` | Her log kaydina request_id alani ekler |
| `_TextFormatter` | `[%(levelname)s] [%(request_id)s] %(message)s` formati |
| `_JSONFormatter` | `{ts, level, rid, msg, exc}` JSON formati |
| `setup_logging()` | text2sql logger'ini yapilandirir ve dondurur |

## Env Degiskenleri

| Degisken | Varsayilan | Aciklama |
|---|---|---|
| `LOG_FORMAT` | `text` | text veya json |
| `LOG_LEVEL` | `INFO` | Log seviyesi |
| `LOG_FILE` | `""` | Dosya yolu (bos = konsol) |

## Ornek Kullanim

```python
from backend.core.logging_config import setup_logging
logger = setup_logging()
logger.info("Uygulama baslatildi")
```

## Degisiklik Gecmisi

| Tarih | Aciklama |
|---|---|
| 1 Mart 2026 | Ilk surum |
