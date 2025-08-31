# Turso データベースセットアップ手順

## 1. Tursoアカウント作成

1. https://turso.tech にアクセス
2. "Sign up" をクリック
3. GitHubアカウントでサインアップ（推奨）
4. 無料プランを選択（500MBまで無料）

## 2. データベース作成

Turso CLIをインストール：
```bash
brew install tursodatabase/tap/turso
```

ログインして認証：
```bash
turso auth login
```

データベースを作成：
```bash
turso db create yamatter-db --location nrt
```

接続情報を取得：
```bash
# データベースURL
turso db show yamatter-db --url

# 認証トークン
turso db tokens create yamatter-db
```

## 3. 環境変数の例

取得した情報を使って、以下の環境変数を設定：
```
TURSO_DATABASE_URL=libsql://yamatter-db-[ユーザー名].turso.io
TURSO_AUTH_TOKEN=[取得したトークン]
```

## 4. コード修正箇所

`backend/models/Database.js` を修正して、Tursoに対応させる必要があります。

## 注意事項

- 無料プランは500MBまで
- 東京リージョン（nrt）を選択することで低レイテンシーを実現
- SQLite互換なので、既存のSQLクエリはほぼそのまま使える