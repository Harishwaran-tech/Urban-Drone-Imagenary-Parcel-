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

def init_db():
    """Initializes database tables on startup."""
    try:
        from backend.models import db_models
        Base.metadata.create_all(bind=engine)
        logger.info("Database tables initialized successfully.")
    except Exception as e:
        logger.error(f"Error initializing database: {e}")
