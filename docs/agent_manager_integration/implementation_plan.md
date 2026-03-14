# Agent Manager 導入計画

## 目的
現在、`app_v14.js`（フロントエンド）にハードコードされているスコアリングや戦略構築のロジックを、バックエンドの「エージェント」に移行します。これにより、将来的にLLMとの連携や、より複雑なエージェント間連携（マルチエージェントシステム）への拡張を容易にします。

## 提案される変更

### [Component Name] Backend Agents

#### [NEW] [manager.py](file:///Volumes/ExternalSSD/Antigravity/keiba_project/backend/agents/manager.py)
複数のエージェント（Scoring, Strategyなど）を統括し、最終的な予測結果をまとめる「Agent Manager」クラス。

#### [NEW] [scoring_agent.py](file:///Volumes/ExternalSSD/Antigravity/keiba_project/backend/agents/scoring_agent.py)
全頭のスコアリング（期待値、実力指数、安定度）を担当するエージェント。

#### [NEW] [strategy_agent.py](file:///Volumes/ExternalSSD/Antigravity/keiba_project/backend/agents/strategy_agent.py)
スコアリング結果に基づき、具体的な買い目戦略（3連複本命流し、馬連妙味軸など）を立案するエージェント。

### [Component Name] Backend API

#### [MODIFY] [main.py](file:///Volumes/ExternalSSD/Antigravity/keiba_project/backend/main.py)
- `/api/predict` エンドポイントを新設し、`AgentManager` を呼び出すように変更。

### [Component Name] Frontend

#### [NEW] [app_v15.js](file:///Volumes/ExternalSSD/Antigravity/keiba_project/app/js/app_v15.js)
フロントエンドでのロジック計算をやめ、バックエンドの `AgentManager` APIから取得した結果を表示する最新バージョン。

---

## 検証計画

### 自動テスト
- 各エージェント（Scoring, Strategy）が期待通りのJSONを返却するか、ユニットテストで確認。

### 手動確認
- WEBアプリを立ち上げ、netkeibaのURLを入力し、バックエンドから返された戦略が正しくカードとして描画されるか確認。
