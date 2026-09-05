import { formatBattleRecordDate } from "./recordDisplay.js";

export type ZzzHistoryKind = "deadly" | "shiyu";

export interface ZzzHistoryEntry {
  kind: ZzzHistoryKind;
  periodId: string;
  periodNumber: number | null;
  schedule: number;
  startTime?: Record<string, number | string>;
  endTime?: Record<string, number | string>;
  savedAt: number;
  data: any;
}

interface ZzzHistoryStore {
  version: 1;
  entries: ZzzHistoryEntry[];
}

type DbLike = {
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: unknown) => Promise<unknown>;
};

const MAX_ENTRIES = 12;
const KEY_PREFIX = "zzz:record-history:v1";

function historyKey(
  kind: ZzzHistoryKind,
  userId: string,
  accountIndex: number,
): string {
  return `${KEY_PREFIX}:${kind}:${userId}:${accountIndex}`;
}

function asRecord(value: unknown): Record<string, any> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : undefined;
}

function keep<T extends Record<string, any>>(value: any, keys: readonly string[]): T {
  const source = asRecord(value);
  const output: Record<string, any> = {};
  if (!source) return output as T;
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) output[key] = source[key];
  }
  return output as T;
}

function compactTime(value: any): Record<string, number | string> | undefined {
  const source = asRecord(value);
  if (!source) return undefined;
  return keep(source, ["year", "month", "day", "hour", "minute", "second"]);
}

function compactAvatar(value: any): Record<string, any> {
  return keep(value, [
    "id",
    "name",
    "name_mi18n",
    "name_cn",
    "name_tw",
    "name_en",
    "level",
    "rank",
    "rarity",
    "rank_type",
    "element_type",
    "role_square_url",
    "role_url",
  ]);
}

function compactBuddy(value: any): Record<string, any> {
  return keep(value, [
    "id",
    "level",
    "rank",
    "rarity",
    "bangboo_rectangle_url",
  ]);
}

function compactBuff(value: any): Record<string, any> | undefined {
  const source = asRecord(value);
  if (!source) return undefined;
  return keep(source, ["identifier", "title", "text", "icon", "name", "desc"]);
}

function compactDeadlyBattle(value: any): Record<string, any> {
  const battle = keep(value, [
    "score",
    "star",
    "battle_time",
    "rank_percent",
    "weakness_list",
    "weakness",
  ]);
  const source = asRecord(value);
  const boss = Array.isArray(source?.boss)
    ? source.boss.map((item) =>
        keep(item, [
          "id",
          "name",
          "icon",
          "bg_icon",
          "weak_element_type",
          "weakness_list",
          "weakness",
        ]),
      )
    : [];
  const buffers = Array.isArray(source?.buffer)
    ? source.buffer.map(compactBuff).filter(Boolean)
    : compactBuff(source?.buffer)
      ? [compactBuff(source?.buffer)]
      : [];
  const avatars = Array.isArray(source?.avatar_list)
    ? source.avatar_list.map(compactAvatar)
    : Array.isArray(source?.avatars)
      ? source.avatars.map(compactAvatar)
      : [];

  return {
    ...battle,
    ...(compactTime(source?.challenge_time)
      ? { challenge_time: compactTime(source?.challenge_time) }
      : {}),
    boss,
    buffer: buffers,
    avatar_list: avatars,
    ...(source?.buddy ? { buddy: compactBuddy(source.buddy) } : {}),
  };
}

function compactDeadlyData(data: any): any {
  const source = asRecord(data) ?? {};
  const output: Record<string, any> = keep(source, [
    "has_data",
    "has_hard",
    "zone_id",
    "schedule_id",
    "nick_name",
    "avatar_icon",
    "total_score",
    "total_star",
    "rank_percent",
    "hard_rank_percent",
  ]);
  const startTime = compactTime(source.start_time ?? source.begin_time);
  const endTime = compactTime(source.end_time);
  if (startTime) output.start_time = startTime;
  if (endTime) output.end_time = endTime;
  output.list = Array.isArray(source.list)
    ? source.list.slice(0, 3).map(compactDeadlyBattle)
    : [];
  output.hard_list = Array.isArray(source.hard_list)
    ? source.hard_list.slice(0, 1).map(compactDeadlyBattle)
    : [];

  const abstract = asRecord(source.abstract_info);
  if (abstract) {
    output.abstract_info = {
      list: Array.isArray(abstract.list)
        ? abstract.list
            .slice(0, 4)
            .map((item) => keep(item, ["nest_type", "rank", "score", "star"]))
        : [],
    };
  }
  return output;
}

