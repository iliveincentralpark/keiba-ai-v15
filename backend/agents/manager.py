from .scoring_agent import ScoringAgent
from .strategy_agent import StrategyAgent


class AgentManager:
    def __init__(self):
        self.scoring_agent = ScoringAgent()
        self.strategy_agent = StrategyAgent()

    def _build_horse_roles(self, scored):
        """
        V16: 本命・対抗・穴馬・DNAマッチ馬を分類する
        - 本命: スコア1位
        - 対抗: スコア2〜3位
        - 穴馬: upset_score > 0 の馬を降順に最大2頭
        - dna_horses: 本命・対抗以外でjiku_bonus/db_bonusが高い馬
        """
        if not scored:
            return {}

        honmei = scored[0] if len(scored) >= 1 else None
        taikou = scored[1:3] if len(scored) >= 3 else scored[1:] if len(scored) >= 2 else []

        # 穴馬候補: upset_score > 0 の馬をスコア降順で上位2頭
        upset_candidates = sorted(
            [h for h in scored if h.get("upset_score", 0) > 0],
            key=lambda x: x["upset_score"],
            reverse=True
        )
        ana = upset_candidates[:2]

        # DNAマッチ馬：本命・対抗以外で過去買い目パターンに合致する馬
        top_nums = {h["number"] for h in ([honmei] if honmei else []) + taikou}
        dna_horses = [
            h for h in scored
            if h["number"] not in top_nums
            and (h.get("jiku_bonus", 1.0) > 1.0 or h.get("db_bonus", 1.0) > 1.05)
        ][:2]  # 最大2頭

        return {
            "honmei": honmei,
            "taikou": taikou,
            "ana": ana,
            "dna_horses": dna_horses,
        }

    def get_predictions(self, horses_list, budget=10000, user_profile=None):
        """
        エージェント間連携を行い、最終的な予測結果を返す (V16)
        """
        # 1. スコアリングエージェントによる全頭評価
        scored = self.scoring_agent.score_all_horses(horses_list, user_profile)

        # 2. ストラテジーエージェントによるレース状況分析
        condition = self.strategy_agent.analyze_race_condition(scored)

        # 3. 本命・対抗・穴馬・DNAマッチ馬の分類 (V16)
        horse_roles = self._build_horse_roles(scored)

        return {
            "scored": scored,
            "condition": condition,
            "horse_roles": horse_roles,
        }
