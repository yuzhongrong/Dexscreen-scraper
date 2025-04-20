const axios = require('axios');
const dbSingleton = require('./dbSingleton');
const fs = require('fs');

// 日志记录函数
function logError(message) {
    const logMessage = `${new Date().toISOString()} - ${message}\n`;
    fs.appendFileSync('filterPools.log', logMessage);
    console.log(logMessage.trim());
}

/**
 * 初始化数据库和表结构
 */
async function initDatabase() {
  try {
    const pool = await dbSingleton.getMySQL();

    // 1. 创建数据库（如果不存在）
    await pool.query('CREATE DATABASE IF NOT EXISTS dex_pools');

    // 2. 切换到该数据库
    await pool.query('USE dex_pools');

    // 3. 创建表
    await pool.query(`
        CREATE TABLE IF NOT EXISTS token_pools (
            token_address VARCHAR(42) PRIMARY KEY,
            pools JSON NOT NULL,
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL,
            INDEX (created_at),
            INDEX (updated_at)
        )
    `);

    logError('数据库表初始化完成');
} catch (error) {
    logError(`数据库表初始化失败: ${error.message}`);
    throw error;
}
}

/**
 * 从 MySQL 加载所有数据到 Redis 缓存
 */
async function loadAllToRedis() {
    const mysqlPool = await dbSingleton.getMySQL();
    const redis = await dbSingleton.getRedis();

    try {
        logError('开始从 MySQL 加载数据到 Redis...');

        // 1. 获取所有数据
        const [rows] = await mysqlPool.query('SELECT * FROM token_pools');

        // 2. 批量写入 Redis
        const pipeline = redis.pipeline();
        rows.forEach(row => {
            pipeline.set(
                `pool:${row.token_address}`,
                JSON.stringify({
                    pools: JSON.parse(row.pools),
                    createdAt: row.created_at,
                    updatedAt: row.updated_at
                }),
                'EX', 3600 * 24 // 缓存24小时
            );
        });

        await pipeline.exec();
        logError(`成功加载 ${rows.length} 条数据到 Redis`);
    } catch (error) {
        logError(`从 MySQL 加载数据到 Redis 失败: ${error.message}`);
        throw error;
    }
}

/**
 * 过滤池子的函数
 */
async function filterPools() {
    try {
        const response = await axios.get('http://127.0.0.1:5000/dex/json');
        const data = response.data;

        const filteredData = Object.entries(data.data).reduce((acc, [tokenAddress, pools]) => {
            const filteredPools = pools.filter((pool) => {
                const isPumpswap = pool.dexId === 'pumpswap' && (!pool.labels || pool.labels.length === 0);
                const isRaydiumV4 = pool.dexId === 'raydium' && (!pool.labels || pool.labels.length === 0);
                const isMeteoraDLMM = pool.dexId === 'meteora' && pool.labels?.includes('DLMM');
                const isOrcaWp = pool.dexId === 'orca' && pool.labels?.includes('wp');
                const hasSufficientLiquidity = pool.liquidity?.usd > 1000;
                return (isPumpswap || isRaydiumV4 || isMeteoraDLMM || isOrcaWp) && hasSufficientLiquidity;
            });

            const poolTypes = new Set();
            filteredPools.forEach((pool) => {
                if (pool.dexId === 'pumpswap' && (!pool.labels || pool.labels.length === 0)) poolTypes.add('Pumpswap');
                if (pool.dexId === 'raydium' && (!pool.labels || pool.labels.length === 0)) poolTypes.add('RaydiumV4');
                if (pool.dexId === 'meteora' && pool.labels?.includes('DLMM')) poolTypes.add('MeteoraDLMM');
                if (pool.dexId === 'orca' && pool.labels?.includes('wp')) poolTypes.add('OrcaWp');
            });

            if (poolTypes.size >= 2 && filteredPools.length > 0) {
                acc[tokenAddress] = filteredPools;
            }

            return acc;
        }, {});

        return Object.fromEntries(
            Object.entries(filteredData).filter(([_, pools]) => pools.length > 0)
        );
    } catch (error) {
        logError(`获取或处理数据时出错: ${error.message}`);
        if (error.response) {
            logError(`状态码: ${error.response.status}, 数据: ${JSON.stringify(error.response.data)}`);
        }
        throw error;
    }
}

/**
 * 将数据存储到 MySQL 和 Redis
 */
async function storeToDatabase(result) {
    const mysqlPool = await dbSingleton.getMySQL();
    const redis = await dbSingleton.getRedis();
    const timestamp = Date.now();

    try {
        const pipeline = redis.pipeline();

        for (const [tokenAddress, pools] of Object.entries(result)) {
            // 检查是否已存在
            const [rows] = await mysqlPool.query(
                'SELECT created_at FROM token_pools WHERE token_address = ?',
                [tokenAddress]
            );

            const createdAt = rows.length > 0 ? rows[0].created_at : timestamp;

            // 更新 MySQL
            await mysqlPool.query(
                'INSERT INTO token_pools (token_address, pools, created_at, updated_at) ' +
                'VALUES (?, ?, ?, ?) ' +
                'ON DUPLICATE KEY UPDATE pools = ?, updated_at = ?',
                [
                    tokenAddress,
                    JSON.stringify(pools),
                    createdAt,
                    timestamp,
                    JSON.stringify(pools),
                    timestamp
                ]
            );

            // 添加到 Redis pipeline
            pipeline.set(
                `pool:${tokenAddress}`,
                JSON.stringify({
                    pools,
                    createdAt,
                    updatedAt: timestamp
                }),
                'EX', 3600 * 24 // 缓存24小时
            );
        }

        await pipeline.exec();
        logError(`成功存储 ${Object.keys(result).length} 条数据到数据库和缓存`);
    } catch (error) {
        logError(`存储到数据库时出错: ${error.message}`);
        throw error;
    }
}

/**
 * 定时任务
 */
async function runScheduledTask() {
    try {
        logError('开始定时任务...');
        const result = await filterPools();
        await storeToDatabase(result);
        logError('定时任务完成。');
    } catch (error) {
        logError(`定时任务失败: ${error.message}`);
    }
}

/**
 * 主程序入口
 */
async function main() {
    try {
        // 1. 初始化数据库连接
        await dbSingleton.initialize();

        // 2. 初始化数据库和表结构
        await initDatabase();

        // 3. 如果 Redis 缓存为空，从 MySQL 加载数据
        if (await dbSingleton.isCacheEmpty()) {
            logError('检测到 Redis 缓存为空，开始从 MySQL 加载数据...');
            await loadAllToRedis();
        } else {
            logError('Redis 缓存已有数据，跳过初始化加载');
        }

        // 4. 立即运行一次定时任务
        await runScheduledTask();

        // 5. 设置定时任务（每5分钟执行一次）
        setInterval(runScheduledTask, 5 * 60 * 1000);

        // 6. 优雅关闭处理
        process.on('SIGINT', async () => {
            logError('关闭数据库连接...');
            await dbSingleton.close();
            process.exit(0);
        });
    } catch (error) {
        logError(`主程序启动失败: ${error.message}`);
        process.exit(1);
    }
}

// 导出方法供测试使用
module.exports = {
    filterPools,
    storeToDatabase,
    runScheduledTask,
    loadAllToRedis
};

// 如果是主模块直接运行
if (require.main === module) {
    main();
}