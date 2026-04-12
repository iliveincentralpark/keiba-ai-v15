from .scoring_agent import ScoringAgent
from .strategy_agent import StrategyAgent


class AgentManager:
    def __init__(self):
        self.scoring_agent  = ScoringAgent()
        self.strategy_agent = StrategyAgent()

    def _make_ai_comment(self, h, role):
        """
        近走生データ・適性スコア・オッズ・DNA情報から人間が読めるコメントを生成 (V19)
        競馬場・距離・血統適性のコメントを新たに追加。
        """
        parts = []
        positions    = h.get("recent_positions", [])
        avg_pos      = h.get("avg_pos_raw")
        top3         = h.get("top3_count", 0)
        avg_agari    = h.get("avg_agari_raw")
        odds         = h.get("odds", 0)
        pop          = h.get("popularity", 99)
        exp_odds     = h.get("expected_odds", 0)
        value        = h.get("value", 0)
        jiku_bonus   = h.get("jiku_bonus", 1.0)
        venue_pop_bonus = h.get("venue_pop_bonus", 1.0)

        # ── 近走成績コメント ──
        if positions:
            n    = len(positions)
            wins = sum(1 for p in positions if p == 1)

            consec_wins = 0
            for p in positions:
                if p == 1:
                    consec_wins += 1
                else:
                    break

            if consec_wins >= 3:
                parts.append(f"直近{consec_wins}連勝中と絶好調")
            elif consec_wins == 2:
                parts.append("直近2連勝中")
            elif positions[0] == 1:
                parts.append("前走勝利からの参戦")
            elif positions[0] <= 3 and n >= 2 and positions[1] <= 3:
                parts.append("直近2走連続3着内と好調維持")
            elif wins >= 2:
                parts.append(f"近{n}走で{wins}勝と実績あり")
            elif top3 >= 3:
                parts.append(f"近{n}走で3着内{top3}回と安定している")
            elif avg_pos and avg_pos <= 4.0:
                parts.append(f"近{n}走の平均着順{avg_pos}位と着実に上位")
            elif avg_pos:
                parts.append(f"近{n}走の平均着順{avg_pos}位")
        else:
            source = h.get("ability_source", "default")
            if source == "default":
                parts.append("近走データなし（新馬または未出走）")
            elif source == "time_index":
                parts.append("タイム指数ベースで評価")

        # ── 上がり3Fコメント ──
        if avg_agari:
            if avg_agari < 33.5:
                parts.append(f"上がり平均{avg_agari}秒と切れ足が際立つ")
            elif avg_agari < 34.5:
                parts.append(f"上がり平均{avg_agari}秒と末脚も優秀")
            elif avg_agari > 36.5:
                parts.append(f"上がりは{avg_agari}秒とやや遅め")

        # ── V19 NEW: 競馬場適性コメント ──
        venue_bonus = h.get("venue_bonus", 1.00)
        if venue_bonus >= 1.20:
            parts.append("このコースを得意としている（競馬場適性◎）")
        elif venue_bonus >= 1.08:
            parts.append("このコースでの成績が良い（競馬場適性○）")
        elif venue_bonus <= 0.86:
            parts.append("このコースでの成績が振るわない（競馬場適性✗）")

        # ── V19 NEW: 距離適性コメント ──
        distance_bonus = h.get("distance_bonus", 1.00)
        if distance_bonus >= 1.20:
            parts.append("今日の距離で高い実績がある（距離適性◎）")
        elif distance_bonus >= 1.08:
            parts.append("今日の距離での成績が安定している（距離適性○）")
        elif distance_bonus <= 0.86:
            parts.append("今日の距離は苦手傾向（距離適性✗）")

        # ── V19 NEW: 血統コメント ──
        sire = h.get("sire")
        bloodline_bonus = h.get("bloodline_bonus", 1.00)
        if sire and bloodline_bonus >= 1.10:
            parts.append(f"父{sire}の適性がこのレース条件にマッチ（血統適性◎）")
        elif sire and bloodline_bonus <= 0.93:
            parts.append(f"父{sire}の適性が今日の条件と不一致（血統注意）")

        # ── オッズ・妙味コメント ──
        if exp_odds > 0:
            if value > 1.4:
                parts.append(f"{pop}人気にして単勝{odds}倍と大幅割安")
            elif value > 1.15:
                parts.append(f"オッズ{odds}倍は{pop}人気としてやや割安")
            elif value < 0.75:
                parts.append(f"単勝{odds}倍は{pop}人気として過剰人気")

        # ── 穴馬固有コメント ──
        if role == "ana":
            parts.append(f"{pop}番人気の低評価を覆す可能性に注目")

        # ── DNAコメント ──
        if jiku_bonus > 1.0 and venue_pop_bonus > 1.05:
            parts.append(f"あなたの{pop}人気軸での的中実績＋このコースでの回収率が高い（DNA一致）")
        elif jiku_bonus > 1.0:
            factors.append(f"あなたの過去の軸馬と同じ{pop}人気帯（DNA一致）")
        elif venue_pop_bonus > 1.1:
            factors.append(f"このコースの{pop}人気帯でのあなたの回収率が高い傾向（DNA参考）")
        elif venue_pop_bonus < 0.90:
            factors.append(f"このコースの{pop}人気帯はあなたの回収率が低め（注意）")

        # ── DNA警告の反映 ──
        if role == "honmei" and h.get("dna_warning_level", 0) >= 1:
            warn_txt = h.get("dna_warning_text", "苦手条件")
            factors.append(f"⚠️ユーザーが外しがちな条件({warn_txt})のため、絶対の軸には非推奨です。")
        elif h.get("dna_match_level", 0) >= 1:
            factors.append("⭐ユーザーの過去の的中傾向とマッチする得意条件です。")
            
        return " ".join(factors) if factors else "データが少なく評価困難。"

    def _build_horse_roles(self, scored):
        """
        V19: 本命・対抗・穴馬・DNAマッチ馬を分類し、ai_commentを付与する
        """
        if not scored:
            return {}

        honmei = scored[0] if len(scored) >= 1 else None
        taikou = scored[1:3] if len(scored) >= 3 else scored[1:] if len(scored) >= 2 else []
        top_nums = {h["number"] for h in ([honmei] if honmei else []) + taikou}

        upset_candidates = sorted(
            [h for h in scored if h["number"] not in top_nums and h.get("upset_score", 0) > 0],
            key=lambda x: x["upset_score"], reverse=True
        )
        mid_upsets = [h for h in upset_candidates if 5 <= h.get("popularity", 99) <= 12]
        ana = []
        if mid_upsets:
            ana.append(mid_upsets[0])
        for h in upset_candidates:
            if h["number"] not in {a["number"] for a in ana}:
                ana.append(h)
            if len(ana) >= 2:
                break

        # DNAマッチ馬（本命・対抗以外）
        dna_horses = [
            h for h in scored
            if h["number"] not in top_nums
            and h.get("dna_match_level", 0) >= 1
        ][:2]

        # ai_comment を付与
        if honmei:
            honmei["ai_comment"] = self._make_ai_comment(honmei, "honmei")
        for h in taikou:
            h["ai_comment"] = self._make_ai_comment(h, "taikou")
        for h in ana:
            h["ai_comment"] = self._make_ai_comment(h, "ana")
        for h in dna_horses:
            h["ai_comment"] = self._make_ai_comment(h, "dna")

        return {
            "honmei":    honmei,
            "taikou":    taikou,
            "ana":       ana,
            "dna_horses": dna_horses,
        }

    def get_predictions(
        self,
        horses_list,
        budget=10000,
        user_profile=None,
        race_context=None,
        detail_map=None,
    ):
        """
        エージェント間連携で最終的な予測結果を返す (V19)
        race_context: {venue, surface, distance_m, dist_category}
        detail_map:   {horse_num: {venue_stats, dist_stats, sire, dam_sire}}
        """
        scored      = self.scoring_agent.score_all_horses(
            horses_list, user_profile, race_context, detail_map
        )
        condition   = self.strategy_agent.analyze_race_condition(scored)
        horse_roles = self._build_horse_roles(scored)

        return {
            "scored":      scored,
            "condition":   condition,
            "horse_roles": horse_roles,
            "race_context": race_context or {},
        }
