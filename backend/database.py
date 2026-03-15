import csv
import os
import sqlite3
from pathlib import Path
from typing import Optional

DB_FILE = Path(os.getenv("DB_FILE_PATH", str(Path(__file__).parent / "keiba_data.db")))
PROJECT_ROOT = Path(__file__).parent.parent
DEFAULT_HISTORY_CSV = PROJECT_ROOT / "analysis" / "馬券投票履歴_enriched.csv"
FALLBACK_HISTORY_CSV = PROJECT_ROOT / "analysis" / "馬券投票履歴20260221.csv"


def _normalize_history_row(row: dict[str, str]) -> dict[str, object]:
    points = int(str(row.get("点数", "0") or "0") or 0)
    amount = int(str(row.get("購入額", "0") or "0") or 0)
    refund = int(str(row.get("払戻", "0") or "0") or 0)
    is_hit_raw = str(row.get("的中", "0") or "0").strip()
    is_hit = 1 if is_hit_raw == "1" or refund > 0 else 0

    return {
        "race_id": str(row.get("race_id", "") or "").strip(),
        "race_date": str(row.get("開催日", "") or "").strip(),
        "venue": str(row.get("競馬場", "") or "").strip(),
        "distance": str(row.get("距離", "") or "").strip(),
        "bet_type": str(row.get("券種", "") or "").strip(),
        "bet_method": str(row.get("買い方", "") or "").strip(),
        "jiku_horses": str(row.get("軸馬番", "") or "").strip(),
        "aite_horses": str(row.get("相手馬番", "") or "").strip(),
        "points": points,
        "amount": amount,
        "is_hit": is_hit,
        "refund": refund,
        "race_name": str(row.get("レース名", "") or "").strip(),
        "jiku_names": str(row.get("軸馬名", "") or "").strip(),
        "jiku_pops": str(row.get("軸人気", "") or "").strip().replace("|", ","),
        "jiku_odds": str(row.get("軸オッズ", "") or "").strip().replace("|", ","),
        "aite_names": str(row.get("相手馬名", "") or "").strip(),
        "aite_pops": str(row.get("相手人気", "") or "").strip().replace("|", ","),
        "aite_odds": str(row.get("相手オッズ", "") or "").strip().replace("|", ","),
    }


def _history_csv_path() -> Optional[Path]:
    if DEFAULT_HISTORY_CSV.exists():
        return DEFAULT_HISTORY_CSV
    if FALLBACK_HISTORY_CSV.exists():
        return FALLBACK_HISTORY_CSV
    return None


def seed_history_from_csv(conn: sqlite3.Connection) -> int:
    csv_path = _history_csv_path()
    if not csv_path:
        return 0

    with csv_path.open(encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))

    payload = [_normalize_history_row(row) for row in rows if str(row.get("race_id", "") or "").strip()]
    if not payload:
        return 0

    conn.executemany(
        """
        INSERT OR IGNORE INTO bet_history (
            race_id, race_date, venue, distance, bet_type, bet_method,
            jiku_horses, aite_horses, points, amount, is_hit, refund,
            race_name, jiku_names, jiku_pops, jiku_odds,
            aite_names, aite_pops, aite_odds
        ) VALUES (
            :race_id, :race_date, :venue, :distance, :bet_type, :bet_method,
            :jiku_horses, :aite_horses, :points, :amount, :is_hit, :refund,
            :race_name, :jiku_names, :jiku_pops, :jiku_odds,
            :aite_names, :aite_pops, :aite_odds
        )
        """,
        payload,
    )
    return len(payload)


def init_db():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS bet_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            race_id TEXT NOT NULL,
            race_date TEXT,
            venue TEXT,
            distance TEXT,
            bet_type TEXT,
            bet_method TEXT,
            jiku_horses TEXT,
            aite_horses TEXT,
            points INTEGER,
            amount INTEGER,
            is_hit INTEGER DEFAULT 0,
            refund INTEGER DEFAULT 0,
            race_name TEXT,
            jiku_names TEXT,
            jiku_pops TEXT,
            jiku_odds TEXT,
            aite_names TEXT,
            aite_pops TEXT,
            aite_odds TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    cursor.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS idx_bet_history_identity
        ON bet_history (
            race_id, bet_type, bet_method, jiku_horses, aite_horses, amount
        )
        """
    )

    cursor.execute("SELECT COUNT(*) FROM bet_history")
    history_count = cursor.fetchone()[0]
    seeded = 0
    if history_count == 0:
        seeded = seed_history_from_csv(conn)

    conn.commit()
    conn.close()
    return {"history_count": history_count + seeded, "seeded": seeded}


if __name__ == "__main__":
    result = init_db()
    print(f"Database initialized successfully. seeded={result['seeded']}")
