from .scoring_agent import ScoringAgent
from .strategy_agent import StrategyAgent

class AgentManager:
    def __init__(self):
        self.scoring_agent = ScoringAgent()
        self.strategy_agent = StrategyAgent()

    def get_predictions(self, horses_list, budget=10000, user_profile=None):
        """
        エージェント間連携を行い、最終的な予測結果を返す
        """
        # 1. スコアリングエージェントによる全頭評価
        scored = self.scoring_agent.score_all_horses(horses_list, user_profile)
        
        # 2. ストラテジーエージェントによるレース状況分析
        condition = self.strategy_agent.analyze_race_condition(scored)
        
        # 3. ストラテジーエージェントによる具体的買い目構築
        bets = self.strategy_agent.build_strategic_bets(scored, condition, budget, user_profile)
        
        return {
            "scored": scored,
            "condition": condition,
            "bets": bets
        }
