const { Level } = require('level'); // 正确导入方式

// 初始化 LevelDB 数据库
const db =new Level('./tokenPoolsDB', { valueEncoding: 'json' });

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

// 测试用例
async function runTests() {
  try {
    // 测试 1：按 createdAt 排序
    console.log('Test 1: Sorting by createdAt');
    const sortedByCreatedAt = await getSortedByTimestamp('createdAt');
    console.log(JSON.stringify(sortedByCreatedAt, null, 2));

    // 测试 2：按 updatedAt 排序
    console.log('Test 2: Sorting by updatedAt');
    const sortedByUpdatedAt = await getSortedByTimestamp('updatedAt');
    console.log(JSON.stringify(sortedByUpdatedAt, null, 2));

    // 测试 3：查找最近 1 小时内新增的 key（基于 createdAt）
    console.log('Test 3: Finding new keys in the last hour');
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const newKeys = await findNewKeys(oneHourAgo);
    console.log(JSON.stringify(newKeys, null, 2));

  } catch (error) {
    console.error('Test execution failed:', error.message);
  } finally {
    // 关闭数据库
    await db.close();
  }
}

// 运行测试
runTests();