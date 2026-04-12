"""
bloodline_data.py

日本競馬の主要種牡馬（約65頭）の距離・馬場適性テーブル。
scoring_agent.py と horse_detail_scraper.py が参照する。

dist カテゴリ:
  sprint  = 1400m 未満
  mile    = 1400〜1699m
  middle  = 1700〜2199m
  long    = 2200m 以上

surface:
  turf  = 芝
  dirt  = ダート
  both  = どちらでも

base: 距離・馬場が完全一致した場合のボーナス係数（1.00 = 中立）
"""

# ────────────────────────────────────────────────
#  距離カテゴリ変換
# ────────────────────────────────────────────────

_DIST_CATEGORIES = [
    (0,    1400, "sprint"),
    (1400, 1700, "mile"),
    (1700, 2200, "middle"),
    (2200, 9999, "long"),
]

DIST_CAT_ORDER = ["sprint", "mile", "middle", "long"]


def get_dist_category(dist_m: int) -> str:
    """距離（メートル）をカテゴリ文字列に変換"""
    for lo, hi, cat in _DIST_CATEGORIES:
        if lo <= dist_m < hi:
            return cat
    return "middle"


def get_adjacent_dist_cats(cat: str) -> list:
    """隣接する距離カテゴリのリストを返す"""
    try:
        idx = DIST_CAT_ORDER.index(cat)
    except ValueError:
        return []
    result = []
    if idx > 0:
        result.append(DIST_CAT_ORDER[idx - 1])
    if idx < len(DIST_CAT_ORDER) - 1:
        result.append(DIST_CAT_ORDER[idx + 1])
    return result


# ────────────────────────────────────────────────
#  種牡馬適性テーブル
# ────────────────────────────────────────────────

SIRE_APTITUDE: dict[str, dict] = {
    # ─── ディープインパクト系 ───
    "ディープインパクト":   {"dist": "middle", "surface": "turf",  "base": 1.20},
    "キズナ":              {"dist": "middle", "surface": "turf",  "base": 1.15},
    "サトノダイヤモンド":  {"dist": "long",   "surface": "turf",  "base": 1.10},
    "ワグネリアン":        {"dist": "middle", "surface": "turf",  "base": 1.08},
    "レイデオロ":          {"dist": "middle", "surface": "turf",  "base": 1.08},
    "スワーヴリチャード":  {"dist": "middle", "surface": "turf",  "base": 1.10},
    "マカヒキ":            {"dist": "middle", "surface": "turf",  "base": 1.05},
    "アルアイン":          {"dist": "middle", "surface": "turf",  "base": 1.05},
    # ─── サンデーサイレンス系（直系） ───
    "ハーツクライ":        {"dist": "long",   "surface": "turf",  "base": 1.15},
    "ジャスタウェイ":      {"dist": "middle", "surface": "turf",  "base": 1.12},
    "スクリーンヒーロー":  {"dist": "middle", "surface": "turf",  "base": 1.08},
    "マンハッタンカフェ":  {"dist": "long",   "surface": "turf",  "base": 1.10},
    "ダイワメジャー":      {"dist": "mile",   "surface": "turf",  "base": 1.15},
    "フジキセキ":          {"dist": "mile",   "surface": "turf",  "base": 1.10},
    "ネオユニヴァース":    {"dist": "middle", "surface": "both",  "base": 1.08},
    "アドマイヤムーン":    {"dist": "middle", "surface": "turf",  "base": 1.08},
    "トーセンジョーダン":  {"dist": "middle", "surface": "turf",  "base": 1.07},
    # ─── ステイゴールド系 ───
    "ステイゴールド":      {"dist": "long",   "surface": "turf",  "base": 1.12},
    "オルフェーヴル":      {"dist": "middle", "surface": "turf",  "base": 1.15},
    "ゴールドシップ":      {"dist": "long",   "surface": "turf",  "base": 1.10},
    "ドリームジャーニー":  {"dist": "middle", "surface": "turf",  "base": 1.08},
    "ブラックタイド":      {"dist": "middle", "surface": "turf",  "base": 1.08},
    # ─── キングカメハメハ系 ───
    "キングカメハメハ":    {"dist": "middle", "surface": "both",  "base": 1.18},
    "ロードカナロア":      {"dist": "sprint", "surface": "turf",  "base": 1.20},
    "ドゥラメンテ":        {"dist": "middle", "surface": "turf",  "base": 1.18},
    "ルーラーシップ":      {"dist": "middle", "surface": "turf",  "base": 1.10},
    "リオンディーズ":      {"dist": "mile",   "surface": "turf",  "base": 1.08},
    "ラブリーデイ":        {"dist": "middle", "surface": "turf",  "base": 1.05},
    # ─── エピファネイア・モーリス系 ───
    "エピファネイア":      {"dist": "middle", "surface": "turf",  "base": 1.15},
    "モーリス":            {"dist": "mile",   "surface": "turf",  "base": 1.15},
    "シルバーステート":    {"dist": "middle", "surface": "turf",  "base": 1.08},
    # ─── キタサンブラック系 ───
    "キタサンブラック":    {"dist": "middle", "surface": "turf",  "base": 1.15},
    "イスラボニータ":      {"dist": "mile",   "surface": "turf",  "base": 1.08},
    # ─── ノーザンダンサー系 ───
    "ハービンジャー":      {"dist": "long",   "surface": "turf",  "base": 1.12},
    "ノヴェリスト":        {"dist": "long",   "surface": "turf",  "base": 1.08},
    "バゴ":                {"dist": "middle", "surface": "turf",  "base": 1.08},
    "シンボリクリスエス":  {"dist": "middle", "surface": "turf",  "base": 1.10},
    "グラスワンダー":      {"dist": "middle", "surface": "turf",  "base": 1.08},
    "タニノギムレット":    {"dist": "mile",   "surface": "turf",  "base": 1.08},
    "タイキシャトル":      {"dist": "mile",   "surface": "turf",  "base": 1.12},
    "エルコンドルパサー":  {"dist": "middle", "surface": "turf",  "base": 1.10},
    "サクラバクシンオー":  {"dist": "sprint", "surface": "turf",  "base": 1.12},
    "クロフネ":            {"dist": "mile",   "surface": "dirt",  "base": 1.15},
    "オペラハウス":        {"dist": "long",   "surface": "turf",  "base": 1.07},
    # ─── ダート系 ───
    "ゴールドアリュール":  {"dist": "middle", "surface": "dirt",  "base": 1.18},
    "サウスヴィグラス":    {"dist": "sprint", "surface": "dirt",  "base": 1.18},
    "ヘニーヒューズ":      {"dist": "sprint", "surface": "dirt",  "base": 1.15},
    "パイロ":              {"dist": "sprint", "surface": "dirt",  "base": 1.12},
    "シニスターミニスター": {"dist": "mile",  "surface": "dirt",  "base": 1.15},
    "スマートファルコン":  {"dist": "middle", "surface": "dirt",  "base": 1.10},
    "ドレフォン":          {"dist": "sprint", "surface": "dirt",  "base": 1.12},
    "マジェスティックウォリアー": {"dist": "mile", "surface": "dirt", "base": 1.12},
    "ハッピースプリント":  {"dist": "sprint", "surface": "dirt",  "base": 1.08},
    "アジアエクスプレス":  {"dist": "sprint", "surface": "dirt",  "base": 1.08},
    "カネヒキリ":          {"dist": "middle", "surface": "dirt",  "base": 1.10},
    "ノーザンリバー":      {"dist": "sprint", "surface": "dirt",  "base": 1.10},
    "タイムパラドックス":  {"dist": "middle", "surface": "dirt",  "base": 1.07},
    "コパノリッキー":      {"dist": "middle", "surface": "dirt",  "base": 1.08},
    "グレープブランデー":  {"dist": "middle", "surface": "dirt",  "base": 1.05},
    "ヴィクトワールピサ":  {"dist": "middle", "surface": "dirt",  "base": 1.10},
    "スパーキングボーイ":  {"dist": "sprint", "surface": "dirt",  "base": 1.07},
}


