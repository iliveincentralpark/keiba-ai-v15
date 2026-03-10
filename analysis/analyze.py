import csv
import io
from collections import defaultdict
from datetime import datetime

data = """race_id,開催日,競馬場,距離,券種,買い方,軸馬番,相手馬番,点数,購入額,的中,払戻
20250223_TOK_11,2025/02/23,東京,ダ1600,馬単,1頭軸,14,1|7|8|9|12,5,5000,0,0
20250413_HAN_11,2025/04/13,阪神,芝1600,3連複,1頭軸,2,6|8|9|15,6,600,0,0
20250413_HAN_11,2025/04/13,阪神,芝1600,3連単,流し,2,6|8|9|15,12,1200,0,0
20250420_NAK_11,2025/04/20,中山,芝2000,3連複,1頭軸,10,1|2|5|9|17,10,1000,0,0
20250504_KYO_11,2025/05/04,京都,芝3200,3連単,フォーメーション,5,3|6|8|14|15,12,1200,0,0
20250601_TOK_11,2025/06/01,東京,芝2400,3連複,2頭軸,13|17,2|6|7|9|16,5,500,1,2990
20250622_TOK_11,2025/06/22,東京,芝1600,馬連,1頭軸,7,4|10|11|12|13,5,500,1,3030
20250625_URA_11,2025/06/25,浦和,ダ1400,馬単,1頭軸,2,4|5|6|9|11,5,500,1,6150
20251228_NAK_11,2025/12/28,中山,芝2500,3連複,2頭軸,5|6,3|4|9|12|13|16,6,600,0,0
20251228_NAK_11,2025/12/28,中山,芝2500,3連単,フォーメーション,5|6,3|4|9|12|13|16,12,2400,0,0
20251102_TOK_11,2025/11/02,東京,芝2000,3連複,1頭軸,13,3|4|5|6|7,10,1000,0,0
20251116_KYO_11,2025/11/16,京都,芝2200,3連複,1頭軸,7,4|6|9|10|13,10,1000,0,0
20251123_KYO_11,2025/11/23,京都,芝1600,馬単,1頭軸,15,1|4|12|14|16|17,6,600,0,0
20251130_TOK_12,2025/10/30,東京,芝2400,3連単,フォーメーション,8,1|2|14|18,9,900,0,0
20241222_NAK_11,2024/12/22,中山,芝2500,3連複,1頭軸,8,1|3|6|9|10|16,15,1500,1,20850
20241222_NAK_11,2024/12/22,中山,芝2500,ワイド,BOX,,8|9|10|15|16,10,1000,1,4450
20240602_KYO_11,2024/06/02,東京,芝1600,馬連,フォーメーション,7|15,3|5|7|13|15|16,9,900,1,2850"""

reader = csv.DictReader(io.StringIO(data.strip()))
rows = list(reader)

def format_stats(group_name, stats_dict):
    print(f"=== {group_name} ===")
    print(f"{'カテゴリ':<15} | {'レース数':>5} | {'購入額':>7} | {'払戻':>8} | {'的中数':>5} | {'回収率(%)':>8} | {'的中率(%)':>8}")
    print("-" * 75)
    for k, v in stats_dict.items():
        k_str = "未設定/なし" if str(k) == "" else str(k)
        races = v['races']
        cost = v['cost']
        ret = v['ret']
        hits = v['hits']
        roi = (ret / cost * 100) if cost > 0 else 0
        hit_rate = (hits / races * 100) if races > 0 else 0
        # zenkaku padding equivalent roughly, string formatting
        print(f"{k_str:<15} | {races:5d} | {cost:7d} | {ret:8d} | {hits:5d} | {roi:8.1f} | {hit_rate:8.1f}")
    print()

def analyze_by(key_func):
    stats = defaultdict(lambda: {'races': 0, 'cost': 0, 'ret': 0, 'hits': 0})
    for row in rows:
        key = key_func(row)
        stats[key]['races'] += 1
        stats[key]['cost'] += int(row['購入額'])
        stats[key]['ret'] += int(row['払戻'])
        stats[key]['hits'] += int(row['的中'])
    return dict(stats)

# 1. 券種別成績
format_stats("1. 券種別成績", analyze_by(lambda r: r['券種']))

# 2. 買い方別成績
format_stats("2. 買い方別成績", analyze_by(lambda r: r['買い方']))

# 3. 軸頭数別
def get_jiku_count(r):
    jiku = r['軸馬番']
    if not jiku: return 0
    return len(jiku.split('|'))
format_stats("3. 軸頭数別", analyze_by(lambda r: f"{get_jiku_count(r)}頭軸"))

# 4. 点数帯別
def get_tensu_bin(r):
    t = int(r['点数'])
    if t <= 5: return "1-5点"
    elif t <= 10: return "6-10点"
    else: return "11点-"
format_stats("4. 点数帯別", analyze_by(get_tensu_bin))

# 5. 券種×買い方
format_stats("5. 券種×買い方", analyze_by(lambda r: f"{r['券種']} - {r['買い方']}"))

# 6. 直近傾向 (日付順)
print("=== 6. 直近傾向 (日付順 トップ5) ===")
def parse_date(date_str):
    try:
        return datetime.strptime(date_str, "%Y/%m/%d")
    except ValueError:
        return datetime.strptime(date_str, "%Y/%m/%d")

sorted_rows = sorted(rows, key=lambda r: r['開催日'], reverse=True)
print(f"{'日付':<10} | {'券種':<8} | {'買い方':<15} | {'購入額':>7} | {'払戻':>8} | {'回収率(%)':>6}")
print("-" * 65)
for r in sorted_rows[:5]:
    cost = int(r['購入額'])
    ret = int(r['払戻'])
    roi = (ret / cost * 100) if cost > 0 else 0
    print(f"{r['開催日']:<10} | {r['券種']:<8} | {r['買い方']:<15} | {cost:7d} | {ret:8d} | {roi:6.1f}")
