const mysql = require('mysql2/promise');
const redis = require('redis');
const { promisify } = require('util');

class DBSingleton {
  constructor() {
    if (DBSingleton.instance) {
      return DBSingleton.instance;
    }

    this.mysqlPool = null;
    this.redisClient = null;
    this.redisAsync = null;
    
    DBSingleton.instance = this;
  }

  async initialize() {
    // MySQL 连接池配置
    this.mysqlPool = mysql.createPool({
      host: process.env.MYSQL_HOST || 'localhost',
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'dex_pools',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });

    // Redis 客户端配置
    this.redisClient = redis.createClient({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379
    });

    // Promisify Redis 方法
    this.redisAsync = {
      get: promisify(this.redisClient.get).bind(this.redisClient),
      set: promisify(this.redisClient.set).bind(this.redisClient),
      del: promisify(this.redisClient.del).bind(this.redisClient),
      keys: promisify(this.redisClient.keys).bind(this.redisClient),
      quit: promisify(this.redisClient.quit).bind(this.redisClient),
      pipeline: () => this.redisClient.pipeline()
    };

    // 测试连接
    await this.testConnections();
  }

  async testConnections() {
    try {
      const conn = await this.mysqlPool.getConnection();
      conn.release();
      await this.redisAsync.get('test');
    } catch (error) {
      console.error('数据库连接测试失败:', error);
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
    if (!this.redisAsync) {
      throw new Error('Redis 连接未初始化');
    }
    return this.redisAsync;
  }

  async isCacheEmpty() {
    try {
      const redis = await this.getRedis();
      const keys = await redis.keys('pool:*');
      return keys.length === 0;
    } catch (error) {
      console.error('检查缓存状态失败:', error);
      return true;
    }
  }

  async close() {
    if (this.mysqlPool) {
      await this.mysqlPool.end();
      this.mysqlPool = null;
    }
    
    if (this.redisClient) {
      await this.redisAsync.quit();
      this.redisClient = null;
      this.redisAsync = null;
    }
  }
}

// 导出单例实例
const dbSingleton = new DBSingleton();
module.exports = dbSingleton;