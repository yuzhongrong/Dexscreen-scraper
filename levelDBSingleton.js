const { Level } = require('level');
const path = require('path');
const fs = require('fs');

class LevelDBSingleton {
  static instance = null;
  db = null;
  dbPath = path.resolve(__dirname, 'tokenPoolsDB');
  logFile = path.resolve(__dirname, 'levelDB.log');

  constructor() {
    if (LevelDBSingleton.instance) {
      return LevelDBSingleton.instance;
    }
    LevelDBSingleton.instance = this;
  }

  // 日志记录函数
  logError(message) {
    fs.appendFileSync(this.logFile, `${new Date().toISOString()} - ${message}\n`);
  }

  // 初始化并打开数据库
  async initialize() {
    try {
      if (!this.db || this.db.status !== 'open') {
        this.logError(`数据库未打开或未初始化，正在初始化... 路径: ${this.dbPath}`);
        this.db = new Level(this.dbPath, { valueEncoding: 'json' });
        await this.db.open();
        this.logError(`成功初始化 LevelDB，路径: ${this.dbPath}, 状态: ${this.db.status}`);
      }
      return this.db;
    } catch (error) {
      this.logError(`无法初始化 LevelDB: ${error.message}`);
      throw error;
    }
  }

  // 获取数据库实例（确保打开）
  async getDB() {
    try {
      if (!this.db || this.db.status !== 'open') {
        await this.initialize();
      }
      return this.db;
    } catch (error) {
      this.logError(`获取数据库实例失败: ${error.message}`);
      throw error;
    }
  }

  // 关闭数据库
  async close() {
    try {
      if (this.db && this.db.status === 'open') {
        await this.db.close();
        this.logError(`数据库已关闭，路径: ${this.dbPath}`);
        this.db = null;
      }
    } catch (error) {
      this.logError(`关闭数据库失败: ${error.message}`);
      throw error;
    }
  }
}

// 导出单例实例
module.exports = new LevelDBSingleton();