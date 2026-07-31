export type DeadlyAssaultViewMode = "normal" | "extreme";

export interface DeadlyModeContext {
  ownerId: string;
  targetUserId: string;
  accountIndex: number;
  schedule: number;
}

export interface DeadlyModePayload {
  list?: unknown[];
  has_hard?: boolean;
  hard_list?: unknown[];
}

export interface DeadlyModeLabels {
  placeholder: string;
  normal: string;
  extreme: string;
  score: string;
  stars: string;
  clearTime: string;
  team: string;
  bangboo: string;
  weakness: string;
  buff: string;
}

export interface DeadlyModeSelectData {
  customId: string;
  placeholder: string;
  options: Array<{
    label: string;
    value: DeadlyAssaultViewMode;
    default: boolean;
  }>;
}

const CUSTOM_ID_PREFIX = "deadly-mode";
const DISCORD_ID_PATTERN = /^\d{1,20}$/;

export function hasDeadlyExtremeMode(data: DeadlyModePayload): boolean {
  return (
    data.has_hard === true &&
    Array.isArray(data.hard_list) &&
    data.hard_list.length > 0
  );
}

export function getDeadlyModeBattle(
  data: DeadlyModePayload,
  requestedMode: DeadlyAssaultViewMode,
):
  | { mode: "normal"; battles: unknown[] }
  | { mode: "extreme"; battle: unknown } {
  if (requestedMode === "extreme" && hasDeadlyExtremeMode(data)) {
    return { mode: "extreme", battle: data.hard_list![0] };
  }

  return {
    mode: "normal",
    battles: Array.isArray(data.list) ? data.list : [],
  };
}

export function buildDeadlyModeCustomId(context: DeadlyModeContext): string {
  const customId = [
    CUSTOM_ID_PREFIX,
    context.ownerId,
    context.targetUserId,
    context.accountIndex,
    context.schedule,
  ].join(":");

  if (!parseDeadlyModeCustomId(customId) || customId.length > 100) {
    throw new Error("Invalid Deadly Assault mode context");
  }

  return customId;
}

export function parseDeadlyModeCustomId(
  customId: string,
): DeadlyModeContext | null {
  const [prefix, ownerId, targetUserId, accountIndexRaw, scheduleRaw, ...rest] =
    customId.split(":");
  if (
    prefix !== CUSTOM_ID_PREFIX ||
    rest.length > 0 ||
    !DISCORD_ID_PATTERN.test(ownerId || "") ||
    !DISCORD_ID_PATTERN.test(targetUserId || "") ||
    !/^\d+$/.test(accountIndexRaw || "") ||
    !/^[12]$/.test(scheduleRaw || "")
  ) {
    return null;
  }

  const accountIndex = Number(accountIndexRaw);
  const schedule = Number(scheduleRaw);
  if (!Number.isSafeInteger(accountIndex) || accountIndex < 0) return null;

  return { ownerId, targetUserId, accountIndex, schedule };
}

export function buildDeadlyModeSelectData(
  locale: string,
  data: DeadlyModePayload,
  mode: DeadlyAssaultViewMode,
  context: DeadlyModeContext,
): DeadlyModeSelectData | null {
  if (!hasDeadlyExtremeMode(data)) return null;
  const labels = getDeadlyModeLabels(locale);
  return {
    customId: buildDeadlyModeCustomId(context),
    placeholder: labels.placeholder,
    options: [
      {
        label: labels.normal,
        value: "normal",
        default: mode === "normal",
      },
      {
        label: labels.extreme,
        value: "extreme",
        default: mode === "extreme",
      },
    ],
  };
}

export function getDeadlyModeLabels(locale: string): DeadlyModeLabels {
  const normalized = locale.toLowerCase();
  if (normalized === "cn" || normalized === "zh-cn") {
    return {
      placeholder: "切换危局强袭战模式",
      normal: "一般模式",
      extreme: "绝境模式",
      score: "分数",
      stars: "星数",
      clearTime: "过关时刻",
      team: "出战队伍",
      bangboo: "邦布",
      weakness: "弱点",
      buff: "增益效果",
    };
  }

  if (normalized !== "tw" && normalized !== "zh-tw") {
    return {
      placeholder: "Switch Deadly Assault mode",
      normal: "Normal Mode",
      extreme: "Extreme Mode",
      score: "Score",
      stars: "Stars",
      clearTime: "Clear Time",
      team: "Team",
      bangboo: "Bangboo",
      weakness: "Weakness",
      buff: "Stage Effect",
    };
  }

  return {
    placeholder: "切換危局強襲戰模式",
    normal: "一般模式",
    extreme: "絕境模式",
    score: "分數",
    stars: "星數",
    clearTime: "過關時刻",
    team: "出戰隊伍",
    bangboo: "邦布",
    weakness: "弱點",
    buff: "增益效果",
  };
}
