# analysis/engine.py

## Amac

Pandas tabanli veri analiz ve temizlik motoru. Rapor verisi uzerinde EDA, eksik deger doldurma, aykiri deger isleme, sayfalama, undo/redo ve disk offload destegi saglar.

## Bagimliliklari

- `pandas`, `numpy` -- veri isleme
- `backend.core.config` -- logger
- `pathlib`, `tempfile`, `json`, `time` -- dosya/session yonetimi

## Fonksiyonlar / Class'lar

### `AnalysisSession` (class)

| Metot | Parametreler | Donus | Aciklama |
|-------|-------------|-------|----------|
| `__init__` | `report_id, data, column_types` | - | Rapor verisinden DataFrame olusturur |
| `get_page` | `page, page_size, sort_col, sort_dir, search` | `dict` | Sayfalanmis veri dondurur |
| `get_eda_summary` | - | `dict` | Tum kolonlar icin EDA ozeti |
| `get_column_profile` | `col_name: str` | `dict` | Tek kolon icin istatistik ve dagilim |
| `preview_operation` | `operation, column, params` | `dict` | Islemi uygulamadan onizleme |
| `apply_operation` | `operation, column, params` | `dict` | 16 operasyondan birini uygular |
| `undo` | - | `dict` | Son islemi geri alir |
| `reset` | - | `dict` | Orijinal veriye doner |
| `to_export_data` | - | `list[list]` | Veriyi 2D array olarak dondurur |

### Modul Fonksiyonlari

| Fonksiyon | Aciklama |
|-----------|----------|
| `get_or_create_session` | Bellekte/diskte session arar, yoksa yeni olusturur |
| `remove_session` | Session'i bellek ve diskten siler |

## Ornek Kullanim

```python
from backend.analysis.engine import get_or_create_session

session = get_or_create_session(report_id=1, data=data)
eda = session.get_eda_summary()
session.apply_operation("fill_mean", column="yas")
session.undo()
```

## Degisiklik Gecmisi

| Tarih | Aciklama |
|-------|----------|
| 1 Mart 2026 | Ilk surum |
