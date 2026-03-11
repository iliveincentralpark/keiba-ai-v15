from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import sqlite3
import requests
from bs4 import BeautifulSoup
import re
from pathlib import Path
import uvicorn
import time
from agents.manager import AgentManager

app = FastAPI(title="Keiba Scraper API V5")
agent_manager = AgentManager()

DB_FILE = Path(__file__).parent / "keiba_data.db"

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
}

def fetch_odds_api(race_id: str):
    """race.netkeiba.com の JSON APIからオッズ・人気取得"""
    result = {}
    try:
        ts = int(time.time() * 1000)
        api_url = (f"https://race.netkeiba.com/api/api_get_jra_odds.html"
                   f"?race_id={race_id}&type=1&action=init&_={ts}")
        res = requests.get(api_url, headers=HEADERS, timeout=5)
        if res.status_code == 200:
            j = res.json()
            odds_data = j.get("data", {}).get("odds", {}).get("1", {})
            for num_str, vals in odds_data.items():
                if len(vals) >= 3:
                    try:
                        n = int(num_str)
                        od = float(vals[0]) if str(vals[0]).replace('.','').isdigit() else 999.9
                        pop = int(vals[2]) if str(vals[2]).isdigit() else 99
                        result[n] = {"odds": od, "popularity": pop}
                    except: pass
    except Exception as e:
        print(f"API Error: {e}")
    return result

def fetch_time_index(race_id: str):
    """タイム指数(馬の能力)を取得 (V8)"""
    result = {}
    try:
        url = f"https://race.netkeiba.com/race/speed.html?race_id={race_id}"
        res = requests.get(url, headers=HEADERS, timeout=5)
        res.encoding = 'EUC-JP'
        if res.status_code == 200:
            soup = BeautifulSoup(res.text, 'html.parser')
            rows = soup.select('tr.HorseList')
            for row in rows:
                num_td = row.select_one('.Umaban')
                if not num_td: continue
                try:
                    num = int(num_td.get_text(strip=True))
                    max_idx = row.select_one('.SpeedIdx_Max')
                    avg_idx = row.select_one('.SpeedIdx_Average')
                    last_idx = row.select_one('.SpeedIdx_Last')
                    def to_int(e):
                        if not e: return 0
                        t = e.get_text(strip=True).replace('*', '')
                        return int(t) if t.isdigit() else 0
                    result[num] = {"max": to_int(max_idx), "avg": to_int(avg_idx), "last": to_int(last_idx)}
                except: continue
    except: pass
    return result

def parse_horses(html: str, race_id: str):
    soup = BeautifulSoup(html, 'html.parser')
    horses = {}
    
    # 1. ライブ出馬表 (race.netkeiba.com)
    rows_live = soup.select('tr.HorseList')
    race_name = ""
    for sel in ['h1.RaceMainName', '.RaceName', '.race_name']:
        elem = soup.select_one(sel)
        if elem:
            race_name = elem.get_text(strip=True)
            break

    if rows_live:
        api_data = fetch_odds_api(race_id)
        time_data = fetch_time_index(race_id) # V8
        for row in rows_live:
            if 'Cancel' in row.get('class', []): continue
            num = None
            umaban_td = row.select_one('.Umaban') or row.select_one('td[class*="Umaban"]')
            if umaban_td and umaban_td.get_text(strip=True).isdigit():
                num = int(umaban_td.get_text(strip=True))
            if num is None: continue
            name_elem = row.select_one('.HorseName a') or row.select_one('.HorseName')
            name = name_elem.get_text(strip=True) if name_elem else f"馬#{num}"
            pop = None
            pop_td = row.select_one('.Popular')
            if pop_td:
                p_text = pop_td.get_text(strip=True)
                if p_text.isdigit(): pop = int(p_text)
            od = None
            odds_td = row.select_one('.Odds')
            if odds_td:
                o_text = odds_td.get_text(strip=True).replace(',', '')
                try: od = float(o_text)
                except: pass
            a_item = api_data.get(num, {})
            if pop is None: pop = a_item.get("popularity", 99)
            if od is None: od = a_item.get("odds", 999.9)
            
            # 実力インデックス (V8)
            ability = time_data.get(num, {"max": 0, "avg": 0, "last": 0})
            horses[num] = {"name": name, "odds": od, "popularity": pop, "ability": ability}
        return horses, race_name

    # 2. 過去データ (db.netkeiba.com)
    for selector in ['table.race_table_01 tr', 'table.race_table_old tr']:
        rows = soup.select(selector)
        if rows: break
    
    for row in rows:
        tds = row.find_all('td')
        if len(tds) < 14: continue
        try:
            # 2:馬番, 3:馬名, 12:単勝, 13:人気
            num = int(tds[2].get_text(strip=True))
            name = tds[3].get_text(strip=True)
            od = float(tds[12].get_text(strip=True).replace(',', ''))
            pop = int(tds[13].get_text(strip=True))
            horses[num] = {"name": name, "odds": od, "popularity": pop, "ability": {"max":0,"avg":0,"last":0}}
        except: continue
        
    return horses, race_name

