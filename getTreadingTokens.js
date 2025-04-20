const axios = require('axios'); // 使用 axios 进行 HTTP 请求

// 过滤池子的函数
async function filterPools() {
  try {
    // 从接口获取数据
    const response = await axios.get('http://127.0.0.1:5000/dex/json');
    const data = response.data;

    // 定义需要保留的标签
    const allowedLabels = ['AMM', 'DLMM'];

    // 过滤数据
    const filteredData = Object.entries(data).reduce((acc, [tokenAddress, pools]) => {
      // 过滤池子：只保留 AMM 和 DLMM 类型的池子，且流动性大于 1000 美金
      const filteredPools = pools.filter((pool) => {
        // 检查池子是否包含 AMM 或 DLMM 标签
        const hasAllowedLabel = pool.labels?.some((label) => allowedLabels.includes(label));
        // 检查流动性是否大于 1000 美金
        const hasSufficientLiquidity = pool.liquidity?.usd > 1000;
        return hasAllowedLabel && hasSufficientLiquidity;
      });

      // 检查是否有 AMM 和 DLMM 类型的池子
      const hasAMM = filteredPools.some((pool) => pool.labels?.includes('AMM'));
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

    // 输出结果
    console.log(JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    console.error('Error fetching or processing data:', error.message);
    throw error;
  }
}

// 执行过滤
filterPools()
  .then(() => console.log('Filtering completed'))
  .catch((err) => console.error('Filtering failed:', err));