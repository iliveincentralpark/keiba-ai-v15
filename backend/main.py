from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import sqlite3
import requests
import os
from bs4 import BeautifulSoup
import re
from pathlib import Path
import uvicorn
import time
import math
from concurrent.futures import ThreadPoolExecutor, as_completed
try:
    from .agents.manager import AgentManager
    from .database import init_db
except ImportError:
    from agents.manager import AgentManager
    from database import init_db

app = FastAPI(title="Keiba Scraper API V5")
agent_manager = AgentManager()

@app.on_event("startup")
def startup_event():
    result = init_db()
    print(f"DB ready. seeded={result.get('seeded', 0)} total={result.get('history_count', 0)}")

DB_FILE = Path(os.getenv("DB_FILE_PATH", str(Path(__file__).parent / "keiba_data.db")))

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


def fetch_all_horse_stats_from_shutuba(race_id: str) -> dict:
    """
    shutuba_past.htmlから全馬の近5走成績を一括取得 (V16改)
    戻り値: {horse_num(int): {"positions": [...], "agari": [...]}}
    """
    try:
        url = f"https://race.netkeiba.com/race/shutuba_past.html?race_id={race_id}"
        res = requests.get(url, headers=HEADERS, timeout=12)
        res.encoding = 'EUC-JP'
        if res.status_code != 200:
            print(f"[shutuba_past] status={res.status_code}")
            return {}

        soup = BeautifulSoup(res.text, 'html.parser')
        rows = soup.select('tr.HorseList')
        result = {}

        for row in rows:
            # 馬番取得
            umaban_td = row.select_one('.Umaban') or row.select_one('td[class*="Waku"]')
            num = None
            if umaban_td:
                t = umaban_td.get_text(strip=True)
                if t.isdigit():
                    num = int(t)
            # ID属性からも試みる
            if num is None:
                row_id = row.get('id', '')
                m = re.search(r'tr_(\d+)', row_id)
                if m:
                    maybe = int(m.group(1))
                    if 1 <= maybe <= 18:
                        num = maybe
            if num is None:
                continue

            # Past列から近走着順・上がり3Fを抽出
            past_tds = [td for td in row.find_all('td') if 'Past' in ' '.join(td.get('class', []))]
            positions = []
            agari_times = []

            for ptd in past_tds:
                cls = ' '.join(ptd.get('class', []))
                raw = ptd.get_text(strip=True)

                # 着順取得：Ranking_Nクラス優先、なければテキストから補完
                rank_m = re.search(r'Ranking_(\d+)', cls)
                if rank_m:
                    positions.append(int(rank_m.group(1)))
                else:
                    # テキスト補完: 「5着」「除外」「中止」等のパターン
                    finish_m = re.search(r'^(\d{1,2})着', raw)
                    if not finish_m:
                        # 「X頭 Y番 Z人」の直前にある着順数字を狙う
                        finish_m = re.search(r'(\d{1,2})\s*\d+頭', raw)
                    if finish_m:
                        pos_val = int(finish_m.group(1))
                        if 1 <= pos_val <= 18:
                            positions.append(pos_val)
                    # 除外・中止・取消は positions に含めない（エラー扱い）

                # 上がり3Fを抽出: (33.5) (34.2) (40.1) など30〜49秒台
                agari_m = re.search(r'\((\d{2}\.\d)\)', raw)
                if agari_m:
                    try:
                        agari_val = float(agari_m.group(1))
                        if 30.0 <= agari_val <= 49.9:
                            agari_times.append(agari_val)
                    except ValueError:
                        pass


            if positions or agari_times:
                result[num] = {"positions": positions, "agari": agari_times}

        fetched = sum(1 for v in result.values() if v and v.get("positions"))
        print(f"[shutuba_past] {len(rows)}頭中 {fetched}頭の近走成績取得")
        return result
    except Exception as e:
        print(f"[shutuba_past] error: {e}")
        return {}

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
            # 1. Umabanカラムから取得を試みる
            umaban_td = row.select_one('.Umaban') or row.select_one('td[class*="Umaban"]')
            if umaban_td:
                u_text = umaban_td.get_text(strip=True)
                if u_text.isdigit():
                    num = int(u_text)
            
            # 2. カラムが空の場合はID属性から取得を試みる (例: tr_16)
            if num is None:
                row_id = row.get('id', '')
                id_match = re.search(r'tr_(\d+)', row_id)
                if id_match:
                    maybe_num = int(id_match.group(1))
                    if 1 <= maybe_num <= 18:
                        num = maybe_num
            
            if num is None:
                continue

            name_elem = (
                row.select_one('.HorseName a')
                or row.select_one('.HorseName')
                or row.select_one('a[href*="/horse/"]')
            )
            if not name_elem:
                continue
            name = name_elem.get_text(strip=True)
            if not name:
                continue

            pop = None
            pop_td = row.select_one('.Popular, .Popular_Ninki, td[class*="Popular"]')
            if pop_td:
                p_text = pop_td.get_text(strip=True)
                p_match = re.search(r'(\d+)', p_text)
                if p_match:
                    pop = int(p_match.group(1))

            od = None
            odds_td = row.select_one('.Odds, td[class*="Odds"], td[class*="Popular"]')
            if odds_td:
                o_text = odds_td.get_text(strip=True).replace(',', '')
                o_match = re.search(r'(\d+\.\d+)', o_text)
                if o_match:
                    od = float(o_match.group(1))

            a_item = api_data.get(num, {})
            if pop is None: pop = a_item.get("popularity", 99)
            if od is None: od = a_item.get("odds", 999.9)
            
            # 実力インデックス (V8)
            ability = time_data.get(num, {"max": 0, "avg": 0, "last": 0})
            if num in horses:
                continue

            # V16: horse_id を抽出（近走成績取得に使用）
            horse_id = None
            link_elem = row.select_one('.HorseName a') or row.select_one('a[href*="/horse/"]')
            if link_elem:
                href = link_elem.get('href', '')
                m = re.search(r'/horse/(\d+)', href)
                if m:
                    horse_id = m.group(1)

            horses[num] = {"name": name, "odds": od, "popularity": pop, "ability": ability, "_horse_id": horse_id}
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

