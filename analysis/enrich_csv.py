"""
enrich_csv.py
=============
既存の馬券投票履歴CSVを読み込み、race_id をもとに netkeiba から
馬名・人気・オッズを自動取得して新しい列を追加するスクリプト。

実行方法:
    cd keiba_project/analysis
    python3 enrich_csv.py

出力: 馬券投票履歴_enriched.csv
"""

import csv
import time
import re
import sys
import os
import requests
from bs4 import BeautifulSoup

INPUT_CSV  = os.path.join(os.path.dirname(__file__), "馬券投票履歴20260221.csv")
OUTPUT_CSV = os.path.join(os.path.dirname(__file__), "馬券投票履歴_enriched.csv")

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

# race_id "20250601_TOK_11" → netkeiba用 12桁 race_id "202506010511"
# フォーマット: YYYYMMDD + 場所コード2桁 + レース番号2桁 = 12桁
VENUE_CODE = {
    "SAP": "01", "HAK": "02", "FUN": "03", "MOC": "04",
    "KOM": "05", "OI":  "44", "KAW": "47",
    "CHU": "07", "NAG": "08", "URA": "48",
    "KYO": "10", "HAN": "09",
    "KOK": "42", "NAK": "06", "TOK": "05",
    "CHI": "43", "SAS": "45",
}

def to_numeric_race_id(race_id_str):
    """
    文字列 race_id を netkeiba の12桁数値形式に変換する。
    例: "20250601_TOK_11" → "202506010511" (東京=05, レース11R)
    フォーマット: YYYYMMDD + 場所コード2桁 + レース番号2桁 = 12桁
    数値12桁なら そのまま返す。
    """
    if re.fullmatch(r'\d{12}', race_id_str.strip()):
        return race_id_str.strip()

    m = re.match(r'(\d{4})(\d{2})(\d{2})_([A-Z]+)_(\d+)', race_id_str)
    if not m:
        return None
    year, month, day, venue, rnum = m.group(1), m.group(2), m.group(3), m.group(4), m.group(5)
    code = VENUE_CODE.get(venue)
    if not code:
        print(f"  ⚠ 会場コード不明: {venue}")
        return None
    # 12桁: YYYYMMDD + 場所2桁 + レース番号2桁
    numeric_id = f"{year}{month}{day}{code}{int(rnum):02d}"
    return numeric_id


def fetch_horses_from_race_id(numeric_race_id):
    """
    race_id から出馬表HTMLを取得し馬一覧（馬番 -> {name, odds, popularity}）を返す。
    過去レースは db.netkeiba.com/race/ から取得する。
    """
    urls_to_try = [
        f"https://race.netkeiba.com/race/shutuba.html?race_id={numeric_race_id}",
        f"https://db.netkeiba.com/race/{numeric_race_id}/",
    ]
    for url in urls_to_try:
        try:
            res = requests.get(url, headers=HEADERS, timeout=10)
            res.encoding = 'EUC-JP'
            if res.status_code != 200:
                continue
            horses, race_name = parse_horses(res.text, numeric_race_id)
            if horses:
                return horses, race_name, url
        except Exception as e:
            print(f"  ⚠ 接続エラー ({url}): {e}")
    return {}, "", None


def fetch_odds_api(numeric_race_id):
    """netkeiba オッズAPIから人気・オッズ取得"""
    result = {}
    try:
        api_url = (f"https://race.netkeiba.com/api/api_get_jra_odds.html"
                   f"?race_id={numeric_race_id}&type=1&action=init")
        res = requests.get(api_url, headers=HEADERS, timeout=5)
        if res.status_code == 200:
            j = res.json()
            data_val = j.get("data")
            if isinstance(data_val, dict):
                odds_map = data_val.get("odds", {}).get("1", {})
                for umaban_str, vals in odds_map.items():
                    if len(vals) >= 3:
                        try:
                            umaban = int(umaban_str)
                            o_raw = str(vals[0]).strip()
                            p_raw = str(vals[2]).strip()
                            odds_val = float(o_raw) if re.match(r'^\d+(\.\d+)?$', o_raw) else 999.9
                            pop_val  = int(p_raw)  if p_raw.isdigit() else 99
                            result[umaban] = {"odds": odds_val, "popularity": pop_val}
                        except: pass
    except Exception as e:
        print(f"  ⚠ オッズAPI失敗: {e}")
    return result


def normalize_cell_text(cell):
    return cell.get_text(" ", strip=True).replace("\xa0", " ").strip()


