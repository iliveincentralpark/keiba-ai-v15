import math


class ScoringAgent:
    def __init__(self):
        pass

    def score_all_horses(self, horses_list, user_profile=None):
        """
        全頭スコアリング (V16: 実力スコア強化 + 穴馬スコア追加)
        horses_list: list of dicts with {number, name, odds, popularity, ability}
        """
        strong_jiku_pops = set(user_profile.get("strong_pops", [])) if user_profile else set()
        pop_weights = user_profile.get("pop_weights", {}) if user_profile else {}
        scored = []

        for h in horses_list:
            item = {
                "number": int(h["number"]),
                "name": h.get("name") or f"馬#{h['number']}",
                "odds": float(h.get("odds", 999)),
                "popularity": int(h.get("popularity", 99)),
                "ability": h.get("ability") or {"max": 0, "avg": 0, "last": 0}
            }

            # 1. 妙味 (Value): オッズ ÷ 人気別期待オッズ
            base = [0, 2.7, 4.8, 7.5, 11, 16, 24, 32, 48, 65]
            pop_idx = item["popularity"] if item["popularity"] < len(base) else 0
            exp = base[pop_idx] if pop_idx > 0 else item["popularity"] * 8
            item["value"] = item["odds"] / exp if exp > 0 else 0

            # 2. 実力 (V16: 近走成績 → タイム指数 → デフォルトの順でフォールバック)
            ability = item["ability"]
            recent_stats = h.get("recent_stats") or {}
            positions = recent_stats.get("positions", [])
            agari_times = recent_stats.get("agari", [])

            if positions:
                # 近走着順からスコア算出（直近5走の平均着順ベース）
                avg_pos = sum(positions) / len(positions)
                top3_rate = sum(1 for p in positions if p <= 3) / len(positions)
                # pos_score: 1着=100, 1位下がるごとに約-3.5, top3率ボーナス+8
                pos_score = max(60.0, 100.0 - (avg_pos - 1.0) * 3.5 + top3_rate * 8.0)
                # 上がり3Fボーナス: 33秒台=速い(+4), 37秒台=遅い(-4)
                agari_bonus = 0.0
                if agari_times:
                    avg_agari = sum(agari_times) / len(agari_times)
                    agari_bonus = max(-4.0, min(4.0, (35.5 - avg_agari) * 1.5))
                av = pos_score + agari_bonus
                item["ability_score"] = math.pow(max(av, 1) / 92.0, 1.6)
                item["ability_source"] = "recent"  # 近走成績ベース
            else:
                raw_max = ability.get("max", 0)
                raw_avg = ability.get("avg", 0)
                raw_last = ability.get("last", 0)
                if raw_max > 0 or raw_avg > 0 or raw_last > 0:
                    # タイム指数フォールバック（直近重視）
                    av = raw_last * 0.5 + raw_avg * 0.3 + raw_max * 0.2
                    item["ability_score"] = math.pow(max(av, 1) / 92.0, 1.6)
                    item["ability_source"] = "time_index"
                else:
                    # 実力データなし（未出走・データ取得失敗）
                    item["ability_score"] = 0.75
                    item["ability_source"] = "default"


            # 3. 安定度 (V16: 人気依存を緩和、実力指数がある馬を補正)
            # 基本は人気に反比例しつつ、ability_scoreが高い馬には追加ボーナス
            base_stability = 12 / (item["popularity"] + 0.5)
            ability_bonus = 1.0 + max(0.0, item["ability_score"] - 0.8) * 0.5
            item["stability"] = base_stability * ability_bonus

            # 4. 1番人気が過剰オッズの場合ペナルティ（単勝2.5倍未満）
            if item["popularity"] == 1 and item["odds"] < 2.5:
                item["stability"] *= 0.35

            # 5. User Match (DNA) ボーナス
            jiku_bonus = 1.22 if item["popularity"] in strong_jiku_pops else 1.0
            pop_weight = float(pop_weights.get(str(item["popularity"]), 1.0))
            if 4 <= item["popularity"] <= 6 and not pop_weights:
                pop_weight = 1.08
            if item["popularity"] == 1 and item["odds"] < 2.0:
                pop_weight *= 0.82
            db_bonus = pop_weight

            item["jiku_bonus"] = jiku_bonus
            item["db_bonus"] = db_bonus

            # 6. 最終スコア
            item["score"] = (
                item["stability"]
                * item["value"]
                * item["ability_score"]
                * jiku_bonus
                * db_bonus
                * 2.0
            )

            # 7. 穴馬スコア (V16追加)
            is_upset_candidate = (
                item["popularity"] >= 6
                and (item["value"] >= 0.9 or item["odds"] >= 20.0)
                and item["ability_score"] >= 0.85
            )
            if is_upset_candidate:
                odds_factor = math.log(item["odds"] + 1) / 4.0
                item["upset_score"] = (item["value"] + odds_factor) * math.log(item["popularity"] + 1) * 0.4
            else:
                item["upset_score"] = 0.0

            # 8. スコア内訳（フロント表示用の根拠テキスト）
            breakdown = {}

            # 妙味の根拠
            if exp > 0:
                if item["value"] > 1.3:
                    breakdown["value"] = f"オッズ {item['odds']}倍 ÷ {item['popularity']}人気の期待値 {exp}倍 = {item['value']:.2f}（お得水準）"
                elif item["value"] > 1.0:
                    breakdown["value"] = f"オッズ {item['odds']}倍 ÷ 期待値 {exp}倍 = {item['value']:.2f}（ほぼ適正）"
                else:
                    breakdown["value"] = f"オッズ {item['odds']}倍 ÷ 期待値 {exp}倍 = {item['value']:.2f}（割高水準）"
            else:
                breakdown["value"] = "オッズデータなし"

            # 実力の根拠
            if item["ability_source"] == "recent" and positions:
                avg_p = sum(positions) / len(positions)
                top3 = sum(1 for p in positions if p <= 3)
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

            # 安定度の根拠
            if item["popularity"] == 1 and item["odds"] < 2.5:
                breakdown["stability"] = f"{item['popularity']}番人気だが単勝{item['odds']}倍の過剰人気のためペナルティ適用"
            else:
                breakdown["stability"] = f"{item['popularity']}番人気ベースの安定指数（人気が低いほど下がる基礎指標）"

            # DNA（ユーザープロファイル）の根拠
            if not user_profile:
                breakdown["dna"] = "履歴データなし（simulation画面からCSVをインポートすると有効化）"
            elif jiku_bonus > 1.0 and db_bonus > 1.05:
                breakdown["dna"] = f"🔥 {item['popularity']}人気は過去の軸馬として的中実績あり＋人気帯の回収率も高い（+{(jiku_bonus*db_bonus-1)*100:.0f}%ボーナス）"
            elif jiku_bonus > 1.0:
                breakdown["dna"] = f"🔥 {item['popularity']}人気は過去の軸馬として的中実績あり（+{(jiku_bonus-1)*100:.0f}%ボーナス）"
            elif db_bonus > 1.05:
                breakdown["dna"] = f"📈 {item['popularity']}人気帯での回収率が高い傾向（×{db_bonus:.2f}倍ボーナス）"
            elif db_bonus < 0.95:
                breakdown["dna"] = f"📉 {item['popularity']}人気帯での回収率が低い傾向（×{db_bonus:.2f}倍ペナルティ）"
            else:
                breakdown["dna"] = "通常評価（この人気帯の的中・回収データは平均的）"

            item["score_breakdown"] = breakdown

            scored.append(item)

        # スコア順にソート
        scored.sort(key=lambda x: x["score"], reverse=True)
        return scored

