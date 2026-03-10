import random
import math

class ScoringAgent:
    def __init__(self):
        pass

    def score_all_horses(self, horses_list, user_profile=None):
        """
        全頭スコアリング (V14ロジックをベースに移植)
        horses_list: list of dicts with {number, name, odds, popularity, ability}
        """
        strong_jiku_pops = [1, 2, 3, 4, 5]
        scored = []
        for h in horses_list:
            item = {
                "number": int(h["number"]),
                "name": h.get("name") or f"馬#{h['number']}",
                "odds": float(h.get("odds", 999)),
                "popularity": int(h.get("popularity", 99)),
                "ability": h.get("ability") or {"max": 0, "avg": 0, "last": 0}
            }

            # 1. 妙味 (Value)
            base = [0, 2.7, 4.8, 7.5, 11, 16, 24, 32, 48, 65]
            pop_idx = item["popularity"] if item["popularity"] < len(base) else 0
            exp = base[pop_idx] if pop_idx > 0 else item["popularity"] * 8
            item["value"] = item["odds"] / exp if exp > 0 else 0

            # 2. 実力 (タイム指数ベース)
            ability = item["ability"]
            av = max(ability.get("avg", 0), ability.get("max", 0) * 0.7, ability.get("last", 0) * 0.9)
            item["ability_score"] = math.pow(av / 92, 1.5) if av > 0 else 0.88

            # 3. 安定度
            item["stability"] = 15 / (item["popularity"] + 0.3)

            # 4. 1番人気が過剰な場合ペナルティ
            if item["popularity"] == 1 and item["odds"] < 2.5:
                item["stability"] *= 0.35

            # 5. User Match (DNA) ボーナス
            jiku_bonus = 1.3 if item["popularity"] in strong_jiku_pops else 1.0
            db_bonus = 1.0
            if user_profile and user_profile.get("strong_pops"):
                if item["popularity"] in user_profile["strong_pops"]:
                    db_bonus = 1.2
            
            item["jiku_bonus"] = jiku_bonus
            item["db_bonus"] = db_bonus

            # 6. 最終スコア
            r = 0.9 + random.random() * 0.2
            item["score"] = item["stability"] * item["value"] * item["ability_score"] * jiku_bonus * db_bonus * 2.0 * r

            scored.append(item)

        # スコア順にソート
        scored.sort(key=lambda x: x["score"], reverse=True)
        return scored
