"""
Coklu veritabani destegi icin adapter pattern.
Desteklenen: PostgreSQL, MySQL, MSSQL
"""
import re
from abc import ABC, abstractmethod
from backend.core.config import logger

_IDENTIFIER_RE = re.compile(r'^[a-zA-Z_][a-zA-Z0-9_.\-]*$')


def validate_identifier(name: str, label: str = "identifier") -> str:
    """SQL identifier'i dogrula. Sadece guvenli karakterlere izin ver."""
    if not name or len(name) > 255:
        raise ValueError(f"Gecersiz {label}: bos veya cok uzun")
    if not _IDENTIFIER_RE.match(name):
        raise ValueError(f"Gecersiz {label}: '{name}' — sadece harf, rakam, alt cizgi ve nokta kullanilabilir")
    return name


def quote_identifier(name: str) -> str:
    """SQL identifier'i guvenli bicimde quote et (double-quote).
    Enjeksiyon riskini ortadan kaldirir — validate_identifier ile birlikte kullanilir."""
    validated = validate_identifier(name)
    escaped = validated.replace('"', '""')
    return f'"{escaped}"'


class DatabaseAdapter(ABC):
    """Soyut veritabani adapter arayuzu."""

    @abstractmethod
    async def init(self) -> None: ...

    @abstractmethod
    async def close(self) -> None: ...

    @abstractmethod
    async def execute_command(self, sql: str, *args) -> None: ...

    @abstractmethod
    async def fetch(self, sql: str, *args) -> list: ...

    @abstractmethod
    async def fetchrow(self, sql: str, *args) -> dict | None: ...

    @abstractmethod
    async def fetchval(self, sql: str, *args): ...

    @abstractmethod
    async def run_query(self, sql: str, max_rows: int) -> dict: ...

    @abstractmethod
    async def get_schema_info(self, allowed_tables: set[str]) -> list: ...

    @abstractmethod
    async def ensure_app_users_table(self) -> None: ...

    @abstractmethod
    def dialect(self) -> str: ...


