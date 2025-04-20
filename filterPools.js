const axios = require('axios');
const { Level } = require('level'); // 正确导入方式

// 初始化 LevelDB
let db;
try {
  db = new Level('./tokenPoolsDB', { valueEncoding: 'json' });
  console.log('成功初始化 LevelDB');
} catch (error) {
  console.error('无法初始化 LevelDB:', error.message);
  process.exit(1);
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
    if (error.response) {
      console.error(`状态码: ${error.response.status}`);
      console.error(`数据: ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
}

// 将数据存储到 LevelDB，保留 createdAt 时间戳
async function storeToLevelDB(result) {
  try {
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
    }
    console.log('数据存储完成。');
  } catch (error) {
    console.error('存储到 LevelDB 时出错:', error.message);
    throw error;
  }
}

// 定时任务：每 10 分钟运行一次
async function runScheduledTask() {
  try {
    console.log('开始定时任务...');
    const result = await filterPools();
    await storeToLevelDB(result);
    console.log('定时任务完成。');
  } catch (error) {
    console.error('定时任务失败:', error.message);
  }
}

// 立即运行一次，然后每  2分钟运行
runScheduledTask();
setInterval(runScheduledTask, 2 * 60 * 1000);