# Documentation Rules

## 更新対象
- 実装計画は `docs/implementation_plan.md` のみ更新する
- 作業ログは `docs/walkthrough.md` のみ更新する

## 既存の個別ファイルの扱い
- `docs/**/implementation_plan.md` と `docs/**/walkthrough.md` の既存ファイルはアーカイブとして残す
- 原則として過去ファイルは編集しない
- 過去の経緯確認が必要な場合だけ参照する

## 追記ルール
- 新しい作業を始める前に `docs/implementation_plan.md` を更新する
- 作業完了後に `docs/walkthrough.md` へ結果を追記する
- ファイルは「最新状態がひと目で分かる要約」を上に置く
- 重要な仕様変更は「現在の状態」と「直近の変更」に反映する

## 記述ルール
- 同じ内容を複数ファイルに重複記載しない
- 詳細な履歴よりも、現状判断に必要な情報を優先する
- バージョン番号、主要変更、検証結果、引き継ぎ事項を残す

## 運用ルール
- 今後「walkthrough を更新して」と依頼された場合は `docs/walkthrough.md` を更新する
- 今後「implementation plan を更新して」と依頼された場合は `docs/implementation_plan.md` を更新する
- 個別ディレクトリ配下に新しい `walkthrough.md` や `implementation_plan.md` は増やさない
