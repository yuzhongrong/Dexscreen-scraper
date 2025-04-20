const axios = require('axios');
const { Level } = require('level');
const path = require('path');
const fs = require('fs');

// 使用绝对路径避免工作目录问题
const dbPath = path.resolve(__dirname, 'tokenPoolsDB');
let db;

// 日志记录函数
function logError(message) {
  fs.appendFileSync('filterPools.log', `${new Date().toISOString()} - ${message}\n`);
}

// 初始化 LevelDB
async function initializeDB() {
  try {
    if (!db || db.status !== 'open') {
      console.log('数据库未打开或未初始化，正在初始化...');
      db = new Level(dbPath, { valueEncoding: 'json' });
      await db.open();
    }
    console.log('成功初始化 LevelDB，路径:', dbPath);
    logError(`成功初始化 LevelDB，路径: ${dbPath}, 状态: ${db.status}`);
    return db;
  } catch (error) {
    console.error('无法初始化 LevelDB:', error.message);
    logError(`无法初始化 LevelDB: ${error.message}`);
    throw error;
  }
}

// 检查数据库状态并重新初始化（如果需要）
async function ensureDBOpen() {
  try {
    if (!db || db.status !== 'open') {
      await initializeDB();
    }
    return db;
  } catch (error) {
    console.error('检查或初始化数据库失败:', error.message);
    logError(`检查或初始化数据库失败: ${error.message}`);
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

// 将数据存储到 LevelDB，保留 createdAt 时间戳
async function storeToLevelDB(result) {
  try {
    await ensureDBOpen();
    const timestamp = Date.now();
    for (const [tokenAddress, pools] of Object.entries(result)) {
      let existingData;
      try {
        existingData = await db.get(tokenAddress);
      } catch (error) {
        if (error.notFound) {
          existingData = null;
        } else {
          throw error;
        }
      }

      const data = {
        pools,
        createdAt: existingData ? existingData.createdAt : timestamp,
        updatedAt: timestamp
      };

      await db.put(tokenAddress, data);
      console.log(`存储代币 ${tokenAddress} 的数据，createdAt: ${data.createdAt}, updatedAt: ${data.updatedAt}`);
      logError(`存储代币 ${tokenAddress} 的数据，createdAt: ${data.createdAt}, updatedAt: ${data.updatedAt}`);
    }
    console.log('数据存储完成。');
    logError('数据存储完成。');
  } catch (error) {
    console.error('存储到 LevelDB 时出错:', error.message);
    logError(`存储到 LevelDB 时出错: ${error.message}`);
    throw error;
  }
}

// 获取所有数据并按 createdAt 或 updatedAt 排序
async function getSortedByTimestamp(sortBy = 'createdAt') {
  try {
    await ensureDBOpen();
    const entries = [];
    const iterator = db.iterator();
    try {
      for await (const [key, value] of iterator) {
        entries.push({ key, ...value });
      }
    } finally {
      await iterator.close();
    }
    entries.sort((a, b) => b[sortBy] - a[sortBy]);
    console.log(`按 ${sortBy} 排序，查询到 ${entries.length} 条记录`);
    logError(`按 ${sortBy} 排序，查询到 ${entries.length} 条记录`);
    return entries;
  } catch (error) {
    console.error('获取排序数据时出错:', error.message);
    logError(`获取排序数据时出错: ${error.message}`);
    throw error;
  }
}

// 查找新增的 key（基于 createdAt）
async function findNewKeys(sinceTimestamp) {
  try {
    await ensureDBOpen();
    const newKeys = [];
    const iterator = db.iterator();
    try {
      for await (const [key, value] of iterator) {
        if (value.createdAt >= sinceTimestamp) {
          newKeys.push({ key, ...value });
        }
      }
    } finally {
      await iterator.close();
    }
    console.log(`查找新增 key，时间戳 >= ${sinceTimestamp}，查询到 ${newKeys.length} 条记录`);
    logError(`查找新增 key，时间戳 >= ${sinceTimestamp}，查询到 ${newKeys.length} 条记录`);
    return newKeys;
  } catch (error) {
    console.error('查找新增 key 时出错:', error.message);
    logError(`查找新增 key 时出错: ${error.message}`);
    throw error;
  }
}

// 定时任务：每 2 分钟运行一次
async function runScheduledTask() {
  try {
    console.log('开始定时任务...');
    logError('开始定时任务...');
    const result = await filterPools();
    await storeToLevelDB(result);
    console.log('定时任务完成。');
    logError('定时任务完成。');
  } catch (error) {
    console.error('定时任务失败:', error.message);
    logError(`定时任务失败: ${error.message}`);
  }
}

// 导出查询方法供外部调用
module.exports = {
  getSortedByTimestamp,
  findNewKeys,
  filterPools,
  storeToLevelDB
};

// 主程序入口：初始化数据库并启动定时任务
async function main() {
  try {
    await initializeDB();
    // 立即运行一次定时任务
    await runScheduledTask();
    // 每 2 分钟运行一次
    setInterval(runScheduledTask, 2 * 60 * 1000);
  } catch (error) {
    console.error('主程序启动失败:', error.message);
    logError(`主程序启动失败: ${error.message}`);
    process.exit(1);
  }
}

main();