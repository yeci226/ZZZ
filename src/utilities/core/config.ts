import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface Config {
  TOKEN: string;
  TEST_TOKEN: string;
  CMDWEBHOOK: string;
  JLWEBHOOK: string;
  LOGWEBHOOK: string;
  FBWEBHOOK: string;
  ERRWEBHOOK: string;
  AUTHTOKEN: string;
  WEBSERVER_PORT: number;
  DEVIDS: string[];
  VERIFY_PUBLIC_URL: string;
  STATS_API_URL: string;
  STATS_API_TOKEN: string;
  /** Vercel proxy API base URL, e.g. https://your-project.vercel.app */
  PROXY_API_URL?: string;
  /** Bearer token to authenticate with the Vercel proxy */
  PROXY_API_TOKEN?: string;
  /** Shared secret used to authenticate the web-login → bot webhook (Bearer) */
  WEBHOOK_SECRET?: string;
  /** Public URL of the web-login app, used in /account button */
  WEB_LOGIN_URL?: string;
  /** Port to bind the webhook HTTP server on (default 3002) */
  WEBHOOK_PORT?: number;
  /** Supabase project URL — used to pull pending logins from web-login */
  SUPABASE_URL?: string;
  /** Supabase service_role key (server-side only) */
  SUPABASE_SERVICE_ROLE_KEY?: string;
  /** AES-256-CBC key used to decrypt cookies pulled from Supabase.
   *  Must match SESSION_SECRET in the web-login .env. */
  WEB_LOGIN_SESSION_SECRET?: string;
  /** Dedicated AES-256 encryption key for user credentials.
   *  If not set, falls back to TOKEN (not recommended). */
  ENCRYPTION_KEY?: string;
}

let config: Config | null = null;

/**
 * Build config from process.env, treating env as the source of truth.
 * Returns a partial config — only keys that are actually set in env are included.
 */
function readFromEnv(): Partial<Config> {
  const env = process.env;
  const out: Partial<Config> = {};

  // String fields
  const stringKeys = [
    "TOKEN",
    "TEST_TOKEN",
    "CMDWEBHOOK",
    "JLWEBHOOK",
    "LOGWEBHOOK",
    "FBWEBHOOK",
    "ERRWEBHOOK",
    "AUTHTOKEN",
    "VERIFY_PUBLIC_URL",
    "STATS_API_URL",
    "STATS_API_TOKEN",
    "PROXY_API_URL",
    "PROXY_API_TOKEN",
    "WEBHOOK_SECRET",
    "WEB_LOGIN_URL",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "WEB_LOGIN_SESSION_SECRET",
    "ENCRYPTION_KEY",
  ] as const;

  for (const key of stringKeys) {
    const value = env[key];
    if (value !== undefined && value !== "") {
      (out as Record<string, unknown>)[key] = value;
    }
  }

  // Number fields
  if (env.WEBSERVER_PORT) {
    const n = Number(env.WEBSERVER_PORT);
    if (!Number.isNaN(n)) out.WEBSERVER_PORT = n;
  }
  if (env.WEBHOOK_PORT) {
    const n = Number(env.WEBHOOK_PORT);
    if (!Number.isNaN(n)) out.WEBHOOK_PORT = n;
  }

  // Array field: DEVIDS — comma-separated string in env, e.g. "111,222,333"
  if (env.DEVIDS) {
    out.DEVIDS = env.DEVIDS.split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  return out;
}

/**
 * Load config.json from cwd if it exists. Returns {} if absent (no longer
 * fatal — env-only deployment is supported).
 */
function readFromFile(): Partial<Config> {
  const configPath = join(process.cwd(), "config.json");
  if (!existsSync(configPath)) return {};

  try {
    const content = readFileSync(configPath, "utf8");
    return JSON.parse(content) as Partial<Config>;
  } catch (error) {
    throw new Error(`读取配置文件失败: ${error}`);
  }
}

export function loadConfig(): Config {
  if (config) {
    return config;
  }

  // env wins; config.json fills gaps. Either source alone may be enough.
  const fromFile = readFromFile();
  const fromEnv = readFromEnv();
  const merged = { ...fromFile, ...fromEnv } as Config;

  // Sanity: TOKEN is the one truly mandatory key for the bot to start.
  if (!merged.TOKEN) {
    throw new Error(
      "配置加载失败: TOKEN is required (set via env TOKEN or config.json)",
    );
  }

  config = merged;
  return config;
}

export function getConfig(): Config {
  const loadedConfig = loadConfig();
  if (!loadedConfig) {
    throw new Error("配置加载失败");
  }
  return loadedConfig;
}

export function getVerifyBaseUrl(): string {
  const cfg = loadConfig();
  return (cfg as any).VERIFY_PUBLIC_URL || "https://verify.yeci.lol/zzz";
}

// 为了兼容性，也提供环境变量风格的访问
export function getEnv(key: string): string | undefined {
  const config = loadConfig();
  return config[key as keyof Config] as string;
}
