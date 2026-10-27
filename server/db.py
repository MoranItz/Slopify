import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "slopify.db"

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def initialize_database() -> None:
    conn = get_db_connection()
    try:
        with conn:
                conn.execute(
                """
                CREATE TABLE IF NOT EXISTS tracks (
                    id       TEXT PRIMARY KEY,
                    title    TEXT NOT NULL,
                    artist   TEXT,
                    duration INTEGER,
                    filename TEXT NOT NULL,
                    thumbnail TEXT
                )
                """
                )
    finally:
        conn.close()

def add_track(id: str, title: str, artist: str | None,
              duration: int | None, filename: str, thumbnail: str | None) -> None:
    conn = get_db_connection()
    try:
        with conn:
            conn.execute(
                "INSERT OR REPLACE INTO tracks (id, title, artist, duration, filename, thumbnail) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (id, title, artist, duration, filename, thumbnail),
            )
    finally:
        conn.close()

def get_track_by_id(track_id: str) -> dict | None:
    conn = get_db_connection()
    try:
        row = conn.execute("SELECT * FROM tracks WHERE id = ?", (track_id,)).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()

def list_tracks(query: str | None = None) -> list[dict]:
    conn = get_db_connection()
    try:
        if query and query.strip():
            pattern = f"%{query.strip()}%"
            rows = conn.execute(
                "SELECT * FROM tracks WHERE title LIKE ? COLLATE NOCASE OR artist LIKE ? COLLATE NOCASE ORDER BY title",
                (pattern, pattern),
            ).fetchall()
        else:
            rows = conn.execute("SELECT * FROM tracks ORDER BY title").fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()
