const { createClient } = require('@libsql/client');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { promisify } = require('util');
const { v4: uuidv4 } = require('uuid');

class Database {
    constructor() {
        // Tursoを使うか、ローカルSQLiteを使うか判定
        if (process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) {
            // Tursoを使用
            this.useTurso = true;
            console.log('Turso database URL:', process.env.TURSO_DATABASE_URL);
            console.log('Turso auth token exists:', !!process.env.TURSO_AUTH_TOKEN);
            
            try {
                this.client = createClient({
                    url: process.env.TURSO_DATABASE_URL,
                    authToken: process.env.TURSO_AUTH_TOKEN
                });
                console.log('Using Turso database - client created');
            } catch (err) {
                console.error('Failed to create Turso client:', err);
                throw err;
            }
        } else {
            // ローカルSQLiteを使用
            this.useTurso = false;
            this.dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../database/yamada_twitter.db');
            this.db = null;
            console.log('Using local SQLite database');
            if (!process.env.TURSO_DATABASE_URL) {
                console.log('TURSO_DATABASE_URL not set');
            }
            if (!process.env.TURSO_AUTH_TOKEN) {
                console.log('TURSO_AUTH_TOKEN not set');
            }
        }
    }
    
    async init() {
        if (this.useTurso) {
            // Tursoの場合は接続確認とテーブル作成
            try {
                await this.client.execute('SELECT 1');
                console.log('Connected to Turso database');
                
                // テーブル作成を確実に実行
                console.log('Creating tables if not exist...');
                await this.createTables();
                console.log('Tables created/verified');
                
                // 既存データのマイグレーション（テーブルが空の場合はスキップ）
                try {
                    await this.migrateExistingMentions();
                } catch (migrationErr) {
                    console.log('Migration skipped or completed:', migrationErr.message);
                }
            } catch (err) {
                console.error('Turso initialization error:', err);
                throw err;
            }
        } else {
            // ローカルSQLiteの初期化（既存のコード）
            return new Promise((resolve, reject) => {
                const fs = require('fs');
                const dbDir = path.dirname(this.dbPath);
                
                console.log('Database path:', this.dbPath);
                console.log('Database directory:', dbDir);
                
                try {
                    if (!fs.existsSync(dbDir)) {
                        fs.mkdirSync(dbDir, { recursive: true });
                        console.log('Created database directory:', dbDir);
                    }
                } catch (err) {
                    console.warn('Could not create directory:', err.message);
                }
                
                this.db = new sqlite3.Database(this.dbPath, (err) => {
                    if (err) {
                        console.error('Database connection error:', err);
                        reject(err);
                        return;
                    }
                    
                    console.log('Connected to SQLite database:', this.dbPath);
                    this.createTables()
                        .then(() => this.migrateExistingMentions())
                        .then(resolve)
                        .catch(reject);
                });
            });
        }
    }
    
    // SQL実行の統一インターフェース
    async run(sql, params = []) {
        if (this.useTurso) {
            try {
                const result = await this.client.execute({
                    sql: sql,
                    args: params
                });
                return result;
            } catch (err) {
                console.error('Turso execute error:', err);
                throw err;
            }
        } else {
            return new Promise((resolve, reject) => {
                this.db.run(sql, params, function(err) {
                    if (err) reject(err);
                    else resolve({ lastID: this.lastID, changes: this.changes });
                });
            });
        }
    }
    
