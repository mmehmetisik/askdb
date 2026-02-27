"""
Analysis Engine - Pandas tabanli veri analiz ve temizlik motoru.
Buyuk veri destegi (1M+ satir), sayfalama, onizleme, geri alma.
Disk offload: Inaktif session'lar Parquet olarak diske yazilir, RAM tasarrufu saglanir.
"""
import json
import os
import time
import tempfile
import numpy as np
import pandas as pd
from pathlib import Path
from typing import Any
from backend.core.config import logger

# Session disk offload ayarlari
_SESSION_DIR = Path(tempfile.gettempdir()) / "t2s_analysis_sessions"
_SESSION_IDLE_TIMEOUT = 1800  # 30 dakika inaktiflik sonrasi bellekten dusur


class AnalysisSession:
    """Bir rapor icin analiz oturumu. DataFrame uzerinde islem yapar."""

    def __init__(self, report_id: int, data: list[list], column_types: list[str] | None = None):
        self.report_id = report_id
        self._column_types = column_types or []

        # DataFrame olustur (ilk satir header)
        if not data or len(data) < 2:
            self.df_original = pd.DataFrame()
            self.df_working = pd.DataFrame()
        else:
            headers = data[0]
            rows = data[1:]
            self.df_original = pd.DataFrame(rows, columns=headers)
            self.df_working = self.df_original.copy()

        # Tip donusumleri
        self._infer_types()

        # Islem gecmisi: [{type, column, params, description, affected_rows, snapshot_hash}]
        self.operations: list[dict] = []
        # Undo icin snapshot stack
        self._snapshots: list[pd.DataFrame] = []
        self._max_snapshots = 20
        # Disk offload icin son erisim zamani
        self.last_access = time.time()

        logger.info(f"[ANALYSIS] Session created: report={report_id}, "
                     f"{len(self.df_original)} rows x {len(self.df_original.columns)} cols")

    # ====================================================================
    # SAYFALAMA
    # ====================================================================
    def touch(self):
        """Son erisim zamanini guncelle."""
        self.last_access = time.time()

    def get_page(self, page: int = 1, page_size: int = 100, sort_col: str | None = None,
                 sort_dir: str = "asc", search: str = "") -> dict:
        """Sayfalanmis veri dondur."""
        self.touch()
        df = self.df_working

        # Arama
        if search:
            mask = df.astype(str).apply(lambda col: col.str.contains(search, case=False, na=False)).any(axis=1)
            df = df[mask]

        # Siralama
        if sort_col and sort_col in df.columns:
            ascending = sort_dir != "desc"
            df = df.sort_values(by=sort_col, ascending=ascending, na_position="last")

        total_rows = len(df)
        total_pages = max(1, (total_rows + page_size - 1) // page_size)
        page = max(1, min(page, total_pages))

        start = (page - 1) * page_size
        end = start + page_size
        page_df = df.iloc[start:end]

        # JSON-safe donusum
        rows = []
        for _, row in page_df.iterrows():
            rows.append([_safe_value(v) for v in row.values])

        return {
            "headers": list(df.columns),
            "rows": rows,
            "page": page,
            "page_size": page_size,
            "total_rows": total_rows,
            "total_pages": total_pages,
        }

    # ====================================================================
    # EDA
    # ====================================================================
    def get_eda_summary(self) -> dict:
        """Tum kolonlar icin EDA ozeti."""
        self.touch()
        df = self.df_working
        columns = []
        total_nulls = 0
        total_outliers = 0

        for col in df.columns:
            profile = self._profile_column(col)
            columns.append(profile)
            total_nulls += profile["null_count"]
            total_outliers += profile.get("outlier_count", 0)

        # Duplicate analizi
        dup_count = int(df.duplicated().sum())

        # Correlation (sadece numerik kolonlar)
        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        correlations = []
        if len(numeric_cols) >= 2:
            corr_matrix = df[numeric_cols].corr()
            for i, c1 in enumerate(numeric_cols):
                for c2 in numeric_cols[i + 1:]:
                    val = corr_matrix.loc[c1, c2]
                    if pd.notna(val):
                        correlations.append({
                            "col1": c1, "col2": c2,
                            "value": round(float(val), 4),
                            "strength": "strong" if abs(val) >= 0.7 else "medium" if abs(val) >= 0.4 else "weak",
                            "direction": "positive" if val > 0 else "negative",
                        })

        # Data quality score
        completeness = 1 - (total_nulls / max(1, df.size))
        uniqueness = np.mean([c["uniqueness"] for c in columns]) if columns else 1
        quality_score = round((completeness * 0.4 + uniqueness * 0.3 + (1 - dup_count / max(1, len(df))) * 0.3) * 100, 1)

        return {
            "row_count": len(df),
            "col_count": len(df.columns),
            "total_nulls": total_nulls,
            "total_outliers": total_outliers,
            "duplicate_count": dup_count,
            "quality_score": quality_score,
            "columns": columns,
            "correlations": correlations,
        }

    def get_column_profile(self, col_name: str) -> dict:
        """Tek kolon icin detayli profil."""
        if col_name not in self.df_working.columns:
            raise ValueError(f"Kolon bulunamadi: {col_name}")
        return self._profile_column(col_name)

    def _profile_column(self, col_name: str) -> dict:
        """Tek kolon profili hesapla."""
        series = self.df_working[col_name]
        total = len(series)
        null_count = int(series.isna().sum())
        unique_count = int(series.nunique())

        profile = {
            "name": col_name,
            "dtype": str(series.dtype),
            "col_type": self._detect_col_type(series),
            "total": total,
            "null_count": null_count,
            "completeness": round(1 - null_count / max(1, total), 4),
            "unique_count": unique_count,
            "uniqueness": round(unique_count / max(1, total - null_count), 4),
        }

        col_type = profile["col_type"]

        if col_type == "numeric":
            clean = pd.to_numeric(series, errors="coerce").dropna()
            if len(clean) > 0:
                q1, q3 = float(clean.quantile(0.25)), float(clean.quantile(0.75))
                iqr = q3 - q1
                lower_bound = q1 - 1.5 * iqr
                upper_bound = q3 + 1.5 * iqr
                outliers = clean[(clean < lower_bound) | (clean > upper_bound)]

                profile["stats"] = {
                    "mean": round(float(clean.mean()), 2),
                    "median": round(float(clean.median()), 2),
                    "min": round(float(clean.min()), 2),
                    "max": round(float(clean.max()), 2),
                    "std": round(float(clean.std()), 2),
                    "q1": round(q1, 2),
                    "q3": round(q3, 2),
                }
                profile["outlier_count"] = len(outliers)
                profile["outlier_bounds"] = {"lower": round(lower_bound, 2), "upper": round(upper_bound, 2)}

                # Distribution (histogram)
                n_bins = min(max(3, int(np.sqrt(len(clean)))), 15)
                counts, edges = np.histogram(clean, bins=n_bins)
                profile["distribution"] = [
                    {"range": f"{round(float(edges[i]), 1)}-{round(float(edges[i + 1]), 1)}", "count": int(counts[i])}
                    for i in range(len(counts))
                ]
            else:
                profile["stats"] = {}
                profile["outlier_count"] = 0
                profile["outlier_bounds"] = {"lower": 0, "upper": 0}
                profile["distribution"] = []

        elif col_type == "text":
            non_null = series.dropna().astype(str)
            if len(non_null) > 0:
                lengths = non_null.str.len()
                top_vals = non_null.value_counts().head(10)
                profile["stats"] = {
                    "avg_length": round(float(lengths.mean()), 1),
                    "min_length": int(lengths.min()),
                    "max_length": int(lengths.max()),
                    "empty_count": int((non_null == "").sum()),
                }
                profile["top_values"] = [{"value": str(v), "count": int(c)} for v, c in top_vals.items()]
            else:
                profile["stats"] = {"avg_length": 0, "min_length": 0, "max_length": 0, "empty_count": 0}
                profile["top_values"] = []
            profile["outlier_count"] = 0

        elif col_type == "date":
            dates = pd.to_datetime(series, errors="coerce").dropna()
            if len(dates) > 0:
                profile["stats"] = {
                    "min": str(dates.min().date()),
                    "max": str(dates.max().date()),
                    "range_days": int((dates.max() - dates.min()).days),
                }
            else:
                profile["stats"] = {"min": None, "max": None, "range_days": 0}
            profile["outlier_count"] = 0

        else:
            profile["stats"] = {}
            profile["outlier_count"] = 0

        return profile

    # ====================================================================
    # ONIZLEME
    # ====================================================================
    def preview_operation(self, operation: str, column: str | None = None,
                          params: dict | None = None) -> dict:
        """Islem onizlemesi: 5 ornek satir goster (once/sonra)."""
        params = params or {}
        df_before = self.df_working

        # Gecici kopya uzerinde islem yap
        df_temp = df_before.copy()
        affected_count, description = self._execute_op(df_temp, operation, column, params)

        # Etkilenen satirlardan 5 ornek sec
        examples = []
        if column and column in df_before.columns:
            diff_mask = df_before[column].astype(str) != df_temp[column].astype(str)
            changed_indices = diff_mask[diff_mask].index[:5].tolist()
            for idx in changed_indices:
                examples.append({
                    "row": int(idx),
                    "before": _safe_value(df_before.at[idx, column]),
                    "after": _safe_value(df_temp.at[idx, column]),
                })
        elif operation in ("remove_duplicates", "drop_null_rows", "drop_outlier_rows"):
            removed = len(df_before) - len(df_temp)
            examples = [{"message": f"{removed} satir silinecek"}]

        return {
            "operation": operation,
            "column": column,
            "description": description,
            "affected_rows": affected_count,
            "examples": examples,
            "current_rows": len(df_before),
            "result_rows": len(df_temp),
        }

    # ====================================================================
    # UYGULA
    # ====================================================================
    def apply_operation(self, operation: str, column: str | None = None,
                        params: dict | None = None) -> dict:
        """Islemi uygula ve gecmise kaydet."""
        self.touch()
        params = params or {}

        # Snapshot kaydet (undo icin)
        self._save_snapshot()

        # Islemi uygula
        affected_count, description = self._execute_op(self.df_working, operation, column, params)

        # Gecmise kaydet
        op_record = {
            "id": len(self.operations) + 1,
            "operation": operation,
            "column": column,
            "params": params,
            "description": description,
            "affected_rows": affected_count,
        }
        self.operations.append(op_record)

        logger.info(f"[ANALYSIS] Op #{op_record['id']}: {description} ({affected_count} satir)")

        return {
            "success": True,
            "operation_id": op_record["id"],
            "description": description,
            "affected_rows": affected_count,
            "total_rows": len(self.df_working),
            "total_cols": len(self.df_working.columns),
        }

    # ====================================================================
    # GERI AL
    # ====================================================================
    def undo(self) -> dict:
        """Son islemi geri al."""
        if not self._snapshots or not self.operations:
            return {"success": False, "message": "Geri alinacak islem yok."}

        self.df_working = self._snapshots.pop()
        removed_op = self.operations.pop()

        logger.info(f"[ANALYSIS] Geri alindi: {removed_op['description']}")

        return {
            "success": True,
            "message": f"Geri alindi: {removed_op['description']}",
            "total_rows": len(self.df_working),
            "total_cols": len(self.df_working.columns),
            "remaining_ops": len(self.operations),
        }

    def reset(self) -> dict:
        """Tum islemleri sifirla, orijinale don."""
        self.df_working = self.df_original.copy()
        self.operations.clear()
        self._snapshots.clear()
        self._infer_types()
        return {
            "success": True,
            "message": "Tum islemler sifirlandi.",
            "total_rows": len(self.df_working),
        }

    def get_history(self) -> list[dict]:
        """Islem gecmisini dondur."""
        return list(self.operations)

    # ====================================================================
    # ISLEM UYGULAMASI (16 operasyon)
    # ====================================================================
    def _execute_op(self, df: pd.DataFrame, operation: str, column: str | None,
                    params: dict) -> tuple[int, str]:
        """Verilen islemi DataFrame uzerinde uygula. (affected_count, description) dondur."""
        op_map = {
            "fill_mean": self._op_fill_mean,
            "fill_median": self._op_fill_median,
            "fill_mode": self._op_fill_mode,
            "fill_constant": self._op_fill_constant,
            "fill_ffill": self._op_fill_ffill,
            "fill_bfill": self._op_fill_bfill,
            "drop_null_rows": self._op_drop_null_rows,
            "drop_column": self._op_drop_column,
            "clip_outliers_iqr": self._op_clip_outliers_iqr,
            "drop_outlier_rows": self._op_drop_outlier_rows,
            "replace_outliers_median": self._op_replace_outliers_median,
            "trim_whitespace": self._op_trim_whitespace,
            "change_case": self._op_change_case,
            "find_replace": self._op_find_replace,
            "rename_column": self._op_rename_column,
            "remove_duplicates": self._op_remove_duplicates,
        }

        fn = op_map.get(operation)
        if not fn:
            raise ValueError(f"Bilinmeyen operasyon: {operation}")
        return fn(df, column, params)

    # ── Eksik Deger ──
    def _op_fill_mean(self, df, col, params) -> tuple[int, str]:
        self._require_col(df, col)
        numeric = pd.to_numeric(df[col], errors="coerce")
        mask = numeric.isna() & df[col].notna().eq(False)
        null_mask = df[col].isna()
        count = int(null_mask.sum())
        if count > 0:
            mean_val = round(float(numeric.mean()), 2)
            df.loc[null_mask, col] = mean_val
        return count, f"{col}: {count} eksik deger ortalama ({mean_val if count else 0}) ile dolduruldu"

    def _op_fill_median(self, df, col, params) -> tuple[int, str]:
        self._require_col(df, col)
        numeric = pd.to_numeric(df[col], errors="coerce")
        null_mask = df[col].isna()
        count = int(null_mask.sum())
        if count > 0:
            median_val = round(float(numeric.median()), 2)
            df.loc[null_mask, col] = median_val
        return count, f"{col}: {count} eksik deger medyan ({median_val if count else 0}) ile dolduruldu"

    def _op_fill_mode(self, df, col, params) -> tuple[int, str]:
        self._require_col(df, col)
        null_mask = df[col].isna()
        count = int(null_mask.sum())
        if count > 0:
            mode_val = df[col].mode()
            fill_val = mode_val.iloc[0] if len(mode_val) > 0 else ""
            df.loc[null_mask, col] = fill_val
        else:
            fill_val = ""
        return count, f"{col}: {count} eksik deger en sik deger ({fill_val}) ile dolduruldu"

    def _op_fill_constant(self, df, col, params) -> tuple[int, str]:
        self._require_col(df, col)
        value = params.get("value", "")
        null_mask = df[col].isna()
        count = int(null_mask.sum())
        if count > 0:
            df.loc[null_mask, col] = value
        return count, f"{col}: {count} eksik deger '{value}' ile dolduruldu"

    def _op_fill_ffill(self, df, col, params) -> tuple[int, str]:
        self._require_col(df, col)
        null_before = int(df[col].isna().sum())
        df[col] = df[col].ffill()
        null_after = int(df[col].isna().sum())
        count = null_before - null_after
        return count, f"{col}: {count} eksik deger onceki degerle dolduruldu (ffill)"

    def _op_fill_bfill(self, df, col, params) -> tuple[int, str]:
        self._require_col(df, col)
        null_before = int(df[col].isna().sum())
        df[col] = df[col].bfill()
        null_after = int(df[col].isna().sum())
        count = null_before - null_after
        return count, f"{col}: {count} eksik deger sonraki degerle dolduruldu (bfill)"

    def _op_drop_null_rows(self, df, col, params) -> tuple[int, str]:
        if col:
            self._require_col(df, col)
            mask = df[col].isna()
            count = int(mask.sum())
            indices = df[mask].index
            df.drop(indices, inplace=True)
            df.reset_index(drop=True, inplace=True)
            return count, f"{col}: {count} eksik degerli satir silindi"
        else:
            before = len(df)
            df.dropna(inplace=True)
            df.reset_index(drop=True, inplace=True)
            count = before - len(df)
            return count, f"Herhangi bir eksik degeri olan {count} satir silindi"

    def _op_drop_column(self, df, col, params) -> tuple[int, str]:
        self._require_col(df, col)
        null_count = int(df[col].isna().sum())
        df.drop(columns=[col], inplace=True)
        return null_count, f"{col} kolonu silindi ({null_count} eksik deger iceriyordu)"

    # ── Aykiri Deger ──
    def _op_clip_outliers_iqr(self, df, col, params) -> tuple[int, str]:
        self._require_col(df, col)
        numeric = pd.to_numeric(df[col], errors="coerce")
        q1, q3 = float(numeric.quantile(0.25)), float(numeric.quantile(0.75))
        iqr = q3 - q1
        lower, upper = q1 - 1.5 * iqr, q3 + 1.5 * iqr
        outlier_mask = (numeric < lower) | (numeric > upper)
        count = int(outlier_mask.sum())
        if count > 0:
            df.loc[numeric < lower, col] = round(lower, 2)
            df.loc[numeric > upper, col] = round(upper, 2)
        return count, f"{col}: {count} aykiri deger [{round(lower, 2)}, {round(upper, 2)}] arasina kirpildi"

    def _op_drop_outlier_rows(self, df, col, params) -> tuple[int, str]:
        self._require_col(df, col)
        numeric = pd.to_numeric(df[col], errors="coerce")
        q1, q3 = float(numeric.quantile(0.25)), float(numeric.quantile(0.75))
        iqr = q3 - q1
        lower, upper = q1 - 1.5 * iqr, q3 + 1.5 * iqr
        outlier_mask = (numeric < lower) | (numeric > upper)
        count = int(outlier_mask.sum())
        indices = df[outlier_mask].index
        df.drop(indices, inplace=True)
        df.reset_index(drop=True, inplace=True)
        return count, f"{col}: {count} aykiri degerli satir silindi"

    def _op_replace_outliers_median(self, df, col, params) -> tuple[int, str]:
        self._require_col(df, col)
        numeric = pd.to_numeric(df[col], errors="coerce")
        q1, q3 = float(numeric.quantile(0.25)), float(numeric.quantile(0.75))
        iqr = q3 - q1
        lower, upper = q1 - 1.5 * iqr, q3 + 1.5 * iqr
        outlier_mask = (numeric < lower) | (numeric > upper)
        count = int(outlier_mask.sum())
        if count > 0:
            median_val = round(float(numeric.median()), 2)
            df.loc[outlier_mask, col] = median_val
        return count, f"{col}: {count} aykiri deger medyan ile degistirildi"

    # ── Genel Temizlik ──
    def _op_trim_whitespace(self, df, col, params) -> tuple[int, str]:
        self._require_col(df, col)
        original = df[col].astype(str)
        trimmed = original.str.strip()
        count = int((original != trimmed).sum())
        df[col] = trimmed
        return count, f"{col}: {count} degerde bosluk temizlendi"

    def _op_change_case(self, df, col, params) -> tuple[int, str]:
        self._require_col(df, col)
        case_type = params.get("case", "lower")  # lower, upper, title
        original = df[col].astype(str)
        if case_type == "upper":
            df[col] = original.str.upper()
            label = "BUYUK HARF"
        elif case_type == "title":
            df[col] = original.str.title()
            label = "Baslik Harfi"
        else:
            df[col] = original.str.lower()
            label = "kucuk harf"
        count = int((original != df[col]).sum())
        return count, f"{col}: {count} deger {label}'e donusturuldu"

    def _op_find_replace(self, df, col, params) -> tuple[int, str]:
        self._require_col(df, col)
        find_val = params.get("find", "")
        replace_val = params.get("replace", "")
        if not find_val:
            return 0, "Aranacak deger belirtilmedi"
        original = df[col].astype(str)
        df[col] = original.str.replace(find_val, replace_val, regex=False)
        count = int((original != df[col]).sum())
        return count, f"{col}: '{find_val}' → '{replace_val}' ({count} degisiklik)"

    def _op_rename_column(self, df, col, params) -> tuple[int, str]:
        self._require_col(df, col)
        new_name = params.get("new_name", "").strip()
        if not new_name:
            return 0, "Yeni isim belirtilmedi"
        if new_name in df.columns:
            return 0, f"'{new_name}' zaten mevcut"
        df.rename(columns={col: new_name}, inplace=True)
        return 0, f"Kolon adi degistirildi: '{col}' → '{new_name}'"

    def _op_remove_duplicates(self, df, col, params) -> tuple[int, str]:
        before = len(df)
        df.drop_duplicates(inplace=True)
        df.reset_index(drop=True, inplace=True)
        count = before - len(df)
        return count, f"{count} tekrarlayan satir silindi"

    # ====================================================================
    # YARDIMCILAR
    # ====================================================================
    def _require_col(self, df: pd.DataFrame, col: str | None):
        if not col or col not in df.columns:
            raise ValueError(f"Kolon bulunamadi: {col}")

    def _save_snapshot(self):
        """Undo icin mevcut durumu kaydet."""
        if len(self._snapshots) >= self._max_snapshots:
            self._snapshots.pop(0)
        self._snapshots.append(self.df_working.copy())

    def _infer_types(self):
        """Kolon tiplerini otomatik tespit et ve donustur."""
        for col in self.df_working.columns:
            series = self.df_working[col]
            # None/NaN degerleri atla
            non_null = series.dropna()
            if len(non_null) == 0:
                continue

            # Numerik deneme
            numeric = pd.to_numeric(non_null, errors="coerce")
            if numeric.notna().sum() / len(non_null) > 0.7:
                self.df_working[col] = pd.to_numeric(self.df_working[col], errors="coerce")
                continue

            # Tarih deneme
            try:
                dates = pd.to_datetime(non_null, errors="coerce", format="mixed")
                if dates.notna().sum() / len(non_null) > 0.7:
                    # Tarih olarak birak ama string tut (JSON uyumluluk)
                    continue
            except Exception:
                pass

    def _detect_col_type(self, series: pd.Series) -> str:
        """Kolon tipini tespit et."""
        if pd.api.types.is_numeric_dtype(series):
            return "numeric"
        non_null = series.dropna()
        if len(non_null) == 0:
            return "text"
        # Numerik mi?
        numeric = pd.to_numeric(non_null, errors="coerce")
        if numeric.notna().sum() / len(non_null) > 0.7:
            return "numeric"
        # Tarih mi?
        try:
            dates = pd.to_datetime(non_null, errors="coerce", format="mixed")
            if dates.notna().sum() / len(non_null) > 0.7:
                return "date"
        except Exception:
            pass
        # Boolean mi?
        if set(non_null.astype(str).str.lower().unique()) <= {"true", "false", "0", "1", "yes", "no"}:
            return "boolean"
        return "text"

    def to_export_data(self) -> list[list]:
        """Working data'yi 2D array formatinda dondur (ML sender, export icin)."""
        headers = list(self.df_working.columns)
        rows = []
        for _, row in self.df_working.iterrows():
            rows.append([_safe_value(v) for v in row.values])
        return [headers] + rows


# ====================================================================
# SESSION YONETIMI (Memory + Disk offload)
# ====================================================================
_sessions: dict[int, AnalysisSession] = {}
_MAX_SESSIONS = 20


def _ensure_session_dir():
    """Session dizinini olustur."""
    _SESSION_DIR.mkdir(parents=True, exist_ok=True)


def _session_path(report_id: int) -> Path:
    """Session Parquet dosya yolunu dondur."""
    return _SESSION_DIR / f"session_{report_id}.parquet"


def _session_meta_path(report_id: int) -> Path:
    """Session metadata dosya yolunu dondur."""
    return _SESSION_DIR / f"session_{report_id}_meta.json"


def _save_session_to_disk(session: AnalysisSession):
    """Session verisini diske yaz (Parquet + JSON metadata)."""
    try:
        _ensure_session_dir()
        session.df_working.to_parquet(_session_path(session.report_id), index=False)
        meta = {
            "report_id": session.report_id,
            "operations": session.operations,
            "column_types": session._column_types,
            "original_columns": list(session.df_original.columns),
        }
        _session_meta_path(session.report_id).write_text(json.dumps(meta, default=str))
        logger.info(f"[ANALYSIS] Session written to disk: report={session.report_id}")
    except Exception as e:
        logger.warning(f"[ANALYSIS] Disk write error: {e}")


def _load_session_from_disk(report_id: int) -> AnalysisSession | None:
    """Diskten session yukle (varsa)."""
    parquet_path = _session_path(report_id)
    meta_path = _session_meta_path(report_id)
    if not parquet_path.exists() or not meta_path.exists():
        return None
    try:
        df = pd.read_parquet(parquet_path)
        meta = json.loads(meta_path.read_text())
        # Minimal session olustur
        headers = list(df.columns)
        # df'den 2D array olusturmadan dogrudan ata
        session = AnalysisSession.__new__(AnalysisSession)
        session.report_id = report_id
        session._column_types = meta.get("column_types", [])
        session.df_original = df.copy()
        session.df_working = df
        session.operations = meta.get("operations", [])
        session._snapshots = []
        session._max_snapshots = 20
        session.last_access = time.time()
        logger.info(f"[ANALYSIS] Session loaded from disk: report={report_id}, {len(df)} rows")
        return session
    except Exception as e:
        logger.warning(f"[ANALYSIS] Disk load error: {e}")
        return None


def _evict_idle_sessions():
    """Inaktif session'lari diske yazip bellekten dusur."""
    now = time.time()
    to_evict = []
    for rid, session in _sessions.items():
        if now - session.last_access > _SESSION_IDLE_TIMEOUT:
            to_evict.append(rid)
    for rid in to_evict:
        _save_session_to_disk(_sessions[rid])
        del _sessions[rid]
        logger.info(f"[ANALYSIS] Idle session evicted from memory: report={rid}")


def get_or_create_session(report_id: int, data: list[list] | None = None,
                          column_types: list[str] | None = None) -> AnalysisSession:
    """Mevcut session'i getir veya yeni olustur. Diskten de yukleyebilir."""
    # 1. Bellekte var mi?
    if report_id in _sessions:
        _sessions[report_id].touch()
        return _sessions[report_id]

    # 2. Diskte var mi?
    disk_session = _load_session_from_disk(report_id)
    if disk_session is not None:
        _evict_idle_sessions()
        _sessions[report_id] = disk_session
        return disk_session

    # 3. Yeni olustur
    if data is None:
        raise ValueError(f"Report {report_id} icin session yok ve veri saglanmadi.")

    # Inaktif session'lari temizle
    _evict_idle_sessions()

    # Hala dolu mu? En eski aktif session'i diske yaz ve cikar
    if len(_sessions) >= _MAX_SESSIONS:
        oldest_rid = min(_sessions, key=lambda k: _sessions[k].last_access)
        _save_session_to_disk(_sessions[oldest_rid])
        del _sessions[oldest_rid]
        logger.info(f"[ANALYSIS] Oldest session spilled to disk and evicted: report={oldest_rid}")

    session = AnalysisSession(report_id, data, column_types)
    _sessions[report_id] = session
    return session


def remove_session(report_id: int):
    """Session'i memory ve diskten kaldir."""
    _sessions.pop(report_id, None)
    # Disk dosyalarini da temizle
    try:
        p = _session_path(report_id)
        m = _session_meta_path(report_id)
        if p.exists():
            p.unlink()
        if m.exists():
            m.unlink()
    except Exception:
        pass


# ====================================================================
# YARDIMCI
# ====================================================================
def _safe_value(v: Any) -> Any:
    """Pandas/numpy degerlerini JSON-safe tiplere donustur."""
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return None
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.floating,)):
        val = float(v)
        return None if np.isnan(val) else round(val, 4)
    if isinstance(v, (np.bool_,)):
        return bool(v)
    if isinstance(v, pd.Timestamp):
        return str(v)
    return v
