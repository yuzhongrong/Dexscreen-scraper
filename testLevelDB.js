const { getSortedByTimestamp, findNewKeys } = require('./filterPools.js');

// 获取按 createdAt 排序的所有数据
async function testQuery() {
  try {
    const sortedData = await getSortedByTimestamp('createdAt');
    console.log('按 createdAt 排序的数据:', JSON.stringify(sortedData, null, 2));

    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const newKeys = await findNewKeys(oneHourAgo);
    console.log('最近一小时新增的 key:', JSON.stringify(newKeys, null, 2));
  } catch (error) {
    console.error('查询失败:', error.message);
  }
}

testQuery();