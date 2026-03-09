# backend/sql/websocket/progress.py

## Amac
Sorgu calistirma sirasinda kullaniciya WebSocket uzerinden canli ilerleme bildirimi gonderir.

## Bagimliliklari
- `fastapi` -- WebSocket
- `backend.core.config` -- logger

## Fonksiyonlar / Class'lar

| Ad | Tip | Aciklama |
|---|---|---|
| `ProgressManager` | Class | WebSocket baglantilerini session_id bazinda yonetir |
| `progress_manager` | Global | Singleton instance |

### ProgressManager Metotlari

| Metot | Aciklama |
|---|---|
| `connect(session_id, ws)` | WebSocket baglantisini kabul ve kaydet |
| `disconnect(session_id)` | Baglantiyi sil |
| `send_progress(session_id, step, detail, progress)` | JSON ilerleme mesaji gonder |

### Ilerleme Adimlari
cache_check(10) → llm_generating(30) → sql_validating(60) → executing(80) → complete(100)

## Ornek Kullanim

```python
from backend.sql.websocket.progress import emit_progress
await emit_progress(session_id, "executing", progress=80)
```

## Degisiklik Gecmisi

| Tarih | Aciklama |
|---|---|
| 1 Mart 2026 | Ilk surum |
