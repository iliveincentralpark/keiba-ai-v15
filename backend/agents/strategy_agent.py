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

        # 穴馬候補がいるかどうかの判定 (V16)
        has_upset_candidate = any(h.get("upset_score", 0) > 1.0 for h in scored)

        return {
            "isClearFavorite": is_clear_favorite,
            "isLowOdds": is_low_odds,
            "isMediumField": is_medium_field,
            "hasUpsetCandidate": has_upset_candidate,
            "scoreGap": score_gap,
            "topOdds": top_odds,
            "topPop": top_pop,
        }

    def _candidate_patterns(self, user_profile, condition):
        """
        V16: 4券種をデフォルトで候補に追加し、おすすめ順（priority）を設定。
        レース条件に応じて優先順位を変動させる。
        """
        # ベースパターン（常に存在する4種）
        base_patterns = [
            {"bet_type": "3連複", "bet_method": "1頭軸",     "priority": 1, "priority_label": "◎推奨"},
            {"bet_type": "馬連",  "bet_method": "1頭軸",     "priority": 2, "priority_label": "○安定"},
            {"bet_type": "ワイド","bet_method": "BOX",        "priority": 3, "priority_label": "△妙味"},
            {"bet_type": "3連単", "bet_method": "フォーメーション", "priority": 4, "priority_label": "☆配当"},
        ]

        # レース条件による優先順位変動
        if condition.get("isClearFavorite") and not condition.get("isLowOdds"):
            # 本命突出型：馬単・3連単を上位に
            base_patterns = [
                {"bet_type": "馬単",  "bet_method": "1頭軸",         "priority": 1, "priority_label": "◎推奨"},
                {"bet_type": "3連単", "bet_method": "フォーメーション","priority": 2, "priority_label": "○配当"},
                {"bet_type": "3連複", "bet_method": "1頭軸",          "priority": 3, "priority_label": "△安定"},
                {"bet_type": "馬連",  "bet_method": "1頭軸",          "priority": 4, "priority_label": "☆押さえ"},
            ]
        elif condition.get("isLowOdds"):
            # 低オッズ本命型：ワイド・3連複2頭軸を上位に
            base_patterns = [
                {"bet_type": "ワイド","bet_method": "BOX",       "priority": 1, "priority_label": "◎推奨"},
                {"bet_type": "3連複", "bet_method": "2頭軸",     "priority": 2, "priority_label": "○安定"},
                {"bet_type": "馬連",  "bet_method": "1頭軸",     "priority": 3, "priority_label": "△押さえ"},
                {"bet_type": "3連複", "bet_method": "1頭軸",     "priority": 4, "priority_label": "☆妙味"},
            ]
        elif condition.get("hasUpsetCandidate"):
            # 穴馬候補あり：ワイド・3連複を上位に
            base_patterns = [
                {"bet_type": "3連複", "bet_method": "1頭軸",          "priority": 1, "priority_label": "◎推奨"},
                {"bet_type": "ワイド","bet_method": "BOX",             "priority": 2, "priority_label": "○穴狙い"},
                {"bet_type": "3連単", "bet_method": "フォーメーション","priority": 3, "priority_label": "△配当"},
                {"bet_type": "馬連",  "bet_method": "1頭軸",           "priority": 4, "priority_label": "☆安定"},
            ]

        # ユーザー過去プロファイルによる優先順位補正
        preferred = []
        if user_profile:
            preferred = user_profile.get("preferred_strategies", [])

        patterns = []
        seen = set()

        # まずユーザー好みのパターンを先に入れる
        for pref in preferred:
            key = (pref["bet_type"], pref["bet_method"])
            if key not in seen:
                seen.add(key)
                # 対応するベースパターンのlabelを探す
                label = next(
                    (p["priority_label"] for p in base_patterns
                     if p["bet_type"] == pref["bet_type"] and p["bet_method"] == pref["bet_method"]),
                    "◎推奨"
                )
                patterns.append({
                    "bet_type": pref["bet_type"],
                    "bet_method": pref["bet_method"],
                    "priority": 0,  # ユーザー優先
                    "priority_label": label,
                })

        for p in base_patterns:
            key = (p["bet_type"], p["bet_method"])
            if key not in seen:
                seen.add(key)
                patterns.append(p)

        return patterns

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

    def _select_upset_horse(self, scored, excluded_numbers):
        """
        V16追加: 穴馬候補（upset_score上位）を選出
        """
        candidates = [
            h for h in scored
            if h["number"] not in excluded_numbers and h.get("upset_score", 0) > 0
        ]
        if not candidates:
            return None
        return max(candidates, key=lambda x: x["upset_score"])

    def _pick_aite(self, scored, excluded_numbers, count, emphasis="balance"):
        candidates = [h for h in scored if h["number"] not in excluded_numbers]
        if emphasis == "value":
            ordered = sorted(candidates, key=lambda x: (x["value"], x["score"]), reverse=True)
        elif emphasis == "stability":
            ordered = sorted(candidates, key=lambda x: (x["score"], -x["popularity"]), reverse=True)
        elif emphasis == "upset":
            # 穴馬重視：upset_scoreが高い馬を先に、次に通常スコア順
            ordered = sorted(
                candidates,
                key=lambda x: (x.get("upset_score", 0) * 0.5 + x["value"] * 0.5, x["score"]),
                reverse=True
            )
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
        priority = pattern.get("priority", 1)
        priority_label = pattern.get("priority_label", "◎推奨")
        aite_count = self._estimate_aite_count(bet_type, bet_method, user_profile)

        if bet_type == "3連複" and bet_method == "1頭軸":
            jiku = [self._select_primary_axis(scored)]
            aite = self._pick_aite(scored, {jiku[0]["number"]}, aite_count, "balance")
            reason = f"総合スコア上位の{jiku[0]['name']}を1頭軸に固定。相手は実力・妙味バランスで選定。"
            icon = "🎯"
        elif bet_type == "3連複" and bet_method == "2頭軸":
            jiku = self._select_two_axes(scored)
            aite = self._pick_aite(scored, {h["number"] for h in jiku}, aite_count, "balance")
            reason = f"{jiku[0]['name']}と{jiku[1]['name']}を2頭軸に。点数を絞りながら3連複を狙う。"
            icon = "🎰"
        elif bet_type == "馬連" and bet_method == "1頭軸":
            axis = self._select_value_axis(scored)
            jiku = [axis]
            aite = self._pick_aite(scored, {axis["number"]}, aite_count, "stability")
            reason = f"妙味スコア上位の{axis['name']}を軸に。相手は安定評価上位へ流す馬連。"
            icon = "🏇"
        elif bet_type == "馬連" and bet_method == "フォーメーション":
            jiku = self._select_two_axes(scored)
            aite = self._pick_aite(scored, {h["number"] for h in jiku}, aite_count, "stability")
            reason = "フォーメーション実績を反映し、軸2頭から相手へ広げる。"
            icon = "🧩"
        elif bet_type == "馬単" and bet_method == "1頭軸":
            axis = self._select_primary_axis(scored) if condition.get("isClearFavorite") else self._select_value_axis(scored)
            jiku = [axis]
            aite = self._pick_aite(scored, {axis["number"]}, aite_count, "stability")
            reason = f"本命突出型レース。{axis['name']}を1着固定で配当を取りにいく馬単。"
            icon = "⚡"
        elif bet_type == "3連単" and bet_method in {"流し", "1頭軸"}:
            axis = self._select_primary_axis(scored)
            jiku = [axis]
            aite = self._pick_aite(scored, {axis["number"]}, aite_count, "value")
            reason = f"{axis['name']}から妙味寄りへ流す3連単。高配当を一点狙い。"
            icon = "🚀"
        elif bet_type == "3連単" and bet_method == "フォーメーション":
            jiku = self._select_two_axes(scored)
            aite = self._pick_aite(scored, {h["number"] for h in jiku}, aite_count, "upset")
            reason = "上位2頭を軸に穴馬・妙味馬を相手へ混ぜたフォーメーション。跳ねを狙う。"
            icon = "🎇"
        elif bet_type == "ワイド" and bet_method == "BOX":
            jiku = []
            # 穴馬候補を相手に含める
            upset = self._select_upset_horse(scored, set())
            base_aite = self._pick_aite(scored, set(), aite_count, "value")
            if upset and upset not in base_aite:
                base_aite = base_aite[:aite_count - 1] + [upset]
            aite = base_aite
            reason = "妙味上位＋穴馬候補でワイドBOX。複数点でリスクを分散しながら回収を狙う。"
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
            "priority": priority,
            "priority_label": priority_label,
            "jiku": jiku,
            "aite": aite,
        }

    def build_strategic_bets(self, scored, condition, budget, user_profile=None):
        """過去プロファイルを踏まえて戦略を構築 (V16: 4券種表示・おすすめ順付与)"""
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
            if len(bets) == 4:  # V16: 3→4種に拡張
                break

        if not bets:
            return []

        # おすすめ順でソート（priority昇順）
        bets.sort(key=lambda b: b["priority"])

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
