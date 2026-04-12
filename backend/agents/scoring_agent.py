import math

try:
    from .bloodline_data import get_bloodline_bonus, get_adjacent_dist_cats, SIRE_APTITUDE
except ImportError:
    from bloodline_data import get_bloodline_bonus, get_adjacent_dist_cats, SIRE_APTITUDE

# 距離カテゴリの日本語表示マップ
DIST_CAT_JP = {
    "sprint": "短距離(<1400m)",
    "mile":   "マイル(1400-1699m)",
    "middle": "中距離(1700-2199m)",
    "long":   "長距離(2200m+)",
}
DIST_CAT_JP_SHORT = {
    "sprint": "短距離", "mile": "マイル", "middle": "中距離", "long": "長距離",
}


class ScoringAgent:
    def __init__(self):
        pass

    def score_all_horses(
        self,
        horses_list,
        user_profile=None,
        race_context=None,
        detail_map=None,
    ):
        """
        全頭スコアリング (V19: 競馬場・距離・血統適性 + CSV🅐🅑🅒 追加)
        horses_list: list of dicts with {number, name, odds, popularity, ability, recent_stats}
        race_context: {venue, surface, distance_m, dist_category}
        detail_map: {horse_num: {venue_stats, dist_stats, sire, dam_sire}}
        """
        rc  = race_context or {}
        today_venue    = rc.get("venue", "")
        today_surface  = rc.get("surface", "turf")
        today_dist_cat = rc.get("dist_category", "")
        dm  = detail_map or {}

        strong_jiku_pops = set(user_profile.get("strong_pops", [])) if user_profile else set()
        pop_weights = user_profile.get("pop_weights", {}) if user_profile else {}

        # ── 🅐 コース×距離的中マトリクス → exponent boost ──
        vd_key = f"{today_venue}_{today_dist_cat}" if today_venue and today_dist_cat else ""
        vd_entry = (user_profile or {}).get("venue_dist_matrix", {}).get(vd_key, {})
        vd_n = vd_entry.get("total", 0)
        if vd_n >= 2 and vd_entry.get("amount", 0) > 0:
            vd_roi = vd_entry["refund"] / vd_entry["amount"]
            course_exp_boost = min(0.3, math.log(vd_n + 1) * 0.05 * max(0.0, vd_roi - 0.8))
        else:
            course_exp_boost = 0.0

        scored = []

        for h in horses_list:
            raw_odds       = h.get("odds")
            raw_popularity = h.get("popularity")
            item = {
                "number":     int(h["number"]),
                "name":       h.get("name") or f"馬#{h['number']}",
                "odds":       float(raw_odds if raw_odds is not None else 999),
                "popularity": int(raw_popularity if raw_popularity is not None else 99),
                "ability":    h.get("ability") or {"max": 0, "avg": 0, "last": 0},
            }
            item["has_valid_odds"]       = raw_odds is not None and item["odds"] < 900
            item["has_valid_popularity"] = raw_popularity is not None and item["popularity"] < 90

            # ── 1. 妙味 (Value) ──
            base = [0, 2.7, 4.8, 7.5, 11, 16, 24, 32, 48, 65]
            pop_idx = item["popularity"] if item["popularity"] < len(base) else 0
            exp = base[pop_idx] if pop_idx > 0 else item["popularity"] * 8
            item["value"] = item["odds"] / exp if exp > 0 else 0
            item["expected_odds"] = exp

            # ── 2. 実力スコア (近走成績 or タイム指数) ──
            ability      = item["ability"]
            recent_stats = h.get("recent_stats") or {}
            positions    = recent_stats.get("positions", [])
            agari_times  = recent_stats.get("agari", [])

            item["recent_positions"] = positions
            item["avg_pos_raw"]  = round(sum(positions) / len(positions), 1) if positions else None
            item["top3_count"]   = sum(1 for p in positions if p <= 3) if positions else 0
            item["avg_agari_raw"] = round(sum(agari_times) / len(agari_times), 1) if agari_times else None

            if positions:
                avg_pos   = sum(positions) / len(positions)
                top3_rate = sum(1 for p in positions if p <= 3) / len(positions)

                consecutive_wins = 0
                for p in positions:
                    if p == 1:
                        consecutive_wins += 1
                    else:
                        break

                pos_score = max(0.35, 1.5 - (avg_pos - 1.0) * 0.125)
                pos_score += top3_rate * 0.18
                if consecutive_wins >= 2:
                    pos_score *= (1.0 + min(consecutive_wins, 4) * 0.08)
                if agari_times:
                    avg_agari = sum(agari_times) / len(agari_times)
                    agari_bonus = max(-0.08, min(0.12, (35.5 - avg_agari) * 0.04))
                    pos_score += agari_bonus

                item["ability_score"]  = min(2.0, max(0.35, pos_score))
                item["ability_source"] = "recent"
            else:
                raw_max  = ability.get("max", 0)
                raw_avg  = ability.get("avg", 0)
                raw_last = ability.get("last", 0)
                if raw_max > 0 or raw_avg > 0 or raw_last > 0:
                    av = raw_last * 0.5 + raw_avg * 0.3 + raw_max * 0.2
                    item["ability_score"]  = max(0.3, min(1.6, av / 75.0))
                    item["ability_source"] = "time_index"
                else:
                    item["ability_score"]  = 0.40
                    item["ability_source"] = "default"

            # ── 3. 妙味係数 ──
            if exp > 0 and item["has_valid_odds"]:
                value_capped = min(max(item["value"], 0.3), 2.5)
                item["value_factor"] = min(1.35, 0.75 + 0.24 * value_capped)
            else:
                item["value_factor"] = 0.90

            # ── V19 NEW: 競馬場・距離・血統 適性ボーナス ──
            detail      = dm.get(item["number"], {})
            venue_stats = detail.get("venue_stats", {})
            dist_stats  = detail.get("dist_stats", {})
            sire        = detail.get("sire")
            dam_sire    = detail.get("dam_sire")
            item["sire"]     = sire
            item["dam_sire"] = dam_sire

            # 競馬場適性ボーナス (0.80 〜 1.35)
            vs = venue_stats.get(today_venue, {}) if today_venue else {}
            if vs.get("total", 0) >= 2:
                wr = vs["win_rate"]
                tr = vs["top3_rate"]
                venue_bonus = min(1.35, max(0.80, 0.80 + wr * 1.30 + tr * 0.25))
            elif today_venue and venue_stats:
                # 他コースのデータはあるが今日のコースがない → 軽微ペナルティ
                venue_bonus = 0.95
            else:
                venue_bonus = 1.00  # データなし → 中立

            # 距離適性ボーナス (0.80 〜 1.30)
            # まず surface+cat のキーで精密検索、次に cat のみで検索
            surf_dist_key = f"{today_dist_cat}_{today_surface}" if today_dist_cat and today_surface else ""
            ds = dist_stats.get(surf_dist_key) or dist_stats.get(today_dist_cat, {}) if today_dist_cat else {}
            if ds.get("total", 0) >= 2:
                wr = ds["win_rate"]
                tr = ds["top3_rate"]
                distance_bonus = min(1.30, max(0.80, 0.80 + wr * 1.20 + tr * 0.20))
            elif today_dist_cat and dist_stats:
                # 隣接距離から参照
                adj = get_adjacent_dist_cats(today_dist_cat)
                adj_vals = [
                    dist_stats[c]["top3_rate"]
                    for c in adj
                    if c in dist_stats and dist_stats[c].get("total", 0) >= 2
                ]
                if adj_vals:
                    distance_bonus = min(1.10, max(0.90, 0.90 + (sum(adj_vals) / len(adj_vals)) * 0.15))
                else:
                    distance_bonus = 0.95
            else:
                distance_bonus = 1.00  # データなし → 中立

            # 血統適性ボーナス (0.88 〜 1.20)
            bloodline_bonus = get_bloodline_bonus(sire, dam_sire, today_surface, today_dist_cat)

            # 適性統合係数（加重平均: venue×40% + dist×40% + blood×20%）
            aptitude_factor = venue_bonus * 0.40 + distance_bonus * 0.40 + bloodline_bonus * 0.20
            
            # V19: 適性の差を明確に出すため上限を3.0へ開放
            enhanced_ability = min(3.0, max(0.10, item["ability_score"] * aptitude_factor))

            item["venue_bonus"]      = round(venue_bonus, 3)
            item["distance_bonus"]   = round(distance_bonus, 3)
            item["bloodline_bonus"]  = round(bloodline_bonus, 3)
            item["aptitude_factor"]  = round(aptitude_factor, 3)
            item["enhanced_ability"] = round(enhanced_ability, 3)

            # ── 4. User Match (DNA) ボーナス（V20案2: スコアは変えず、警告/推奨バッジのみ付与） ──
            # jiku_pops, vpm(venue_pop), horse_name(known) を使って分析
            warning_level = 0
            warning_text = ""
            match_level = 0
            match_text = ""

            # (1) 馬名の相性
            known = (user_profile or {}).get("known_horses", {}).get(item["name"].strip(), {})
            jiku_total = known.get("jiku_total", 0)
            jiku_hits  = known.get("jiku_hits", 0)
            aite_hits  = known.get("aite_hits", 0)

            if jiku_total >= 2:
                jiku_rate = jiku_hits / jiku_total
                if jiku_rate == 0.0:
                    warning_level = max(warning_level, 2)
                    warning_text += f"[軸馬不振: {jiku_total}戦0勝]"
                elif jiku_rate >= 0.5:
                    match_level = max(match_level, 2)
                    match_text += f"[相性抜群: {jiku_total}戦{jiku_hits}勝]"
            elif jiku_total == 1 and jiku_hits == 1:
                match_level = max(match_level, 1)

            # (2) コース×人気帯の相性
            pop_band = "1-3" if item["popularity"] <= 3 else "4-6" if item["popularity"] <= 6 else "7+"
            vpm = (user_profile or {}).get("venue_pop_matrix", {}).get(pop_band, {})
            vpm_n = vpm.get("total", 0)
            if vpm_n >= 2:
                hit_rate = vpm["hits"] / vpm_n
                if hit_rate <= 0.10:
                    warning_level = max(warning_level, 1)
                    warning_text += f"[{today_venue}×{pop_band}人気勝率{int(hit_rate*100)}%]"
                elif hit_rate >= 0.50:
                    match_level = max(match_level, 1)
                    match_text += f"[{today_venue}×{pop_band}人気得意]"

            # スコアへの掛け算は行わない（1.0で固定し純粋なデータドリブンを維持）
            item["jiku_bonus"] = 1.0
            item["db_bonus"]   = 1.0
            item["horse_name_bonus"] = 1.0
            item["venue_pop_bonus"]  = 1.0
            
            item["dna_warning_level"] = warning_level
            item["dna_warning_text"] = warning_text
            item["dna_match_level"] = match_level
            item["dna_match_text"] = match_text

            # ── 5. 最終スコア (V19/20) ──
            exponent      = 2.0 + course_exp_boost
            ability_power = math.pow(max(item["enhanced_ability"], 0.10), exponent)
            item["score"] = (
                ability_power
                * item["value_factor"]
                * 4.5
            )

            # ── 6. 穴馬スコア（enhanced_ability を使用） ──
            pop              = item["popularity"]
            has_market_data  = item["has_valid_odds"] and item["has_valid_popularity"]
            min_odds, min_value, min_ability = 20.0, 0.50, 0.68

            if 5 <= pop <= 6:
                min_odds, min_value = 8.0, 0.60
            elif 7 <= pop <= 9:
                min_odds, min_value = 12.0, 0.55
            elif 10 <= pop <= 12:
                min_odds, min_value = 18.0, 0.55
            elif 13 <= pop <= 15:
                min_odds, min_value, min_ability = 25.0, 0.62, 0.78
            elif pop >= 16:
                min_odds, min_value, min_ability = 40.0, 0.70, 0.90

            eff_ability = item["enhanced_ability"]
            is_upset_candidate = (
                has_market_data
                and pop >= 5
                and item["odds"] >= min_odds
                and item["value"] >= min_value
                and eff_ability >= min_ability
            )
            if is_upset_candidate:
                value_factor      = min(item["value"], 1.55)
                odds_factor       = min(math.log(item["odds"] + 1) / 5.0, 0.95)
                popularity_factor = (
                    1.12 if pop <= 6 else
                    1.18 if pop <= 9 else
                    1.05 if pop <= 12 else
                    0.90 if pop <= 15 else 0.74
                )
                ability_factor = 0.85 + eff_ability * 0.65
                score_factor   = 0.82 + min(item["score"], 4.0) * 0.07
                item["upset_score"] = (
                    (value_factor * 0.45 + odds_factor * 0.30 + eff_ability * 0.25)
                    * popularity_factor * ability_factor * score_factor
                )
            else:
                item["upset_score"] = 0.0

            # ── 7. score_breakdown ──
            breakdown = {}

            # 妙味
            if exp > 0:
                if item["value"] > 1.3:
                    breakdown["value"] = f"オッズ {item['odds']}倍 ÷ {item['popularity']}人気の期待値 {exp}倍 = {item['value']:.2f}（お得水準）"
                elif item["value"] > 1.0:
                    breakdown["value"] = f"オッズ {item['odds']}倍 ÷ 期待値 {exp}倍 = {item['value']:.2f}（ほぼ適正）"
                else:
                    breakdown["value"] = f"オッズ {item['odds']}倍 ÷ 期待値 {exp}倍 = {item['value']:.2f}（割高水準）"
            else:
                breakdown["value"] = "オッズデータなし"

            # 実力
            if item["ability_source"] == "recent" and positions:
                avg_p = sum(positions) / len(positions)
                top3  = sum(1 for p in positions if p <= 3)
                agari_str = f"・平均上がり {sum(agari_times)/len(agari_times):.1f}秒" if agari_times else ""
                breakdown["ability"] = (
                    f"近{len(positions)}走の平均着順 {avg_p:.1f}位（3着内 {top3}回）{agari_str}"
                    f" → 実力スコア {item['ability_score']:.2f}"
                )
            elif item["ability_source"] == "time_index":
                raw = item["ability"]
                breakdown["ability"] = (
                    f"タイム指数：最大 {raw.get('max',0)} / 平均 {raw.get('avg',0)} / 直近 {raw.get('last',0)}"
                    f" → 実力スコア {item['ability_score']:.2f}"
                )
            else:
                breakdown["ability"] = "近走・タイム指数ともにデータなし（未出走または取得失敗）"

            # 妙味係数
            vf = item.get("value_factor", 1.0)
            if vf >= 1.20:
                breakdown["stability"] = f"妙味係数 {vf:.2f}（オッズ割安 → スコア上乗せ）"
            elif vf >= 1.00:
                breakdown["stability"] = f"妙味係数 {vf:.2f}（オッズほぼ適正）"
            else:
                breakdown["stability"] = f"妙味係数 {vf:.2f}（オッズ割高 → スコア減点）"

            # DNA（コース×人気帯ボーナス込み）
            if not user_profile:
                breakdown["dna"] = "履歴データなし（simulation画面からCSVをインポートすると有効化）"
            elif jiku_bonus > 1.0 and venue_pop_bonus > 1.05:
                breakdown["dna"] = (
                    f"🔥 {item['popularity']}人気は過去の軸馬として的中実績あり"
                    f"＋{today_venue or ''}での回収率も高い（+{(jiku_bonus*venue_pop_bonus-1)*100:.0f}%ボーナス）"
                )
            elif jiku_bonus > 1.0:
                breakdown["dna"] = f"🔥 {item['popularity']}人気は過去の軸馬として的中実績あり（+{(jiku_bonus-1)*100:.0f}%ボーナス）"
            elif venue_pop_bonus > 1.05:
                breakdown["dna"] = f"📈 {today_venue or ''}での{pop_band}人気帯の回収率が高い傾向（×{venue_pop_bonus:.2f}ボーナス）"
            elif venue_pop_bonus < 0.95:
                breakdown["dna"] = f"📉 {today_venue or ''}での{pop_band}人気帯の回収率が低い傾向（×{venue_pop_bonus:.2f}ペナルティ）"
            else:
                breakdown["dna"] = "通常評価（この人気帯の的中・回収データは平均的）"

            # 🏟️ 競馬場適性
            if today_venue:
                ve = venue_stats.get(today_venue, {})
                if ve.get("total", 0) >= 2:
                    grade = "◎" if venue_bonus >= 1.15 else "○" if venue_bonus >= 1.05 else "△" if venue_bonus >= 0.95 else "✗"
                    breakdown["venue_fit"] = (
                        f"{today_venue}{ve['total']}戦{ve['wins']}勝"
                        f"（勝率{ve['win_rate']*100:.0f}% / 3着内率{ve['top3_rate']*100:.0f}%）"
                        f" → 競馬場適性{grade}（×{venue_bonus:.2f}）"
                    )
                elif venue_stats:
                    breakdown["venue_fit"] = f"{today_venue}での成績データなし（中立）"
                else:
                    breakdown["venue_fit"] = "競馬場成績データ取得失敗"
            else:
                breakdown["venue_fit"] = "競馬場情報未取得"

            # 🏁 距離適性
            cat_jp = DIST_CAT_JP.get(today_dist_cat, today_dist_cat)
            if today_dist_cat:
                de = dist_stats.get(f"{today_dist_cat}_{today_surface}") or dist_stats.get(today_dist_cat, {})
                if de.get("total", 0) >= 2:
                    grade = "◎" if distance_bonus >= 1.15 else "○" if distance_bonus >= 1.05 else "△" if distance_bonus >= 0.95 else "✗"
                    breakdown["distance_fit"] = (
                        f"{cat_jp}: {de['total']}戦{de['wins']}勝"
                        f"（勝率{de['win_rate']*100:.0f}% / 3着内率{de['top3_rate']*100:.0f}%）"
                        f" → 距離適性{grade}（×{distance_bonus:.2f}）"
                    )
                elif dist_stats:
                    breakdown["distance_fit"] = f"{cat_jp}でのデータ少（隣接距離から推定：×{distance_bonus:.2f}）"
                else:
                    breakdown["distance_fit"] = "距離成績データ取得失敗"
            else:
                breakdown["distance_fit"] = "距離情報未取得"

            # 🧬 血統
            sire_disp   = sire or "不明"
            surf_jp     = "芝" if today_surface == "turf" else "ダート"
            cat_jp_s    = DIST_CAT_JP_SHORT.get(today_dist_cat, "")
            in_table    = sire in SIRE_APTITUDE if sire else False
            if bloodline_bonus >= 1.10:
                breakdown["bloodline"] = f"父{sire_disp} × {surf_jp}{cat_jp_s} → 血統適性◎（×{bloodline_bonus:.2f}）"
            elif bloodline_bonus >= 1.04:
                breakdown["bloodline"] = f"父{sire_disp} × {surf_jp}{cat_jp_s} → 血統適性○（×{bloodline_bonus:.2f}）"
            elif bloodline_bonus <= 0.93:
                breakdown["bloodline"] = f"父{sire_disp} × {surf_jp}{cat_jp_s} → 血統適性✗（×{bloodline_bonus:.2f}）"
            else:
                note = "" if in_table else "（主要テーブルにない種牡馬）"
                breakdown["bloodline"] = f"父{sire_disp}{note}（血統影響：中立）"

            # 🅑 ユーザーDNA（警告・相性）
            dna_msg = ""
            if warning_level >= 2:
                dna_msg = f"⚠️ 危険パターン: {warning_text}"
            elif warning_level >= 1:
                dna_msg = f"⚠️ 苦手注意: {warning_text}"
            elif match_level >= 2:
                dna_msg = f"⭐ 激アツ条件: {match_text}"
            elif match_level >= 1:
                dna_msg = f"⭐ 得意条件: {match_text}"
                
            breakdown["name_match"] = dna_msg

            item["score_breakdown"] = breakdown
            scored.append(item)

        # スコア順にソート
        scored.sort(key=lambda x: x["score"], reverse=True)
        return scored
