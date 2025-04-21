
const dbSingleton = require('./dbSingleton');
const fs = require('fs').promises; // 使用 promises API
const fsSync = require('fs'); // 用于 logError 的同步写入

// 日志记录函数
function logError(message) {
    const logMessage = `${new Date().toISOString()} - ${message}\n`;
    fsSync.appendFileSync('testDatabase.log', logMessage);
    console.log(logMessage.trim());
}

// 获取 Redis 中最新的一条池子数据并写入 test.json
async function getLatestPool(sortBy = 'createdAt') {
    try {
        const redis = await dbSingleton.getRedis();

        // 获取所有 pool:* 键
        const keys = await redis.keys('pool:*');
        if (keys.length === 0) {
            const msg = 'Redis 中无 pool:* 键';
            console.log(msg);
            logError(msg);
            await fs.writeFile('test.json', JSON.stringify({}), 'utf8');
            return {};
        }

        // 批量获取键值
        let latestData = null;
        let maxSortValue = -Infinity;

        for (const key of keys) {
            const value = await redis.get(key);
            if (value) {
                try {
                    const parsed = JSON.parse(value);
                    const sortValue = parsed[sortBy] || 0;
                    if (sortValue > maxSortValue) {
                        maxSortValue = sortValue;
                        latestData = parsed;
                    }
                } catch (parseError) {
                    logError(`解析 Redis 键 ${key} 失败: ${parseError.message}`);
                }
            }
        }

        if (!latestData) {
            const msg = '未找到有效数据';
            console.log(msg);
            logError(msg);
            await fs.writeFile('test.json', JSON.stringify({}), 'utf8');
            return {};
        }

        // 写入 test.json
        await fs.writeFile('test.json', JSON.stringify(latestData, null, 2), 'utf8');
        const msg = `获取最新 1 条记录，按 ${sortBy} 排序，写入 test.json`;
        console.log(msg);
        logError(msg);
        return latestData;
    } catch (error) {
        const errMsg = `查询失败: ${error.message}`;
        console.error(errMsg);
        logError(errMsg);
        throw error;
    }
}

// 主函数
async function main() {
    try {
        await dbSingleton.initialize();
        logError('数据库连接初始化成功');

        // 获取最新数据
        const latestPool = await getLatestPool('createdAt');
        console.log('最新池子:', latestPool);

        await dbSingleton.close();
    } catch (error) {
        logError(`主程序错误: ${error.message}`);
        await dbSingleton.close();
        process.exit(1);
    }
}

main();
