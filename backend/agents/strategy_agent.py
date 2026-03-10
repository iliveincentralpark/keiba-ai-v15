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
            "topPop": top_pop
        }

    def build_strategic_bets(self, scored, condition, budget):
        """戦略に基づいた買い目構築"""
        if not scored:
            return []
            
        bets = []
        s0 = scored[0]
        s1 = scored[1] if len(scored) > 1 else s0
        
        # ---- 戦略1: メイン本命軸 (3連複 1頭軸) ----
        jiku1 = s0
        ai_pool1 = [h for h in scored if h["number"] != jiku1["number"]]
        # 妙味でソートして相手を決める
        aite1 = sorted(ai_pool1, key=lambda x: x["value"], reverse=True)[:5]
        bets.append({
            "type": "3連複", "method": "1頭軸 (本命流し)", "icon": "🎯",
            "reason": f"{jiku1['name']}を軸に妙味上位5頭に流す。実力指数と期待値のバランスが最も高い組み合わせ。",
            "jiku": [jiku1], "aite": aite1, "ratio": 0.40
        })

        # ---- 戦略2: 2番手軸で穴を狙う (馬連) ----
        value_ranked = sorted(scored, key=lambda x: x["value"], reverse=True)
        jiku2 = value_ranked[1] if value_ranked[0]["number"] == s0["number"] and len(value_ranked) > 1 else value_ranked[0]
        aite2 = [h for h in scored if h["number"] != jiku2["number"]][:5]
        bets.append({
            "type": "馬連", "method": "1頭軸 (妙味軸)", "icon": "🏇",
            "reason": f"妙味指数{jiku2['value']:.2f}の{jiku2['name']}({jiku2['popularity']}人気)を軸に据え、安定上位5頭に流す。",
            "jiku": [jiku2], "aite": aite2, "ratio": 0.30
        })

        # ---- 戦略3: 状況に応じた柔軟な券種 ----
        if condition["isClearFavorite"] and not condition["isLowOdds"]:
            jiku3 = s0
            aite3 = [h for h in scored if h["number"] != jiku3["number"]][:5]
            bets.append({
                "type": "馬単", "method": "1頭軸 (本命食い)", "icon": "⚡",
                "reason": f"AIスコア差{(condition['scoreGap'] * 100):.0f}%で{jiku3['name']}が頭で安定。馬単で配当アップを狙う。",
                "jiku": [jiku3], "aite": aite3, "ratio": 0.30
            })
        elif condition["isLowOdds"]:
            box_horses = scored[1:5]
            bets.append({
                "type": "ワイド", "method": "BOX (番狂わせ)", "icon": "🛡️",
                "reason": f"{s0['name']}が低オッズ({s0['odds']}倍)で妙味が薄い。2〜5番手でBOXを組み、穴を狙う。",
                "jiku": [], "aite": box_horses, "isBOX": True, "ratio": 0.30
            })
        else:
            jiku4 = [s0, s1]
            aite4 = [h for h in scored if h["number"] not in [s0["number"], s1["number"]]][:4]
            bets.append({
                "type": "3連複", "method": "2頭軸 (絞り込み)", "icon": "🎰",
                "reason": f"上位2頭 {s0['name']}+{s1['name']} の2頭軸。点数を絞る効率戦略。",
                "jiku": jiku4, "aite": aite4, "ratio": 0.30
            })

        # 予算配分計算
        final_bets = []
        for bet in bets:
            pts = (len(bet["aite"]) * (len(bet["aite"]) - 1)) // 2 if bet.get("isBOX") else max(len(bet["aite"]), 1)
            per = max(100, math.floor((budget * bet["ratio"]) / pts / 100) * 100)
            total = per * pts
            final_bets.append({**bet, "points": pts, "perPoint": per, "total": total})
            
        return final_bets