# =================== POSTGRESQL ===================
class PostgreSQLAdapter(DatabaseAdapter):
    def __init__(self, url: str):
        self.url = url
        self.pool = None

    async def init(self):
        import asyncpg
        self.pool = await asyncpg.create_pool(
            self.url, min_size=2, max_size=10,
            command_timeout=60, timeout=30,
            statement_cache_size=0,  # pgbouncer uyumlulugu (Supabase vb.)
        )

    async def close(self):
        if self.pool:
            await self.pool.close()

    async def execute_command(self, sql: str, *args):
        async with self.pool.acquire() as conn:
            await conn.execute(sql, *args)

    async def fetch(self, sql: str, *args) -> list:
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(sql, *args)
            return [dict(r) for r in rows]

    async def fetchrow(self, sql: str, *args) -> dict | None:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(sql, *args)
            return dict(row) if row else None

    async def fetchval(self, sql: str, *args):
        async with self.pool.acquire() as conn:
            return await conn.fetchval(sql, *args)

    async def run_query(self, sql: str, max_rows: int) -> dict:
        async with self.pool.acquire() as conn:
            limited_sql = f"SELECT * FROM ({sql}) AS _sub LIMIT {max_rows + 1}"
            # pgbouncer uyumlulugu: prepare() yerine fetch() kullan
            rows = await conn.fetch(limited_sql)

            if not rows:
                return {
                    "headers": ["Sonuc Yok"], "rows": [],
                    "column_types": [], "total_count": 0, "truncated": False,
                }

            headers = list(rows[0].keys())
            column_types = [_pg_python_type(rows[0][h]) for h in headers]
            truncated = len(rows) > max_rows
            if truncated:
                rows = rows[:max_rows]

            data_rows = [[v for v in row.values()] for row in rows]
            return {
                "headers": headers, "rows": data_rows,
                "column_types": column_types,
                "total_count": len(data_rows), "truncated": truncated,
            }

    async def get_schema_info(self, allowed_tables: set[str]) -> list:
        async with self.pool.acquire() as conn:
            rows = await conn.fetch("""
                SELECT
                    c.table_name, c.column_name, c.data_type,
                    c.is_nullable, c.ordinal_position,
                    COALESCE(
                        (SELECT true FROM information_schema.key_column_usage kcu
                         JOIN information_schema.table_constraints tc
                           ON kcu.constraint_name = tc.constraint_name
                          AND tc.table_schema = kcu.table_schema
                         WHERE tc.constraint_type = 'PRIMARY KEY'
                           AND kcu.table_name = c.table_name
                           AND kcu.column_name = c.column_name
                           AND kcu.table_schema = c.table_schema
                         LIMIT 1
                        ), false
                    ) AS is_pk
                FROM information_schema.columns c
                WHERE c.table_schema = 'public'
                  AND c.table_name = ANY($1::text[])
                ORDER BY c.table_name, c.ordinal_position
            """, list(allowed_tables))

            tables: dict[str, dict] = {}
            for row in rows:
                tname = row["table_name"]
                if tname not in tables:
                    tables[tname] = {"name": tname, "columns": []}
                tables[tname]["columns"].append({
                    "name": row["column_name"],
                    "type": row["data_type"],
                    "nullable": row["is_nullable"] == "YES",
                    "is_pk": bool(row["is_pk"]),
                })
            return sorted(tables.values(), key=lambda t: t["name"])

    async def ensure_app_users_table(self):
        async with self.pool.acquire() as conn:
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS app_users (
                    id SERIAL PRIMARY KEY,
                    username TEXT UNIQUE NOT NULL,
                    password TEXT NOT NULL,
                    role TEXT NOT NULL DEFAULT 'user',
                    created_at TIMESTAMP DEFAULT NOW()
                )
            """)

    def dialect(self) -> str:
        return "postgresql"


# =================== MYSQL ===================
class MySQLAdapter(DatabaseAdapter):
    def __init__(self, url: str, ssl_enabled: bool = False):
        self.url = url
        self.ssl_enabled = ssl_enabled
        self.pool = None
        self._db_name = None

    def _parse_url(self):
        """mysql://user:pass@host:port/dbname seklindeki URL'i parse et."""
        from urllib.parse import urlparse, unquote
        parsed = urlparse(self.url.replace("mysql://", "mysql://"))
        self._db_name = parsed.path.lstrip("/")
        return {
            "host": parsed.hostname or "localhost",
            "port": parsed.port or 3306,
            "user": unquote(parsed.username or "root"),
            "password": unquote(parsed.password or ""),
            "db": self._db_name,
        }

    async def init(self):
        import aiomysql
        params = self._parse_url()
        # SSL destegi (TiDB Cloud, Aiven vb. icin gerekli)
        if self.ssl_enabled:
            import ssl as _ssl
            ssl_ctx = _ssl.create_default_context()
            # Aiven gibi self-signed sertifika kullanan servisler icin
            ssl_ctx.check_hostname = False
            ssl_ctx.verify_mode = _ssl.CERT_NONE
            params["ssl"] = ssl_ctx
        self.pool = await aiomysql.create_pool(
            minsize=2, maxsize=10, connect_timeout=30, **params
        )

    async def close(self):
        if self.pool:
            self.pool.close()
            await self.pool.wait_closed()

    async def execute_command(self, sql: str, *args):
        sql = self._convert_params(sql)
        async with self.pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(sql, args or None)
                await conn.commit()

    async def fetch(self, sql: str, *args) -> list:
        import aiomysql
        sql = self._convert_params(sql)
        async with self.pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute(sql, args or None)
                return await cur.fetchall()

    async def fetchrow(self, sql: str, *args) -> dict | None:
        import aiomysql
        sql = self._convert_params(sql)
        async with self.pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute(sql, args or None)
                return await cur.fetchone()

    async def fetchval(self, sql: str, *args):
        sql = self._convert_params(sql)
        async with self.pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(sql, args or None)
                row = await cur.fetchone()
                return row[0] if row else None

    async def run_query(self, sql: str, max_rows: int) -> dict:
        limited_sql = f"SELECT * FROM ({sql}) AS _sub LIMIT {max_rows + 1}"
        import aiomysql
        async with self.pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute(limited_sql)
                rows = await cur.fetchall()
                desc = cur.description

                if not rows:
                    return {
                        "headers": ["Sonuc Yok"], "rows": [],
                        "column_types": [], "total_count": 0, "truncated": False,
                    }

                headers = [d[0] for d in desc]
                column_types = [_mysql_type_name(d[1]) for d in desc]
                truncated = len(rows) > max_rows
                if truncated:
                    rows = rows[:max_rows]

                data_rows = [[row[h] for h in headers] for row in rows]
                return {
                    "headers": headers, "rows": data_rows,
                    "column_types": column_types,
                    "total_count": len(data_rows), "truncated": truncated,
                }

    async def get_schema_info(self, allowed_tables: set[str]) -> list:
        if not allowed_tables:
            return []
        placeholders = ",".join(["%s"] * len(allowed_tables))
        sql = f"""
            SELECT
                c.TABLE_NAME as table_name,
                c.COLUMN_NAME as column_name,
                c.DATA_TYPE as data_type,
                c.IS_NULLABLE as is_nullable,
                c.ORDINAL_POSITION as ordinal_position,
                IF(c.COLUMN_KEY = 'PRI', 1, 0) as is_pk
            FROM INFORMATION_SCHEMA.COLUMNS c
            WHERE c.TABLE_SCHEMA = %s
              AND c.TABLE_NAME IN ({placeholders})
            ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION
        """
        args = [self._db_name] + list(allowed_tables)
        import aiomysql
        async with self.pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute(sql, args)
                rows = await cur.fetchall()

        tables: dict[str, dict] = {}
        for row in rows:
            tname = row["table_name"]
            if tname not in tables:
                tables[tname] = {"name": tname, "columns": []}
            tables[tname]["columns"].append({
                "name": row["column_name"],
                "type": row["data_type"],
                "nullable": row["is_nullable"] == "YES",
                "is_pk": bool(row["is_pk"]),
            })
        return sorted(tables.values(), key=lambda t: t["name"])

    async def ensure_app_users_table(self):
        sql = """
            CREATE TABLE IF NOT EXISTS app_users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(255) UNIQUE NOT NULL,
                password TEXT NOT NULL,
                role VARCHAR(50) NOT NULL DEFAULT 'user',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """
        async with self.pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(sql)
                await conn.commit()

    def dialect(self) -> str:
        return "mysql"

    @staticmethod
    def _convert_params(sql: str) -> str:
        """$1, $2 parametrelerini %s'ye donustur."""
        import re
        return re.sub(r'\$\d+', '%s', sql)


