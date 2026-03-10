import { client } from "./index.js";
import { Collection } from "discord.js";
import { ClusterClient } from "discord-hybrid-sharding";
import { QuickDB } from "quick.db";
import Logger from "./utilities/core/logger.js";
import { ApplicationCommandType, Client } from "discord.js";
import { getAllFiles } from "./utilities/getAllFiles.js";
import path from "path";
import { fileURLToPath } from "url";
import { VerificationServer } from "./utilities/core/VerificationServer.js";
import OptimizationManager from "./optimizations/index.js";
import { getConfig } from "./utilities/core/config.js";

const config = getConfig();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Client Variables
client.db = new QuickDB();
client.cluster = new ClusterClient(client as unknown as Client); // Cast to Client if needed or augment correctly
client.commands = {
  slash: new Collection(),
  message: new Collection(),
};

async function getMessageCommands(
  client: Client,
  messageCommandPaths: string[],
) {
  const result = [];

  for (let path of messageCommandPaths) {
    const file = (await import(`file://${path}`))?.default;
    const splitted = path.split("/");
    const folder = splitted[splitted.length - 2];

    if (file.name) {
      const properties = { folder, ...file };
      client.commands.message.set(file.name, properties);
      result.push(file);
    }
  }

  return result;
}

async function bindEvents() {
  const eventsDir = path.join(__dirname, "events");
  const paths = await getAllFiles(eventsDir);

  for (let path of paths) {
    await import(`file://${path}`);
  }

  return paths;
}

async function getSlashCommands(client: Client, slashCommandPaths: string[]) {
  const result = [];

  for (let path of slashCommandPaths) {
    const file = (await import(`file://${path}`))?.default;

    if ("data" in file && "execute" in file) {
      client.commands.slash.set(file.data.name, file);
    } else {
      new Logger("系統").error(
        `${path} 處的指令缺少必要的「資料」或「執行」屬性`,
      );
    }
    client.commands.slash.set(file.name, file);

    if (
      [ApplicationCommandType.Message, ApplicationCommandType.User].includes(
        file.type,
      )
    )
      delete file.description;

    result.push(file.data);
  }

  return result;
}

export async function load(client: Client) {
  // Message command
  const messageDir = path.join(__dirname, "commands", "message");
  const messageCommandPaths = await getAllFiles(messageDir);
  const messageCommands = await getMessageCommands(client, messageCommandPaths);

  // Slash command
  const slashDir = path.join(__dirname, "commands", "slash");
  const slashCommandPaths = await getAllFiles(slashDir);
  const slashCommands = await getSlashCommands(client, slashCommandPaths);

  // Event
  const eventPaths = await bindEvents();

  new Logger("系統").success(
    `已載入 ${eventPaths.length} 事件、${slashCommands.length} 斜線指令、${messageCommands.length} 訊息指令`,
  );

  client.on("clientReady", async () => {
    await client.application?.commands.set(slashCommands);
  });
}

await load(client);

// ====================================
// 初始化優化功能
// ====================================
const optimizations = new OptimizationManager(client, client.db);
await optimizations.initialize();

// 將優化工具附加到客户端，以便在其他部分使用
(client as any).optimizations = optimizations.getManager();

// ====================================
// 設置統計數據推送到 personalWeb
// ====================================
if (optimizations.commandUsageTracker) {
  const STATS_API = config.STATS_API_URL;
  const STATS_API_TOKEN = config.STATS_API_TOKEN;

  if (!STATS_API) {
    new Logger("Stats").error(
      "STATS_API_URL is not set, stats push is disabled",
    );
  } else {
    setInterval(async () => {
      try {
        const stats = optimizations.commandUsageTracker?.getStats();
        if (stats && Object.keys(stats).length > 0) {
          // 計算聚合統計
          const totalCommands = Object.values(
            stats as Record<string, any>,
          ).reduce((sum: number, cmd: any) => sum + (cmd.count || 0), 0);
          const totalErrors = Object.values(
            stats as Record<string, any>,
          ).reduce((sum: number, cmd: any) => sum + (cmd.errors || 0), 0);

          const headers: Record<string, string> = {
            "Content-Type": "application/json",
          };
          if (STATS_API_TOKEN) {
            headers.Authorization = `Bearer ${STATS_API_TOKEN}`;
          }

          await fetch(STATS_API, {
            method: "POST",
            headers,
            body: JSON.stringify({
              botId: "zzz",
              botName: "ZZZ",
              timestamp: Date.now(),
              stats: {
                totalCommands24h: totalCommands,
                totalErrors24h: totalErrors,
                topCommands: Object.entries(stats as Record<string, any>)
                  .map(([name, data]: [string, any]) => ({
                    name,
                    count: data.count || 0,
                    avgTimeMs:
                      data.count > 0
                        ? Math.round(data.totalExecutionMs / data.count)
                        : 0,
                    errors: data.errors || 0,
                  }))
                  .sort((a, b) => b.count - a.count)
                  .slice(0, 10),
                byCommand: Object.entries(stats as Record<string, any>).map(
                  ([name, data]: [string, any]) => ({
                    name,
                    count: data.count || 0,
                    errors: data.errors || 0,
                    avgTimeMs:
                      data.count > 0
                        ? Math.round(data.totalExecutionMs / data.count)
                        : 0,
                  }),
                ),
              },
            }),
          }).catch((err) => {
            new Logger("Stats").error(`Failed to push stats: ${err.message}`);
          });
        }
      } catch (error) {
        new Logger("Stats").error(
          `Error pushing stats: ${(error as Error).message}`,
        );
      }
    }, 60_000); // 每 60 秒推送一次
  }
}

// Start Verification Server
if (client.cluster.id === 0) {
  new VerificationServer(client.cluster as any).start();
} else {
  new VerificationServer(client.cluster as any);
}

client.login(
  process.env.NODE_ENV === "dev"
    ? config.TEST_TOKEN || config.TOKEN
    : config.TOKEN,
);
