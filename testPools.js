const dbSingleton = require('./dbSingleton');
const fs = require('fs');

// 日志记录函数
function logError(message) {
  fs.appendFileSync('testDatabase.log', `${new Date().toISOString()} - ${message}\n`);
}

// 获取排序后的池子数据
async function getSortedPools(sortBy = 'created_at', limit = 10) {
  try {
    const mysqlPool = await dbSingleton.getMySQL();
    const [rows] = await mysqlPool.query(
      `SELECT * FROM token_pools ORDER BY ${sortBy} DESC LIMIT ?`,
      [limit]
    );
    const msg = `获取最新 ${rows.length} 条记录，按 ${sortBy} 排序`;
    console.log(msg);
    logError(msg);
    return rows;
  } catch (error) {
    const errMsg = `查询失败: ${error.message}`;
    console.error(errMsg);
    logError(errMsg);
    throw error;
  }
}

// 从缓存获取单个池子数据
async function getPoolFromCache(tokenAddress) {
  try {
    const redis = await dbSingleton.getRedis();
    const cached = await redis.get(`pool:${tokenAddress}`);
    if (cached) {
      const msg = `从缓存获取 ${tokenAddress}`;
      console.log(msg);
      logError(msg);
      return JSON.parse(cached);
    }
    
    // 缓存未命中，从数据库获取
    const mysqlPool = await dbSingleton.getMySQL();
    const [rows] = await mysqlPool.query(
      'SELECT * FROM token_pools WHERE token_address = ?',
      [tokenAddress]
    );
    
    if (rows.length > 0) {
      // 更新缓存
      await redis.set(
        `pool:${tokenAddress}`,
        JSON.stringify(rows[0]),
        'EX', 3600 // 1小时过期
      );
      return rows[0];
    }
    return null;
  } catch (error) {
    const errMsg = `查询失败: ${error.message}`;
    console.error(errMsg);
    logError(errMsg);
    throw error;
  }
}

// 测试函数
async function runTests() {
  try {
    console.log('测试1: 获取最新创建的池子');
    logError('测试1: 获取最新创建的池子');
    const latestCreated = await getSortedPools('created_at', 5);
    console.log(latestCreated);

    console.log('\n测试2: 获取最近更新的池子');
    logError('测试2: 获取最近更新的池子');
    const latestUpdated = await getSortedPools('updated_at', 5);
    console.log(latestUpdated);

    console.log('\n测试3: 从缓存获取池子');
    logError('测试3: 从缓存获取池子');
    if (latestCreated.length > 0) {
      const cachedPool = await getPoolFromCache(latestCreated[0].token_address);
      console.log(cachedPool);
    }
  } catch (error) {
    const errMsg = `测试失败: ${error.message}`;
    console.error(errMsg);
    logError(errMsg);
  }
}

// 主函数
async function main() {
  try {
    await dbSingleton.initialize();
    await runTests();
    await dbSingleton.close();
  } catch (error) {
    const errMsg = `主程序错误: ${error.message}`;
    console.error(errMsg);
    logError(errMsg);
    process.exit(1);
  }
}

main();