@app.get("/api/scrape")
def scrape_race(race_id: str):
    race_id = race_id.strip()
    if not re.fullmatch(r'\d{12}', race_id):
        raise HTTPException(status_code=400, detail="Invalid ID")
    
    urls = [
        f"https://race.netkeiba.com/race/shutuba.html?race_id={race_id}",
        f"https://db.netkeiba.com/race/{race_id}/"
    ]
    for url in urls:
        try:
            res = requests.get(url, headers=HEADERS, timeout=10)
            res.encoding = 'EUC-JP'
            if res.status_code != 200: continue
            horses, r_name = parse_horses(res.text, race_id)
            if horses:
                return {"success": True, "race_id": race_id, "race_name": r_name, "horses": horses}
        except: continue
        
    raise HTTPException(status_code=404, detail="Data not found")

@app.get("/api/predict")
def predict_race(race_id: str, budget: int = 10000):
    """Agent Managerを使用してレースを予測する (V15)"""
    # 1. スクレイピング
    res = scrape_race(race_id)
    if not res.get("success"):
        raise HTTPException(status_code=404, detail="Scrape failed")
    
    horses_list = [
        {"number": num, **data} 
        for num, data in res["horses"].items()
    ]
    
    # +++ User Profile Fetch (DNA) +++
    try:
        profile_res = get_user_profile()
        user_profile = profile_res.get("profile") if profile_res.get("success") else None
    except Exception:
        user_profile = None

    # 2. Agent Managerによる予測
    predictions = agent_manager.get_predictions(horses_list, budget, user_profile)
    
    return {
        "success": True,
        "race_id": race_id,
        "race_name": res["race_name"],
        "predictions": predictions
    }

@app.get("/api/user_profile")
def get_user_profile():
    """過去の履歴からユーザーの得意な人気帯、券種を分析 (V8)"""
    try:
        conn = sqlite3.connect(DB_FILE)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT jiku_pops, is_hit, bet_type, amount, refund FROM bet_history")
        rows = cursor.fetchall()
        conn.close()
        if not rows: return {"success": True, "profile": None}
        pop_counts = {}
        for r in rows:
            pops = str(r['jiku_pops']).split(',')
            if pops and pops[0].isdigit():
                p = int(pops[0])
                if p not in pop_counts: pop_counts[p] = {"hits": 0, "total": 0}
                pop_counts[p]["total"] += 1
                if r['is_hit']: pop_counts[p]["hits"] += 1
        strong_pops = [p for p, v in pop_counts.items() if v['total'] >= 3 and (v['hits']/v['total']) > 0.25]
        return {"success": True, "profile": {"strong_pops": strong_pops, "total_records": len(rows)}}
    except Exception as e:
        return {"success": False, "error": str(e)}

class BetHistoryItem(BaseModel):
    race_id: str
    race_name: str = ""
    bet_type: str
    bet_method: str
    points: int
    amount: int
    jiku_horses: str = ""
    aite_horses: str = ""
    jiku_names: str = ""
    aite_names: str = ""
    jiku_pops: str = ""
    aite_pops: str = ""
    jiku_odds: str = ""
    aite_odds: str = ""

@app.post("/api/import_csv")
def import_csv_data(data: list[BetHistoryItem]):
    """シミュレーター等からアップロードされたCSVデータを一括でDBに保存 (V9)"""
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        for bet in data:
            cursor.execute('''
            INSERT INTO bet_history (
                race_id, race_name, bet_type, bet_method, points, amount,
                jiku_horses, aite_horses, jiku_names, aite_names,
                jiku_pops, aite_pops, jiku_odds, aite_odds, is_hit, refund
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                bet.race_id, bet.race_name, bet.bet_type, bet.bet_method, bet.points, bet.amount,
                bet.jiku_horses, bet.aite_horses, bet.jiku_names, bet.aite_names,
                bet.jiku_pops, bet.aite_pops, bet.jiku_odds, bet.aite_odds, bet.is_hit, bet.refund
            ))
        conn.commit()
        conn.close()
        return {"success": True, "count": len(data)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/save_bet")
def save_bet(bet: BetHistoryItem):
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute('''
        INSERT INTO bet_history (
            race_id, race_name, bet_type, bet_method, points, amount,
            jiku_horses, aite_horses, jiku_names, aite_names,
            jiku_pops, aite_pops, jiku_odds, aite_odds
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            bet.race_id, bet.race_name, bet.bet_type, bet.bet_method, bet.points, bet.amount,
            bet.jiku_horses, bet.aite_horses, bet.jiku_names, bet.aite_names,
            bet.jiku_pops, bet.aite_pops, bet.jiku_odds, bet.aite_odds
        ))
        conn.commit()
        conn.close()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/bet_history")
def get_bet_history():
    try:
        conn = sqlite3.connect(DB_FILE)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM bet_history ORDER BY id DESC')
        rows = cursor.fetchall()
        conn.close()
        return {"success": True, "history": [dict(r) for r in rows]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Serving static files
BASE_DIR = Path(__file__).parent.parent
app.mount("/", StaticFiles(directory=BASE_DIR / "app", html=True), name="app")

@app.get("/api/debug")
def debug_scrape(url: str):
    try:
        res = requests.get(url, headers=HEADERS, timeout=10)
        return {"status": res.status_code, "text": res.text[:200]}
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
