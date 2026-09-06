from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path

from app.database import engine, Base
from app.models import Document, AudioBook, HistoryItem  # noqa
from app.routers import documents, audio, history
from app.core.config import settings

# ── Create tables (new databases only) ────────────────────────────────────
Base.metadata.create_all(bind=engine)

# ── SQLite column migrations (safe to run every startup) ──────────────────
def _migrate():
    """Add any missing columns to existing tables without dropping data."""
    if "sqlite" not in settings.database_url:
        return  # PostgreSQL handles this via proper migrations

    import sqlite3
    db_path = settings.database_url.replace("sqlite:///", "")
    conn = sqlite3.connect(db_path)
    cur  = conn.cursor()

    def _columns(table: str):
        cur.execute(f"PRAGMA table_info({table})")
        return {row[1] for row in cur.fetchall()}

    hist_cols = _columns("history_items")
    if "completed" not in hist_cols:
        cur.execute("ALTER TABLE history_items ADD COLUMN completed TEXT DEFAULT 'false'")
    if "resume_sentence" not in hist_cols:
        cur.execute("ALTER TABLE history_items ADD COLUMN resume_sentence INTEGER DEFAULT 0")

    doc_cols = _columns("documents")
    if "analysis" not in doc_cols:
        cur.execute("ALTER TABLE documents ADD COLUMN analysis TEXT")

    conn.commit()
    conn.close()

_migrate()

# ── App ────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Lesly Refresh Reader — API",
    version="1.0.0",
    docs_url="/docs",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

audio_dir = Path(settings.audio_dir)
audio_dir.mkdir(parents=True, exist_ok=True)

# ── Routers ────────────────────────────────────────────────────────────────
app.include_router(documents.router)
app.include_router(audio.router)
app.include_router(history.router)


@app.get("/health")
def health():
    return {"status": "ok", "service": "Lesly Refresh Reader"}


@app.get("/")
def root():
    return {"message": "API running. See /docs for endpoints."}
