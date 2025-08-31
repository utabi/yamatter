const express = require('express');
const { body, validationResult, param, query } = require('express-validator');

class TwitterAPI {
    constructor(database, io) {
        this.db = database;
        this.io = io;
        this.router = express.Router();
        this.setupRoutes();
    }
    
    setupRoutes() {
        // ツイート一覧取得
        this.router.get('/', [
            query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
            query('offset').optional().isInt({ min: 0 }).toInt(),
            query('hashtag').optional().isString().trim()
        ], this.getTweets.bind(this));
        
        // 特定ツイート取得
        this.router.get('/:id', [
            param('id').isUUID()
        ], this.getTweet.bind(this));
        
        // ツイート投稿
        this.router.post('/', [
            body('content')
                .isString()
                .trim()
                .isLength({ min: 1, max: 280 })
                .withMessage('Content must be 1-280 characters'),
            body('authorId')
                .isString()
                .notEmpty()
                .withMessage('Author ID is required'),
            body('author')
                .isString()
                .trim()
                .isLength({ min: 1, max: 20 })
                .withMessage('Author name must be 1-20 characters')
        ], this.createTweet.bind(this));
        
        // ユーザーのツイート取得
        this.router.get('/user/:userId', [
            param('userId').isString().notEmpty(),
            query('limit').optional().isInt({ min: 1, max: 100 }).toInt()
        ], this.getUserTweets.bind(this));
        
        // ユーザーの返信のみ取得
        this.router.get('/user/:userId/replies', [
            param('userId').isString().notEmpty(),
            query('limit').optional().isInt({ min: 1, max: 100 }).toInt()
        ], this.getUserReplies.bind(this));
        
        // メンション&返信されたツイート取得
        this.router.get('/mentions/:userId', [
            param('userId').isString().notEmpty(),
            query('limit').optional().isInt({ min: 1, max: 100 }).toInt()
        ], this.getMentions.bind(this));
        
        // いいね/リツイート
        this.router.post('/:id/action', [
            param('id').isUUID(),
            body('action')
                .isIn(['like', 'retweet'])
                .withMessage('Action must be like or retweet'),
            body('userDeviceId')
                .isString()
                .notEmpty()
                .withMessage('User device ID is required')
        ], this.tweetAction.bind(this));
        
        // ハッシュタグ検索
        this.router.get('/search/hashtag/:tag', [
            param('tag').isString().matches(/^#?[^#\s]+$/),
            query('limit').optional().isInt({ min: 1, max: 100 }).toInt()
        ], this.searchByHashtag.bind(this));
        
        // 人気ハッシュタグ
        this.router.get('/hashtags/trending', [
            query('limit').optional().isInt({ min: 1, max: 50 }).toInt()
        ], this.getTrendingHashtags.bind(this));
        
        // 返信一覧取得
        this.router.get('/:id/replies', [
            param('id').isUUID(),
            query('limit').optional().isInt({ min: 1, max: 100 }).toInt()
        ], this.getReplies.bind(this));
        
        // 返信投稿
        this.router.post('/:id/replies', [
            param('id').isUUID(),
            body('content')
                .isString()
                .trim()
                .isLength({ min: 1, max: 280 })
                .withMessage('Content must be 1-280 characters'),
            body('authorId')
                .isString()
                .notEmpty()
                .withMessage('Author ID is required'),
            body('author')
                .isString()
                .trim()
                .isLength({ min: 1, max: 20 })
                .withMessage('Author name must be 1-20 characters')
        ], this.createReply.bind(this));
        
        // ツイート削除
        this.router.delete('/:id', [
            param('id').isUUID(),
            body('authorId')
                .isString()
                .notEmpty()
                .withMessage('Author ID is required')
        ], this.deleteTweet.bind(this));
    }
    
    // ツイート一覧取得
    async getTweets(req, res) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }
            
            const { limit = 50, offset = 0, hashtag } = req.query;
            
            let tweets;
            if (hashtag) {
                const cleanTag = hashtag.startsWith('#') ? hashtag : '#' + hashtag;
                tweets = await this.db.searchTweetsByHashtag(cleanTag, limit);
            } else {
                tweets = await this.db.getTweets(limit, offset);
            }
            
