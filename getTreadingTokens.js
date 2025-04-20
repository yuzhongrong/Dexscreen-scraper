const axios = require('axios'); // 使用 axios 进行 HTTP 请求
const fs = require('fs').promises; // 使用 fs.promises 进行异步文件操作

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

// 执行过滤并将结果写入 pool.json
filterPools()
  .then(async (result) => {
    try {
      // 检查 pool.json 是否存在
      const fileExists = await fs.access('pool.json')
        .then(() => true)
        .catch(() => false);

      // 写入文件（覆盖模式）
      await fs.writeFile('pool.json', JSON.stringify(result, null, 2));

      // 如果文件是新建的，设置读写权限 (rw-rw-r--)
      if (!fileExists) {
        await fs.chmod('pool.json', 0o664);
        console.log('Created pool.json with read/write permissions (664)');
      }

      console.log('Filtering completed. Results written to pool.json');
    } catch (fileError) {
      console.error('Error writing to pool.json:', fileError.message);
      throw fileError;
    }
  })
  .catch((err) => console.error('Filtering failed:', err));