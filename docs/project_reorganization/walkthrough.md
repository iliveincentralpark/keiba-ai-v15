# 競馬予想Webアプリ 作業ログ

## 作業日: 2026-03-04

### 1. プロジェクトフォルダの統合・整理
分散していた競馬アプリ関連の6フォルダを `keiba_project/` に統合した。

| 移動元 | 移動先 |
|---|---|
| `horse_bet_web/` | `keiba_project/app/` |
| `keiba/` | `keiba_project/analysis/` |
| `docs/live_odds_scraper/` | `keiba_project/docs/archive/` |
| `docs/fix_render_issue/` | `keiba_project/docs/archive/` |
| `docs/horse_racing_strategy_upgrade/` | `keiba_project/docs/archive/` |
| `docs/horse_racing_bet_generator/` | `keiba_project/docs/archive/` |

### 2. `app.js` の安定性向上（レンダリング不具合修正）
- グローバルエラーハンドリング（`window.error`, `unhandledrejection`）を追加
- 初期化を `window.onload` → `DOMContentLoaded` / `readyState` 判定に変更
- `fetchLiveOdds` にローディングUI表示と、エラー時の赤枠メッセージ（`alert` 廃止）を実装
- netkeibaの特殊URLを出馬表URLへ自動正規化する処理を追加

### 3. テスト結果（全てOK ✅）
- 空URL → 赤枠エラー表示 ✅
- 不正URL → 「サーバーに接続できません」表示 ✅
- netkeiba出馬表URL → 馬一覧と買い目が正常表示 ✅

---

## 次回実施予定のタスク
1. **回収率シミュレーション機能**: `analysis/` の過去CSV（馬券投票履歴）を活用し、買い目パターンごとの回収率を分析・可視化する機能の追加
2. **ユーザー独自予想の入力UI**: 特定の馬を強制的に軸にする等、ユーザーの主観を反映できるUI追加

## 起動方法メモ
```bash
# 1. バックエンド起動
cd keiba_project/app && python3 app.py

# 2. フロントエンド起動（別ターミナル）
cd keiba_project/app && python3 -m http.server 8000

# 3. ブラウザで http://localhost:8000/index.html を開く
```