# =================== MSSQL ===================
class MSSQLAdapter(DatabaseAdapter):
    def __init__(self, url: str):
        self.url = url
        self._conn_params = None
        self._pool = None  # pymssql connection pool (manual)
        self._db_name = None

    def _parse_url(self):
        """mssql://user:pass@host:port/dbname veya mssql+pymssql://... parse et."""
        from urllib.parse import urlparse, unquote
        clean = self.url.replace("mssql+pymssql://", "mssql://").replace("mssql://", "mssql://")
        parsed = urlparse(clean)
        self._db_name = parsed.path.lstrip("/")
        self._conn_params = {
            "server": parsed.hostname or "localhost",
            "port": str(parsed.port or 1433),
            "user": unquote(parsed.username or "sa"),
            "password": unquote(parsed.password or ""),
            "database": self._db_name,
            "charset": "utf8",
        }

    async def init(self):
        import pymssql
        self._parse_url()
        # pymssql senkron — async wrapper ile kullanacagiz
        self._pymssql = pymssql
        # Test baglantisi
        conn = pymssql.connect(**self._conn_params, login_timeout=30)
        conn.close()

    async def close(self):
        pass  # pymssql per-query connection kullanir

    def _get_conn(self):
        return self._pymssql.connect(**self._conn_params)

    async def execute_command(self, sql: str, *args):
        import asyncio
        sql = self._convert_params(sql)

        def _exec():
            conn = self._get_conn()
            try:
                cur = conn.cursor()
                cur.execute(sql, args or None)
                conn.commit()
            finally:
                conn.close()

        await asyncio.get_running_loop().run_in_executor(None, _exec)

    async def fetch(self, sql: str, *args) -> list:
        import asyncio
        sql = self._convert_params(sql)

        def _exec():
            conn = self._get_conn()
            try:
                cur = conn.cursor(as_dict=True)
                cur.execute(sql, args or None)
                return cur.fetchall()
            finally:
                conn.close()

        return await asyncio.get_running_loop().run_in_executor(None, _exec)

    async def fetchrow(self, sql: str, *args) -> dict | None:
        import asyncio
        sql = self._convert_params(sql)

        def _exec():
            conn = self._get_conn()
            try:
                cur = conn.cursor(as_dict=True)
                cur.execute(sql, args or None)
                return cur.fetchone()
            finally:
                conn.close()

        return await asyncio.get_running_loop().run_in_executor(None, _exec)

    async def fetchval(self, sql: str, *args):
        import asyncio
        sql = self._convert_params(sql)

        def _exec():
            conn = self._get_conn()
            try:
                cur = conn.cursor()
                cur.execute(sql, args or None)
                row = cur.fetchone()
                return row[0] if row else None
            finally:
                conn.close()

        return await asyncio.get_running_loop().run_in_executor(None, _exec)

    async def run_query(self, sql: str, max_rows: int) -> dict:
        import asyncio

        # MSSQL: TOP yerine subquery + OFFSET FETCH kullan (daha uyumlu)
        limited_sql = f"SELECT TOP {max_rows + 1} * FROM ({sql}) AS _sub"

        def _exec():
            conn = self._get_conn()
            try:
                cur = conn.cursor(as_dict=True)
                cur.execute(limited_sql)
                rows = cur.fetchall()
                desc = cur.description

                if not rows:
                    return {
                        "headers": ["Sonuc Yok"], "rows": [],
                        "column_types": [], "total_count": 0, "truncated": False,
                    }

                headers = [d[0] for d in desc]
                column_types = [_mssql_type_name(d[1]) for d in desc] if desc else []
                truncated = len(rows) > max_rows
                if truncated:
                    rows = rows[:max_rows]

                data_rows = [[row[h] for h in headers] for row in rows]
                return {
                    "headers": headers, "rows": data_rows,
                    "column_types": column_types,
                    "total_count": len(data_rows), "truncated": truncated,
                }
            finally:
                conn.close()

        return await asyncio.get_running_loop().run_in_executor(None, _exec)

    async def get_schema_info(self, allowed_tables: set[str]) -> list:
        import asyncio
        if not allowed_tables:
            return []

        placeholders = ",".join(["%s"] * len(allowed_tables))
        sql = f"""
            SELECT
                c.TABLE_NAME as table_name,
                c.COLUMN_NAME as column_name,
                c.DATA_TYPE as data_type,
                c.IS_NULLABLE as is_nullable,
                c.ORDINAL_POSITION as ordinal_position,
                CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END as is_pk
            FROM INFORMATION_SCHEMA.COLUMNS c
            LEFT JOIN (
                SELECT ku.TABLE_NAME, ku.COLUMN_NAME
                FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
                JOIN INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
                  ON ku.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
                WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
            ) pk ON c.TABLE_NAME = pk.TABLE_NAME AND c.COLUMN_NAME = pk.COLUMN_NAME
            WHERE c.TABLE_CATALOG = %s
              AND c.TABLE_NAME IN ({placeholders})
            ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION
        """
        args = (self._db_name, *list(allowed_tables))

        def _exec():
            conn = self._get_conn()
            try:
                cur = conn.cursor(as_dict=True)
                cur.execute(sql, args)
                return cur.fetchall()
            finally:
                conn.close()

        rows = await asyncio.get_running_loop().run_in_executor(None, _exec)

        tables: dict[str, dict] = {}
        for row in rows:
            tname = row["table_name"]
            if tname not in tables:
                tables[tname] = {"name": tname, "columns": []}
            tables[tname]["columns"].append({
                "name": row["column_name"],
                "type": row["data_type"],
                "nullable": row["is_nullable"] == "YES",
                "is_pk": bool(row["is_pk"]),
            })
        return sorted(tables.values(), key=lambda t: t["name"])

    async def ensure_app_users_table(self):
        import asyncio

        def _exec():
            conn = self._get_conn()
            try:
                cur = conn.cursor()
                cur.execute("""
                    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'app_users')
                    CREATE TABLE app_users (
                        id INT IDENTITY(1,1) PRIMARY KEY,
                        username NVARCHAR(255) UNIQUE NOT NULL,
                        password NVARCHAR(MAX) NOT NULL,
                        role NVARCHAR(50) NOT NULL DEFAULT 'user',
                        created_at DATETIME DEFAULT GETDATE()
                    )
                """)
                conn.commit()
            finally:
                conn.close()

        await asyncio.get_running_loop().run_in_executor(None, _exec)

    def dialect(self) -> str:
        return "mssql"

    @staticmethod
    def _convert_params(sql: str) -> str:
        """$1, $2 parametrelerini %s'ye donustur."""
        import re
        return re.sub(r'\$\d+', '%s', sql)


