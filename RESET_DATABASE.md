# Tursoデータベースのリセット方法

## 方法1: Renderのダッシュボードから環境変数を取得して実行

1. Renderダッシュボード (https://dashboard.render.com) にログイン
2. yamatter-deployサービスを選択
3. 左メニューの「Environment」をクリック
4. `TURSO_AUTH_TOKEN`の値をコピー

5. ローカルで以下のコマンドを実行:
```bash
cd /Users/claude/workspace/yamatter-deploy

# 環境変数を設定
export TURSO_DATABASE_URL="libsql://yamatter-utabi.aws-ap-northeast-1.turso.io"
export TURSO_AUTH_TOKEN="コピーしたトークンをここに貼り付け"

# リセットスクリプトを実行
node reset_db_api.js
```

## 方法2: Turso Webコンソールから直接実行

1. https://turso.tech にアクセス
2. GitHubアカウントでログイン
3. `yamatter-utabi`データベースを選択
4. 「Query」タブをクリック
5. 以下のSQLを実行:

```sql
DROP TABLE IF EXISTS mentions;
DROP TABLE IF EXISTS tweets;
DROP TABLE IF EXISTS users;
```

## リセット後の手順

1. Renderダッシュボードで「Manual Deploy」→「Deploy latest commit」を実行
2. デプロイが完了するまで待機（約2-3分）
3. https://yamatter.onrender.com にアクセスして確認

新しいテーブルは自動的に作成されます。