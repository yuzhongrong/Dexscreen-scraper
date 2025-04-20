const { getSortedByTimestamp, findNewKeys } = require('./filterPools.js');

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
  }
}

async function main() {
  try {
    await runTests();
  } catch (error) {
    console.error('主程序启动失败:', error.message);
    process.exit(1);
  }
}

main();