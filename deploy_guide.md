#🚀 クラウド完全化（Render展開）ガイド

以下の３ステップで、スマホ単体で世界中どこからでも「AI KEIBA V15」が使えるようになります！

### ステップ1：Githubへアップロード
この `keiba_project` フォルダ全体をあなたの Github アカウントの新しいリポジトリ（例: `ai-keiba-v15`）にプッシュ（アップロード）してください。

（※もしGitの設定がまだの場合、以下のコマンドをターミナルで実行してアップロードできます）
```bash
git init
git add .
git commit -m "Initial commit for V15 PWA"
git branch -M main
git remote add origin https://github.com/あなたのユーザー名/リポジトリ名.git
git push -u origin main
```

### ステップ2：Renderへ接続
1. [Render.com](https://render.com/) にアクセスし、Githubアカウントでログイン（無料登録）します。
2. 画面右上の「New」ボタンを押して**「Blueprint」**（※または Web Service）をクリックします。
3. Githubの連携を許可し、先ほど作成した `ai-keiba-v15` リポジトリを選択します。
4. （Blueprintを選択すると、すでに作成済みの `render.yaml` が自動で読み込まれ、設定不要でワンクリック構築が始まります）

### ステップ3：スマホでPWA化（ホーム画面に追加）
1. 数分後、Renderから `https://ai-keiba-v15-xxxxx.onrender.com` のような専用URLが発行されます。
2. これをスマホで開き、画面下の共有メニューから**「ホーム画面に追加」**を行ってください。

✅ これでPCをシャットダウンしても、いつでも最新のAIスコアリングとDNAボーナスを用いた予測ロジックが手元で動きます！
