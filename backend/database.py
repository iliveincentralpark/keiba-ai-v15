import sqlite3
from pathlib import Path

DB_FILE = Path(__file__).parent / "keiba_data.db"

def init_db():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    # 投票履歴を保存するテーブル
    cursor.execute('''
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
    ''')
    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()
    print("Database initialized successfully.")
