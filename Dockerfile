# Node.js 18 Alpine (軽量)
FROM node:18-alpine

# 作業ディレクトリ設定
WORKDIR /app

# package.jsonをコピー（キャッシュ効率化）
COPY package*.json ./

# 依存関係インストール（本番環境用）
# npm ciがlibsqlで失敗するのでnpm installを使用
RUN npm install --production && \
    npm cache clean --force

# アプリケーションファイルをコピー
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# データベースディレクトリ作成（ローカル用と永続ディスク用）
RUN mkdir -p backend/database /var/data

# 非rootユーザー作成（セキュリティ）
RUN addgroup -g 1001 -S nodejs && \
    adduser -S yamada -u 1001

# ファイル所有権変更（/var/dataも含む）
RUN chown -R yamada:nodejs /app && \
    chown -R yamada:nodejs /var/data
USER yamada

# ポート公開
EXPOSE 10000

# ヘルスチェック（ポート番号を修正）
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:10000/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# 作業ディレクトリを再確認
WORKDIR /app

# アプリケーション起動
CMD ["node", "backend/server.js"]