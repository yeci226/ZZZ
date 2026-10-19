const CACHE_KEY = "zzzPublicBannerCalendars";
const SCHEDULE_LISTS = ["avatar_gacha_schedule_list", "weapon_gacha_schedule_list"] as const;

type CacheDb = {
  get(key: string): unknown | Promise<unknown>;
  set(key: string, value: unknown): unknown | Promise<unknown>;
};

export interface PublicBannerCalendar {
  schemaVersion: 1;
  updatedAt: number;
  region: string;
  lang: string;
  calendar: Record<typeof SCHEDULE_LISTS[number], Record<string, unknown>[]>;
}

function object(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function timestamp(value: unknown): number | undefined {
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  const number = Number(value);
  if (Number.isFinite(number) && number >= 1_000_000_000) {
    return number >= 10_000_000_000 ? number : number * 1000;
  }
  if (typeof value === "string" && !Number.isFinite(number)) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function relativeTimestamp(value: unknown, now: number): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 && seconds < 1_000_000_000
    ? now + seconds * 1000 : undefined;
}

/** Copy only display metadata; never retain UID, resources, ownership or guarantee state. */
function publicItem(value: unknown, agent: boolean) {
  const item = object(value);
  const number = (value: unknown) => value !== undefined && value !== null && Number.isFinite(Number(value))
    ? Number(value) : undefined;
  return {
    id: String(item.id ?? item.item_id ?? item.avatar_id ?? item.weapon_id ?? ""),
    name: String(agent
      ? item.avatar_name ?? item.full_name ?? item.name ?? "未知項目"
      : item.talent_title ?? item.weapon_name ?? item.name ?? item.full_name ?? "未知項目"),
    icon: String(item.icon ?? item.icon_url ?? item.square_icon ?? ""),
    rarity: String(item.rarity ?? item.rank_type ?? ""),
    element_type: number(item.avatar_element_type ?? item.element_type),
    sub_element_type: number(item.avatar_sub_element_type ?? item.sub_element_type),
    profession: number(item.avatar_profession ?? item.profession),
  };
}

function publicCalendar(value: unknown, now: number): PublicBannerCalendar["calendar"] {
  const calendar = object(value);
  const result: PublicBannerCalendar["calendar"] = { avatar_gacha_schedule_list: [], weapon_gacha_schedule_list: [] };
  for (const key of SCHEDULE_LISTS) {
    const schedules = Array.isArray(calendar[key]) ? calendar[key] : [];
    const agent = key === "avatar_gacha_schedule_list";
    result[key] = schedules.flatMap((value: unknown) => {
      const schedule = object(value);
      const type = String(schedule.gacha_type ?? "").toUpperCase();
      if (type && !(agent ? /CHARACTER|AVATAR/ : /WEAPON|W_ENGINE/).test(type)) return [];
      const state = String(schedule.gacha_state ?? schedule.state ?? "").toUpperCase();
      if (/COMPLETE|INACTIVE|CLOSE|FINISH|EXPIRE|ENDED/.test(state)) return [];
      const start = timestamp(schedule.start_ts ?? schedule.start_time ?? schedule.start_at)
        ?? relativeTimestamp(schedule.left_start_ts ?? schedule.left_start_time, now);
      const end = timestamp(schedule.end_ts ?? schedule.end_time ?? schedule.end_at)
        ?? relativeTimestamp(schedule.left_end_ts ?? schedule.left_end_time, now);
      // An undated snapshot cannot safely remain public indefinitely.
      if (end === undefined || end <= now || (start === undefined && /NOT_START|UPCOMING|LOCK/.test(state))) return [];
      const items = schedule[agent ? "avatar_list" : "weapon_list"] ?? schedule.item_list;
      if (!Array.isArray(items) || !items.length) return [];
      return [{
        gacha_type: type,
        version: String(schedule.version ?? ""),
        start_ts: start,
        end_ts: end,
        gacha_state: start !== undefined && start > now ? "GACHA_STATE_NOT_START" : "GACHA_STATE_IN_PROGRESS",
        [agent ? "avatar_list" : "weapon_list"]: items.map((item) => publicItem(item, agent)),
      }];
    });
  }
  return result;
}

function hasSchedules(calendar: PublicBannerCalendar["calendar"]) {
  return SCHEDULE_LISTS.some((key) => calendar[key].length > 0);
}

export async function cachePublicBannerCalendar(
  db: CacheDb,
  calendar: unknown,
  options: { region: string; lang: string; now?: number },
): Promise<void> {
  const region = options.region.toLowerCase();
  const lang = options.lang.toLowerCase();
  if (![region, lang].every((key) => /^[a-z0-9_-]+$/.test(key))) return;
  const updatedAt = options.now ?? Date.now();
  const sanitized = publicCalendar(calendar, updatedAt);
  if (!hasSchedules(sanitized)) return;
  const snapshot: PublicBannerCalendar = { schemaVersion: 1, updatedAt, region, lang, calendar: sanitized };
  await db.set(`${CACHE_KEY}.${region}.${lang}`, snapshot);
}

export async function getPublicBannerCalendar(
  db: Pick<CacheDb, "get">,
  options: { lang: string; region?: string; now?: number },
): Promise<PublicBannerCalendar | null> {
  const entries = object(await db.get(CACHE_KEY));
  const now = options.now ?? Date.now();
  const snapshots: PublicBannerCalendar[] = [];
  for (const locales of Object.values(entries)) {
    for (const value of Object.values(object(locales))) {
      const snapshot = object(value);
      if (snapshot.schemaVersion !== 1 || !Number.isFinite(snapshot.updatedAt)
        || typeof snapshot.region !== "string" || typeof snapshot.lang !== "string"
        || (options.region && snapshot.region !== options.region)) continue;
      const calendar = publicCalendar(snapshot.calendar, now);
      if (hasSchedules(calendar)) snapshots.push({
        schemaVersion: 1, updatedAt: snapshot.updatedAt, region: snapshot.region, lang: snapshot.lang, calendar,
      });
    }
  }
  snapshots.sort((a, b) => Number(b.lang === options.lang) - Number(a.lang === options.lang)
    || b.updatedAt - a.updatedAt);
  return snapshots[0] ?? null;
}

export function bannerRegionLabel(region: string) {
  const labels: Record<string, string> = {
    prod_gf_jp: "亞洲", prod_gf_sg: "台港澳", prod_gf_us: "美洲", prod_gf_eu: "歐洲",
  };
  return labels[region] ?? region;
}
