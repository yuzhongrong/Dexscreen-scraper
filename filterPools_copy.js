const axios = require('axios');
const dbSingleton = require('./dbSingleton');
const fs = require('fs');

// 日志记录函数
function logError(message) {
  fs.appendFileSync('filterPools.log', `${new Date().toISOString()} - ${message}\n`);
}

// 初始化数据库表结构
async function initDatabase() {
  try {
    const pool = await dbSingleton.getMySQL();
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS token_pools (
        token_address VARCHAR(42) PRIMARY KEY,
        pools JSON NOT NULL,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        INDEX (created_at),
        INDEX (updated_at)
    `);
    
    console.log('数据库表初始化完成');
  } catch (error) {
    console.error('数据库表初始化失败:', error);
    throw error;
  }
}

// 过滤池子的函数
async function filterPools() {
  try {
    const response = await axios.get('http://127.0.0.1:5000/dex/json');
    const data = response.data;

    const filteredData = Object.entries(data.data).reduce((acc, [tokenAddress, pools]) => {
      const filteredPools = pools.filter((pool) => {
        const isPumpswap = pool.dexId === 'pumpswap' && (!pool.labels || pool.labels.length === 0);
        const isRaydiumV4 = pool.dexId === 'raydium' && (!pool.labels || pool.labels.length === 0);
        const isMeteoraDLMM = pool.dexId === 'meteora' && pool.labels?.includes('DLMM');
        const isOrcaWp = pool.dexId === 'orca' && pool.labels?.includes('wp');
        const hasSufficientLiquidity = pool.liquidity?.usd > 1000;
        return (isPumpswap || isRaydiumV4 || isMeteoraDLMM || isOrcaWp) && hasSufficientLiquidity;
      });

      const poolTypes = new Set();
      filteredPools.forEach((pool) => {
        if (pool.dexId === 'pumpswap' && (!pool.labels || pool.labels.length === 0)) poolTypes.add('Pumpswap');
        if (pool.dexId === 'raydium' && (!pool.labels || pool.labels.length === 0)) poolTypes.add('RaydiumV4');
        if (pool.dexId === 'meteora' && pool.labels?.includes('DLMM')) poolTypes.add('MeteoraDLMM');
        if (pool.dexId === 'orca' && pool.labels?.includes('wp')) poolTypes.add('OrcaWp');
      });

      if (poolTypes.size >= 2 && filteredPools.length > 0) {
        acc[tokenAddress] = filteredPools;
      }

      return acc;
    }, {});

    const result = Object.fromEntries(
      Object.entries(filteredData).filter(([_, pools]) => pools.length > 0)
    );

    return result;
  } catch (error) {
    console.error('获取或处理数据时出错:', error.message);
    logError(`获取或处理数据时出错: ${error.message}`);
    if (error.response) {
      console.error(`状态码: ${error.response.status}`);
      console.error(`数据: ${JSON.stringify(error.response.data)}`);
      logError(`状态码: ${error.response.status}, 数据: ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
}

// 将数据存储到 MySQL 和 Redis
async function storeToDatabase(result) {
  const mysqlPool = await dbSingleton.getMySQL();
  const redis = await dbSingleton.getRedis();
  const timestamp = Date.now();

  try {
    for (const [tokenAddress, pools] of Object.entries(result)) {
      // 检查是否已存在
      const [rows] = await mysqlPool.query(
        'SELECT created_at FROM token_pools WHERE token_address = ?',
        [tokenAddress]
      );

      const createdAt = rows.length > 0 ? rows[0].created_at : timestamp;
      
      // 更新 MySQL
      await mysqlPool.query(
        'INSERT INTO token_pools (token_address, pools, created_at, updated_at) ' +
        'VALUES (?, ?, ?, ?) ' +
        'ON DUPLICATE KEY UPDATE pools = ?, updated_at = ?',
        [
          tokenAddress,
          JSON.stringify(pools),
          createdAt,
          timestamp,
          JSON.stringify(pools),
          timestamp
        ]
      );

      // 更新 Redis 缓存
      await redis.set(
        `pool:${tokenAddress}`,
        JSON.stringify({
          pools,
          createdAt,
          updatedAt: timestamp
        })
      );

      console.log(`存储代币 ${tokenAddress} 的数据，createdAt: ${createdAt}, updatedAt: ${timestamp}`);
      logError(`存储代币 ${tokenAddress} 的数据，createdAt: ${createdAt}, updatedAt: ${timestamp}`);
    }
    console.log('数据存储完成。');
    logError('数据存储完成。');
  } catch (error) {
    console.error('存储到数据库时出错:', error.message);
    logError(`存储到数据库时出错: ${error.message}`);
    throw error;
  }
}

// 定时任务
async function runScheduledTask() {
  try {
    console.log('开始定时任务...');
    logError('开始定时任务...');
    const result = await filterPools();
    await storeToDatabase(result);
    console.log('定时任务完成。');
    logError('定时任务完成。');
  } catch (error) {
    console.error('定时任务失败:', error.message);
    logError(`定时任务失败: ${error.message}`);
  }
}

// 主程序入口
async function main() {
  try {
    await dbSingleton.initialize();
    await initDatabase();
    
    // 立即运行一次
    await runScheduledTask();
    
    // 设置定时任务
    setInterval(runScheduledTask, 5 * 60 * 1000);
    
    // 优雅关闭
    process.on('SIGINT', async () => {
      console.log('关闭数据库连接...');
      await dbSingleton.close();
      process.exit(0);
    });
  } catch (error) {
    console.error('主程序启动失败:', error.message);
    logError(`主程序启动失败: ${error.message}`);
    process.exit(1);
  }
}

// 导出方法供测试使用
module.exports = {
  filterPools,
  storeToDatabase,
  runScheduledTask
};

// 如果是主模块直接运行
if (require.main === module) {
  main();
}