            res.json({
                success: true,
                data: tweets,
                pagination: {
                    limit,
                    offset,
                    hasMore: tweets.length === limit
                }
            });
            
        } catch (error) {
            console.error('Get tweets error:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to retrieve tweets' 
            });
        }
    }
    
    // 特定ツイート取得
    async getTweet(req, res) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }
            
            const { id } = req.params;
            const tweet = await this.db.getTweet(id);
            
            if (!tweet) {
                return res.status(404).json({ 
                    success: false, 
                    error: 'Tweet not found' 
                });
            }
            
            res.json({ success: true, data: tweet });
            
        } catch (error) {
            console.error('Get tweet error:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to retrieve tweet' 
            });
        }
    }
    
    // ツイート投稿
    async createTweet(req, res) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }
            
            const { content, authorId, author } = req.body;
            
            // XSS対策: HTMLエスケープ
            const sanitizedContent = this.escapeHtml(content);
            
            // スパム対策: 同一内容の連投チェック
            const recentTweets = await this.db.getUserTweets(authorId, 5);
            const isDuplicate = recentTweets.some(tweet => 
                tweet.content === sanitizedContent && 
                (Date.now() - new Date(tweet.created_at).getTime()) < 60000 // 1分以内
            );
            
            if (isDuplicate) {
                return res.status(429).json({ 
                    success: false, 
                    error: 'Duplicate tweet detected. Please wait before posting the same content.' 
                });
            }
            
            // ユーザー作成または更新
            await this.db.createOrUpdateUser(authorId, author);
            
            // ツイート作成（正しいシグネチャで呼び出し）
            const tweetId = await this.db.createTweet(authorId, sanitizedContent);
            
            // 作成したツイートを取得
            const tweet = await this.db.get(
                `SELECT t.*, u.nickname as author_nickname 
                 FROM tweets t 
                 JOIN users u ON t.author_id = u.device_id 
                 WHERE t.id = ?`,
                [tweetId]
            );
            
            // WebSocketで全クライアントに配信（認証済みユーザーのみ）
            this.io.to('authenticated').emit('newTweet', tweet);
            
            res.status(201).json({ 
                success: true, 
                data: tweet,
                message: 'Tweet created successfully' 
            });
            
        } catch (error) {
            console.error('Create tweet error:', error);
            console.error('Error details:', {
                message: error.message,
                stack: error.stack,
                authorId: req.body?.authorId,
                content: req.body?.content
            });
            res.status(500).json({ 
                success: false, 
                error: 'Failed to create tweet',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
    
    // ユーザーツイート取得
    async getUserTweets(req, res) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }
            
            const { userId } = req.params;
            const { limit = 50 } = req.query;
            
            // nicknameの場合はdevice_idに変換
            let actualUserId = userId;
            const user = await this.db.get(
                'SELECT device_id FROM users WHERE nickname = ?',
                [userId]
            );
            if (user) {
                actualUserId = user.device_id;
            }
            
            const tweets = await this.db.getUserTweets(actualUserId, limit);
            
            res.json({ 
                success: true, 
                data: tweets,
                user: userId
            });
            
        } catch (error) {
            console.error('Get user tweets error:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to retrieve user tweets' 
            });
        }
    }
    
    // ユーザーの返信のみ取得
    async getUserReplies(req, res) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }
            
            const { userId } = req.params;
            const { limit = 50 } = req.query;
            
            // nicknameの場合はdevice_idに変換
            let actualUserId = userId;
            const user = await this.db.get(
                'SELECT device_id FROM users WHERE nickname = ?',
                [userId]
            );
            if (user) {
                actualUserId = user.device_id;
            }
            
            // ユーザーが投稿した返信を取得
            const replies = await this.db.getUserReplies(actualUserId, limit);
            
            res.json({ 
                success: true, 
                data: replies,
                user: userId
            });
            
        } catch (error) {
            console.error('Get user replies error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to retrieve user replies'
            });
        }
    }
    
    // メンション&返信されたツイート取得
    async getMentions(req, res) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }
            
            const { userId } = req.params;
            const { limit = 50 } = req.query;
            
            // ユーザー名を取得してメンション検索
            const mentions = await this.db.getMentionsAndReplies(userId, limit);
            
            res.json({ 
                success: true, 
                data: mentions,
                user: userId
            });
            
        } catch (error) {
            console.error('Get mentions error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to retrieve mentions'
            });
        }
    }
    
    // いいね/リツイートアクション
    async tweetAction(req, res) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }
            
            const { id } = req.params;
            const { action, userDeviceId } = req.body;
            
            // ツイートの存在確認
            const tweet = await this.db.getTweet(id);
            if (!tweet) {
                return res.status(404).json({ 
                    success: false, 
                    error: 'Tweet not found' 
                });
            }
            
            // アクション実行
            const result = await this.db.updateTweetAction(id, action, userDeviceId);
            
            // WebSocketで全クライアントに配信
            this.io.to('authenticated').emit('tweetAction', {
                tweetId: id,
                action: result.action,
                tweet: result.tweet
            });
            
            res.json({ 
                success: true, 
                data: result,
                message: `Tweet ${result.action} successfully` 
            });
            
        } catch (error) {
            console.error('Tweet action error:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to perform tweet action' 
            });
        }
    }
    
    // ハッシュタグ検索
    async searchByHashtag(req, res) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }
            
            const { tag } = req.params;
            const { limit = 50 } = req.query;
            
            const cleanTag = tag.startsWith('#') ? tag : '#' + tag;
            const tweets = await this.db.searchTweetsByHashtag(cleanTag, limit);
            
            res.json({ 
                success: true, 
                data: tweets,
                hashtag: cleanTag,
                count: tweets.length
            });
            
        } catch (error) {
            console.error('Hashtag search error:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to search by hashtag' 
            });
        }
    }
    
    // 人気ハッシュタグ取得
    async getTrendingHashtags(req, res) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }
            
            const { limit = 20 } = req.query;
            const hashtags = await this.db.getPopularHashtags(limit);
            
            res.json({ 
                success: true, 
                data: hashtags
            });
            
        } catch (error) {
            console.error('Get trending hashtags error:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to retrieve trending hashtags' 
            });
        }
    }
    
    // 返信一覧取得
    async getReplies(req, res) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }
            
            const { id } = req.params;
            const { limit = 50 } = req.query;
            
            // ツイートの存在確認
            const tweet = await this.db.getTweet(id);
            if (!tweet) {
                return res.status(404).json({ 
                    success: false, 
                    error: 'Tweet not found' 
                });
            }
            
            const replies = await this.db.getReplies(id, limit);
            
            res.json({ 
                success: true, 
                data: replies,
                tweetId: id,
                count: replies.length
            });
            
        } catch (error) {
            console.error('Get replies error:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to retrieve replies' 
            });
        }
    }
    
    // 返信投稿
    async createReply(req, res) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }
            
            const { id } = req.params;
            const { content, authorId, author } = req.body;
            
            // ツイートの存在確認
            const tweet = await this.db.getTweet(id);
            if (!tweet) {
                return res.status(404).json({ 
                    success: false, 
                    error: 'Tweet not found' 
                });
            }
            
            // XSS対策: HTMLエスケープ
            const sanitizedContent = this.escapeHtml(content);
            
            // ユーザー作成または更新
            await this.db.createOrUpdateUser(authorId, author);
            
            // 返信作成（正しいシグネチャで呼び出し）
            const replyId = await this.db.createTweet(authorId, sanitizedContent, id);
            
            // 作成した返信を取得
            const reply = await this.db.get(
                `SELECT t.*, u.nickname as author_nickname 
                 FROM tweets t 
                 JOIN users u ON t.author_id = u.device_id 
                 WHERE t.id = ?`,
                [replyId]
            );
            
            // WebSocketで全クライアントに配信
            this.io.to('authenticated').emit('newReply', {
                tweetId: id,
                reply: reply
            });
            
            res.status(201).json({ 
                success: true, 
                data: reply,
                message: 'Reply created successfully' 
            });
            
        } catch (error) {
            console.error('Create reply error:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to create reply' 
            });
        }
    }
    
    // HTMLエスケープ（XSS対策）
    async deleteTweet(req, res) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ 
                    success: false, 
                    errors: errors.array() 
                });
            }
            
            const { id } = req.params;
            const { authorId } = req.body;
            
            // ツイートの所有者確認
            const tweet = await this.db.getTweet(id);
            if (!tweet) {
                return res.status(404).json({ 
                    success: false, 
                    error: 'Tweet not found' 
                });
            }
            
            if (tweet.author_id !== authorId) {
                return res.status(403).json({ 
                    success: false, 
                    error: 'Unauthorized to delete this tweet' 
                });
            }
            
            // 削除実行（論理削除）
            await this.db.deleteTweet(id);
            
            // WebSocket通知
            this.io.emit('tweetDeleted', { tweetId: id });
            
            res.json({ 
                success: true, 
                message: 'Tweet deleted successfully' 
            });
            
        } catch (error) {
            console.error('Delete tweet error:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to delete tweet' 
            });
        }
    }
    
    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, (m) => map[m]);
    }
}

module.exports = TwitterAPI;