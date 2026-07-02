import os
from pathlib import Path
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, declarative_base

# Priority: 1. ENV, 2. Local fallback
BACKEND_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = Path(os.environ.get("BACKEND_DATA_DIR", str(BACKEND_DIR / ".data")))
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_FILE = DATA_DIR / "idea-gauntlet.db"
DEFAULT_URL = f"sqlite:///{DB_FILE}"
DATABASE_URL = os.environ.get("DATABASE_URL", DEFAULT_URL)

# Many managed Postgres providers hand out "postgresql://" / "postgres://" URLs,
# which SQLAlchemy maps to the psycopg2 driver. We standardize on psycopg v3, so
# normalize to the explicit "+psycopg" dialect. No effect on the sqlite
# self-host default.
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)
elif DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+psycopg://", 1)

engine_kwargs = {}
if DATABASE_URL.startswith("sqlite"):
    # check_same_thread=False: the async server touches the DB from worker
    # threads. timeout: how long a connection waits on a locked DB before
    # raising (see the busy_timeout PRAGMA below, which is the effective knob).
    engine_kwargs["connect_args"] = {"check_same_thread": False, "timeout": 30}

engine = create_engine(DATABASE_URL, **engine_kwargs)


if DATABASE_URL.startswith("sqlite") and not DATABASE_URL.endswith(":memory:"):

    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_conn, _record):
        """Make SQLite tolerate the app's concurrent writers.

        The default rollback journal serializes writers with a short busy
        timeout, so a background write (e.g. usage metering) racing a request's
        transaction fails fast with "database is locked". WAL lets readers run
        concurrently with a single writer, and a long busy_timeout makes the
        remaining writer-vs-writer contention wait-and-retry instead of erroring.
        """
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=30000")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
