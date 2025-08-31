# Render環境変数設定手順

## 必要な環境変数

Renderダッシュボードで以下の環境変数を設定してください：

### 1. Tursoデータベース接続情報

```
TURSO_DATABASE_URL=libsql://yamatter-utabi.aws-ap-northeast-1.turso.io
TURSO_AUTH_TOKEN=[Tursoから取得したトークン]
```

### 2. 取得方法

Turso CLIを使ってトークンを取得：
```bash
turso db tokens create yamatter-utabi
```

または、Tursoダッシュボード（https://turso.tech）から：
1. データベースを選択
2. "Connect" タブをクリック
3. "Create Database Token" をクリック

## Renderでの設定方法

1. Renderダッシュボードにログイン
2. yamatter-deployサービスを選択
3. 左メニューの "Environment" をクリック
4. "Add Environment Variable" をクリック
5. 以下を追加：
   - Key: `TURSO_DATABASE_URL`
   - Value: `libsql://yamatter-utabi.aws-ap-northeast-1.turso.io`
6. 再度 "Add Environment Variable" をクリック
7. 以下を追加：
   - Key: `TURSO_AUTH_TOKEN`
   - Value: [取得したトークン]
8. "Save Changes" をクリック

## 確認方法

環境変数を設定後、サービスは自動的に再デプロイされます。
ログを確認して "Using Turso database" と表示されていることを確認してください。

## トラブルシューティング

- "Turso connection error" が表示される場合：
  - トークンが正しくコピーされているか確認
  - データベースURLが正しいか確認
  
- データが保持されない場合：
  - 環境変数が正しく設定されているか確認
  - Renderのログで "Using local SQLite database" ではなく "Using Turso database" と表示されているか確認