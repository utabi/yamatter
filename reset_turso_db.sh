#!/bin/bash

# Tursoデータベースをリセットするスクリプト
# 注意: これを実行すると全てのデータが削除されます

echo "⚠️  警告: Tursoデータベースの全データを削除しようとしています"
echo "データベース: yamatter-utabi"
echo ""
read -p "本当に続行しますか？ (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "キャンセルしました"
    exit 0
fi

echo "🔄 Turso CLIでログイン中..."
turso auth login

echo "📊 データベースの現在の状態を確認..."
turso db show yamatter-utabi

echo "🗑️  全てのテーブルを削除..."
turso db shell yamatter-utabi <<EOF
DROP TABLE IF EXISTS mentions;
DROP TABLE IF EXISTS tweets;
DROP TABLE IF EXISTS users;
.quit
EOF

echo "✅ テーブルが削除されました"
echo ""
echo "Renderサービスを再起動すると、新しいテーブルが自動的に作成されます。"
echo "Renderダッシュボードで「Manual Deploy」→「Deploy latest commit」を実行してください。"