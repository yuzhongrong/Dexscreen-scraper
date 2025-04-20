const axios = require('axios'); // 使用 axios 进行 HTTP 请求
const level = require('level'); // 使用 LevelDB 作为 key-value 存储

// 初始化 LevelDB 数据库
const db = level('./tokenPoolsDB', { valueEncoding: 'json' });

// 过滤池子的函数
async function filterPools() {
  try {
    // 从接口获取数据
    const response = await axios.get('http://127.0.0.1:5000/dex/json');
    const data = response.data;

    // 过滤数据
    const filteredData = Object.entries(data.data).reduce((acc, [tokenAddress, pools]) => {
      // 过滤池子：仅保留 Pumpswap、Raydium V4、Meteora DLMM 或 Orca wp 类型的池子，且流动性大于 1000 美金
      const filteredPools = pools.filter((pool) => {
        // 检查池子类型
        const isPumpswap = pool.dexId === 'pumpswap' && (!pool.labels || pool.labels.length === 0);
        const isRaydiumV4 = pool.dexId === 'raydium' && (!pool.labels || pool.labels.length === 0);
        const isMeteoraDLMM = pool.dexId === 'meteora' && pool.labels?.includes('DLMM');
        const isOrcaWp = pool.dexId === 'orca' && pool.labels?.includes('wp');
        // 检查流动性是否大于 1000 美金
        const hasSufficientLiquidity = pool.liquidity?.usd > 1000;
        return (isPumpswap || isRaydiumV4 || isMeteoraDLMM || isOrcaWp) && hasSufficientLiquidity;
      });

      // 检查池子类型数量
      const poolTypes = new Set();
      filteredPools.forEach((pool) => {
        if (pool.dexId === 'pumpswap' && (!pool.labels || pool.labels.length === 0)) poolTypes.add('Pumpswap');
        if (pool.dexId === 'raydium' && (!pool.labels || pool.labels.length === 0)) poolTypes.add('RaydiumV4');
        if (pool.dexId === 'meteora' && pool.labels?.includes('DLMM')) poolTypes.add('MeteoraDLMM');
        if (pool.dexId === 'orca' && pool.labels?.includes('wp')) poolTypes.add('OrcaWp');
      });

      // 只有当池子类型至少有 2 种且池子数量大于 0 时才保留
      if (poolTypes.size >= 2 && filteredPools.length > 0) {
        acc[tokenAddress] = filteredPools;
      }

      return acc;
    }, {});

    // 移除没有池子的 token
    const result = Object.fromEntries(
      Object.entries(filteredData).filter(([_, pools]) => pools.length > 0)
    );

    return result;
  } catch (error) {
    console.error('Error fetching or processing data:', error.message);
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Data: ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
}

// 将数据存储到 LevelDB，保留 createdAt 时间戳
async function storeToLevelDB(result) {
  try {
    const timestamp = Date.now();
    for (const [tokenAddress, pools] of Object.entries(result)) {
      // 检查 key 是否已存在
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

      // 准备存储数据
      const data = {
        pools,
        createdAt: existingData ? existingData.createdAt : timestamp, // 保留原有 createdAt 或使用当前时间
        updatedAt: timestamp // 总是更新 updatedAt
      };

      // 存储数据
      await db.put(tokenAddress, data);
      console.log(`Stored data for token ${tokenAddress} with createdAt ${data.createdAt}, updatedAt ${data.updatedAt}`);
    }
    console.log('Data storage completed.');
  } catch (error) {
    console.error('Error storing data to LevelDB:', error.message);
    throw error;
  }
}

// 定时任务：每 10 分钟运行一次
async function runScheduledTask() {
  try {
    console.log('Starting scheduled task...');
    const result = await filterPools();
    await storeToLevelDB(result);
    console.log('Scheduled task completed.');
  } catch (error) {
    console.error('Scheduled task failed:', error.message);
  }
}

// 立即运行一次，然后每 5 分钟运行
runScheduledTask();
setInterval(runScheduledTask, 5 * 60 * 1000); // 5 分钟