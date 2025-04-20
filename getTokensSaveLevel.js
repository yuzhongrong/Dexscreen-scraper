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

    // 输出结果到控制台（取消注释以启用）
    // console.log(JSON.stringify(result, null, 2));

    // 返回结果以供后续处理
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

// 获取所有数据并按 createdAt 或 updatedAt 排序
async function getSortedByTimestamp(sortBy = 'createdAt') {
  try {
    const entries = [];
    for await (const [key, value] of db.iterator()) {
      entries.push({ key, ...value });
    }
    // 按指定字段（createdAt 或 updatedAt）降序排序
    entries.sort((a, b) => b[sortBy] - a[sortBy]);
    return entries;
  } catch (error) {
    console.error('Error retrieving sorted data:', error.message);
    throw error;
  }
}

// 查找新增的 key（基于 createdAt）
async function findNewKeys(sinceTimestamp) {
  try {
    const newKeys = [];
    for await (const [key, value] of db.iterator()) {
      if (value.createdAt >= sinceTimestamp) {
        newKeys.push({ key, ...value });
      }
    }
    return newKeys;
  } catch (error) {
    console.error('Error finding new keys:', error.message);
    throw error;
  }
}

// 主执行逻辑
async function main() {
  try {
    // 执行过滤
    const result = await filterPools();

    // 存储到 LevelDB
    await storeToLevelDB(result);

    // 示例：获取按 createdAt 排序的数据
    const sortedByCreatedAt = await getSortedByTimestamp('createdAt');
    console.log('Sorted entries by createdAt:');
    console.log(JSON.stringify(sortedByCreatedAt, null, 2));

    // 示例：获取按 updatedAt 排序的数据
    const sortedByUpdatedAt = await getSortedByTimestamp('updatedAt');
    console.log('Sorted entries by updatedAt:');
    console.log(JSON.stringify(sortedByUpdatedAt, null, 2));

    // 示例：查找最近 1 小时内新增的 key（基于 createdAt）
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const newKeys = await findNewKeys(oneHourAgo);
    console.log('New keys added in the last hour (based on createdAt):');
    console.log(JSON.stringify(newKeys, null, 2));
  } catch (err) {
    console.error('Main execution failed:', err);
  } finally {
    // 关闭数据库
    await db.close();
  }
}

// 运行主函数
main();