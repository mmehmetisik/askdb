"""
migrations.py  —  Database table creation and seeding.
Called once at startup via init_pool().
"""
from backend.core.config import DEFAULT_ADMIN_PASSWORD, logger
from backend.auth import hash_password


async def seed_admin(auth_adapter):
    """Create default admin user if none exists. Clean up plain-text passwords."""
    old_users = await auth_adapter.fetch("SELECT id, password FROM app_users")
    for u in old_users:
        pwd = u["password"] if isinstance(u, dict) else u[1]
        uid = u["id"] if isinstance(u, dict) else u[0]
        if not pwd.startswith("$2b$"):
            await auth_adapter.execute_command("DELETE FROM app_users WHERE id = $1", uid)

    admin_exists = await auth_adapter.fetchrow(
        "SELECT id FROM app_users WHERE role = 'admin'"
    )
    if not admin_exists:
        hashed = hash_password(DEFAULT_ADMIN_PASSWORD)
        await auth_adapter.execute_command(
            "INSERT INTO app_users (username, password, role) VALUES ($1, $2, 'admin')",
            "admin", hashed,
        )
        logger.info("DEFAULT ADMIN CREATED — user: admin (password in .env)")


async def ensure_all_tables(auth_adapter):
    """Create all required tables and columns (idempotent)."""
    await auth_adapter.ensure_app_users_table()
    await seed_admin(auth_adapter)

    await auth_adapter.execute_command("""
        CREATE TABLE IF NOT EXISTS saved_reports (
            id SERIAL PRIMARY KEY,
            title VARCHAR(200) NOT NULL,
            created_by INT NOT NULL REFERENCES app_users(id),
            assigned_to INT REFERENCES app_users(id),
            original_sql TEXT DEFAULT '',
            result_data TEXT DEFAULT '[]',
            column_types TEXT DEFAULT '[]',
            row_count INT DEFAULT 0,
            note TEXT DEFAULT '',
            status VARCHAR(20) DEFAULT 'new',
            filters_applied TEXT DEFAULT '{}',
            hidden_columns TEXT DEFAULT '[]',
            deleted_rows TEXT DEFAULT '[]',
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    """)

    await auth_adapter.execute_command("""
        CREATE TABLE IF NOT EXISTS ml_tasks (
            id SERIAL PRIMARY KEY,
            source_report_id INT NOT NULL REFERENCES saved_reports(id),
            title VARCHAR(200) NOT NULL,
            created_by INT NOT NULL REFERENCES app_users(id),
            note TEXT DEFAULT '',
            target_column INT,
            data TEXT DEFAULT '[]',
            column_types TEXT DEFAULT '[]',
            cleaning_steps TEXT DEFAULT '[]',
            filters_applied TEXT DEFAULT '[]',
            row_count INT DEFAULT 0,
            col_count INT DEFAULT 0,
            status VARCHAR(20) DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    """)

    await auth_adapter.execute_command("""
        CREATE TABLE IF NOT EXISTS ml_jobs (
            id SERIAL PRIMARY KEY,
            ml_task_id INT NOT NULL REFERENCES ml_tasks(id),
            created_by INT NOT NULL REFERENCES app_users(id),
            problem_type VARCHAR(20) NOT NULL,
            target_column VARCHAR(200) NOT NULL,
            feature_columns TEXT DEFAULT '[]',
            algorithms TEXT DEFAULT '[]',
            train_split FLOAT DEFAULT 0.8,
            cv_folds INT DEFAULT 5,
            status VARCHAR(20) DEFAULT 'running',
            error_message TEXT DEFAULT '',
            results TEXT DEFAULT '{}',
            best_model_name VARCHAR(100) DEFAULT '',
            started_at TIMESTAMP DEFAULT NOW(),
            completed_at TIMESTAMP
        )
    """)

    await auth_adapter.execute_command("""
        CREATE TABLE IF NOT EXISTS ml_models (
            id SERIAL PRIMARY KEY,
            ml_job_id INT NOT NULL REFERENCES ml_jobs(id),
            ml_task_id INT NOT NULL REFERENCES ml_tasks(id),
            model_name VARCHAR(100) NOT NULL,
            algorithm VARCHAR(100) NOT NULL,
            problem_type VARCHAR(20) NOT NULL,
            metrics TEXT DEFAULT '{}',
            feature_columns TEXT DEFAULT '[]',
            target_column VARCHAR(200) NOT NULL,
            file_path VARCHAR(500) NOT NULL,
            preprocessing_info TEXT DEFAULT '{}',
            is_best BOOLEAN DEFAULT FALSE,
            created_by INT NOT NULL REFERENCES app_users(id),
            created_at TIMESTAMP DEFAULT NOW()
        )
    """)

    await auth_adapter.execute_command("""
        CREATE TABLE IF NOT EXISTS db_connections (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            db_type VARCHAR(20) NOT NULL,
            host VARCHAR(255) NOT NULL,
            port INT NOT NULL,
            database_name VARCHAR(100) DEFAULT '',
            username VARCHAR(100) DEFAULT '',
            password VARCHAR(255) DEFAULT '',
            ssl_enabled BOOLEAN DEFAULT TRUE,
            is_active BOOLEAN DEFAULT TRUE,
            allowed_tables TEXT DEFAULT '[]',
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    """)

    await auth_adapter.execute_command("""
        CREATE TABLE IF NOT EXISTS analysis_operations (
            id SERIAL PRIMARY KEY,
            report_id INT NOT NULL,
            operation_type VARCHAR(50) NOT NULL,
            column_name VARCHAR(100) DEFAULT '',
            params TEXT DEFAULT '{}',
            description TEXT DEFAULT '',
            affected_rows INT DEFAULT 0,
            created_at TIMESTAMP DEFAULT NOW()
        )
    """)

    # Add columns (idempotent)
    try:
        await auth_adapter.execute_command(
            "ALTER TABLE app_users ADD COLUMN IF NOT EXISTS trino_access BOOLEAN DEFAULT FALSE"
        )
    except Exception as e:
        logger.warning(f"[DB] trino_access column: {e}")

    await auth_adapter.execute_command("""
        CREATE TABLE IF NOT EXISTS query_logs (
            id SERIAL PRIMARY KEY,
            user_id INT REFERENCES app_users(id),
            username VARCHAR(50) NOT NULL,
            question TEXT DEFAULT '',
            generated_sql TEXT DEFAULT '',
            execution_time_ms INT DEFAULT 0,
            row_count INT DEFAULT 0,
            is_trino BOOLEAN DEFAULT FALSE,
            is_cached BOOLEAN DEFAULT FALSE,
            status VARCHAR(20) DEFAULT 'success',
            error_message TEXT DEFAULT '',
            tables_used TEXT DEFAULT '[]',
            created_at TIMESTAMP DEFAULT NOW()
        )
    """)

    await auth_adapter.execute_command("""
        CREATE TABLE IF NOT EXISTS table_profiles (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL UNIQUE,
            description TEXT DEFAULT '',
            allowed_tables TEXT DEFAULT '[]',
            created_by INT REFERENCES app_users(id),
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    """)

    try:
        await auth_adapter.execute_command(
            "ALTER TABLE app_users ADD COLUMN IF NOT EXISTS table_profile_id INT REFERENCES table_profiles(id)"
        )
    except Exception as e:
        logger.warning(f"[DB] table_profile_id column: {e}")

    logger.info("[DB] All tables ready (query_logs + table_profiles included)")