    // SELECTクエリの統一インターフェース
    async all(sql, params = []) {
        if (this.useTurso) {
            try {
                const result = await this.client.execute({
                    sql: sql,
                    args: params
                });
                return result.rows;
            } catch (err) {
                console.error('Turso query error:', err);
                throw err;
            }
        } else {
            return new Promise((resolve, reject) => {
                this.db.all(sql, params, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });
        }
    }
    
    // 単一行取得の統一インターフェース
    async get(sql, params = []) {
        if (this.useTurso) {
            try {
                const result = await this.client.execute({
                    sql: sql,
                    args: params
                });
                return result.rows[0] || null;
            } catch (err) {
                console.error('Turso get error:', err);
                throw err;
            }
        } else {
            return new Promise((resolve, reject) => {
                this.db.get(sql, params, (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });
        }
    }
    
    async createTables() {
        console.log('Starting table creation...');
        
        const tables = [
            // ユーザーテーブル
            `CREATE TABLE IF NOT EXISTS users (
                device_id TEXT PRIMARY KEY,
                nickname TEXT UNIQUE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            
            // ツイートテーブル
            `CREATE TABLE IF NOT EXISTS tweets (
                id TEXT PRIMARY KEY,
                author_id TEXT NOT NULL,
                content TEXT NOT NULL,
                reply_to_id TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (author_id) REFERENCES users(device_id)
            )`,
            
            // メンションテーブル
            `CREATE TABLE IF NOT EXISTS mentions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tweet_id TEXT NOT NULL,
                mentioned_user TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tweet_id) REFERENCES tweets(id) ON DELETE CASCADE
            )`
        ];
        
        for (const table of tables) {
            try {
                await this.run(table);
                console.log('Table created/verified:', table.match(/CREATE TABLE IF NOT EXISTS (\w+)/)[1]);
            } catch (err) {
                console.error('Error creating table:', err);
                throw err;
            }
        }
        
        // インデックスの作成
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_tweets_author ON tweets(author_id)',
            'CREATE INDEX IF NOT EXISTS idx_tweets_reply_to ON tweets(reply_to_id)',
            'CREATE INDEX IF NOT EXISTS idx_tweets_created ON tweets(created_at)',
            'CREATE INDEX IF NOT EXISTS idx_mentions_user ON mentions(mentioned_user)',
            'CREATE INDEX IF NOT EXISTS idx_mentions_tweet ON mentions(tweet_id)'
        ];
        
        for (const index of indexes) {
            try {
                await this.run(index);
                console.log('Index created/verified:', index.match(/CREATE INDEX IF NOT EXISTS (\w+)/)[1]);
            } catch (err) {
                console.error('Error creating index:', err);
                // インデックスのエラーは無視（テーブルが存在すれば問題ない）
            }
        }
        
        console.log('All tables and indexes created/verified');
    }
    
    async migrateExistingMentions() {
        try {
            // 既存のツイートからメンションを抽出して mentions テーブルに追加
            const tweets = await this.all('SELECT id, content FROM tweets WHERE content LIKE "%@%"');
            
            for (const tweet of tweets) {
                const mentions = this.extractMentions(tweet.content);
                for (const mention of mentions) {
                    // 重複チェック
                    const existing = await this.get(
                        'SELECT id FROM mentions WHERE tweet_id = ? AND mentioned_user = ?',
                        [tweet.id, mention]
                    );
                    
                    if (!existing) {
                        await this.run(
                            'INSERT INTO mentions (tweet_id, mentioned_user) VALUES (?, ?)',
                            [tweet.id, mention]
                        );
                    }
                }
            }
            
            console.log('Mention migration completed');
        } catch (err) {
            console.error('Mention migration error:', err);
        }
    }
    
    extractMentions(content) {
        const mentionRegex = /@([^\s@]+)/g;
        const mentions = [];
        let match;
        
        while ((match = mentionRegex.exec(content)) !== null) {
            mentions.push(match[1]);
        }
        
        return mentions;
    }
    
    // ユーザー作成または更新
    async createOrUpdateUser(deviceId, nickname = null) {
        const existingUser = await this.get(
            'SELECT * FROM users WHERE device_id = ?',
            [deviceId]
        );
        
        if (existingUser) {
            if (nickname && nickname !== existingUser.nickname) {
                await this.run(
                    'UPDATE users SET nickname = ?, last_seen = CURRENT_TIMESTAMP WHERE device_id = ?',
                    [nickname, deviceId]
                );
                return { ...existingUser, nickname };
            }
            
            await this.run(
                'UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE device_id = ?',
                [deviceId]
            );
            return existingUser;
        } else {
            const finalNickname = nickname || `user_${deviceId.substring(0, 8)}`;
            await this.run(
                'INSERT INTO users (device_id, nickname) VALUES (?, ?)',
                [deviceId, finalNickname]
            );
            return { device_id: deviceId, nickname: finalNickname };
        }
    }
    
    // ニックネームの更新
    async updateNickname(deviceId, newNickname) {
        const existing = await this.get(
            'SELECT device_id FROM users WHERE nickname = ? AND device_id != ?',
            [newNickname, deviceId]
        );
        
        if (existing) {
            throw new Error('このニックネームは既に使用されています');
        }
        
        await this.run(
            'UPDATE users SET nickname = ? WHERE device_id = ?',
            [newNickname, deviceId]
        );
        
        return true;
    }
    
    // ツイート作成
    async createTweet(authorId, content, replyToId = null) {
        const tweetId = uuidv4();
        
        await this.run(
            'INSERT INTO tweets (id, author_id, content, reply_to_id) VALUES (?, ?, ?, ?)',
            [tweetId, authorId, content, replyToId]
        );
        
        // メンションを抽出して保存
        const mentions = this.extractMentions(content);
        for (const mention of mentions) {
            await this.run(
                'INSERT INTO mentions (tweet_id, mentioned_user) VALUES (?, ?)',
                [tweetId, mention]
            );
        }
        
        return tweetId;
    }
    
    // ツイート削除
    async deleteTweet(tweetId, authorId) {
        const tweet = await this.get(
            'SELECT author_id FROM tweets WHERE id = ?',
            [tweetId]
        );
        
        if (!tweet) {
            throw new Error('ツイートが見つかりません');
        }
        
        if (tweet.author_id !== authorId) {
            throw new Error('自分のツイートのみ削除できます');
        }
        
        await this.run('DELETE FROM tweets WHERE id = ?', [tweetId]);
        return true;
    }
    
    // 単一ツイート取得
    async getTweet(tweetId) {
        const tweet = await this.get(
            `SELECT t.*, u.nickname as author_nickname 
             FROM tweets t 
             JOIN users u ON t.author_id = u.device_id 
             WHERE t.id = ?`,
            [tweetId]
        );
        
        return tweet;
    }
    
    // ツイート取得（最新順）
    async getTweets(limit = 50, offset = 0) {
        const tweets = await this.all(
            `SELECT t.*, u.nickname as author_nickname 
             FROM tweets t 
             JOIN users u ON t.author_id = u.device_id 
             ORDER BY t.created_at DESC 
             LIMIT ? OFFSET ?`,
            [limit, offset]
        );
        
        return tweets;
    }
    
    // 返信一覧取得
    async getReplies(tweetId, limit = 50) {
        const replies = await this.all(
            `SELECT t.*, u.nickname as author_nickname 
             FROM tweets t 
             JOIN users u ON t.author_id = u.device_id 
             WHERE t.reply_to_id = ? 
             ORDER BY t.created_at ASC
             LIMIT ?`,
            [tweetId, limit]
        );
        
        return replies;
    }
    
    // 返信を含むツイート詳細取得
    async getTweetWithReplies(tweetId) {
        const tweet = await this.get(
            `SELECT t.*, u.nickname as author_nickname 
             FROM tweets t 
             JOIN users u ON t.author_id = u.device_id 
             WHERE t.id = ?`,
            [tweetId]
        );
        
        if (!tweet) return null;
        
        const replies = await this.all(
            `SELECT t.*, u.nickname as author_nickname 
             FROM tweets t 
             JOIN users u ON t.author_id = u.device_id 
             WHERE t.reply_to_id = ? 
             ORDER BY t.created_at ASC`,
            [tweetId]
        );
        
        return { ...tweet, replies };
    }
    
    // ユーザーの返信のみ取得
    async getUserReplies(authorId, limit = 50) {
        const replies = await this.all(
            `SELECT t.*, u.nickname as author_nickname 
             FROM tweets t 
             JOIN users u ON t.author_id = u.device_id 
             WHERE t.author_id = ? AND t.reply_to_id IS NOT NULL
             ORDER BY t.created_at DESC 
             LIMIT ?`,
            [authorId, limit]
        );
        
        return replies;
    }
    
    // ユーザーのツイート取得
    async getUserTweets(identifier, limit = 50, offset = 0, includeReplies = false) {
        // identifierがdevice_idかnicknameかを判定
        const user = await this.get(
            'SELECT * FROM users WHERE device_id = ? OR nickname = ?',
            [identifier, identifier]
        );
        
        if (!user) return [];
        
        let query = `
            SELECT t.*, u.nickname as author_nickname 
            FROM tweets t 
            JOIN users u ON t.author_id = u.device_id 
            WHERE t.author_id = ?
        `;
        
        if (!includeReplies) {
            query += ' AND t.reply_to_id IS NULL';
        }
        
        query += ' ORDER BY t.created_at DESC LIMIT ? OFFSET ?';
        
        return await this.all(query, [user.device_id, limit, offset]);
    }
    
    // メンションと返信を取得
    async getMentionsAndReplies(userIdentifier, limit = 50) {
        // userIdentifierはnicknameまたはdevice_idの可能性がある
        const tweets = await this.all(
            `SELECT DISTINCT t.*, u.nickname as author_nickname 
             FROM tweets t 
             JOIN users u ON t.author_id = u.device_id 
             LEFT JOIN mentions m ON t.id = m.tweet_id 
             WHERE m.mentioned_user = ? 
                OR t.reply_to_id IN (
                    SELECT id FROM tweets WHERE author_id = (
                        SELECT device_id FROM users WHERE nickname = ? OR device_id = ?
                    )
                )
             ORDER BY t.created_at DESC 
             LIMIT ?`,
            [userIdentifier, userIdentifier, userIdentifier, limit]
        );
        
        return tweets;
    }
    
    // メンション付きツイート取得
    async getMentionedTweets(nickname, limit = 50, offset = 0) {
        const tweets = await this.all(
            `SELECT DISTINCT t.*, u.nickname as author_nickname 
             FROM tweets t 
             JOIN users u ON t.author_id = u.device_id 
             JOIN mentions m ON t.id = m.tweet_id 
             WHERE m.mentioned_user = ? 
             ORDER BY t.created_at DESC 
             LIMIT ? OFFSET ?`,
            [nickname, limit, offset]
        );
        
        return tweets;
    }
    
    // ユーザー情報取得
    async getUser(identifier) {
        return await this.get(
            'SELECT * FROM users WHERE device_id = ? OR nickname = ?',
            [identifier, identifier]
        );
    }
    
    // データベースクローズ
    close() {
        if (this.useTurso) {
            // Tursoクライアントのクローズは不要
            console.log('Turso connection closed');
        } else if (this.db) {
            this.db.close((err) => {
                if (err) {
                    console.error('Error closing database:', err);
                } else {
                    console.log('Database connection closed');
                }
            });
        }
    }
}

module.exports = Database;