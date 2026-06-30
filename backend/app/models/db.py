import os
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# Priority: 1. ENV, 2. Local fallback
BACKEND_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = Path(os.environ.get("BACKEND_DATA_DIR", str(BACKEND_DIR / ".data")))
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_FILE = DATA_DIR / "tft_arena.db"
DEFAULT_URL = f"sqlite:///{DB_FILE}"
DATABASE_URL = os.environ.get("DATABASE_URL", DEFAULT_URL)

# Managed Postgres providers (Render, etc.) hand out "postgresql://" / "postgres://"
# URLs, which SQLAlchemy maps to the psycopg2 driver. We standardize on psycopg
# v3, so normalize to the explicit "+psycopg" dialect. No effect on the sqlite
# self-host default.
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)
elif DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+psycopg://", 1)

engine_kwargs = {}
if DATABASE_URL.startswith("sqlite"):
    engine_kwargs["connect_args"] = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, **engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