def _raw_scrape(race_id: str) -> dict:
    """内部用スクレイプ。_horse_idを含む生データを返す"""
    urls = [
        f"https://race.netkeiba.com/race/shutuba.html?race_id={race_id}",
        f"https://db.netkeiba.com/race/{race_id}/"
    ]
    for url in urls:
        try:
            res = requests.get(url, headers=HEADERS, timeout=10)
            res.encoding = 'EUC-JP'
            if res.status_code != 200:
                continue
            horses, r_name = parse_horses(res.text, race_id)
            if horses:
                return {"success": True, "race_id": race_id, "race_name": r_name, "horses": horses}
        except:
            continue
    return {"success": False}


@app.get("/api/scrape")
def scrape_race(race_id: str):
    race_id = race_id.strip()
    if not re.fullmatch(r'\d{12}', race_id):
        raise HTTPException(status_code=400, detail="Invalid ID")

    result = _raw_scrape(race_id)
    if not result.get("success"):
        raise HTTPException(status_code=404, detail="Data not found")

    # _horse_id など内部フィールドを除外して返す
    clean_horses = {
        num: {k: v for k, v in data.items() if not k.startswith('_')}
        for num, data in result["horses"].items()
    }
    return {**result, "horses": clean_horses}

@app.get("/api/predict")
def predict_race(race_id: str, budget: int = 10000):
    """Agent Managerを使用してレースを予測する (V16: 近走成績取得追加)"""
    race_id = race_id.strip()
    if not re.fullmatch(r'\d{12}', race_id):
        raise HTTPException(status_code=400, detail="Invalid ID")

    # 1. スクレイピング（_horse_idを含む生データ）
    res = _raw_scrape(race_id)
    if not res.get("success"):
        raise HTTPException(status_code=404, detail="Scrape failed")

    raw_horses = res["horses"]

    # 2. 近走成績をshutuba_past.htmlから一括取得 (V16) - 1回のreqで全馬分
    print(f"[predict] Fetching shutuba_past for {race_id}...")
    recent_stats_map = fetch_all_horse_stats_from_shutuba(race_id)
    fetched = sum(1 for v in recent_stats_map.values() if v)
    print(f"[predict] recent_stats fetched: {fetched}/{len(raw_horses)} horses")

    # 3. horses_list に recent_stats を追加
    horses_list = []
    for num_str, data in raw_horses.items():
        num = int(num_str)
        h = {"number": num, **{k: v for k, v in data.items() if not k.startswith('_')}}
        h["recent_stats"] = recent_stats_map.get(num)  # None の場合はデフォルト評価にフォールバック
        horses_list.append(h)

    # 4. User Profile Fetch (DNA)
    try:
        profile_res = get_user_profile()
        user_profile = profile_res.get("profile") if profile_res.get("success") else None
    except Exception:
        user_profile = None

    # 5. Agent Managerによる予測
    predictions = agent_manager.get_predictions(horses_list, budget, user_profile)

    return {
        "success": True,
        "race_id": race_id,
        "race_name": res["race_name"],
        "predictions": predictions
    }

