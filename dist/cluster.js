"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const fs_1 = __importDefault(require("fs"));
Object.assign(process.env, dotenv_1.default.parse(fs_1.default.readFileSync('./.env')));
const discord_hybrid_sharding_1 = require("discord-hybrid-sharding");
const logger_1 = __importDefault(require("./utilities/core/logger"));
const manager = new discord_hybrid_sharding_1.ClusterManager(`${process.cwd()}/src/index.ts`, {
    totalShards: 'auto',
    totalClusters: 5,
    shardsPerClusters: 5,
    mode: 'worker',
    token: process.env.NODE_ENV === 'dev' ? process.env.TESTOKEN : process.env.TOKEN,
    restarts: {
        max: 5,
        interval: 1000 * 60 * 60 * 2,
    },
});
manager.extend(new discord_hybrid_sharding_1.HeartbeatManager({
    interval: 2000,
    maxMissedHeartbeats: 5,
}));
manager.on('clusterCreate', (cluster) => {
    cluster.on('ready', () => {
        new logger_1.default('分片').info(`已啟動 Cluster #${cluster.id}`);
    });
    cluster.on('reconnecting', () => {
        new logger_1.default('分片').info(`重新連接集群 #${cluster.id} 至 Discord WS`);
    });
    cluster.on('death', () => {
        new logger_1.default('分片').info(`重新聚類集群 ${cluster.id}`);
        manager.recluster?.start();
    });
});
manager.spawn().then(() => {
    setInterval(async () => {
        await manager.broadcastEval(`this.ws.status && this.isReady() ? this.ws.reconnect() : 0`);
    }, 60000);
});