function compactShiyuNode(value: any): Record<string, any> {
  const source = asRecord(value);
  const output = keep(source, [
    "node_id",
    "layer_id",
    "is_get_medal",
    "score",
    "battle_time",
    "monster_pic",
    "rating",
  ]);
  if (output.node_id === undefined && output.layer_id !== undefined) {
    output.node_id = String(output.layer_id);
  }
  const challengeTime = compactTime(source?.challenge_time);
  if (challengeTime) output.challenge_time = challengeTime;
  const buffer = compactBuff(source?.buffer);
  if (buffer) output.buffer = buffer;
  if (Array.isArray(source?.avatar_list)) {
    output.avatar_list = source.avatar_list.map(compactAvatar);
  } else if (Array.isArray(source?.avatars)) {
    output.avatars = source.avatars.map(compactAvatar);
  }
  if (source?.buddy) output.buddy = compactBuddy(source.buddy);
  return output;
}

function compactShiyuLayer(value: any): Record<string, any> {
  const source = asRecord(value);
  const output = keep(source, ["rating"]);
  const buffer = compactBuff(source?.buffer);
  if (buffer) output.buffer = buffer;
  output.layer_challenge_info_list = Array.isArray(source?.layer_challenge_info_list)
    ? source.layer_challenge_info_list.slice(0, 3).map(compactShiyuNode)
    : [];
  const challengeTime = compactTime(source?.challenge_time);
  if (challengeTime) output.challenge_time = challengeTime;
  return output;
}

function compactShiyuData(data: any): any {
  const source = asRecord(data) ?? {};
  const info = asRecord(source.hadal_info_v2) ?? {};
  const result: Record<string, any> = {
    hadal_info_v2: {
      zone_id: info.zone_id,
      hadal_begin_time: compactTime(info.hadal_begin_time),
      hadal_end_time: compactTime(info.hadal_end_time),
      brief: keep(info.brief, [
        "score",
        "rank_percent",
        "rating",
        "battle_time",
        "challenge_time",
      ]),
    },
  };
  const briefTime = compactTime(info.brief?.challenge_time);
  if (briefTime) result.hadal_info_v2.brief.challenge_time = briefTime;

  const layerKeys = [
    "first_layer_detail",
    "second_layer_detail",
    "third_layer_detail",
    "fourth_layer_detail",
    "fitfh_layer_detail",
    "fifth_layer_detail",
  ];
  for (const key of layerKeys) {
    if (info[key]) result.hadal_info_v2[key] = compactShiyuLayer(info[key]);
  }
  return result;
}

function periodNumber(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const normalized = Math.abs(Math.trunc(numeric));
  return normalized >= 100 ? normalized % 100 : normalized;
}

function periodId(kind: ZzzHistoryKind, data: any, schedule: number): string {
  const source = kind === "shiyu" ? data?.hadal_info_v2 : data;
  const id = source?.zone_id ?? source?.period_id ?? source?.schedule_id;
  return id !== undefined && id !== null ? String(id) : `schedule-${schedule}`;
}

function dateValue(value: any): number {
  const source = asRecord(value);
  if (!source) return 0;
  return Number(
    `${source.year ?? 0}${String(source.month ?? 0).padStart(2, "0")}${String(source.day ?? 0).padStart(2, "0")}`,
  );
}

function entrySortValue(entry: ZzzHistoryEntry): number {
  return Math.max(dateValue(entry.startTime), dateValue(entry.endTime), Number(entry.periodNumber ?? 0));
}

function normalizeStore(value: unknown, kind: ZzzHistoryKind): ZzzHistoryStore {
  const source = asRecord(value);
  const entries = Array.isArray(source?.entries) ? source.entries : [];
  return {
    version: 1,
    entries: entries
      .filter((entry): entry is ZzzHistoryEntry =>
        Boolean(entry && typeof entry === "object" && (entry as any).kind === kind),
      )
      .map((entry) => ({
        ...entry,
        periodId: String(entry.periodId),
        schedule: Number(entry.schedule) === 2 ? 2 : 1,
        periodNumber: periodNumber(entry.periodNumber),
      }))
      .sort((a, b) => entrySortValue(b) - entrySortValue(a))
      .slice(0, MAX_ENTRIES),
  };
}

async function readStore(
  db: DbLike,
  kind: ZzzHistoryKind,
  userId: string,
  accountIndex: number,
): Promise<ZzzHistoryStore> {
  try {
    return normalizeStore(await db.get(historyKey(kind, userId, accountIndex)), kind);
  } catch {
    return { version: 1, entries: [] };
  }
}

export async function listZzzHistory(
  db: DbLike,
  kind: ZzzHistoryKind,
  userId: string,
  accountIndex: number,
): Promise<ZzzHistoryEntry[]> {
  return (await readStore(db, kind, userId, accountIndex)).entries;
}

