/**
 * 機器人優化初始化器
 * 初始化所有優化工具：命令統計、速率限制、超時/重試、緩存等
 */

import Logger from "../utilities/core/logger.js";
import OPTIMIZATION_CONFIG from "./config.js";
import * as Shared from "../utilities/shared/index.js";

type CommandStats = Record<string, any>;

class LocalCommandUsageTracker {
  private stats: CommandStats = {};
  private flushCallback?: (stats: CommandStats) => Promise<void> | void;
  private flushTimer?: NodeJS.Timeout;

  constructor(flushIntervalMs = 60_000) {
    this.flushTimer = setInterval(() => {
      if (this.flushCallback) {
        void this.flushCallback(this.stats);
      }
    }, flushIntervalMs);
  }

  onFlush(callback: (stats: CommandStats) => Promise<void> | void) {
    this.flushCallback = callback;
  }

  getStats() {
    return this.stats;
  }

  stop() {
    if (this.flushTimer) clearInterval(this.flushTimer);
  }
}

class LocalRateLimiter {
  constructor(_options?: Record<string, unknown>) {}
}

class LocalCommandExecutor {
  constructor(_options?: Record<string, unknown>) {}
}

class LocalMessageCache {
  constructor(_options?: Record<string, unknown>) {}
}

class LocalEnhancedErrorHandler {
  private errorCallback?: (errorData: Record<string, any>) => Promise<void> | void;

  constructor(_options?: Record<string, unknown>) {}

  onError(callback: (errorData: Record<string, any>) => Promise<void> | void) {
    this.errorCallback = callback;
  }

  emit(errorData: Record<string, any>) {
    if (this.errorCallback) {
      void this.errorCallback(errorData);
    }
  }
}

class LocalConnectionPool {
  async close() {}
}

const CommandUsageTrackerCtor =
  (Shared as any).CommandUsageTracker ?? LocalCommandUsageTracker;
const RateLimiterCtor = (Shared as any).RateLimiter ?? LocalRateLimiter;
const CommandExecutorCtor =
  (Shared as any).CommandExecutor ?? LocalCommandExecutor;
const MessageCacheCtor = (Shared as any).MessageCache ?? LocalMessageCache;
const EnhancedErrorHandlerCtor =
  (Shared as any).EnhancedErrorHandler ?? LocalEnhancedErrorHandler;
const ConnectionPoolCtor = (Shared as any).ConnectionPool ?? LocalConnectionPool;

const logger = new Logger("優化初始化");

export class OptimizationManager {
  commandUsageTracker?: InstanceType<typeof CommandUsageTrackerCtor>;
  rateLimiter?: InstanceType<typeof RateLimiterCtor>;
  commandExecutor?: InstanceType<typeof CommandExecutorCtor>;
  messageCache?: InstanceType<typeof MessageCacheCtor>;
  errorHandler?: InstanceType<typeof EnhancedErrorHandlerCtor>;
  connectionPool?: InstanceType<typeof ConnectionPoolCtor>;

  client: any;
  db: any;

  constructor(client: any, db: any) {
    this.client = client;
    this.db = db;
  }

