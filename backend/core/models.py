from typing import Optional
from pydantic import BaseModel, Field, field_validator


# Gecerli roller
VALID_ROLES = ("admin", "analyst", "reporter", "data_scientist")


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=50)
    password: str = Field(..., min_length=1, max_length=128)


class UserCreate(BaseModel):
    username: str = Field(..., min_length=2, max_length=50)
    password: str = Field(..., min_length=6, max_length=128)
    role: str = "analyst"
    trino_access: bool = False

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v):
        if len(v) < 6:
            raise ValueError("Sifre en az 6 karakter olmalidir")
        return v

    @field_validator("role")
    @classmethod
    def valid_role(cls, v):
        if v not in VALID_ROLES:
            raise ValueError(f"Rol {VALID_ROLES} degerlerinden biri olmalidir")
        return v


class QueryRequest(BaseModel):
    """Dogal dil sorgusu icin request modeli."""
    query: str = Field(..., min_length=1, max_length=1000, description="Dogal dil ile yazilmis veritabani sorusu")
    selected_tables: Optional[list[str]] = Field(default=None, description="LLM baglam filtresi icin secili tablo isimleri")

    @field_validator("query")
    @classmethod
    def query_not_empty(cls, v):
        v = v.strip()
        if not v:
            raise ValueError("Sorgu bos olamaz")
        return v


class ExecuteSQLRequest(BaseModel):
    """Kullanici tarafindan duzenlenmis SQL sorgusu."""
    sql: str = Field(..., min_length=1, max_length=5000, description="Calistirilacak SQL sorgusu")


class ReportCreate(BaseModel):
    """Rapor kaydetme / gonderme modeli."""
    title: str = Field(..., min_length=1, max_length=200)
    assigned_to: Optional[int] = Field(default=None, description="Raporu alacak kullanici ID")
    note: Optional[str] = Field(default=None, max_length=500)
    original_sql: str = Field(default="")
    result_data: list = Field(default_factory=list, description="Sorgu sonuc verisi [[headers], [row1], ...]")
    column_types: list = Field(default_factory=list)
    row_count: int = Field(default=0)


class ReportUpdate(BaseModel):
    """Rapor guncelleme (snapshot kaydet)."""
    filters_applied: Optional[dict] = None
    hidden_columns: Optional[list[int]] = None
    deleted_rows: Optional[list[int]] = None
    status: Optional[str] = None

    @field_validator("status")
    @classmethod
    def valid_status(cls, v):
        if v is not None and v not in ("new", "in_progress", "completed", "archived"):
            raise ValueError("Gecersiz rapor durumu")
        return v


class MLTaskCreate(BaseModel):
    """ML Studio'ya veri gonderme modeli."""
    source_report_id: int = Field(..., description="Kaynak rapor ID")
    title: str = Field(..., min_length=1, max_length=200)
    note: Optional[str] = Field(default=None, max_length=1000)
    target_column: Optional[int] = Field(default=None, description="Hedef kolon index'i")
    data: list = Field(default_factory=list, description="Temizlenmis veri [[headers], [row1], ...]")
    column_types: list = Field(default_factory=list)
    cleaning_steps: list = Field(default_factory=list, description="Uygulanan temizleme adimlari")
    filters_applied: list = Field(default_factory=list)
    row_count: int = Field(default=0)
    col_count: int = Field(default=0)


class MLTrainRequest(BaseModel):
    """ML model egitim istegi."""
    ml_task_id: int = Field(..., description="ML task ID (veri kaynagi)")
    problem_type: str = Field(..., description="classification veya regression")
    target_column: str = Field(..., description="Hedef kolon adi")
    feature_columns: list[str] = Field(default_factory=list, description="Feature kolon adlari")
    algorithms: list[str] = Field(..., min_length=1, description="Secili algoritma adlari")
    train_split: float = Field(default=0.8, ge=0.6, le=0.9)
    cv_folds: int = Field(default=5, ge=2, le=10)

    @field_validator("problem_type")
    @classmethod
    def valid_problem_type(cls, v):
        if v not in ("classification", "regression"):
            raise ValueError("Problem tipi 'classification' veya 'regression' olmalidir")
        return v


class MLPredictRequest(BaseModel):
    """Tahmin istegi."""
    model_id: int = Field(..., description="Kaydedilmis model ID")
    data: list = Field(..., description="Tahmin verisi [[headers], [row1], ...]")


# =================== DB CONNECTION MODELS ===================
class DBConnectionCreate(BaseModel):
    """Veritabani baglanti olusturma/guncelleme modeli."""
    name: str = Field(..., min_length=1, max_length=100)
    db_type: str = Field(..., description="postgresql, mysql, mssql, trino")
    host: str = Field(..., min_length=1, max_length=255)
    port: int = Field(..., ge=1, le=65535)
    database_name: str = Field(default="", max_length=100)
    username: str = Field(default="", max_length=100)
    password: str = Field(default="", max_length=255)
    ssl_enabled: bool = True

    @field_validator("db_type")
    @classmethod
    def valid_db_type(cls, v):
        allowed = ("postgresql", "mysql", "mssql", "trino")
        if v not in allowed:
            raise ValueError(f"db_type {allowed} degerlerinden biri olmalidir")
        return v


class DBConnectionTest(BaseModel):
    """Baglanti testi icin model."""
    db_type: str
    host: str
    port: int
    database_name: str = ""
    username: str = ""
    password: str = ""
    ssl_enabled: bool = True


# =================== TABLE PROFILE MODELS ===================
class TableProfileCreate(BaseModel):
    """Tablo erisim profili olusturma/guncelleme."""
    name: str = Field(..., min_length=1, max_length=100)
    description: str = Field(default="", max_length=500)
    allowed_tables: list[str] = Field(default_factory=list)
