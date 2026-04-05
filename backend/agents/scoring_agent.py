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
            raw_odds = h.get("odds")
            raw_popularity = h.get("popularity")
            item = {
                "number": int(h["number"]),
                "name": h.get("name") or f"馬#{h['number']}",
                "odds": float(raw_odds if raw_odds is not None else 999),
                "popularity": int(raw_popularity if raw_popularity is not None else 99),
                "ability": h.get("ability") or {"max": 0, "avg": 0, "last": 0}
            }
            item["has_valid_odds"] = raw_odds is not None and item["odds"] < 900
            item["has_valid_popularity"] = raw_popularity is not None and item["popularity"] < 90

            # 1. 妙味 (Value): オッズ ÷ 人気別期待オッズ
            base = [0, 2.7, 4.8, 7.5, 11, 16, 24, 32, 48, 65]
            pop_idx = item["popularity"] if item["popularity"] < len(base) else 0
            exp = base[pop_idx] if pop_idx > 0 else item["popularity"] * 8
            item["value"] = item["odds"] / exp if exp > 0 else 0

            # 2. 実力スコア (V18: 着順差を大幅拡大、人気依存を完全排除)
            ability = item["ability"]
            recent_stats = h.get("recent_stats") or {}
            positions = recent_stats.get("positions", [])
            agari_times = recent_stats.get("agari", [])

            # --- 近走生データを保存（ai_comment生成用） ---
            item["recent_positions"] = positions
            item["avg_pos_raw"] = round(sum(positions) / len(positions), 1) if positions else None
            item["top3_count"] = sum(1 for p in positions if p <= 3) if positions else 0
            item["avg_agari_raw"] = round(sum(agari_times) / len(agari_times), 1) if agari_times else None

            if positions:
                avg_pos = sum(positions) / len(positions)
                top3_rate = sum(1 for p in positions if p <= 3) / len(positions)

                # 連勝チェック（最新から連続して1着か）
                consecutive_wins = 0
                for p in positions:
                    if p == 1:
                        consecutive_wins += 1
                    else:
                        break

                # 着順→スコア変換（差が大きく出る設計）
                # avg1着=1.50 / avg3着=1.25 / avg5着=1.00 / avg8着=0.63 / avg12着以下=0.35
                pos_score = max(0.35, 1.5 - (avg_pos - 1.0) * 0.125)
                pos_score += top3_rate * 0.18  # 3着以内率ボーナス

                # 連勝ボーナス（直近2連勝+8%, 3連勝+16%, 4連勝+24%）
                if consecutive_wins >= 2:
                    pos_score *= (1.0 + min(consecutive_wins, 4) * 0.08)

                # 上がり3Fボーナス（35.5秒基準、速いほど加点）
                if agari_times:
                    avg_agari = sum(agari_times) / len(agari_times)
                    agari_bonus = max(-0.08, min(0.12, (35.5 - avg_agari) * 0.04))
                    pos_score += agari_bonus

                item["ability_score"] = min(2.0, max(0.35, pos_score))
                item["ability_source"] = "recent"
            else:
                raw_max = ability.get("max", 0)
                raw_avg = ability.get("avg", 0)
                raw_last = ability.get("last", 0)
                if raw_max > 0 or raw_avg > 0 or raw_last > 0:
                    av = raw_last * 0.5 + raw_avg * 0.3 + raw_max * 0.2
                    # タイム指数75点=1.0基準でスケーリング
                    item["ability_score"] = max(0.3, min(1.6, av / 75.0))
                    item["ability_source"] = "time_index"
                else:
                    # 近走・タイム指数ともに取得失敗 → 大幅ペナルティ（旧0.75→新0.40）
                    item["ability_score"] = 0.40
                    item["ability_source"] = "default"

            # expected_odds（妙味計算に使った期待オッズ）も保存
            item["expected_odds"] = exp

            # 3. 妙味係数 (V18: stability廃止 → 人気依存ゼロ。妙味は0.75〜1.35の補正係数のみ)
            if exp > 0 and item["has_valid_odds"]:
                value_capped = min(max(item["value"], 0.3), 2.5)
                item["value_factor"] = min(1.35, 0.75 + 0.24 * value_capped)
            else:
                item["value_factor"] = 0.90  # オッズ未確定時

            # 4. User Match (DNA) ボーナス
            jiku_bonus = 1.22 if item["popularity"] in strong_jiku_pops else 1.0
            pop_weight = float(pop_weights.get(str(item["popularity"]), 1.0))
            if 4 <= item["popularity"] <= 6 and not pop_weights:
                pop_weight = 1.08
            if item["popularity"] == 1 and item["odds"] < 2.0:
                pop_weight *= 0.82
            db_bonus = pop_weight

            item["jiku_bonus"] = jiku_bonus
            item["db_bonus"] = db_bonus

            # 5. 最終スコア (V18: stability廃止、ability^2.0を主軸)
            # データなし(0.40^2=0.16) vs 連勝3回(1.86^2=3.46) → 22倍の差
            # 人気1位でもデータなしなら中位以下に落ちる設計
            ability_power = math.pow(max(item["ability_score"], 0.1), 2.0)
            item["score"] = (
                ability_power
                * item["value_factor"]
                * jiku_bonus
                * db_bonus
                * 4.5
            )

            # 7. 穴馬スコア (V16改: 中穴〜大穴を正しく捕捉)
            # 旧: ability_score >= 0.85 は「着順データなし → 0.75固定」で中人気馬が除外されるバグあり
            # 新: 実力閾値を緩和し、オッズと妙味で穴度を判定
            pop = item["popularity"]
            has_market_data = item["has_valid_odds"] and item["has_valid_popularity"]
            min_odds = 20.0
            min_value = 0.50
            min_ability = 0.68
            if 5 <= pop <= 6:
                min_odds = 8.0
                min_value = 0.60
            elif 7 <= pop <= 9:
                min_odds = 12.0
                min_value = 0.55
            elif 10 <= pop <= 12:
                min_odds = 18.0
                min_value = 0.55
            elif 13 <= pop <= 15:
                min_odds = 25.0
                min_value = 0.62
                min_ability = 0.78
            elif pop >= 16:
                min_odds = 40.0
                min_value = 0.70
                min_ability = 0.90

            is_upset_candidate = (
                has_market_data
                and pop >= 5                   # 5人気以下（中穴〜大穴）
                and item["odds"] >= min_odds
                and item["value"] >= min_value
                and item["ability_score"] >= min_ability
            )
            if is_upset_candidate:
                # 中穴帯を主役にしつつ、超人気薄は実力がないと上がりにくくする
                value_factor = min(item["value"], 1.55)
                odds_factor = min(math.log(item["odds"] + 1) / 5.0, 0.95)
                if pop <= 6:
                    popularity_factor = 1.12
                elif pop <= 9:
                    popularity_factor = 1.18
                elif pop <= 12:
                    popularity_factor = 1.05
                elif pop <= 15:
                    popularity_factor = 0.90
                else:
                    popularity_factor = 0.74
                ability_factor = 0.85 + item["ability_score"] * 0.65
                score_factor = 0.82 + min(item["score"], 4.0) * 0.07
                item["upset_score"] = (
                    (value_factor * 0.45 + odds_factor * 0.30 + item["ability_score"] * 0.25)
                    * popularity_factor
                    * ability_factor
                    * score_factor
                )
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

            # 妙味係数の根拠（V18: stability廃止、人気依存ゼロ）
            vf = item.get("value_factor", 1.0)
            if vf >= 1.20:
                breakdown["stability"] = f"妙味係数 {vf:.2f}（オッズ割安 → スコア上乗せ）"
            elif vf >= 1.00:
                breakdown["stability"] = f"妙味係数 {vf:.2f}（オッズほぼ適正）"
            else:
                breakdown["stability"] = f"妙味係数 {vf:.2f}（オッズ割高 → スコア減点）"

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
