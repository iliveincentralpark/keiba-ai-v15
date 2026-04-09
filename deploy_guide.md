#🚀 クラウド完全化（Render展開）ガイド

以下の３ステップで、スマホ単体で世界中どこからでも「AI KEIBA V15」が使えるようになります！

### ステップ1：Githubへアップロード
この `keiba_project` フォルダ全体をあなたの Github アカウントの新しいリポジトリ（例: `ai-keiba-v15`）にプッシュ（アップロード）してください。

（※もし Git の設定がまだの場合、以下のコマンドをターミナルで実行してアップロードできます）
```bash
git init
git add .
git commit -m "Initial commit for V15 PWA"
git branch -M main
git remote add origin https://github.com/あなたのユーザー名/リポジトリ名.git
git push -u origin main
```

注意:
- `https://<token>@github.com/...` のように Personal Access Token を remote URL に埋め込まないでください。
- 初回 push 時は GitHub の認証が求められます。HTTPS を使う場合は、GitHub のユーザー名と、必要に応じて再生成したトークンを入力してください。
- すでに token 付き URL を使っている場合は、先に以下で token なし URL へ戻してから push してください。

```bash
git remote set-url origin https://github.com/あなたのユーザー名/リポジトリ名.git
git remote -v
```

補足:
- Classic PAT は期限切れや権限過多の管理負荷があるため、可能なら Fine-grained PAT か SSH へ移行するのが安全です。
- macOS の credential helper や GitHub CLI を使うと、毎回 remote URL に token を含めずに運用できます。

### ステップ2：Renderへ接続
1. [Render.com](https://render.com/) にアクセスし、Githubアカウントでログイン（無料登録）します。
2. 画面右上の「New」ボタンを押して**「Blueprint」**（※または Web Service）をクリックします。
3. Githubの連携を許可し、先ほど作成した `ai-keiba-v15` リポジトリを選択します。
4. （Blueprintを選択すると、すでに作成済みの `render.yaml` が自動で読み込まれ、設定不要でワンクリック構築が始まります）
5. デプロイ後、`/api/status` が `{"success": true, "history_count": 17, ...}` を返せば、CSVベースの学習データ取り込みまで完了しています。

### ステップ3：スマホでPWA化（ホーム画面に追加）
1. 数分後、Renderから `https://ai-keiba-v15-xxxxx.onrender.com` のような専用URLが発行されます。
2. これをスマホで開き、画面下の共有メニューから**「ホーム画面に追加」**を行ってください。

✅ これでPCをシャットダウンしても、いつでも最新のAIスコアリングとDNAボーナスを用いた予測ロジックが手元で動きます！

補足:
`DB_FILE_PATH` 環境変数を指定すると、SQLite の保存先を Render 側で切り替えられます。未指定時は `backend/keiba_data.db` を使い、起動時に `analysis/馬券投票履歴_enriched.csv` から自動投入されます。
