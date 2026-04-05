# V18実装計画：人気順脱却 + 近走データ取得修正

## 問題の根本原因

### ①「人気順の羅列」になる根本原因

現在のスコア計算：
```
score = stability × value × ability_multiplier × jiku_bonus × db_bonus × 4.5
```

**`value（妙味） = オッズ ÷ 人気別期待オッズ`** は、どの人気でも均一になりやすい（全馬が「適正オッズ」に収束する）。

結果として **stability（人気依存）× ability_score** で順位が決まる。
- データなし馬は全て `0.75^2.2 = 0.52` で並び、stabilityが高い上位人気馬が上に来る
- データがある馬でも、pos_score = `100 - (avg_pos - 1) * 3.5 + top3_rate * 8` は1着が100点、8着が75点程度で差が小さい

**→ 結果：stability（人気）で大きく決まり、近走成績が差をつけられない**

### ②「データなし」が多発する根本原因

`shutuba_past.html` の実際のHTML構造が想定と違う可能性が高い。
- netkeibaのshutuba_past.htmlは近走成績をJavaScriptで動的レンダリングしている場合があり、静的スクレイピングでは取れない
- `Ranking_N` クラスは3着以内だけに付くため4着以下は補完ロジックに依存するが、そのパターンも不一致の可能性
- 現状のフォールバック先（タイム指数）もゼロの場合は全て `ability_source="default"` になる

## 修正方針（V18）

### 方針①：スコア設計を根本から変える

**人気は「期待値補正」だけに使う。順位の主軸は近走成績とする。**

新設計：
```
score = ability_score_v18 × value_factor × (1 + dna_bonus)
```

- `ability_score_v18`：近走着順ベースのスコア（差が大きく出るよう設計）
  - 近走あり：自然対数スケールで着順差を拡大
  - 近走なし：タイム指数 → fallback(0.3)（今より大幅に下げる）
- `value_factor`：妙味は補正係数として小さく使う（0.7〜1.4の範囲）
- `dna_bonus`：DNA一致で小幅加算

stabilityは廃止し、人気の直接的な影響をゼロにする。

### 方針②：近走データ取得を2段階にする

**Stage 1（現行）:** shutuba_past.htmlから一括取得（高速）
**Stage 2（新規）:** Stage 1で取れなかった馬について馬個別ページから取得（フォールバック）

`https://db.netkeiba.com/horse/{horse_id}/` から近5走の着順を取得する。

### 方針③：フロント表示の改善

- `ability_source` が `"default"` かつ実際に馬IDがある場合 → 「スクレイプ失敗⚠️」
- `ability_source` が `"default"` で馬IDもない → 「新馬/未出走」
- スコアの根拠をより分かりやすく

## 変更ファイル

### backend/main.py
- `fetch_all_horse_stats_from_shutuba()` にデバッグログ追加
- `fetch_horse_stats_from_horse_page()` を新規追加（個別ページフォールバック）
- `predict_race()` でStage 2フォールバックを実行

### backend/agents/scoring_agent.py
- `score_all_horses()` のスコア計算を根本から変更
- ability_scoreの計算で近走着順の差を拡大
- stabilityを廃止

### app/js/app_v15.js
- 「データなし」表示を「スクレイプ失敗」と「新馬/未出走」に分離

## 検証計画

1. ローカルで実際のレースIDで動作確認
2. `shutuba_past` が取れているかログ確認
3. デバッグエンドポイントで生HTML確認
4. スコア分布が人気順でなくなっていることを確認