export async function getZzzHistoryEntry(
  db: DbLike,
  kind: ZzzHistoryKind,
  userId: string,
  accountIndex: number,
  value: string,
): Promise<ZzzHistoryEntry | null> {
  const match = /^history:(deadly|shiyu):([^:]+)$/.exec(value);
  if (!match || match[1] !== kind) return null;
  const entries = await listZzzHistory(db, kind, userId, accountIndex);
  return entries.find((entry) => entry.periodId === match[2]) ?? null;
}

export async function saveDeadlyHistory(
  db: DbLike,
  userId: string,
  accountIndex: number,
  schedule: number,
  data: any,
): Promise<void> {
  const entry: ZzzHistoryEntry = {
    kind: "deadly",
    periodId: periodId("deadly", data, schedule),
    periodNumber: periodNumber(data?.zone_id ?? data?.schedule_id),
    schedule: schedule === 2 ? 2 : 1,
    startTime: compactTime(data?.start_time ?? data?.begin_time),
    endTime: compactTime(data?.end_time),
    savedAt: Date.now(),
    data: compactDeadlyData(data),
  };
  const store = await readStore(db, "deadly", userId, accountIndex);
  const remaining = store.entries.filter((item) => item.periodId !== entry.periodId);
  remaining.push(entry);
  remaining.sort((a, b) => entrySortValue(b) - entrySortValue(a));
  await db.set(historyKey("deadly", userId, accountIndex), {
    version: 1,
    entries: remaining.slice(0, MAX_ENTRIES),
  });
}

export async function saveShiyuHistory(
  db: DbLike,
  userId: string,
  accountIndex: number,
  schedule: number,
  data: any,
): Promise<void> {
  const info = data?.hadal_info_v2;
  const entry: ZzzHistoryEntry = {
    kind: "shiyu",
    periodId: periodId("shiyu", data, schedule),
    periodNumber: periodNumber(info?.zone_id),
    schedule: schedule === 2 ? 2 : 1,
    startTime: compactTime(info?.hadal_begin_time),
    endTime: compactTime(info?.hadal_end_time),
    savedAt: Date.now(),
    data: compactShiyuData(data),
  };
  const store = await readStore(db, "shiyu", userId, accountIndex);
  const remaining = store.entries.filter((item) => item.periodId !== entry.periodId);
  remaining.push(entry);
  remaining.sort((a, b) => entrySortValue(b) - entrySortValue(a));
  await db.set(historyKey("shiyu", userId, accountIndex), {
    version: 1,
    entries: remaining.slice(0, MAX_ENTRIES),
  });
}

function localeParts(locale: string): {
  current: string;
  previous: string;
  period: string;
  rangeSeparator: string;
  deadlyExtreme: string;
  deadlyNormal: string;
  score: string;
  stars: string;
} {
  const normalized = locale.toLowerCase();
  if (normalized === "cn" || normalized === "zh-cn") {
    return { current: "本期", previous: "上期", period: "期", rangeSeparator: " - ", deadlyExtreme: "绝境", deadlyNormal: "试炼", score: "分", stars: "星" };
  }
  if (normalized === "jp" || normalized === "ja" || normalized === "ja-jp") {
    return { current: "今期", previous: "前期", period: "期", rangeSeparator: " - ", deadlyExtreme: "极限", deadlyNormal: "试炼", score: "分", stars: "星" };
  }
  if (normalized === "kr" || normalized === "ko" || normalized === "ko-kr") {
    return { current: "이번", previous: "이전", period: "기", rangeSeparator: " - ", deadlyExtreme: "극한", deadlyNormal: "시련", score: "점", stars: "별" };
  }
  if (normalized === "fr" || normalized === "fr-fr") {
    return { current: "Actuelle", previous: "Précédente", period: "", rangeSeparator: " - ", deadlyExtreme: "Extrême", deadlyNormal: "Épreuve", score: " pts", stars: "★" };
  }
  if (normalized === "vi" || normalized === "vi-vn") {
    return { current: "Hiện tại", previous: "Trước", period: "", rangeSeparator: " - ", deadlyExtreme: "Cực hạn", deadlyNormal: "Thử thách", score: " điểm", stars: " sao" };
  }
  if (normalized !== "tw" && normalized !== "zh-tw") {
    return { current: "Current", previous: "Previous", period: "", rangeSeparator: " - ", deadlyExtreme: "Extreme", deadlyNormal: "Trial", score: " pts", stars: "★" };
  }
  return { current: "本期", previous: "上期", period: "期", rangeSeparator: " - ", deadlyExtreme: "絕境", deadlyNormal: "試煉", score: "分", stars: "星" };
}

function rangeLabel(entry: ZzzHistoryEntry, locale: string): string {
  if (!entry.startTime || !entry.endTime) return "";
  return `${formatBattleRecordDate(entry.startTime as any, locale)}${locale.toLowerCase() === "ko" || locale.toLowerCase() === "ko-kr" ? " - " : " - "}${formatBattleRecordDate(entry.endTime as any, locale)}`;
}