def build_header_map(table):
    header_row = table.select_one("tr")
    if not header_row:
        return {}
    headers = [normalize_cell_text(cell) for cell in header_row.find_all(["th", "td"])]
    return {header: idx for idx, header in enumerate(headers) if header}


def safe_cell(cells, idx):
    if idx is None or idx < 0 or idx >= len(cells):
        return ""
    return normalize_cell_text(cells[idx])


def extract_horse_anchor(row):
    for anchor in row.select('a[href*="/horse/"]'):
        text = anchor.get_text(strip=True)
        if text:
            return text
    return ""


def find_umaban(cells, header_map):
    candidate_indexes = []
    for header in ("馬番", "馬 番"):
        if header in header_map:
            candidate_indexes.append(header_map[header])

    for idx in candidate_indexes + list(range(min(4, len(cells)))):
        text = safe_cell(cells, idx)
        if text.isdigit():
            num = int(text)
            if 1 <= num <= 18:
                return num
    return None


def find_popularity(cells, header_map):
    candidate_indexes = []
    for header in ("人気", "人 気"):
        if header in header_map:
            candidate_indexes.append(header_map[header])

    for idx in candidate_indexes:
        text = safe_cell(cells, idx).replace("人気", "").strip()
        m = re.search(r"\d+", text)
        if m:
            num = int(m.group())
            if 1 <= num <= 18:
                return num

    for idx in range(len(cells) - 1, -1, -1):
        text = safe_cell(cells, idx)
        if text.isdigit():
            num = int(text)
            if 1 <= num <= 18:
                return num
    return 99


def find_odds(cells, header_map):
    candidate_indexes = []
    for header in ("単勝", "オッズ", "単 勝"):
        if header in header_map:
            candidate_indexes.append(header_map[header])

    decimal_pattern = re.compile(r"\d+\.\d+")
    for idx in candidate_indexes:
        text = safe_cell(cells, idx).replace(",", "")
        m = decimal_pattern.search(text)
        if m:
            value = float(m.group())
            if value < 1000:
                return value

    for idx in range(len(cells) - 1, -1, -1):
        text = safe_cell(cells, idx).replace(",", "")
        m = decimal_pattern.search(text)
        if m:
            value = float(m.group())
            if value < 1000:
                return value
    return 999.9


def parse_db_race_table(table):
    header_map = build_header_map(table)
    horses = {}

    for row in table.select("tr"):
        if row.find("th"):
            continue
        cells = row.find_all("td")
        if len(cells) < 4:
            continue

        num = find_umaban(cells, header_map)
        name = extract_horse_anchor(row)
        if not name and "馬名" in header_map:
            name = safe_cell(cells, header_map["馬名"])

        if num is None or not name:
            continue

        horses[num] = {
            "name": name,
            "odds": find_odds(cells, header_map),
            "popularity": find_popularity(cells, header_map),
        }

    return horses


def parse_horses(html, numeric_race_id):
    """HTMLから馬一覧パース（shutuba / db.netkeiba 両対応）。(horses_dict, race_name) を返す。"""
    soup = BeautifulSoup(html, 'html.parser')
    horses = {}
    dynamic_odds = fetch_odds_api(numeric_race_id)

    # レース名取得
    race_name = ""
    for sel in ['.RaceName', 'h1.RaceMainName', '.race_name']:
        elem = soup.select_one(sel)
        if elem:
            race_name = elem.get_text(strip=True)
            break
    if not race_name:
        title = soup.select_one('title')
        if title:
            race_name = title.get_text(strip=True).split('|')[0].split('出馬表')[0].strip()

    # --- shutuba.html パターン ---
    rows = soup.select('tr.HorseList')
    if rows:
        for row in rows:
            if 'Cancel' in row.get('class', []): continue
            name_elem = row.select_one('.HorseName a') or row.select_one('.HorseName')
            if not name_elem: continue
            name = name_elem.get_text(strip=True)
            num = None
            td = row.select_one('.Umaban') or row.select_one('td[class*="Umaban"]')
            if td and td.get_text(strip=True).isdigit():
                num = int(td.get_text(strip=True))
            else:
                row_id = row.get('id', '')
                m = re.search(r'tr_(\d+)', row_id)
                if m:
                    maybe_num = int(m.group(1))
                    if 1 <= maybe_num <= 18:
                        num = maybe_num
            if num is None: continue

            pop = dynamic_odds.get(num, {}).get("popularity")
            if pop is None:
                pop_td = row.select_one('td.Popular, td.Popular_Ninki, td[class*="Popular"]')
                if pop_td:
                    pop_match = re.search(r'(\d+)', pop_td.get_text(strip=True))
                    if pop_match:
                        pop = int(pop_match.group(1))
            if pop is None:
                pop = 99

            od = dynamic_odds.get(num, {}).get("odds")
            if od is None:
                odds_td = row.select_one('td.Odds, td[class*="Odds"], td[class*="Popular"]')
                if odds_td:
                    odds_match = re.search(r'(\d+\.\d+)', odds_td.get_text(strip=True).replace(',', ''))
                    if odds_match:
                        od = float(odds_match.group(1))
            if od is None:
                od = 999.9

            horses[num] = {"name": name, "odds": od, "popularity": pop}
        return horses, race_name

    # --- db.netkeiba.com パターン（過去結果） ---
    for selector in ['table.race_table_01', 'table.race_table_old', '.RaceTable']:
        for table in soup.select(selector):
            horses = parse_db_race_table(table)
            if horses:
                return horses, race_name
    return horses, race_name


