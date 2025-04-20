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
  
  // 1. 创建数据库（如果不存在）
  await pool.query(`CREATE DATABASE IF NOT EXISTS dex_pools`).catch(console.error);
  
  // 2. 切换到该数据库
  await pool.query(`USE dex_pools`);
  
    await pool.query(`
      CREATE TABLE IF NOT EXISTS token_pools (
        token_address VARCHAR(42) PRIMARY KEY,
        pools JSON NOT NULL,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        INDEX (created_at),
        INDEX (updated_at)
      )
    `);
    
    console.log('数据库表初始化完成');
    logError('数据库表初始化完成');
  } catch (error) {
    console.error('数据库表初始化失败:', error);
    logError(`数据库表初始化失败: ${error.message}`);
    throw error;
  }
}

/**
 * 从 MySQL 加载所有数据到 Redis 缓存
 */
async function loadAllToRedis() {
  const mysqlPool = await dbSingleton.getMySQL();
  const redis = await dbSingleton.getRedis();
  
  try {
    console.log('开始从 MySQL 加载数据到 Redis...');
    logError('开始从 MySQL 加载数据到 Redis...');
    
    // 1. 检查表是否存在
    const [tables] = await mysqlPool.query(
      "SHOW TABLES LIKE 'token_pools'"
    );
    
    if (tables.length === 0) {
      console.log('token_pools 表不存在，跳过数据加载');
      logError('token_pools 表不存在，跳过数据加载');
      return;
    }
    
    // 2. 获取所有数据
    const [rows] = await mysqlPool.query(
      'SELECT * FROM token_pools'
    );
    
    // 3. 批量写入 Redis
    const pipeline = redis.pipeline();
    rows.forEach(row => {
      pipeline.set(
        `pool:${row.token_address}`,
        JSON.stringify({
          pools: JSON.parse(row.pools),
          createdAt: row.created_at,
          updatedAt: row.updated_at
        }),
        'EX', 3600 * 24 // 缓存24小时
      );
    });
    
    await pipeline.exec();
    const msg = `成功加载 ${rows.length} 条数据到 Redis`;
    console.log(msg);
    logError(msg);
    
  } catch (error) {
    const errMsg = `从 MySQL 加载数据到 Redis 失败: ${error.message}`;
    console.error(errMsg);
    logError(errMsg);
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
    const errMsg = `获取或处理数据时出错: ${error.message}`;
    console.error(errMsg);
    logError(errMsg);
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
    // 使用 pipeline 批量操作
    const pipeline = redis.pipeline();
    
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

      // 添加到 Redis pipeline
      pipeline.set(
        `pool:${tokenAddress}`,
        JSON.stringify({
          pools,
          createdAt,
          updatedAt: timestamp
        }),
        'EX', 3600 * 24 // 缓存24小时
      );
    }
    
    // 执行所有 Redis 操作
    await pipeline.exec();
    
    const msg = `成功存储 ${Object.keys(result).length} 条数据到数据库和缓存`;
    console.log(msg);
    logError(msg);
  } catch (error) {
    const errMsg = `存储到数据库时出错: ${error.message}`;
    console.error(errMsg);
    logError(errMsg);
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
    const errMsg = `定时任务失败: ${error.message}`;
    console.error(errMsg);
    logError(errMsg);
  }
}

// 主程序入口
async function main() {
  try {
    await dbSingleton.initialize();
    await initDatabase();
    
    // 如果 Redis 缓存为空，从 MySQL 加载数据
    if (await dbSingleton.isCacheEmpty()) {
      console.log('检测到 Redis 缓存为空，开始从 MySQL 加载数据...');
      logError('检测到 Redis 缓存为空，开始从 MySQL 加载数据...');
      await loadAllToRedis();
    } else {
      console.log('Redis 缓存已有数据，跳过初始化加载');
      logError('Redis 缓存已有数据，跳过初始化加载');
    }
    
    // 立即运行一次
    await runScheduledTask();
    
    // 设置定时任务
    setInterval(runScheduledTask, 5 * 60 * 1000);
    
    // 优雅关闭
    process.on('SIGINT', async () => {
      console.log('关闭数据库连接...');
      logError('关闭数据库连接...');
      await dbSingleton.close();
      process.exit(0);
    });
  } catch (error) {
    const errMsg = `主程序启动失败: ${error.message}`;
    console.error(errMsg);
    logError(errMsg);
    process.exit(1);
  }
}

// 导出方法供测试使用
module.exports = {
  filterPools,
  storeToDatabase,
  runScheduledTask,
  loadAllToRedis
};

// 如果是主模块直接运行
if (require.main === module) {
  main();
}