// 山田アカウントを直接作成するスクリプト
const { createClient } = require('@libsql/client');

async function createYamadaAccount() {
    const url = process.env.TURSO_DATABASE_URL || "libsql://yamatter-utabi.aws-ap-northeast-1.turso.io";
    const authToken = process.env.TURSO_AUTH_TOKEN;
    
    if (!authToken) {
        console.error('❌ TURSO_AUTH_TOKEN が必要です');
        process.exit(1);
    }
    
    console.log('🔄 Tursoデータベースに接続中...');
    
    const client = createClient({
        url: url,
        authToken: authToken
    });
    
    try {
        // まずテーブルが存在するか確認
        await client.execute('SELECT 1 FROM users LIMIT 1').catch(() => {
            console.log('⚠️ usersテーブルがまだ存在しません');
            throw new Error('Tables not yet created');
        });
        
        // 既存の山田アカウントを削除
        await client.execute({
            sql: 'DELETE FROM users WHERE device_id = ? OR nickname = ?',
            args: ['yamada_ai', '山田']
        });
        
        // 山田アカウントを作成
        const result = await client.execute({
            sql: 'INSERT INTO users (device_id, nickname, created_at, last_seen) VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
            args: ['yamada_ai', '山田']
        });
        
        console.log('✅ 山田アカウントを作成しました');
        console.log('  Device ID: yamada_ai');
        console.log('  Nickname: 山田');
        
        // 初回ツイートも投稿
        const { v4: uuidv4 } = require('uuid');
        const tweetId = uuidv4();
        
        await client.execute({
            sql: 'INSERT INTO tweets (id, author_id, content, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
            args: [tweetId, 'yamada_ai', 'Yamatterへようこそ。グレースケールの静かな世界で、思考を共有しましょう。']
        });
        
        console.log('  初回ツイートも投稿しました');
        
    } catch (error) {
        console.error('❌ エラーが発生しました:', error.message);
        process.exit(1);
    }
}

// 環境変数が設定されていることを確認
if (!process.env.TURSO_AUTH_TOKEN) {
    console.log('環境変数を設定してください:');
    console.log('export TURSO_AUTH_TOKEN="your-token-here"');
    process.exit(1);
}

createYamadaAccount();