class BetHistoryItem(BaseModel):
    race_id: str
    race_date: str = ""
    venue: str = ""
    distance: str = ""
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
    is_hit: int = 0
    refund: int = 0


def parse_multi_value_numbers(value: str) -> list[float]:
    values = []
    for part in str(value or "").replace("|", ",").split(","):
        part = part.strip()
        if not part:
            continue
        try:
            values.append(float(part))
        except ValueError:
            continue
    return values


def infer_axis_count(row: sqlite3.Row) -> int:
    horses = [v for v in re.split(r"[|,]", str(row["jiku_horses"] or "")) if v.strip()]
    if horses:
        return len(horses)

    method = str(row["bet_method"] or "")
    if "2頭軸" in method:
        return 2
    if "1頭軸" in method or "流し" in method:
        return 1
    if "BOX" in method:
        return 0
    if "フォーメーション" in method:
        return 2
    return 0


def build_user_profile(rows: list[sqlite3.Row]):
    if not rows:
        return None

    pop_stats = {}
    pop_band_stats = {}
    strategy_stats = {}
    axis_stats = {}
    preferred_point_sizes = []

    for row in rows:
        is_hit = int(row["is_hit"] or 0)
        amount = int(row["amount"] or 0)
        refund = int(row["refund"] or 0)
        points = int(row["points"] or 0)
        if points > 0:
            preferred_point_sizes.append(points)

        pops = parse_multi_value_numbers(row["jiku_pops"])
        if pops:
            pop = int(pops[0])
            pop_entry = pop_stats.setdefault(pop, {"hits": 0, "total": 0, "amount": 0, "refund": 0})
            pop_entry["total"] += 1
            pop_entry["hits"] += is_hit
            pop_entry["amount"] += amount
            pop_entry["refund"] += refund

            band = "1-3人気" if pop <= 3 else "4-6人気" if pop <= 6 else "7人気以下"
            band_entry = pop_band_stats.setdefault(band, {"hits": 0, "total": 0, "amount": 0, "refund": 0})
            band_entry["total"] += 1
            band_entry["hits"] += is_hit
            band_entry["amount"] += amount
            band_entry["refund"] += refund

        strategy_key = (str(row["bet_type"] or "不明"), str(row["bet_method"] or "不明"))
        strategy_entry = strategy_stats.setdefault(strategy_key, {"hits": 0, "total": 0, "amount": 0, "refund": 0})
        strategy_entry["total"] += 1
        strategy_entry["hits"] += is_hit
        strategy_entry["amount"] += amount
        strategy_entry["refund"] += refund

        axis_count = infer_axis_count(row)
        axis_entry = axis_stats.setdefault(axis_count, {"hits": 0, "total": 0, "amount": 0, "refund": 0})
        axis_entry["total"] += 1
        axis_entry["hits"] += is_hit
        axis_entry["amount"] += amount
        axis_entry["refund"] += refund

    pop_weights = {}
    strong_pops = []
    for pop, stats in pop_stats.items():
        hit_rate = stats["hits"] / stats["total"] if stats["total"] else 0
        roi = stats["refund"] / stats["amount"] if stats["amount"] else 0
        if stats["total"] >= 2:
            pop_weights[str(pop)] = round(0.85 + min(0.55, hit_rate * 0.8 + max(0.0, roi - 1.0) * 0.18), 3)
        if stats["total"] >= 2 and (hit_rate >= 0.2 or roi >= 1.0):
            strong_pops.append(pop)

    strategy_rankings = []
    for (bet_type, bet_method), stats in strategy_stats.items():
        hit_rate = stats["hits"] / stats["total"] if stats["total"] else 0
        roi = stats["refund"] / stats["amount"] if stats["amount"] else 0
        sample = stats["total"]
        score = (roi * 0.65 + hit_rate * 1.75) * math.log(sample + 1.0)
        strategy_rankings.append({
            "bet_type": bet_type,
            "bet_method": bet_method,
            "sample_size": sample,
            "hit_rate": round(hit_rate, 4),
            "roi": round(roi, 4),
            "score": round(score, 4),
        })
    strategy_rankings.sort(key=lambda item: (item["score"], item["sample_size"]), reverse=True)

    axis_rankings = []
    for axis_count, stats in axis_stats.items():
        hit_rate = stats["hits"] / stats["total"] if stats["total"] else 0
        roi = stats["refund"] / stats["amount"] if stats["amount"] else 0
        score = (roi * 0.55 + hit_rate * 1.5) * math.log(stats["total"] + 1.0)
        axis_rankings.append({
            "axis_count": axis_count,
            "sample_size": stats["total"],
            "hit_rate": round(hit_rate, 4),
            "roi": round(roi, 4),
            "score": round(score, 4),
        })
    axis_rankings.sort(key=lambda item: (item["score"], item["sample_size"]), reverse=True)

    avg_points = round(sum(preferred_point_sizes) / len(preferred_point_sizes), 2) if preferred_point_sizes else 0

    return {
        "strong_pops": sorted(strong_pops),
        "pop_weights": pop_weights,
        "pop_band_stats": pop_band_stats,
        "strategy_rankings": strategy_rankings[:8],
        "preferred_strategies": strategy_rankings[:3],
        "axis_rankings": axis_rankings,
        "preferred_axis_count": axis_rankings[0]["axis_count"] if axis_rankings else 1,
        "average_points": avg_points,
        "total_records": len(rows),
    }


