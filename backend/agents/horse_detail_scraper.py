"""
horse_detail_scraper.py

db.netkeiba.com から各馬の競馬場別・距離別成績と血統情報を取得する。
predict_race() の Stage3 で ThreadPoolExecutor から並列呼び出しされる。
"""

import re
import requests
from bs4 import BeautifulSoup

try:
    from .bloodline_data import get_dist_category
except ImportError:
    from bloodline_data import get_dist_category

HEADERS = {
    'User-Agent': (
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
        '(KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
    ),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
}


def fetch_horse_venue_distance_stats(horse_id: str) -> dict:
    """
    db.netkeiba.com/horse/result/{horse_id}/ から
    競馬場別・距離カテゴリ別の全走行成績を集計して返す。

    Returns:
      {
        "venue_stats": {
          "東京": {"total": 5, "wins": 2, "top3": 4, "win_rate": 0.40, "top3_rate": 0.80},
          "阪神": {"total": 3, "wins": 0, "top3": 1, "win_rate": 0.00, "top3_rate": 0.33},
        },
        "dist_stats": {
          "mile": {"total": 8, "wins": 3, "top3": 6, "win_rate": 0.375, "top3_rate": 0.75},
        }
      }
    """
    try:
        url = f"https://db.netkeiba.com/horse/result/{horse_id}/"
        res = requests.get(url, headers=HEADERS, timeout=10)
        res.encoding = 'EUC-JP'
        if res.status_code != 200:
            print(f"[horse_detail] result page status={res.status_code} for {horse_id}")
            return {}

        soup = BeautifulSoup(res.text, 'html.parser')
        table = soup.select_one('table.db_h_race_results')
        if not table:
            print(f"[horse_detail] results table not found for {horse_id}")
            return {}

        venue_stats: dict[str, dict] = {}
        dist_stats: dict[str, dict] = {}

        rows = table.find_all('tr')[1:]  # ヘッダースキップ
        for row in rows:
            tds = row.find_all('td')
            if len(tds) < 15:
                continue
            try:
                # 着順 (index 11)
                rank_text = tds[11].get_text(strip=True)
                rank_clean = re.sub(r'[^\d]', '', rank_text)
                if not rank_clean:
                    continue
                pos = int(rank_clean)
                if pos < 1 or pos > 18:
                    continue

                # 開催 (index 1): "1阪神4" → "阪神"
                venue_text = tds[1].get_text(strip=True)
                venue_m = re.search(r'([^\d\s]+)', venue_text)
                if not venue_m:
                    continue
                venue_name = venue_m.group(1).strip()
                if not venue_name:
                    continue

                # コース (index 14): "芝1600右" → dist_m=1600
                course_text = tds[14].get_text(strip=True) if len(tds) > 14 else ""
                dist_m_match = re.search(r'(\d{3,4})', course_text)
                dist_m = int(dist_m_match.group(1)) if dist_m_match else None
                dist_cat = get_dist_category(dist_m) if dist_m else None

                # 馬場（芝/ダ）
                surface_raw = course_text[:1] if course_text else ""
                surface = "turf" if surface_raw == "芝" else "dirt" if surface_raw in ("ダ", "障") else None

                # 競馬場別集計
                ve = venue_stats.setdefault(venue_name, {"total": 0, "wins": 0, "top3": 0})
                ve["total"] += 1
                if pos == 1:
                    ve["wins"] += 1
                if pos <= 3:
                    ve["top3"] += 1

                # 距離カテゴリ別集計（馬場も考慮してキーに含める）
                if dist_cat and surface:
                    # surface付きキー例: "mile_turf"
                    surf_key = f"{dist_cat}_{surface}"
                    de = dist_stats.setdefault(surf_key, {
                        "total": 0, "wins": 0, "top3": 0,
                        "dist_cat": dist_cat, "surface": surface
                    })
                    de["total"] += 1
                    if pos == 1:
                        de["wins"] += 1
                    if pos <= 3:
                        de["top3"] += 1

                    # 距離カテゴリのみのキーも集計（馬場問わず）
                    de2 = dist_stats.setdefault(dist_cat, {
                        "total": 0, "wins": 0, "top3": 0,
                        "dist_cat": dist_cat, "surface": "all"
                    })
                    de2["total"] += 1
                    if pos == 1:
                        de2["wins"] += 1
                    if pos <= 3:
                        de2["top3"] += 1

            except Exception:
                continue

        # win_rate / top3_rate を付与
        for stats in {**venue_stats, **dist_stats}.values():
            n = stats["total"]
            stats["win_rate"] = round(stats["wins"] / n, 3) if n > 0 else 0.0
            stats["top3_rate"] = round(stats["top3"] / n, 3) if n > 0 else 0.0

        total_races = sum(v["total"] for v in venue_stats.values())
        print(f"[horse_detail] {horse_id}: {total_races}走分の競馬場/距離成績取得 "
              f"({len(venue_stats)}会場, {len(dist_stats)}距離カテゴリ)")
        return {"venue_stats": venue_stats, "dist_stats": dist_stats}

    except Exception as e:
        print(f"[horse_detail] venue/dist error for {horse_id}: {e}")
        return {}


