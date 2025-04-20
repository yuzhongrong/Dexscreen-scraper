const { MongoClient } = require('mongodb');
const redis = require('redis');

class DbSingleton {
    constructor() {
        this.mongoClient = null;
        this.mongoDb = null;
        this.redisClient = null;
    }

    async initialize() {
        try {
            // 初始化 MongoDB
            this.mongoClient = new MongoClient('mongodb://localhost:27017');
            await this.mongoClient.connect();
            this.mongoDb = this.mongoClient.db('dex_pools');
            console.log('MongoDB 连接初始化成功');

            // 初始化 Redis
            this.redisClient = redis.createClient({
                url: 'redis://localhost:6379' // 替换为你的 Redis URL
            });

            this.redisClient.on('error', (err) => {
                console.error('Redis 客户端错误:', err);
            });

            await this.redisClient.connect();
            console.log('Redis 连接初始化成功');

            // 测试连接
            await this.testConnections();
            console.log('数据库连接测试成功');
        } catch (error) {
            console.error('数据库连接初始化失败:', error);
            await this.close();
            throw error;
        }
    }

    async testConnections() {
        try {
            // 测试 MongoDB
            await this.mongoDb.command({ ping: 1 });
            console.log('MongoDB 连接测试通过');

            // 测试 Redis
            if (!this.redisClient.isOpen) {
                throw new Error('Redis 客户端未连接');
            }
            await this.redisClient.set('test', 'ok', { EX: 10 });
            const value = await this.redisClient.get('test');
            if (value !== 'ok') {
                throw new Error('Redis 测试失败');
            }
            console.log('Redis 连接测试通过');
        } catch (error) {
            console.error('连接测试失败:', error);
            throw error;
        }
    }

    async getMongoDb() {
        if (!this.mongoDb) {
            throw new Error('MongoDB 连接未初始化');
        }
        return this.mongoDb;
    }

    async getRedis() {
        if (!this.redisClient || !this.redisClient.isOpen) {
            throw new Error('Redis 连接未初始化或已关闭');
        }
        return this.redisClient;
    }

    async isCacheEmpty() {
        try {
            const keys = await this.redisClient.keys('pool:*');
            return keys.length === 0;
        } catch (error) {
            console.error('检查 Redis 缓存失败:', error);
            throw error;
        }
    }

    async close() {
        try {
            if (this.mongoClient) {
                await this.mongoClient.close();
                console.log('MongoDB 连接已关闭');
            }
            if (this.redisClient && this.redisClient.isOpen) {
                await this.redisClient.quit();
                console.log('Redis 连接已关闭');
            }
        } catch (error) {
            console.error('关闭连接时出错:', error);
        }
    }
}

module.exports = new DbSingleton();