# =================== TRINO ===================
class TrinoAdapter(DatabaseAdapter):
    """Trino adapter — READ-ONLY analytics engine. DBAPI2 senkron, async wrapper ile."""

    def __init__(self, url: str):
        self.url = url
        self._conn_params = None
        self._default_catalog = None
        self._default_schema = None
        self._trino = None

    def _parse_url(self):
        from urllib.parse import urlparse
        parsed = urlparse(self.url)
        path_parts = [p for p in parsed.path.strip("/").split("/") if p]
        self._default_catalog = path_parts[0] if len(path_parts) > 0 else "hive"
        self._default_schema = path_parts[1] if len(path_parts) > 1 else "default"
        self._conn_params = {
            "host": parsed.hostname or "localhost",
            "port": parsed.port or 8080,
            "user": parsed.username or "trino",
            "catalog": self._default_catalog,
            "schema": self._default_schema,
        }

    async def init(self):
        import asyncio
        import trino as trino_pkg
        self._trino = trino_pkg
        self._parse_url()

        def _test():
            # Baglanti testi icin catalog belirtmeye gerek yok
            params = dict(self._conn_params)
            params.pop("catalog", None)
            params.pop("schema", None)
            conn = trino_pkg.dbapi.connect(**params)
            cur = conn.cursor()
            cur.execute("SELECT 1")
            cur.fetchone()
            conn.close()

        await asyncio.get_running_loop().run_in_executor(None, _test)
        logger.info(f"[TRINO] Connection successful: {self._conn_params['host']}:{self._conn_params['port']}/{self._default_catalog}")

    async def close(self):
        pass  # Per-query connection

    def _get_conn(self, catalog=None, schema=None):
        params = dict(self._conn_params)
        if catalog:
            params["catalog"] = catalog
        if schema:
            params["schema"] = schema
        return self._trino.dbapi.connect(**params)

    async def execute_command(self, sql: str, *args):
        raise NotImplementedError("Trino read-only. Yazma islemleri icin AUTH_DATABASE_URL kullanin.")

    async def fetch(self, sql: str, *args) -> list:
        import asyncio
        sql = self._convert_params(sql)

        def _exec():
            conn = self._get_conn()
            try:
                cur = conn.cursor()
                cur.execute(sql, args or None)
                columns = [desc[0] for desc in cur.description]
                rows = cur.fetchall()
                return [dict(zip(columns, row)) for row in rows]
            finally:
                conn.close()

        return await asyncio.get_running_loop().run_in_executor(None, _exec)

    async def fetchrow(self, sql: str, *args) -> dict | None:
        import asyncio
        sql = self._convert_params(sql)

        def _exec():
            conn = self._get_conn()
            try:
                cur = conn.cursor()
                cur.execute(sql, args or None)
                columns = [desc[0] for desc in cur.description]
                row = cur.fetchone()
                return dict(zip(columns, row)) if row else None
            finally:
                conn.close()

        return await asyncio.get_running_loop().run_in_executor(None, _exec)

    async def fetchval(self, sql: str, *args):
        import asyncio
        sql = self._convert_params(sql)

        def _exec():
            conn = self._get_conn()
            try:
                cur = conn.cursor()
                cur.execute(sql, args or None)
                row = cur.fetchone()
                return row[0] if row else None
            finally:
                conn.close()

        return await asyncio.get_running_loop().run_in_executor(None, _exec)

    async def run_query(self, sql: str, max_rows: int) -> dict:
        import asyncio
        limited_sql = f"SELECT * FROM ({sql}) AS _sub LIMIT {max_rows + 1}"

        def _exec():
            conn = self._get_conn()
            try:
                cur = conn.cursor()
                cur.execute(limited_sql)
                desc = cur.description
                rows = cur.fetchall()

                if not rows:
                    return {
                        "headers": ["Sonuc Yok"], "rows": [],
                        "column_types": [], "total_count": 0, "truncated": False,
                    }

                headers = [d[0] for d in desc]
                column_types = [_trino_type_name(d[1]) for d in desc]
                truncated = len(rows) > max_rows
                if truncated:
                    rows = rows[:max_rows]

                data_rows = [list(row) for row in rows]
                return {
                    "headers": headers, "rows": data_rows,
                    "column_types": column_types,
                    "total_count": len(data_rows), "truncated": truncated,
                }
            finally:
                conn.close()

        return await asyncio.get_running_loop().run_in_executor(None, _exec)

    async def get_schema_info(self, allowed_tables: set[str]) -> list:
        import asyncio
        from backend.core.config import ALLOWED_TABLES_BY_CATALOG

        # NOT: DB_MODE kontrolu kaldirildi — Trino dinamik olarak admin panelden
        # aktif edilebilir, bu durumda DB_MODE hala "direct" olur ama Trino calisir.
        if not ALLOWED_TABLES_BY_CATALOG:
            return []

        def _exec():
            all_tables = {}
            for catalog, schemas in ALLOWED_TABLES_BY_CATALOG.items():
                for schema, table_names in schemas.items():
                    if not table_names:
                        continue
                    # Her catalog icin kendi baglantisini ac (session catalog dogrulama icin)
                    try:
                        conn = self._get_conn(catalog=catalog, schema=schema)
                    except Exception as conn_err:
                        logger.warning(f"[TRINO SCHEMA] Connection failed for catalog={catalog}: {conn_err}")
                        continue
                    try:
                        safe_catalog = quote_identifier(catalog)
                        safe_schema_val = schema.replace("'", "''")
                        safe_table_vals = ",".join(
                            f"'{t.replace(chr(39), chr(39)*2)}'" for t in table_names
                        )
                        sql = f"""
                            SELECT
                                c.table_catalog, c.table_schema, c.table_name,
                                c.column_name, c.data_type, c.is_nullable,
                                c.ordinal_position
                            FROM {safe_catalog}.information_schema.columns c
                            WHERE c.table_schema = '{safe_schema_val}'
                              AND c.table_name IN ({safe_table_vals})
                            ORDER BY c.table_name, c.ordinal_position
                        """
                        cur = conn.cursor()
                        cur.execute(sql)
                        desc = cur.description
                        columns = [d[0] for d in desc]

                        for row in cur.fetchall():
                            row_dict = dict(zip(columns, row))
                            fqn = f"{row_dict['table_catalog']}.{row_dict['table_schema']}.{row_dict['table_name']}"
                            if fqn not in all_tables:
                                all_tables[fqn] = {
                                    "name": row_dict["table_name"],
                                    "catalog": row_dict["table_catalog"],
                                    "schema": row_dict["table_schema"],
                                    "full_name": fqn,
                                    "columns": [],
                                }
                            all_tables[fqn]["columns"].append({
                                "name": row_dict["column_name"],
                                "type": row_dict["data_type"],
                                "nullable": row_dict["is_nullable"] == "YES",
                                "is_pk": False,
                            })
                    except Exception as query_err:
                        logger.warning(f"[TRINO SCHEMA] Query failed for catalog={catalog}.{schema}: {query_err}")
                    finally:
                        try:
                            conn.close()
                        except Exception:
                            pass
            return sorted(all_tables.values(), key=lambda t: t["full_name"])

        return await asyncio.get_running_loop().run_in_executor(None, _exec)

    async def ensure_app_users_table(self):
        raise NotImplementedError("Trino read-only. Auth islemleri icin AUTH_DATABASE_URL kullanin.")

    def dialect(self) -> str:
        return "trino"

    @staticmethod
    def _convert_params(sql: str) -> str:
        import re
        return re.sub(r'\$\d+', '%s', sql)


