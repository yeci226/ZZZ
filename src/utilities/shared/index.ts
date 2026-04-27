/**
 * Local port of @bot/shared (originally an external workspace package).
 *
 * Provides:
 * - Logger: scoped colored console logger
 * - TtlCache: time-bounded LRU-ish cache with single-flight getOrSetAsync
 * - fireAndForget: swallow promise rejections with optional logger
 * - getCommandAckPlan / ensureDeferredReply / replyOrFollowUp: Discord interaction ack helpers
 *
 * Inlined here so deploys (e.g. fresh VPS install) don't need a parent
 * `packages/shared` workspace to resolve the import.
 */

const LEVEL_COLORS: Record<string, string> = {
  info: "\x1b[36m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
  success: "\x1b[32m",
  command: "\x1b[35m",
  debug: "\x1b[90m",
};

const RESET = "\x1b[0m";
const EPHEMERAL_FLAG = 64;

interface CacheEntry<V> {
  value: V;
  expiresAt: number;
}

export class TtlCache<K = string, V = unknown> {
  private ttlMs: number;
  private maxSize: number;
  private store: Map<K, CacheEntry<V>>;
  private inFlight: Map<K, Promise<V | undefined>>;

  constructor(ttlMs = 60_000, maxSize = 5_000) {
    this.ttlMs = ttlMs;
    this.maxSize = maxSize;
    this.store = new Map();
    this.inFlight = new Map();
  }

  get(key: K): V | undefined {
    const item = this.store.get(key);
    if (!item) return undefined;

    if (item.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }

    return item.value;
  }

  set(key: K, value: V): void {
    if (this.store.size >= this.maxSize) {
      const firstKey = this.store.keys().next().value;
      if (firstKey !== undefined) {
        this.store.delete(firstKey as K);
      }
    }

    this.store.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  delete(key: K): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
    this.inFlight.clear();
  }

  async getOrSetAsync(
    key: K,
    loader: () => Promise<V | undefined>,
  ): Promise<V | undefined> {
    const cached = this.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const existing = this.inFlight.get(key);
    if (existing) {
      return existing;
    }

    const pending = (async () => {
      try {
        const value = await loader();
        if (value !== undefined) {
          this.set(key, value);
        }
        return value;
      } finally {
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, pending);
    return pending;
  }
}

export function fireAndForget(
  promise: Promise<unknown> | null | undefined,
  logger?: { error: (...args: unknown[]) => void },
): void {
  if (!promise || typeof (promise as Promise<unknown>).then !== "function") return;

  (promise as Promise<unknown>).catch((error) => {
    if (logger && typeof logger.error === "function") {
      logger.error((error as Error)?.message || String(error));
      return;
    }
    console.error(error);
  });
}

export interface CommandAckPlan {
  shouldDefer: boolean;
  ephemeral: boolean;
  usesModal: boolean;
}

export function getCommandAckPlan(
  command: any,
  options: { defaultEphemeral?: boolean } = {},
): CommandAckPlan {
  const defaultEphemeral = options.defaultEphemeral ?? true;
  const meta = command?.meta ?? {};

  const usesModal =
    command?.usesModal === true ||
    command?.showModal === true ||
    command?.opensModal === true ||
    meta.usesModal === true;

  const autoDefer =
    command?.autoDefer === true ||
    command?.defer === true ||
    meta.autoDefer === true;

  const ephemeral =
    command?.ephemeral ??
    command?.defaultEphemeral ??
    command?.autoDeferEphemeral ??
    meta.ephemeral ??
    meta.defaultEphemeral ??
    defaultEphemeral;

  return {
    shouldDefer: autoDefer && !usesModal,
    ephemeral: Boolean(ephemeral),
    usesModal,
  };
}

export async function ensureDeferredReply(
  interaction: any,
  ephemeral = true,
): Promise<boolean> {
  if (!interaction || interaction.deferred || interaction.replied) {
    return false;
  }

  const options = ephemeral ? { flags: EPHEMERAL_FLAG } : {};
  await interaction.deferReply(options);
  return true;
}

export async function replyOrFollowUp(
  interaction: any,
  payload: any,
): Promise<any> {
  if (!interaction) return null;

  if (interaction.deferred || interaction.replied) {
    return interaction.followUp(payload);
  }

  return interaction.reply(payload);
}

export class Logger {
  private scope: string;

  constructor(scope = "App") {
    this.scope = scope;
  }

  info(...args: unknown[]): void {
    this.write("info", args);
  }

  warn(...args: unknown[]): void {
    this.write("warn", args);
  }

  error(...args: unknown[]): void {
    this.write("error", args);
  }

  success(...args: unknown[]): void {
    this.write("success", args);
  }

  command(...args: unknown[]): void {
    this.write("command", args);
  }

  debug(...args: unknown[]): void {
    this.write("debug", args);
  }

  private write(level: string, args: unknown[]): void {
    const ts = new Date().toISOString();
    const color = LEVEL_COLORS[level] || "";
    const head = `${color}[${ts}] [${this.scope}] [${level.toUpperCase()}]${RESET}`;

    if (level === "error") {
      console.error(head, ...args);
      return;
    }

    if (level === "warn") {
      console.warn(head, ...args);
      return;
    }

    console.log(head, ...args);
  }
}
