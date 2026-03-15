# Current Status (2026-03-15)

## Summary
- GitHub / Render 本番環境で `AI BET GEN V15` が起動し、`/api/status` で `history_count: 17` を返す状態まで確認済み。
- `analysis/馬券投票履歴_enriched.csv` の人気・馬名補完精度を改善し、`馬番N` や `57`, `99` の異常値を大幅に解消。
- `backend/database.py` で起動時に `analysis/馬券投票履歴_enriched.csv` から学習データを自動投入するように変更。
- `backend/main.py` / `backend/agents/*` で、人気帯だけでなく券種・買い方・軸数の傾向も反映した予想ロジックへ更新。
- Render 上では `https://keiba-ai-v15.onrender.com/api/status` が正常応答し、学習済みプロフィールも返却済み。

## Completed Changes
- CSV学習取り込みの修正
  - `app/js/simulation_v5.js`
  - `backend/main.py`
- ユーザープロファイル集計の拡張
  - `backend/main.py`
- スコアリングと戦略生成の更新
  - `backend/agents/scoring_agent.py`
  - `backend/agents/strategy_agent.py`
  - `backend/agents/manager.py`
- DB自動初期化 / 自動シード
  - `backend/database.py`
- Render 用の起動調整
  - `render.yaml`
  - `deploy_guide.md`
- UIへの学習状態表示追加
  - `app/index.html`
  - `app/js/app_v15.js`
- 競走馬名・人気・オッズ補完精度の改善
  - `analysis/enrich_csv.py`
- 実際の予想APIで「存在しない 17番 / 18番」が混ざる問題の修正
  - `backend/main.py`

## Verified State
- Render の `/api/status` で以下を確認済み
  - `success: true`
  - `history_count: 17`
  - `profile_loaded: true`
- 本番画面で以下を確認済み
  - 学習ステータス表示あり
  - `馬#17`, `馬#18` の幽霊馬が消えた
  - 16頭立てのレースで16頭分の評価に収まっている

## Notes For Next Time
- 現在は「動作安定化」が主目的の修正を完了。
- 次回以降は以下の改善余地あり。
  - 予想ロジックの精度チューニング
  - あなたの感覚とのズレがある券種・相手選定の微調整
  - 保存履歴の永続化強化（Render persistent disk や外部DB）

## Files Intentionally Cleaned Up
- 旧フロントエンド版スクリプト群 (`app/js/app_v3.js` 〜 `app/js/app_v14.js`)
- 旧シミュレーター版スクリプト (`app/js/simulation_v3.js`, `app/js/simulation_v4.js`)
- 未使用データファイル (`app/data/debug_output.json`, `app/data/live_data.json`, `app/data/mock.json`)

## Important Runtime Files
- `backend/main.py`
- `backend/database.py`
- `backend/agents/manager.py`
- `backend/agents/scoring_agent.py`
- `backend/agents/strategy_agent.py`
- `app/index.html`
- `app/js/app_v15.js`
- `app/js/simulation_v5.js`
- `analysis/enrich_csv.py`
- `analysis/馬券投票履歴_enriched.csv`
- `render.yaml`
