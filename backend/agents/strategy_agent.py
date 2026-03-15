import math


class StrategyAgent:
    def __init__(self):
        pass

    def analyze_race_condition(self, scored):
        """レース展開の分析"""
        if not scored:
            return {}

        top_score = scored[0]["score"]
        second_score = scored[1]["score"] if len(scored) > 1 else top_score
        score_gap = (top_score - second_score) / top_score if top_score > 0 else 0

        top_odds = scored[0]["odds"]
        top_pop = scored[0]["popularity"]

        is_clear_favorite = score_gap > 0.15
        is_low_odds = top_odds < 3.0
        is_medium_field = len(scored) >= 10

        return {
            "isClearFavorite": is_clear_favorite,
            "isLowOdds": is_low_odds,
            "isMediumField": is_medium_field,
            "scoreGap": score_gap,
            "topOdds": top_odds,
            "topPop": top_pop,
        }

    def _candidate_patterns(self, user_profile, condition):
        patterns = []
        if user_profile:
            patterns.extend(user_profile.get("preferred_strategies", []))

        defaults = [
            {"bet_type": "3連複", "bet_method": "1頭軸"},
            {"bet_type": "馬連", "bet_method": "1頭軸"},
            {"bet_type": "3連複", "bet_method": "2頭軸"},
        ]
        if condition.get("isClearFavorite") and not condition.get("isLowOdds"):
            defaults.append({"bet_type": "馬単", "bet_method": "1頭軸"})
        elif condition.get("isLowOdds"):
            defaults.append({"bet_type": "ワイド", "bet_method": "BOX"})
        else:
            defaults.append({"bet_type": "3連単", "bet_method": "フォーメーション"})

        seen = set()
        deduped = []
        for pattern in patterns + defaults:
            key = (pattern["bet_type"], pattern["bet_method"])
            if key in seen:
                continue
            seen.add(key)
            deduped.append(pattern)
        return deduped

    def _select_primary_axis(self, scored):
        return scored[0]

    def _select_value_axis(self, scored):
        value_ranked = sorted(scored, key=lambda x: (x["value"], x["score"]), reverse=True)
        for horse in value_ranked:
            if horse["popularity"] <= 8:
                return horse
        return value_ranked[0]

    def _select_two_axes(self, scored):
        primary = scored[0]
        secondary = None
        for horse in scored[1:6]:
            if horse["popularity"] <= 6:
                secondary = horse
                break
        if secondary is None:
            secondary = scored[1] if len(scored) > 1 else primary
        return [primary, secondary]

    def _pick_aite(self, scored, excluded_numbers, count, emphasis="balance"):
        candidates = [h for h in scored if h["number"] not in excluded_numbers]
        if emphasis == "value":
            ordered = sorted(candidates, key=lambda x: (x["value"], x["score"]), reverse=True)
        elif emphasis == "stability":
            ordered = sorted(candidates, key=lambda x: (x["score"], -x["popularity"]), reverse=True)
        else:
            ordered = sorted(candidates, key=lambda x: (x["score"] * 0.6 + x["value"] * 0.4, -x["popularity"]), reverse=True)
        return ordered[:count]

    def _estimate_aite_count(self, bet_type, bet_method, user_profile):
        avg_points = (user_profile or {}).get("average_points", 0)
        if bet_type == "ワイド" and bet_method == "BOX":
            return 5 if avg_points >= 8 else 4
        if bet_type == "3連単":
            return 4 if avg_points <= 8 else 5
        if bet_type == "3連複" and bet_method == "1頭軸":
            return 6 if avg_points >= 12 else 5
        if bet_type == "3連複" and bet_method == "2頭軸":
            return 5 if avg_points >= 8 else 4
        return 5

    def _count_points(self, bet):
        bet_type = bet["type"]
        bet_method = bet["method"]
        aite_count = len(bet["aite"])
        jiku_count = len(bet["jiku"])

        if bet.get("isBOX"):
            return (aite_count * (aite_count - 1)) // 2
        if bet_type == "3連複" and bet_method == "1頭軸":
            return (aite_count * (aite_count - 1)) // 2
        if bet_type == "3連複" and bet_method == "2頭軸":
            return aite_count
        if bet_type == "3連単" and bet_method in {"1頭軸", "流し"}:
            return aite_count * max(aite_count - 1, 1)
        if bet_type == "3連単" and bet_method == "フォーメーション":
            return max(aite_count * max(jiku_count, 1), aite_count)
        if bet_type == "馬連" and bet_method == "フォーメーション":
            return max((jiku_count * aite_count) - max(jiku_count - 1, 0), aite_count)
        return max(aite_count, 1)

    def _build_bet(self, pattern, scored, condition, user_profile):
        bet_type = pattern["bet_type"]
        bet_method = pattern["bet_method"]
        aite_count = self._estimate_aite_count(bet_type, bet_method, user_profile)

        if bet_type == "3連複" and bet_method == "1頭軸":
            jiku = [self._select_primary_axis(scored)]
            aite = self._pick_aite(scored, {jiku[0]["number"]}, aite_count, "balance")
            reason = f"過去の主戦法に合わせて{jiku[0]['name']}を1頭軸。相手は総合力と妙味のバランス上位で固める。"
            icon = "🎯"
        elif bet_type == "3連複" and bet_method == "2頭軸":
            jiku = self._select_two_axes(scored)
            aite = self._pick_aite(scored, {h["number"] for h in jiku}, aite_count, "balance")
            reason = f"得意な2頭軸寄せ。{jiku[0]['name']}と{jiku[1]['name']}を軸に点数を絞って拾う。"
            icon = "🎰"
        elif bet_type == "馬連" and bet_method == "1頭軸":
            axis = self._select_value_axis(scored)
            jiku = [axis]
            aite = self._pick_aite(scored, {axis["number"]}, aite_count, "stability")
            reason = f"回収寄りの馬連パターン。妙味のある{axis['name']}を軸に、相手は安定上位へ流す。"
            icon = "🏇"
        elif bet_type == "馬連" and bet_method == "フォーメーション":
            jiku = self._select_two_axes(scored)
            aite = self._pick_aite(scored, {h["number"] for h in jiku}, aite_count, "stability")
            reason = f"フォーメーション実績を反映し、軸2頭から相手へ広げる。"
            icon = "🧩"
        elif bet_type == "馬単" and bet_method == "1頭軸":
            axis = self._select_primary_axis(scored) if condition.get("isClearFavorite") else self._select_value_axis(scored)
            jiku = [axis]
            aite = self._pick_aite(scored, {axis["number"]}, aite_count, "stability")
            reason = f"頭固定の実績に寄せて{axis['name']}を1着軸。配当を取りにいく馬単。"
            icon = "⚡"
        elif bet_type == "3連単" and bet_method in {"流し", "1頭軸"}:
            axis = self._select_primary_axis(scored)
            jiku = [axis]
            aite = self._pick_aite(scored, {axis["number"]}, aite_count, "value")
            reason = f"3連単流しの買い方を再現し、{axis['name']}から妙味側へ流す。"
            icon = "🚀"
        elif bet_type == "3連単" and bet_method == "フォーメーション":
            jiku = self._select_two_axes(scored)
            aite = self._pick_aite(scored, {h["number"] for h in jiku}, aite_count, "value")
            reason = f"フォーメーション志向を反映。上位軸に中穴候補を混ぜて3連単の跳ねを狙う。"
            icon = "🎇"
        elif bet_type == "ワイド" and bet_method == "BOX":
            jiku = []
            aite = self._pick_aite(scored, set(), aite_count, "value")
            reason = "低オッズ本命戦や荒れ待ちで使いやすいワイドBOX。妙味寄りの複数頭で押さえる。"
            icon = "🛡️"
        else:
            jiku = [self._select_primary_axis(scored)]
            aite = self._pick_aite(scored, {jiku[0]["number"]}, aite_count, "balance")
            reason = "過去データが薄いので、主軸パターンに寄せて組み立てる。"
            icon = "📌"

        return {
            "type": bet_type,
            "method": bet_method,
            "icon": icon,
            "reason": reason,
            "jiku": jiku,
            "aite": aite,
        }

    def build_strategic_bets(self, scored, condition, budget, user_profile=None):
        """過去プロファイルを踏まえて戦略を構築"""
        if not scored:
            return []

        candidates = self._candidate_patterns(user_profile, condition)
        bets = []
        used = set()
        for pattern in candidates:
            bet = self._build_bet(pattern, scored, condition, user_profile)
            key = (
                bet["type"],
                bet["method"],
                tuple(h["number"] for h in bet["jiku"]),
                tuple(h["number"] for h in bet["aite"]),
            )
            if key in used:
                continue
            used.add(key)
            bets.append(bet)
            if len(bets) == 3:
                break

        if not bets:
            return []

        weights = []
        preferred = (user_profile or {}).get("preferred_strategies", [])
        preference_map = {(item["bet_type"], item["bet_method"]): item for item in preferred}
        for bet in bets:
            profile_item = preference_map.get((bet["type"], bet["method"]))
            weight = 1.0
            if profile_item:
                weight += min(0.8, profile_item.get("score", 0) / 4.0)
            weights.append(weight)

        weight_sum = sum(weights) or 1.0
        final_bets = []
        running_total = 0
        for index, bet in enumerate(bets):
            pts = self._count_points(bet)
            raw_budget = budget * (weights[index] / weight_sum)
            per = max(100, math.floor(raw_budget / max(pts, 1) / 100) * 100)
            total = per * pts
            running_total += total
            final_bets.append({**bet, "points": pts, "perPoint": per, "total": total})

        while final_bets and running_total > budget:
            for bet in sorted(final_bets, key=lambda item: item["total"], reverse=True):
                if bet["perPoint"] <= 100:
                    continue
                bet["perPoint"] -= 100
                bet["total"] = bet["perPoint"] * bet["points"]
                running_total = sum(item["total"] for item in final_bets)
                if running_total <= budget:
                    break
            else:
                break

        return final_bets
