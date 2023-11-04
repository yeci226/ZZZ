const dotenv = require("dotenv");
const { ClusterManager, HeartbeatManager } = require("discord-hybrid-sharding");
const log = require("./util/logger");
const logger = new log("Shard");
dotenv.config();

const manager = new ClusterManager(`${process.cwd()}/src/index.js`, {
  totalShards: "auto",
  totalClusters: "auto",
  shardsPerClusters: 20,
  mode: "process",
  token:
    process.env.NODE_ENV === "dev" ? process.env.TESTOKEN : process.env.TOKEN,
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
    logger.success(`Launched Cluster ${cluster.id}`);
  });

  cluster.on("reconnecting", () => {
    logger.success(`Reconnecting Cluster ${cluster.id} to discord WS`);
  });
});

manager.spawn({ timeout: -1 });
