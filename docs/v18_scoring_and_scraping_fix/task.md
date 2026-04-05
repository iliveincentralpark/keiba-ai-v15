# V18 修正タスク

- [x] 問題の根本分析
- [x] main.py: `fetch_horse_stats_from_db_page()` 追加（Stage2フォールバック）
- [x] main.py: `predict_race()` でStage2取得を実行 + horse_idをhorse_listに渡す
- [x] scoring_agent.py: `stability`廃止、スコア主軸を`ability^2.0`に変更
- [x] scoring_agent.py: データなし馬のスコアを0.75→0.40に引き下げ
- [x] app_v15.js: 「データなし」表示を「取得失敗」と明示
