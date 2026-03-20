from .scoring_agent import ScoringAgent
from .strategy_agent import StrategyAgent


class AgentManager:
    def __init__(self):
        self.scoring_agent = ScoringAgent()
        self.strategy_agent = StrategyAgent()

    def _build_horse_roles(self, scored):
        """
        V16: 本命・対抗・穴馬を分類する
        - 本命: スコア1位
        - 対抗: スコア2〜3位
        - 穴馬: 人気6位以下かつ upset_score 上位2頭
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

        return {
            "honmei": honmei,
            "taikou": taikou,
            "ana": ana,
        }

    def get_predictions(self, horses_list, budget=10000, user_profile=None):
        """
        エージェント間連携を行い、最終的な予測結果を返す (V16)
        """
        # 1. スコアリングエージェントによる全頭評価
        scored = self.scoring_agent.score_all_horses(horses_list, user_profile)

        # 2. ストラテジーエージェントによるレース状況分析
        condition = self.strategy_agent.analyze_race_condition(scored)

        # 3. ストラテジーエージェントによる具体的買い目構築
        bets = self.strategy_agent.build_strategic_bets(scored, condition, budget, user_profile)

        # 4. 本命・対抗・穴馬の分類 (V16)
        horse_roles = self._build_horse_roles(scored)

        return {
            "scored": scored,
            "condition": condition,
            "bets": bets,
            "horse_roles": horse_roles,
        }
