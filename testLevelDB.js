let Level;
try {
    Level = require('level');
  console.log('成功加载 level 模块:', typeof level);
} catch (error) {
  console.error('无法加载 level 模块:', error.message);
  process.exit(1);
}

// 初始化 LevelDB 数据库
let db;
async function initializeDB() {
  try {
    db = new Level('./tokenPoolsDB', { valueEncoding: 'json' });
    console.log('成功初始化 LevelDB');
    return db;
  } catch (error) {
    console.error('无法初始化 LevelDB:', error.message);
    process.exit(1);
  }
}

// 检查数据库状态并重新初始化（如果需要）
async function ensureDBOpen() {
  try {
    if (!db || !db.isOpen()) {
      console.log('数据库未打开或未初始化，正在初始化...');
      await initializeDB();
    }
    console.log('数据库状态:', db.isOpen() ? '打开' : '关闭');
    return db;
  } catch (error) {
    console.error('检查或初始化数据库失败:', error.message);
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
      await iterator.close(); // 确保迭代器关闭
    }
    entries.sort((a, b) => b[sortBy] - a[sortBy]);
    return entries;
  } catch (error) {
    console.error('获取排序数据时出错:', error.message);
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
      await iterator.close(); // 确保迭代器关闭
    }
    return newKeys;
  } catch (error) {
    console.error('查找新增 key 时出错:', error.message);
    throw error;
  }
}

// 测试用例
async function runTests() {
  try {
    console.log('测试 1：按 createdAt 排序');
    const sortedByCreatedAt = await getSortedByTimestamp('createdAt');
    console.log(JSON.stringify(sortedByCreatedAt, null, 2));

    console.log('测试 2：按 updatedAt 排序');
    const sortedByUpdatedAt = await getSortedByTimestamp('updatedAt');
    console.log(JSON.stringify(sortedByUpdatedAt, null, 2));

    console.log('测试 3：查找最近 1 小时内新增的 key');
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const newKeys = await findNewKeys(oneHourAgo);
    console.log(JSON.stringify(newKeys, null, 2));
  } catch (error) {
    console.error('测试执行失败:', error.message);
  } finally {
    console.log('测试完成，未关闭数据库以支持定时任务');
  }
}

// 运行测试
runTests();