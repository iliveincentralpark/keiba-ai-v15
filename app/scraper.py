import json
import requests
from bs4 import BeautifulSoup
import re

def get_netkeiba_odds(html_content, race_id=None):
    """
    html_content: 出馬表のHTML
    race_id: オッズAPIを叩くために必要なID
    """
    soup = BeautifulSoup(html_content, 'html.parser')
    debug_logs = []

    race_info = {
        "name": "レース名取得エラー",
        "course": "",
        "time": "",
        "condition": "",
        "roughness": "🛡️ 堅実",
        "is_rough": False
    }

    try:
        title_elem = soup.select_one('title')
        if title_elem:
            race_info["name"] = title_elem.text.split('出馬表')[0].strip()
        race_name_elem = soup.select_one('.RaceName')
        if race_name_elem:
            race_info["name"] = race_name_elem.text.strip()
        race_data_elem = soup.select_one('.RaceData01')
        if race_data_elem:
            race_info["course"] = race_data_elem.text.strip().replace('\n', ' ')
            parts = race_info["course"].split('/')
            for p in parts:
                p = p.strip()
                if '発走' in p: race_info["time"] = p
                if '馬場:' in p: race_info["condition"] = p.replace('馬場:', '')
    except Exception as e:
        debug_logs.append(f"Race Info Error: {e}")

    dynamic_odds = {}
    if race_id:
        try:
            # action=init を追加することで、未確定レースの「予想人気(yoso)」を取得可能にする
            odds_url = f"https://race.netkeiba.com/api/api_get_jra_odds.html?race_id={race_id}&type=1&action=init"
            headers = {'User-Agent': 'Mozilla/5.0'}
            res = requests.get(odds_url, headers=headers, timeout=5)
            if res.status_code == 200:
                json_data = res.json()
                data_val = json_data.get("data")
                
                # dataが文字列(圧縮データ)の場合もあるが、action=init では辞書で返ることが多い
                if isinstance(data_val, dict):
                    odds_map = data_val.get("odds", {}).get("1", {})
                    for umaban_str, vals in odds_map.items():
                        if len(vals) >= 3:
                            try:
                                umaban = int(umaban_str)
                                o_raw = str(vals[0]).strip()
                                p_raw = str(vals[2]).strip()
                                
                                odds_val = float(o_raw) if o_raw and re.match(r'^\d+(\.\d+)?$', o_raw) else 999.9
                                pop_val = int(p_raw) if p_raw and p_raw.isdigit() else 99
                                
                                dynamic_odds[umaban] = {"odds": odds_val, "popularity": pop_val}
                            except: pass
                else:
                    debug_logs.append("API Error: 'data' field is not a dictionary.")
        except Exception as e:
            debug_logs.append(f"API Error: {e}")

    horses = []
    try:
        rows = soup.select('tr.HorseList')
        for row in rows:
            try:
                if 'Cancel' in row.get('class', []): continue
                name_elem = row.select_one('.HorseName a') or row.select_one('.HorseName')
                if not name_elem: continue
                name = name_elem.get_text(strip=True)

                # 馬番の取得
                num = None
                row_id = row.get('id', '')
                id_match = re.search(r'tr_(\d+)', row_id)
                if id_match:
                    num = int(id_match.group(1))
                else:
                    umaban_td = row.select_one('td[class*="Umaban"]')
                    if umaban_td:
                        txt = umaban_td.get_text(strip=True)
                        if txt.isdigit(): num = int(txt)
                
                if num is None: continue

                odds = 999.9
                popularity = 99
                source = "none"

                # 1. APIからの取得 (最優先)
                if num in dynamic_odds:
                    odds = dynamic_odds[num]["odds"]
                    popularity = dynamic_odds[num]["popularity"]
                    source = "api"
                
                # 2. HTMLからの抽出（フォールバック）
                if source == "none":
                    pop_td = row.select_one('td.Popular, td.Popular_Ninki')
                    if pop_td:
                        p_txt = pop_td.get_text(strip=True)
                        match = re.search(r'(\d+)', p_txt)
                        if match:
                            popularity = int(match.group(1))
                            source = "html_pop"
                    
                if odds == 999.9:
                    odds_td = row.select_one('td.Odds, td.Popular')
                    if odds_td:
                        o_txt = odds_td.get_text(strip=True).replace(',', '')
                        match = re.search(r'(\d+\.\d+)', o_txt)
                        if match:
                            odds = float(match.group(1))
                            if source == "none": source = "html_odds"

                horses.append({"number": num, "name": name, "odds": odds, "popularity": popularity, "source_debug": source})
            except Exception as e:
                debug_logs.append(f"Row Error: {e}")
    except Exception as e:
        debug_logs.append(f"Loop Error: {e}")

    # 荒れ判定
    try:
        valid_p = [h for h in horses if h['popularity'] < 99]
        if valid_p:
            sorted_h = sorted(valid_p, key=lambda x: x['popularity'])
            top_odds = sorted_h[0]['odds']
            if top_odds >= 4.0:
                race_info["roughness"] = "🔥 波乱"
                race_info["is_rough"] = True
            elif top_odds >= 3.0:
                race_info["roughness"] = "⚠️ 混戦"
                race_info["is_rough"] = True
    except: pass

    return {"race_info": race_info, "horses": horses, "debug_logs": debug_logs}