# =================== HELPERS ===================
def _pg_python_type(val) -> str:
    """Python degerinden PostgreSQL tip adini tahmin et (pgbouncer modunda prepare() kullanilamaz)."""
    if val is None:
        return "text"
    if isinstance(val, bool):
        return "boolean"
    if isinstance(val, int):
        return "integer"
    if isinstance(val, float):
        return "double precision"
    from decimal import Decimal
    if isinstance(val, Decimal):
        return "numeric"
    from datetime import datetime, date, time, timedelta
    if isinstance(val, datetime):
        return "timestamp"
    if isinstance(val, date):
        return "date"
    if isinstance(val, time):
        return "time"
    if isinstance(val, timedelta):
        return "interval"
    return "text"


def _mysql_type_name(type_code) -> str:
    """MySQL cursor description type code'u okunabilir isme donustur."""
    try:
        import aiomysql
        _map = {
            aiomysql.FIELD_TYPE.TINY: "tinyint",
            aiomysql.FIELD_TYPE.SHORT: "smallint",
            aiomysql.FIELD_TYPE.LONG: "int",
            aiomysql.FIELD_TYPE.LONGLONG: "bigint",
            aiomysql.FIELD_TYPE.FLOAT: "float",
            aiomysql.FIELD_TYPE.DOUBLE: "double",
            aiomysql.FIELD_TYPE.DECIMAL: "decimal",
            aiomysql.FIELD_TYPE.NEWDECIMAL: "decimal",
            aiomysql.FIELD_TYPE.STRING: "varchar",
            aiomysql.FIELD_TYPE.VAR_STRING: "varchar",
            aiomysql.FIELD_TYPE.BLOB: "text",
            aiomysql.FIELD_TYPE.DATE: "date",
            aiomysql.FIELD_TYPE.DATETIME: "datetime",
            aiomysql.FIELD_TYPE.TIMESTAMP: "timestamp",
        }
        return _map.get(type_code, "unknown")
    except Exception:
        return "unknown"


def _trino_type_name(type_code) -> str:
    """Trino cursor description type bilgisi. Trino genelde string dondurur."""
    if isinstance(type_code, str):
        return type_code.lower()
    return "unknown"


def _mssql_type_name(type_code) -> str:
    """MSSQL cursor description type code'u okunabilir isme donustur."""
    _map = {
        1: "char", 2: "numeric", 3: "decimal", 4: "int", 5: "smallint",
        6: "float", 7: "real", 8: "varchar", 12: "datetime",
    }
    return _map.get(type_code, "unknown")


def create_adapter(db_type: str, url: str, ssl_enabled: bool = False) -> DatabaseAdapter:
    """Verilen tipe gore uygun adapter olustur."""
    db_type = db_type.lower().strip()
    if db_type in ("postgresql", "postgres"):
        return PostgreSQLAdapter(url)
    elif db_type == "mysql":
        return MySQLAdapter(url, ssl_enabled=ssl_enabled)
    elif db_type == "mssql":
        return MSSQLAdapter(url)
    elif db_type == "trino":
        return TrinoAdapter(url)
    else:
        raise ValueError(f"Desteklenmeyen veritabani tipi: {db_type}. Desteklenen: postgresql, mysql, mssql, trino")
