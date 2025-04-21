const dbSingleton = require('./dbSingleton');
const fs = require('fs').promises;
const fsSync = require('fs');
const toml = require('toml');
const tomlify = require('tomlify-j0.4');

// 日志记录函数
function logError(message) {
    const logMessage = `${new Date().toISOString()} - ${message}\n`;
    fsSync.appendFileSync('testDatabase.log', logMessage);
    console.log(logMessage.trim());
}

// 更新 pool.toml 文件
async function updatePoolToml() {
    try {
        const redis = await dbSingleton.getRedis();

        // 获取所有 pool:* 键
        const keys = await redis.keys('pool:*');
        if (keys.length === 0) {
            const msg = 'Redis 中无 pool:* 键';
            console.log(msg);
            logError(msg);
            return;
        }

        // 按 mint 组织池子数据
        const mintConfigs = new Map(); // Map<mint, {pump, raydium, meteora, orca}>

        for (const key of keys) {
            const value = await redis.get(key);
            if (!value) continue;

            try {
                const parsed = JSON.parse(value);
                const pools = parsed.pools || [];

                // 从 key 中提取 mint（假设 key 是 pool:<mint>）
                const mint = key.replace('pool:', '');

                // 初始化 mint 配置
                if (!mintConfigs.has(mint)) {
                    mintConfigs.set(mint, {
                        pump_pool_list: new Set(),
                        raydium_pool_list: new Set(),
                        meteora_dlmm_pool_list: new Set(),
                        whirlpool_pool_list: new Set()
                    });
                }

                const config = mintConfigs.get(mint);

                // 按 dexId 分类池子
                for (const pool of pools) {
                    const pairAddress = pool.pairAddress;
                    const dexId = pool.dexId?.toLowerCase();

                    if (!pairAddress || !dexId) {
                        logError(`无效池子数据: ${JSON.stringify(pool)}`);
                        continue;
                    }

                    switch (dexId) {
                        case 'pumpswap':
                            config.pump_pool_list.add(pairAddress);
                            break;
                        case 'raydium':
                            config.raydium_pool_list.add(pairAddress);
                            break;
                        case 'meteora':
                            config.meteora_dlmm_pool_list.add(pairAddress);
                            break;
                        case 'orca':
                            config.whirlpool_pool_list.add(pairAddress);
                            break;
                        default:
                            logError(`未知 dexId: ${dexId} for pool ${pairAddress}`);
                    }
                }
            } catch (parseError) {
                logError(`解析 Redis 键 ${key} 失败: ${parseError.message}`);
            }
        }

        if (mintConfigs.size === 0) {
            const msg = '未找到有效池子数据';
            console.log(msg);
            logError(msg);
            return;
        }

        // 读取现有 pool.toml（如果存在）
        let existingConfig = { routing: { mint_config_list: [] } };
        try {
            const tomlContent = await fs.readFile('pool.toml', 'utf8');
            existingConfig = toml.parse(tomlContent);
        } catch (error) {
            logError(`读取 pool.toml 失败: ${error.message}, 使用默认配置`);
        }

        // 转换为数组（确保兼容）
        if (!Array.isArray(existingConfig.routing.mint_config_list)) {
            existingConfig.routing.mint_config_list = [];
        }

        // 更新 mint 配置
        for (const [mint, pools] of mintConfigs) {
            // 检查是否已存在该 mint
            const existingMintConfig = existingConfig.routing.mint_config_list.find(
                config => config.mint === mint
            );

            if (existingMintConfig) {
                // 合并池子列表（去重）
                existingMintConfig.pump_pool_list = [
                    ...new Set([
                        ...(existingMintConfig.pump_pool_list || []),
                        ...pools.pump_pool_list
                    ])
                ];
                existingMintConfig.raydium_pool_list = [
                    ...new Set([
                        ...(existingMintConfig.raydium_pool_list || []),
                        ...pools.raydium_pool_list
                    ])
                ];
                existingMintConfig.meteora_dlmm_pool_list = [
                    ...new Set([
                        ...(existingMintConfig.meteora_dlmm_pool_list || []),
                        ...pools.meteora_dlmm_pool_list
                    ])
                ];
                existingMintConfig.whirlpool_pool_list = [
                    ...new Set([
                        ...(existingMintConfig.whirlpool_pool_list || []),
                        ...pools.whirlpool_pool_list
                    ])
                ];
            } else {
                // 添加新 mint 配置
                existingConfig.routing.mint_config_list.push({
                    mint,
                    pump_pool_list: [...pools.pump_pool_list],
                    raydium_pool_list: [...pools.raydium_pool_list],
                    raydium_cp_pool_list: [],
                    meteora_dlmm_pool_list: [...pools.meteora_dlmm_pool_list],
                    whirlpool_pool_list: [...pools.whirlpool_pool_list],
                    lookup_table_accounts: [], // 默认空，可配置
                    process_delay: 10000
                });
            }
        }

        // 写入 pool.toml
        const tomlOutput = tomlify(existingConfig, { space: 2 });
        await fs.writeFile('pool.toml', tomlOutput, 'utf8');

        const msg = `成功更新 pool.toml，处理 ${mintConfigs.size} 个 mint 配置`;
        console.log(msg);
        logError(msg);
    } catch (error) {
        const errMsg = `更新 pool.toml 失败: ${error.message}`;
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

        await updatePoolToml();

        await dbSingleton.close();
    } catch (error) {
        logError(`主程序错误: ${error.message}`);
        await dbSingleton.close();
        process.exit(1);
    }
}

main();