# Renderディスク設定手順

## 重要：無料プランではディスクが自動削除される

Renderの無料プランでは、残念ながら**永続ディスクは利用できません**。
無料プランの制限：
- サービスが15分間アクセスされないとスリープ
- **再起動時にデータが失われる**
- ディスクは一時的なもののみ

## 解決策

### 1. 外部データベースを使用（推奨）
無料のデータベースサービスを利用：

#### Supabase（推奨）
- PostgreSQL互換
- 500MBまで無料
- https://supabase.com

#### PlanetScale
- MySQL互換  
- 5GBまで無料
- https://planetscale.com

#### Turso
- SQLite互換（LibSQL）
- 500MBまで無料
- https://turso.tech

### 2. ローカルSQLiteを使用（データは失われる）
現在の設定のまま使用できますが、以下の制限があります：
- 再デプロイ時にデータリセット
- 15分アイドル後の再起動でデータリセット

### 3. 有料プランにアップグレード
月$7から永続ディスクが使用可能

## Tursoを使った解決策（SQLite互換）

TursoはSQLite互換なので、コード変更が最小限で済みます：

```javascript
// backend/models/Database.js の変更例
const { createClient } = require('@libsql/client');

class Database {
    constructor() {
        if (process.env.TURSO_DATABASE_URL) {
            // Tursoを使用
            this.client = createClient({
                url: process.env.TURSO_DATABASE_URL,
                authToken: process.env.TURSO_AUTH_TOKEN
            });
        } else {
            // ローカルSQLite
            this.dbPath = path.join(__dirname, '../database/yamada_twitter.db');
        }
    }
}
```

## 環境変数の設定

Render Dashboardで以下を追加：
- `TURSO_DATABASE_URL`: Tursoから取得
- `TURSO_AUTH_TOKEN`: Tursoから取得

## まとめ

無料でデータを永続化したい場合は、外部データベースサービスの利用が必須です。
Tursoが最もSQLiteに近く、移行が簡単です。