# 回収率シミュレーション & CSV拡張 実装計画

## 背景
現在のCSV（17レコード）には馬番・券種・購入額・払戻のみ記録されている。
馬名・人気・オッズなどの情報がないため、「なぜその馬を選んだか」の傾向分析ができない。

## ゴール
1. CSVに**馬名・人気・オッズ列**を追加し、ユーザーの買い目パターンをより正確に再現可能にする
2. 過去データをWebアプリ上で可視化する**回収率シミュレーション画面**を追加する
3. 「もしAIの推奨通りに買っていたら？」のバックテスト機能の土台を作る

## User Review Required

> [!IMPORTANT]
> CSVフォーマットを拡張します。既存17レコードの馬名・人気・オッズは手動入力 or 空欄のままにするか決める必要があります。後者なら新規レコードから自動入力する形にします。

## Proposed Changes

---

### CSVフォーマット拡張

#### [MODIFY] [馬券投票履歴20260221.csv](file:///Users/kojimarei/Desktop/Antigravity/keiba_project/analysis/馬券投票履歴20260221.csv)
**追加列（既存列の後ろに追加）：**

| 新列名 | 説明 | 例 |
|---|---|---|
| `軸馬名` | 軸に選んだ馬の名前 | `ドウデュース` |
| `軸人気` | 軸馬の人気順位 | `1` |
| `軸オッズ` | 軸馬の単勝オッズ | `2.8` |
| `相手馬名` | 相手馬の名前（`\|`区切り） | `ジャスティンミラノ\|ソウルラッシュ` |
| `レース名` | レース名（G1等） | `有馬記念` |

→ 新規レコードは `scraper.py` が取得したデータからフロントで自動入力する仕組みにする。

---

### 回収率シミュレーション画面（Web UI）

#### [NEW] [simulation.html](file:///Users/kojimarei/Desktop/Antigravity/keiba_project/app/simulation.html)
- 既存の `index.html` と同じダーク+グラスモーフィズムのデザイン
- CSVアップロード or API経由で過去データ読み込み
- 表示内容:
  - **総合成績**: 投資額・回収額・回収率・的中率
  - **券種別グラフ**: ワイド/馬連/3連複/3連単/馬単の回収率比較（棒グラフ）
  - **月別推移**: 月ごとの投資vs回収の折れ線グラフ
  - **買い方別分析**: 1頭軸/2頭軸/BOX/フォーメーション別の成績テーブル

#### [NEW] [js/simulation.js](file:///Users/kojimarei/Desktop/Antigravity/keiba_project/app/js/simulation.js)
- CSVパーサー（Papa Parse等は不要、自前で軽量実装）
- 集計ロジック（`analyze.py` 相当をJSで実装）
- Chart.js（CDN）を使ったグラフ描画

---

### バックエンド拡張

#### [MODIFY] [app.py](file:///Users/kojimarei/Desktop/Antigravity/keiba_project/app/app.py)
- `/api/history` エンドポイント追加: CSVを読み込みJSON返却
- `/api/history/add` エンドポイント追加: 新規レコードをCSVに追記（買い目確定時に自動保存）

---

### ナビゲーション追加

#### [MODIFY] [index.html](file:///Users/kojimarei/Desktop/Antigravity/keiba_project/app/index.html)
- ヘッダーに「📊 成績分析」へのリンクボタン追加

---

## Verification Plan

### Automated Tests
- `python3 -m http.server 8000` + `python3 app.py` でサーバー起動
- ブラウザで `simulation.html` を開いて各種グラフの表示を確認

### Manual Verification
- CSVアップロード → グラフ表示
- `/api/history` へのアクセスでJSON一覧が返ること
