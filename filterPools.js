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
 * 初始化数据库（MongoDB 无需显式创建集合）
 */
async function initDatabase() {
    try {
        const db = await dbSingleton.getMongoDb();
        // 创建索引以优化查询
        await db.collection('token_pools').createIndex({ created_at: -1 });
        await db.collection('token_pools').createIndex({ updated_at: -1 });
        logError('MongoDB 集合初始化完成');
    } catch (error) {
        logError(`数据库初始化失败: ${error.message}`);
        throw error;
    }
}

/**
 * 从 MongoDB 加载所有数据到 Redis 缓存
 */
async function loadAllToRedis() {
    const db = await dbSingleton.getMongoDb();
    const redis = await dbSingleton.getRedis();

    try {
        logError('开始从 MongoDB 加载数据到 Redis...');

        // 获取所有数据
        const rows = await db.collection('token_pools').find({}).toArray();

        // 使用 multi 进行批量写入
        const multi = redis.multi();
        rows.forEach(row => {
            multi.set(
                `pool:${row.token_address}`,
                JSON.stringify({
                    pools: row.pools,
                    createdAt: row.created_at,
                    updatedAt: row.updated_at
                }),
                { EX: 3600 * 24 } // 缓存24小时
            );
        });

        await multi.exec();
        logError(`成功加载 ${rows.length} 条数据到 Redis`);
    } catch (error) {
        logError(`从 MongoDB 加载数据到 Redis 失败: ${error.message}`);
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
            }).slice(0, 100); // 限制最多 100 个 pool

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
 * 将数据存储到 MongoDB 和 Redis
 */
async function storeToDatabase(result) {
    const db = await dbSingleton.getMongoDb();
    const redis = await dbSingleton.getRedis();
    const timestamp = Date.now();

    try {
        const multi = redis.multi();

        for (const [tokenAddress, pools] of Object.entries(result)) {
            logError(`处理 tokenAddress: ${tokenAddress}, 长度: ${tokenAddress.length}, pools 数量: ${pools.length}`);

            // 检查 tokenAddress 长度
            if (tokenAddress.length > 100) {
                logError(`警告: tokenAddress 过长 (${tokenAddress.length} 字符)，将截断到 100 字符`);
                tokenAddress = tokenAddress.substring(0, 100);
            }

            // 限制 pools 数量
            if (pools.length > 100) {
                logError(`警告: pools 数量过多 (${pools.length})，仅保留前 100 条`);
                pools = pools.slice(0, 100);
            }

            // 存储到 MongoDB
            await db.collection('token_pools').updateOne(
                { token_address: tokenAddress },
                {
                    $set: {
                        pools,
                        updated_at: timestamp
                    },
                    $setOnInsert: {
                        created_at: timestamp
                    }
                },
                { upsert: true }
            );

            // 添加到 Redis
            multi.set(
                `pool:${tokenAddress}`,
                JSON.stringify({
                    pools,
                    createdAt: timestamp,
                    updatedAt: timestamp
                }),
                { EX: 3600 * 24 }
            );
        }

        await multi.exec();
        logError(`成功存储 ${Object.keys(result).length} 条数据到 MongoDB 和 Redis`);
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

        // 2. 初始化数据库
        await initDatabase();

        // 3. 如果 Redis 缓存为空，从 MongoDB 加载数据
        if (await dbSingleton.isCacheEmpty()) {
            logError('检测到 Redis 缓存为空，开始从 MongoDB 加载数据...');
            await loadAllToRedis();
        } else {
            logError('Redis 缓存已有数据，跳过初始化加载');
        }

        // 4. 立即运行一次定时任务
        await runScheduledTask();

        // 5. 设置定时任务（每5分钟执行一次）
        setInterval(runScheduledTask, 2 * 60 * 1000);

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