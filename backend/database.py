import os
import logging
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

logger = logging.getLogger("cadastra.database")

# Environment variable for database connection (defaults to local SQLite if PostgreSQL is not active)
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./backend/cadastral.db")

# Detect database dialect
IS_POSTGRES = DATABASE_URL.startswith("postgresql")

try:
    if IS_POSTGRES:
        logger.info(f"Connecting to PostgreSQL/PostGIS: {DATABASE_URL.split('@')[-1]}")
        engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_size=10, max_overflow=20)
    else:
        logger.info("Connecting to local SQLite database (Development mode)")
        engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
except Exception as e:
    logger.warning(f"Failed to connect to configured DB ({e}). Falling back to SQLite memory/file.")
    DATABASE_URL = "sqlite:///./backend/cadastral.db"
    IS_POSTGRES = False
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    """FastAPI Dependency for database sessions."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

from sqlalchemy import text as sa_text

def init_db():
    """Initializes database tables on startup and migrates schema if needed."""
    try:
        from backend.models import db_models
        Base.metadata.create_all(bind=engine)

        # SQLite automatic schema migration for added columns
        if not IS_POSTGRES:
            with engine.connect() as conn:
                # Check parcels columns
                res = conn.execute(sa_text("PRAGMA table_info(parcels)"))
                existing_cols = {row[1] for row in res.fetchall()}
                new_cols = {
                    "corrected_geometry_json": "TEXT",
                    "current_geometry_json": "TEXT",
                    "ground_truth_geometry_json": "TEXT",
                    "validation_metrics_json": "TEXT DEFAULT '{}'",
                }
                for col_name, col_type in new_cols.items():
                    if col_name not in existing_cols:
                        conn.execute(sa_text(f"ALTER TABLE parcels ADD COLUMN {col_name} {col_type}"))
                        logger.info(f"Added column {col_name} to parcels table.")

                # Check survey_projects columns
                res_p = conn.execute(sa_text("PRAGMA table_info(survey_projects)"))
                existing_p_cols = {row[1] for row in res_p.fetchall()}
                new_p_cols = {
                    "working_crs": "VARCHAR(64)",
                    "source_crs": "VARCHAR(64)",
                }
                for col_name, col_type in new_p_cols.items():
                    if col_name not in existing_p_cols:
                        conn.execute(sa_text(f"ALTER TABLE survey_projects ADD COLUMN {col_name} {col_type}"))
                        logger.info(f"Added column {col_name} to survey_projects table.")

                conn.commit()

        # Seed default users
        try:
            from backend.services.auth_service import seed_default_users
            db_session = SessionLocal()
            seed_default_users(db_session)
            db_session.close()
        except Exception as seed_err:
            logger.warning(f"Could not seed default users: {seed_err}")

        logger.info("Database tables initialized successfully.")
    except Exception as e:
        logger.error(f"Error initializing database: {e}")

