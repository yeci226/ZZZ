import { requestZzzRecordApi } from "./officialRecordApi.js";

export type ProfilePeriodStatus = "ready" | "empty" | "unavailable";
export interface ProfileBattleSummary {
  score: number;
  rank: number | null;
  stars?: number;
  floor?: number;
  rating?: string;
}
export interface ProfilePeriod {
  schedule: 1 | 2;
  status: ProfilePeriodStatus;
  start: string;
  end: string;
}
export interface ProfileDeadlyPeriod extends ProfilePeriod {
  extreme: ProfileBattleSummary | null;
  trial: ProfileBattleSummary | null;
}
export interface ProfileShiyuPeriod extends ProfilePeriod {
  battle: ProfileBattleSummary | null;
}
export interface ProfileMainData {
  account: {
    nickname?: string;
    level?: number;
    game_role_id: string;
    region_name?: string;
  };
  record: any;
  /** All owned agents for the existing Discord selector. */
  characters: any[];
  /** Only the publicly displayed agents, in HoYoLAB order. */
  showcase: any[];
  deadly: ProfileDeadlyPeriod[];
  shiyu: ProfileShiyuPeriod[];
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

export function formatProfileRank(raw: unknown): string | null {
  const value = numberOrNull(raw);
  if (value === null || value === 0) return null;
  return value > 5000 ? "50.00%+" : `${(value / 100).toFixed(2)}%`;
}

function date(value: any): string {
  if (!value?.year || !value?.month || !value?.day) return "";
  return `${value.year}.${String(value.month).padStart(2, "0")}.${String(value.day).padStart(2, "0")}`;
}

export function normalizeProfileDeadly(
  data: any,
  schedule: 1 | 2,
): ProfileDeadlyPeriod {
  const modes = Array.isArray(data?.list) ? data.list : [];
  const summary = (names: string[]): ProfileBattleSummary | null => {
    const mode = modes.find((entry: any) =>
      names.includes(String(entry.nest_type).toLowerCase()),
    );
    if (!mode || ![mode.score, mode.star, mode.rank].some((n) => Number(n) > 0))
      return null;
    return {
      score: numberOrNull(mode.score) ?? 0,
      rank: numberOrNull(mode.rank),
      stars: numberOrNull(mode.star) ?? undefined,
    };
  };
  const extreme = summary(["hard", "extreme", "2"]);
  const trial = summary(["general", "normal", "trial", "1"]);
  return {
    schedule,
    status: extreme || trial ? "ready" : "empty",
    start: date(data?.start_time),
    end: date(data?.end_time),
    extreme,
    trial,
  };
}

export function normalizeProfileShiyu(
  data: any,
  schedule: 1 | 2,
): ProfileShiyuPeriod {
  const info = data?.hadal_info_v2;
  const brief = info?.brief;
  const hasBattle =
    brief &&
    [brief.score, brief.cur_period_zone_layer_count, brief.rank_percent].some(
      (n) => Number(n) > 0,
    );
  return {
    schedule,
    status: hasBattle ? "ready" : "empty",
    start: date(info?.hadal_begin_time),
    end: date(info?.hadal_end_time),
    battle: hasBattle
      ? {
          score: numberOrNull(brief.score) ?? 0,
          rank: numberOrNull(brief.rank_percent),
          floor: numberOrNull(brief.cur_period_zone_layer_count) ?? undefined,
          rating: brief.rating || undefined,
        }
      : null,
  };
}

export interface ProfileMainLoadOptions {
  targetUserId: string;
  accountIndex: number;
  locale: string;
  loadAccount: (
    userId: string,
    locale: string,
    accountIndex: number,
  ) => Promise<any>;
  characters?: any[];
}

/** The SDK shares one mutable request builder, so all calls stay sequential. */
export async function loadProfileMainData(
  zzz: any,
  options: ProfileMainLoadOptions,
): Promise<ProfileMainData> {
  const record = await zzz.record.records();
  const characters = options.characters ?? (await zzz.record.characters());
  const account = await options.loadAccount(
    options.targetUserId,
    options.locale,
    options.accountIndex,
  );
  const data: ProfileMainData = {
    account: {
      ...(account?.game_role_id &&
      String(account.game_role_id) !== String(zzz.uid)
        ? {}
        : account),
      game_role_id: String(zzz.uid),
    },
    record,
    characters,
    showcase: (record?.avatar_list ?? []).slice(0, 9),
    deadly: [],
    shiyu: [],
  };
  for (const schedule of [1, 2] as const) {
    try {
      const result = await requestZzzRecordApi(zzz, "hadal_mem_abstract_info", {
        schedule_type: schedule,
        need_all: "true",
      });
      if (!Array.isArray(result?.list))
        throw new Error("Invalid Deadly Assault summary");
      data.deadly.push(normalizeProfileDeadly(result, schedule));
    } catch {
      data.deadly.push({
        schedule,
        status: "unavailable",
        start: "",
        end: "",
        extreme: null,
        trial: null,
      });
    }
    try {
      const result = await zzz.record.hadalInfo(schedule);
      if (
        !result ||
        typeof result !== "object" ||
        !Object.hasOwn(result, "hadal_info_v2")
      )
        throw new Error("Invalid Shiyu summary");
      data.shiyu.push(normalizeProfileShiyu(result, schedule));
    } catch {
      data.shiyu.push({
        schedule,
        status: "unavailable",
        start: "",
        end: "",
        battle: null,
      });
    }
  }
  return data;
}
