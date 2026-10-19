export const CATEGORIES = [
  "update",
  "preload",
  "maintenance",
  "character_reveal",
  "character",
  "banner",
  "event",
  "preview",
  "other",
] as const;
export type NewsCategory = (typeof CATEGORIES)[number];
export type NewsGame = "hsr" | "zzz";
export type NewsLocale = "tw" | "cn" | "en" | "jp" | "kr" | "fr" | "vi";
export const DEFAULT_CATEGORIES: NewsCategory[] = [
  "update",
  "preload",
  "maintenance",
  "character_reveal",
];
export const API_LOCALES: Record<NewsLocale, string> = {
  tw: "zh-tw",
  cn: "zh-cn",
  en: "en-us",
  jp: "ja-jp",
  kr: "ko-kr",
  fr: "fr-fr",
  vi: "vi-vn",
};
export const LOCALE_LABELS: Record<NewsLocale, string> = {
  tw: "繁體中文",
  cn: "简体中文",
  en: "English",
  jp: "日本語",
  kr: "한국어",
  fr: "Français",
  vi: "Tiếng Việt",
};
export const GAME_CONFIG = {
  hsr: {
    gids: 6,
    officialUid: "172534910",
    branchId: "4ziysqXOQ8",
    maintBiz: "hkrpg_cn",
    maintUrl:
      "https://cg-hkrpg-api.mihoyo.com/hkrpg_cn/cg/gamer/api/getGlobalApplicationMaintenance",
    locales: ["tw", "cn", "en"] as NewsLocale[],
  },
  zzz: {
    gids: 8,
    officialUid: "219270333",
    branchId: "U5hbdsT9W7",
    maintBiz: "nap_global",
    maintUrl:
      "https://sg-cg-nap-api.hoyoverse.com/nap_global/cg/gamer/api/getGlobalApplicationMaintenance",
    locales: ["tw", "cn", "en", "jp", "kr", "fr", "vi"] as NewsLocale[],
  },
};

export function resolveNewsLocale(
  game: NewsGame,
  ...values: unknown[]
): NewsLocale {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const lower = value.toLowerCase().replace(/_/g, "-");
    const aliases: Record<string, string> = {
      "zh-tw": "tw",
      "zh-hant": "tw",
      "zh-cn": "cn",
      "zh-hans": "cn",
      ja: "jp",
      ko: "kr",
    };
    const prefix = lower.split("-")[0]!;
    const mapped = aliases[lower] ?? aliases[prefix] ?? prefix;
    if (GAME_CONFIG[game].locales.includes(mapped as NewsLocale))
      return mapped as NewsLocale;
  }
  return "en";
}

export interface NewsSubscription {
  id: string;
  scope: "dm" | "channel";
  userId: string;
  guildId: string | null;
  channelId: string | null;
  locale: NewsLocale;
  categories: NewsCategory[];
  roleId: string | null;
  enabled: boolean;
  invalidReason: string | null;
  revision: number;
  updatedAt: number;
  categorySince: Partial<Record<NewsCategory, number>>;
}
export interface NewsEvent {
  authorName?: string;
  article?: import("./article.js").ArticleDocument;
  simulated?: boolean;
  id: string;
  game: NewsGame;
  source: "hoyolab" | "hoyoplay" | "maintenance";
  locale: NewsLocale | null;
  categories: NewsCategory[];
  publishedAt: number;
  title: string;
  summary: string;
  image: string | null;
  url: string;
  kind:
    "article" | "update" | "preload" | "maintenance_start" | "maintenance_end";
  version: string | null;
}
export interface NewsDelivery {
  eventId: string;
  subscriptionId: string;
  revision: number;
  attempts: number;
}
export interface UpdateSnapshot {
  main: string;
  preload: string | null;
}
export interface UpdateState extends UpdateSnapshot {
  highestPreload: string | null;
}
export interface MaintenanceState {
  active: boolean;
  cycle: number;
}
export const DAY_MS = 86_400_000;

export function newSubscription(
  userId: string,
  locale: NewsLocale,
): NewsSubscription {
  return {
    id: `dm:${userId}`,
    scope: "dm",
    userId,
    guildId: null,
    channelId: null,
    locale,
    categories: [...DEFAULT_CATEGORIES],
    roleId: null,
    enabled: false,
    invalidReason: null,
    revision: 0,
    updatedAt: 0,
    categorySince: {},
  };
}