@app.get("/api/user_profile")
def get_user_profile():
    """過去の履歴からユーザーの得意な人気帯、券種、買い方を分析する"""
    try:
        conn = sqlite3.connect(DB_FILE)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("""
            SELECT jiku_horses, jiku_pops, is_hit, bet_type, bet_method, points, amount, refund
            FROM bet_history
        """)
        rows = cursor.fetchall()
        conn.close()
        if not rows:
            return {"success": True, "profile": None}
        return {"success": True, "profile": build_user_profile(rows)}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.get("/api/status")
def get_status():
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM bet_history")
        history_count = cursor.fetchone()[0]
        conn.close()
        profile_res = get_user_profile()
        return {
            "success": True,
            "history_count": history_count,
            "profile_loaded": bool(profile_res.get("profile")) if profile_res.get("success") else False,
            "profile": profile_res.get("profile") if profile_res.get("success") else None,
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.post("/api/import_csv")
def import_csv_data(data: list[BetHistoryItem]):
    """シミュレーター等からアップロードされたCSVデータを一括でDBに保存 (V9)"""
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        for bet in data:
            cursor.execute('''
            INSERT OR IGNORE INTO bet_history (
                race_id, race_date, venue, distance, race_name, bet_type, bet_method, points, amount,
                jiku_horses, aite_horses, jiku_names, aite_names,
                jiku_pops, aite_pops, jiku_odds, aite_odds, is_hit, refund
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                bet.race_id, bet.race_date, bet.venue, bet.distance, bet.race_name, bet.bet_type, bet.bet_method, bet.points, bet.amount,
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
        INSERT OR IGNORE INTO bet_history (
            race_id, race_date, venue, distance, race_name, bet_type, bet_method, points, amount,
            jiku_horses, aite_horses, jiku_names, aite_names,
            jiku_pops, aite_pops, jiku_odds, aite_odds, is_hit, refund
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            bet.race_id, bet.race_date, bet.venue, bet.distance, bet.race_name, bet.bet_type, bet.bet_method, bet.points, bet.amount,
            bet.jiku_horses, bet.aite_horses, bet.jiku_names, bet.aite_names,
            bet.jiku_pops, bet.aite_pops, bet.jiku_odds, bet.aite_odds, bet.is_hit, bet.refund
        ))
        conn.commit()
        conn.close()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/debug")
def debug_scrape(url: str):
    try:
        res = requests.get(url, headers=HEADERS, timeout=10)
        return {"status": res.status_code, "text": res.text[:200]}
    except Exception as e:
        return {"error": str(e)}

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

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
