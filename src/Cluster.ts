import { getConfig } from "./utilities/core/config.js";

const config = getConfig();

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: string;
    }
  }
}

import { ClusterManager, HeartbeatManager } from "discord-hybrid-sharding";
import Logger from "./utilities/core/logger.js";

const file =
  process.env.NODE_ENV === "dev"
    ? `${process.cwd()}/src/index.ts`
    : `${process.cwd()}/dist/index.js`;

const manager = new ClusterManager(file, {
  totalShards: "auto",
  totalClusters: 5,
  shardsPerClusters: 5,
  mode: "worker",
  token:
    process.env.NODE_ENV === "dev"
      ? config.TEST_TOKEN || config.TOKEN
      : config.TOKEN,
  restarts: {
    max: 5,
    interval: 1000 * 60 * 60 * 2,
  },
});

manager.extend(
  new HeartbeatManager({
    interval: 2000,
    maxMissedHeartbeats: 5,
  })
);

manager.on("clusterCreate", (cluster) => {
  cluster.on("ready", () => {
    new Logger("分片").info(`已啟動 Cluster #${cluster.id}`);
  });

  cluster.on("reconnecting", () => {
    new Logger("分片").info(`重新連接集群 #${cluster.id} 至 Discord WS`);
  });

  cluster.on("death", () => {
    new Logger("分片").info(`重新聚類集群 ${cluster.id}`);
    manager.recluster?.start();
  });
});

manager.spawn().then(() => {
  setInterval(async () => {
    await manager.broadcastEval(
      `this.ws.status && this.isReady() ? this.ws.reconnect() : 0`
    );
  }, 60000);
});