function scoreLabel(value: unknown, stars: unknown, parts: ReturnType<typeof localeParts>): string {
  const score = Number(value);
  const star = Number(stars);
  if (!Number.isFinite(score) && !Number.isFinite(star)) return "";
  if (Number.isFinite(score) && Number.isFinite(star) && star >= 0) return `${score}${parts.score}${star}${parts.stars}`;
  if (Number.isFinite(score)) return `${score}${parts.score}`;
  if (Number.isFinite(star)) return `${star}${parts.stars}`;
  return "";
}

function deadlySummary(entry: ZzzHistoryEntry, locale: string): string {
  const parts = localeParts(locale);
  const data = entry.data ?? {};
  const hard = Array.isArray(data.hard_list) ? data.hard_list[0] : undefined;
  const normalScore = scoreLabel(data.total_score, data.total_star, parts);
  const hardScore = scoreLabel(hard?.score, hard?.star, parts);
  const suffix = [
    hardScore ? `${parts.deadlyExtreme}${hardScore}` : "",
    normalScore ? `${parts.deadlyNormal}${normalScore}` : "",
  ].filter(Boolean).join(" ");
  return suffix;
}

function shiyuSummary(entry: ZzzHistoryEntry, parts: ReturnType<typeof localeParts>): string {
  const brief = entry.data?.hadal_info_v2?.brief;
  return scoreLabel(brief?.score, undefined, parts) || String(brief?.rating ?? "");
}

export function formatZzzHistoryChoice(
  entry: ZzzHistoryEntry,
  index: number,
  locale: string,
): { name: string; value: string } {
  const parts = localeParts(locale);
  const relative = index === 0 ? parts.current : index === 1 ? parts.previous : "";
  const period = entry.periodNumber !== null ? `${relative ? `${relative} ` : ""}${entry.periodNumber}${parts.period}` : relative;
  const range = rangeLabel(entry, locale);
  const summary = entry.kind === "deadly" ? deadlySummary(entry, locale) : shiyuSummary(entry, parts);
  const name = [period, range, summary].filter(Boolean).join(" ") || `${relative || "Record"}`;
  return {
    name: name.slice(0, 100),
    value: `history:${entry.kind}:${entry.periodId}`.slice(0, 100),
  };
}

export function formatZzzLiveScheduleChoice(
  kind: ZzzHistoryKind,
  schedule: number,
  locale: string,
  data: any,
): { name: string; value: string } {
  const source = kind === "shiyu" ? data?.hadal_info_v2 : data;
  const entry: ZzzHistoryEntry = {
    kind,
    periodId: String(
      source?.zone_id ?? source?.schedule_id ?? `schedule-${schedule}`,
    ),
    periodNumber: periodNumber(source?.zone_id ?? source?.schedule_id),
    schedule: schedule === 2 ? 2 : 1,
    startTime: compactTime(
      kind === "shiyu"
        ? source?.hadal_begin_time
        : source?.start_time ?? source?.begin_time,
    ),
    endTime: compactTime(
      kind === "shiyu" ? source?.hadal_end_time : source?.end_time,
    ),
    savedAt: 0,
    data: kind === "shiyu" ? compactShiyuData(data) : compactDeadlyData(data),
  };
  return {
    ...formatZzzHistoryChoice(entry, schedule === 1 ? 0 : 1, locale),
    value: String(schedule),
  };
}

export function getLiveScheduleChoices(
  kind: ZzzHistoryKind,
  locale: string,
  focusedValue = "",
): Array<{ name: string; value: string }> {
  const parts = localeParts(locale);
  const choices = [
    { name: `${parts.current}（即時載入）`, value: "1" },
    { name: `${parts.previous}（即時載入）`, value: "2" },
  ];
  const query = focusedValue.toLowerCase();
  return choices.filter((choice) => !query || choice.name.toLowerCase().includes(query) || choice.value.includes(query));
}

export async function getZzzScheduleAutocompleteChoices(
  db: DbLike,
  kind: ZzzHistoryKind,
  userId: string,
  accountIndex: number,
  locale: string,
  focusedValue = "",
): Promise<Array<{ name: string; value: string }>> {
  const entries = await listZzzHistory(db, kind, userId, accountIndex);
  const history = entries.map((entry, index) => formatZzzHistoryChoice(entry, index, locale));
  const choices = [...getLiveScheduleChoices(kind, locale, ""), ...history];
  const query = focusedValue.toLowerCase();
  return choices
    .filter((choice) => !query || choice.name.toLowerCase().includes(query) || choice.value.toLowerCase().includes(query))
    .slice(0, 25);
}

export function parseHistorySchedule(value: string | null): boolean {
  return typeof value === "string" && value.startsWith("history:");
}