def get_horses_for_numbers(horses_dict, numbers_str):
    """
    "1|7|8" のような馬番文字列から、馬名・人気・オッズを取得して文字列化。
    """
    if not numbers_str: return "", "", ""
    nums = [n.strip() for n in numbers_str.split('|') if n.strip()]
    names, pops, odds_list = [], [], []
    for n in nums:
        if n.isdigit():
            horse = horses_dict.get(int(n), {})
            names.append(horse.get("name", f"馬番{n}"))
            pops.append(str(horse.get("popularity", 99)))
            odds_list.append(str(horse.get("odds", 999.9)))
    return "|".join(names), "|".join(pops), "|".join(odds_list)


def main():
    print("=== CSV エンリッチ処理開始 ===\n")
    
    with open(INPUT_CSV, encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        original_fields = reader.fieldnames or []
        rows = list(reader)

    new_fields = original_fields + [
        "レース名", "軸馬名", "軸人気", "軸オッズ",
        "相手馬名", "相手人気", "相手オッズ"
    ]
    
    # race_id ごとにキャッシュ（同一レースIDが複数行あるため）
    race_cache = {}     # race_id -> (numeric_id, horses_dict, race_name)

    enriched = []
    for i, row in enumerate(rows):
        race_id_raw = row.get("race_id", "").strip()
        print(f"[{i+1}/{len(rows)}] race_id={race_id_raw}")

        if race_id_raw not in race_cache:
            numeric_id = to_numeric_race_id(race_id_raw)
            if numeric_id:
                print(f"  → numeric_id={numeric_id}")
                horses, race_name_fetched, url_used = fetch_horses_from_race_id(numeric_id)
                if horses:
                    print(f"  ✓ {len(horses)} 頭取得 / レース名: {race_name_fetched} ({url_used})")
                else:
                    race_name_fetched = ""
                    print(f"  ✗ 取得失敗")
                race_cache[race_id_raw] = (numeric_id, horses, race_name_fetched)
                time.sleep(1.5)  # サーバー負荷対策
            else:
                print(f"  ✗ numeric_id 変換失敗")
                race_cache[race_id_raw] = (None, {}, "")

        numeric_id, horses_dict, race_name = race_cache[race_id_raw]

        if not race_name:
            race_name = f"{row.get('競馬場','')}{row.get('距離','')}"

        # 軸・相手の馬名・人気・オッズ
        jiku_str  = row.get("軸馬番", "")
        aite_str  = row.get("相手馬番", "")
        jiku_names, jiku_pops, jiku_odds   = get_horses_for_numbers(horses_dict, jiku_str)
        aite_names, aite_pops, aite_odds   = get_horses_for_numbers(horses_dict, aite_str)

        new_row = dict(row)
        new_row["レース名"]  = race_name
        new_row["軸馬名"]   = jiku_names
        new_row["軸人気"]   = jiku_pops
        new_row["軸オッズ"] = jiku_odds
        new_row["相手馬名"] = aite_names
        new_row["相手人気"] = aite_pops
        new_row["相手オッズ"] = aite_odds
        enriched.append(new_row)

    with open(OUTPUT_CSV, 'w', encoding='utf-8-sig', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=new_fields)
        writer.writeheader()
        writer.writerows(enriched)
    
    print(f"\n=== 完了: {OUTPUT_CSV} に保存しました ===")


if __name__ == "__main__":
    main()