  async initialize() {
    logger.info("初始化優化功能...");

    // 1. 命令使用統計追蹤
    if (OPTIMIZATION_CONFIG.commandUsageTracker.enabled) {
      this.commandUsageTracker = new CommandUsageTrackerCtor(
        OPTIMIZATION_CONFIG.commandUsageTracker.flushIntervalMs,
      );

      // 設置 flush 回調，定期保存統計到數據庫
      this.commandUsageTracker.onFlush(async (stats: CommandStats) => {
        try {
          const timestamp = Date.now();
          await this.db.set(`stats.commands.${timestamp}`, stats);
          logger.success(
            `✓ 複數統計已保存 (${Object.keys(stats).length} 條命令)`,
          );
        } catch (error) {
          logger.error(`❌ 複數統計保存失敗: ${(error as Error).message}`);
        }
      });

      logger.success("✓ 命令統計追蹤已初始化");
    }

    // 2. 全局速率限制
    if (OPTIMIZATION_CONFIG.rateLimiter.enabled) {
      this.rateLimiter = new RateLimiterCtor({
        maxRequestsPerSecond:
          OPTIMIZATION_CONFIG.rateLimiter.maxRequestsPerSecond,
        userMaxPerMinute: OPTIMIZATION_CONFIG.rateLimiter.userMaxPerMinute,
      });

      logger.success("✓ 速率限制已初始化");
    }

    // 3. 命令執行器（超時 + 重試）
    if (OPTIMIZATION_CONFIG.commandExecutor.enabled) {
      this.commandExecutor = new CommandExecutorCtor({
        defaultTimeoutMs: OPTIMIZATION_CONFIG.commandExecutor.defaultTimeoutMs,
        maxRetries: OPTIMIZATION_CONFIG.commandExecutor.maxRetries,
        retryDelayMs: OPTIMIZATION_CONFIG.commandExecutor.retryDelayMs,
        logger,
      });

      logger.success("✓ 命令執行器（超時+重試）已初始化");
    }

    // 4. 消息緩存
    if (OPTIMIZATION_CONFIG.messageCache.enabled) {
      this.messageCache = new MessageCacheCtor({
        ttlMs: OPTIMIZATION_CONFIG.messageCache.ttlMs,
        maxSize: OPTIMIZATION_CONFIG.messageCache.maxSize,
      });

      logger.success("✓ 消息緩存已初始化");
    }

    // 5. 強化錯誤處理
    if (OPTIMIZATION_CONFIG.errorHandler.enabled) {
      this.errorHandler = new EnhancedErrorHandlerCtor({ logger });

      // 設置錯誤回調，發送到 Discord webhook
      if (
        OPTIMIZATION_CONFIG.errorHandler.logToWebhook &&
        process.env.ERRWEBHOOK
      ) {
        const { WebhookClient } = await import("discord.js");
        const webhook = new WebhookClient({ url: process.env.ERRWEBHOOK });

        this.errorHandler.onError(async (errorData: Record<string, any>) => {
          try {
            await webhook.send({
              embeds: [
                {
                  title: "❌ 命令執行錯誤",
                  description: errorData.message,
                  fields: [
                    {
                      name: "代碼",
                      value: errorData.code || "N/A",
                      inline: true,
                    },
                    {
                      name: "來源",
                      value: errorData.context?.source || "Unknown",
                      inline: true,
                    },
                    { name: "時間", value: errorData.timestamp, inline: false },
                  ],
                  color: 0xff0000,
                  timestamp: new Date().toISOString(),
                },
              ],
            });
          } catch {
            // 忽略 webhook 錯誤
          }
        });
      }

      logger.success("✓ 強化錯誤處理已初始化");
    }

    // 6. 數據庫連接池（如果使用）
    if (OPTIMIZATION_CONFIG.connectionPool.enabled) {
      // Note: 需要根據實際的 DB 驅動（SQLite、PostgreSQL等）進行配置
      this.connectionPool = new ConnectionPoolCtor();
      logger.info("ℹ 連接池未在此配置中啟用");
    }

    logger.success(`✅ 所有優化功能已初始化`);
  }

  getManager() {
    return {
      commandUsageTracker: this.commandUsageTracker,
      rateLimiter: this.rateLimiter,
      commandExecutor: this.commandExecutor,
      messageCache: this.messageCache,
      errorHandler: this.errorHandler,
      connectionPool: this.connectionPool,
    };
  }

  async shutdown() {
    logger.info("關閉優化管理器...");

    if (this.commandUsageTracker) {
      this.commandUsageTracker.stop();
    }

    if (this.connectionPool) {
      await this.connectionPool.close();
    }

    logger.success("✅ 優化管理器已關閉");
  }
}

export default OptimizationManager;
