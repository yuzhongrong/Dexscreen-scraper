const mysql = require('mysql2/promise');
const redis = require('redis');

class DbSingleton {
    constructor() {
        this.mysqlPool = null;
        this.redisClient = null;
    }

    async initialize() {
        try {
            // 初始化 MySQL 连接池
            this.mysqlPool = await mysql.createPool({
                host: 'localhost',
                user: 'root', // 替换为你的 MySQL 用户名
                password: 'Abc5341842...', // 替换为你的 MySQL 密码
                connectionLimit: 10
            });
            console.log('MySQL 连接初始化成功');

            // 初始化 Redis 客户端
            this.redisClient = redis.createClient({
                url: 'redis://localhost:6379' // 替换为你的 Redis URL
            });

            // 处理 Redis 连接错误
            this.redisClient.on('error', (err) => {
                console.error('Redis 客户端错误:', err);
            });

            // 连接到 Redis
            await this.redisClient.connect();
            console.log('Redis 连接初始化成功');

            // 测试连接
            await this.testConnections();
            console.log('数据库连接测试成功');
        } catch (error) {
            console.error('数据库连接初始化失败:', error);
            if (this.redisClient) {
                await this.redisClient.quit().catch(() => {}); // 确保 Redis 客户端关闭
            }
            if (this.mysqlPool) {
                await this.mysqlPool.end().catch(() => {}); // 确保 MySQL 连接池关闭
            }
            throw error;
        }
    }

    async testConnections() {
        try {
            // 测试 MySQL 连接
            await this.mysqlPool.query('SELECT 1');
            console.log('MySQL 连接测试通过');

            // 测试 Redis 连接
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

    async getMySQL() {
        if (!this.mysqlPool) {
            throw new Error('MySQL 连接未初始化');
        }
        return this.mysqlPool;
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
            if (this.mysqlPool) {
                await this.mysqlPool.end();
                console.log('MySQL 连接已关闭');
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