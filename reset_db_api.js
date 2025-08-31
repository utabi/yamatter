// Tursoデータベースをリセットするスクリプト
// 環境変数から接続情報を取得して実行

const { createClient } = require('@libsql/client');

async function resetDatabase() {
    // 環境変数から接続情報を取得
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;
    
    if (!url || !authToken) {
        console.error('❌ 環境変数 TURSO_DATABASE_URL と TURSO_AUTH_TOKEN が必要です');
        console.log('\n以下のコマンドで環境変数を設定してください:');
        console.log('export TURSO_DATABASE_URL="libsql://yamatter-utabi.aws-ap-northeast-1.turso.io"');
        console.log('export TURSO_AUTH_TOKEN="your-token-here"');
        process.exit(1);
    }
    
    console.log('🔄 Tursoデータベースに接続中...');
    console.log('URL:', url);
    
    const client = createClient({
        url: url,
        authToken: authToken
    });
    
    try {
        console.log('🗑️  既存のテーブルを削除中...');
        
        // テーブルを削除（依存関係の順序で）
        await client.execute('DROP TABLE IF EXISTS mentions');
        console.log('  ✓ mentions テーブルを削除');
        
        await client.execute('DROP TABLE IF EXISTS tweets');
        console.log('  ✓ tweets テーブルを削除');
        
        await client.execute('DROP TABLE IF EXISTS users');
        console.log('  ✓ users テーブルを削除');
        
        console.log('\n✅ データベースがリセットされました！');
        console.log('\nRenderのダッシュボードで「Manual Deploy」→「Deploy latest commit」を実行してください。');
        console.log('新しいテーブルは自動的に作成されます。');
        
    } catch (error) {
        console.error('❌ エラーが発生しました:', error);
        process.exit(1);
    }
}

// 確認プロンプト
const readline = require('readline');
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log('⚠️  警告: Tursoデータベースの全データを削除しようとしています');
console.log('');
rl.question('本当に続行しますか？ (yes/no): ', (answer) => {
    if (answer.toLowerCase() === 'yes') {
        resetDatabase();
    } else {
        console.log('キャンセルしました');
        process.exit(0);
    }
    rl.close();
});