def fetch_horse_bloodline(horse_id: str) -> dict:
    """
    db.netkeiba.com/horse/ped/{horse_id}/ から血統情報（父・母父）を取得。

    Returns:
      {"sire": "ドゥラメンテ", "dam_sire": "キングカメハメハ"}
    """
    try:
        url = f"https://db.netkeiba.com/horse/ped/{horse_id}/"
        res = requests.get(url, headers=HEADERS, timeout=10)
        res.encoding = 'EUC-JP'
        if res.status_code != 200:
            print(f"[horse_detail] ped page status={res.status_code} for {horse_id}")
            return {}

        soup = BeautifulSoup(res.text, 'html.parser')
        blood_table = soup.select_one('table.blood_table')
        if not blood_table:
            print(f"[horse_detail] blood_table not found for {horse_id}")
            return {}

        sire = None
        dam_sire = None

        trs = blood_table.find_all('tr')
        if len(trs) >= 32:
            # 父 (行0 の最初の b_ml)
            td_sire = trs[0].find('td', class_='b_ml')
            if td_sire:
                # td内の最初のリンクが馬名（「血統」「産駒」のリンクより前）
                a_tag = td_sire.find('a')
                sire = a_tag.get_text(strip=True) if a_tag else td_sire.get_text(strip=True)

            # 母父 (行16 の最初の b_ml、母[b_fml]の隣のセル)
            td_ds = trs[16].find('td', class_='b_ml')
            if td_ds:
                a_tag = td_ds.find('a')
                dam_sire = a_tag.get_text(strip=True) if a_tag else td_ds.get_text(strip=True)

        print(f"[horse_detail] {horse_id}: sire={sire}, dam_sire={dam_sire}")
        return {"sire": sire, "dam_sire": dam_sire}

    except Exception as e:
        print(f"[horse_detail] bloodline error for {horse_id}: {e}")
        return {}


def fetch_horse_full_detail(horse_id: str) -> dict:
    """
    競馬場別・距離別成績 + 血統情報を取得して統合して返す。
    ThreadPoolExecutor から並列呼び出しされるエントリーポイント。

    Returns:
      {
        "venue_stats": {...},
        "dist_stats": {...},
        "sire": "ドゥラメンテ",
        "dam_sire": "キングカメハメハ",
      }
    """
    vd = fetch_horse_venue_distance_stats(horse_id)
    bl = fetch_horse_bloodline(horse_id)
    return {
        "venue_stats": vd.get("venue_stats", {}),
        "dist_stats": vd.get("dist_stats", {}),
        "sire": bl.get("sire"),
        "dam_sire": bl.get("dam_sire"),
    }
