const dbSingleton = require('./levelDBSingleton');
const fs = require('fs');

// 日志记录函数
function logError(message) {
  fs.appendFileSync('testLevelDB.log', `${new Date().toISOString()} - ${message}\n`);
}

// 获取所有数据并按 createdAt 或 updatedAt 排序
async function getSortedByTimestamp(sortBy = 'createdAt') {
  try {
    const db = await dbSingleton.getDB();
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
    const db = await dbSingleton.getDB();
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

// 测试查询方法
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
    logError(`测试执行失败: ${error.message}`);
  }
}

async function main() {
  try {
    await dbSingleton.initialize();
    await runTests();
  } catch (error) {
    console.error('主程序启动失败:', error.message);
    logError(`主程序启动失败: ${error.message}`);
    process.exit(1);
  }
}

main();