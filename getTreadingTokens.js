const axios = require('axios'); // 使用 axios 进行 HTTP 请求
const fs = require('fs').promises; // 使用 fs.promises 进行异步文件操作

// 过滤池子的函数
async function filterPools() {
  try {
    // 从接口获取数据
    const response = await axios.get('http://127.0.0.1:5000/dex/json');
    const data = response.data;

    // 定义需要保留的标签
    const allowedLabels = ['DLMM', 'CLMM', 'CPMM'];

    // 过滤数据
    const filteredData = Object.entries(data.data).reduce((acc, [tokenAddress, pools]) => {
      // 过滤池子：保留 DLMM、CLMM、CPMM 类型的池子或 pumpswap 池子，且流动性大于 1000 美金
      const filteredPools = pools.filter((pool) => {
        // 检查池子是否为 pumpswap 或包含允许的标签
        const isPumpswap = pool.dexId === 'pumpswap';
        const hasAllowedLabel = pool.labels?.some((label) => allowedLabels.includes(label));
        // 检查流动性是否大于 1000 美金
        const hasSufficientLiquidity = pool.liquidity?.usd > 1000;
        return (isPumpswap || hasAllowedLabel) && hasSufficientLiquidity;
      });

      // 检查是否有 AMM (CLMM 或 CPMM) 和 DLMM 类型的池子
      const hasAMM = filteredPools.some((pool) => pool.labels?.includes('CLMM') || pool.labels?.includes('CPMM'));
      const hasDLMM = filteredPools.some((pool) => pool.labels?.includes('DLMM'));

      // 只有当同时有 AMM 和 DLMM 池子且池子数量大于 0 时才保留
      if (hasAMM && hasDLMM && filteredPools.length > 0) {
        acc[tokenAddress] = filteredPools;
      }

      return acc;
    }, {});

    // 移除没有池子的 token
    const result = Object.fromEntries(
      Object.entries(filteredData).filter(([_, pools]) => pools.length > 0)
    );

    // 输出结果到控制台
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
    
      // 写入文件（覆盖模式）
      await fs.writeFile('pool.json', JSON.stringify(result, null, 2));
      console.log('Filtering completed. Results written to pool.json');
    } catch (fileError) {
      console.error('Error writing to pool.json:', fileError.message);
      throw fileError;
    }
  })
  .catch((err) => console.error('Filtering failed:', err));