# ────────────────────────────────────────────────
#  血統ボーナス計算
# ────────────────────────────────────────────────

def _single_sire_bonus(name, surface: str, dist_category: str) -> float:
    """1頭の種牡馬名から適性係数を返す（1.00=中立）"""
    if not name:
        return 1.00
    apt = SIRE_APTITUDE.get(name)
    if not apt:
        return 1.00  # テーブルにない → 中立

    dist_match = apt["dist"] == dist_category
    surf_match = apt["surface"] == "both" or apt["surface"] == surface
    dist_adj = dist_category in get_adjacent_dist_cats(apt["dist"])

    if dist_match and surf_match:
        # 完全一致
        val = apt["base"]
    elif dist_match:
        # 距離一致・馬場不一致
        val = 0.60 * apt["base"] + 0.40
    elif dist_adj and surf_match:
        # 隣接距離・馬場一致
        val = 0.40 * apt["base"] + 0.60
    elif dist_adj:
        # 隣接距離・馬場不一致
        val = 0.20 * apt["base"] + 0.80
    else:
        # 完全不一致: 適性が高い馬ほどミスマッチで下がる
        val = max(0.88, 2.0 - apt["base"])

    return val


def get_bloodline_bonus(
    sire,
    dam_sire,
    surface: str,
    dist_category: str,
) -> float:
    """
    父（sire）と母父（dam_sire）の適性係数を合成して返す。
    父の影響 70%, 母父の影響 30%。
    返値範囲: 0.88 〜 1.20

    surface: "turf" or "dirt"
    dist_category: "sprint" / "mile" / "middle" / "long"
    """
    sire_val     = _single_sire_bonus(sire,     surface, dist_category)
    dam_sire_val = _single_sire_bonus(dam_sire, surface, dist_category)

    # 父70% + 母父30%
    combined = sire_val * 0.70 + dam_sire_val * 0.30
    return round(min(1.20, max(0.88, combined)), 3)
