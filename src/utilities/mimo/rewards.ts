import { locales, uiLocale, type UiLocale } from "../settings/presentation.js";
export const rewardNames = {
  polychrome: ["Polychrome", "菲林", "菲林", "ポリクローム", "폴리크롬", "Polychrome", "Polychrome"],
  dennies: ["Denny", "丁尼", "丁尼", "ディニー", "데니", "Denny", "Denny"],
  seniorLog: ["Senior Investigator Log", "資深調查員記錄", "资深调查员记录", "ベテラン調査員の記録", "베테랑 조사원 기록", "Journal d’enquêteur chevronné", "Nhật Ký Điều Tra Viên Thâm Niên"],
  officialLog: ["Official Investigator Log", "正式調查員記錄", "正式调查员记录", "正式調査員の記録", "정식 조사원 기록", "Journal d’enquêteur officiel", "Nhật Ký Điều Tra Viên Chính Thức"],
  traineeLog: ["Trainee Investigator Log", "見習調查員記錄", "见习调查员记录", "見習い調査員の記録", "견습 조사원 기록", "Journal d’enquêteur stagiaire", "Nhật Ký Điều Tra Viên Tập Sự"],
  engine: ["W-Engine Energy Module", "音擎能源模組", "音擎能源模块", "音動機用エネルギーモジュール", "음동기 에너지 모듈", "Module d’énergie pour moteur-ampli", "Mô-Đun Năng Lượng W-Engine"],
  power: ["W-Engine Power Supply", "音擎能源蓄電池", "音擎能源蓄电池", "音動機用蓄電池", "음동기 에너지 축전지", "Alimentation pour moteur-ampli", "Nguồn Năng Lượng W-Engine"],
  bangbooModule: ["Bangboo Algorithm Module", "邦布演算法模組", "邦布算法模块", "ボンプ用アルゴリズムモジュール", "「Bangboo」 알고리즘 모듈", "Module alogrithmique de Bangbou", "Mô Đun Thuật Toán Bangboo"],
  plating: ["Ether Plating Agent", "以太鍍劑", "以太镀剂", "エーテル助剤", "에테르 도금제", "Agent de placage éthéré", "Dung Dịch Mạ Ether"],
} as const;
export type RewardKind = keyof typeof rewardNames;
const rewardAliases: Partial<Record<RewardKind, string[]>> = { power: ["W-Engine Power Supplies"] };
export function rewardIcon(kind?: string): string | undefined { return kind && kind in rewardNames ? `src/assets/images/zzz/rewards/${kind}.png` : undefined; }
export function rewardName(kind: string, locale: unknown): string { return rewardNames[kind as RewardKind]?.[locales.indexOf(uiLocale(locale))] || kind; }
function key(value: string) { return value.toLowerCase().normalize("NFKC").replace(/[’'\s_\-\u2010-\u2015\u2212]/g, ""); }
export function identifyReward(name: string): RewardKind | undefined {
  const normalized = key(name);
  for (const [kind, names] of Object.entries(rewardNames)) for (const n of [...names, ...(rewardAliases[kind as RewardKind] || [])]) if (normalized.includes(key(n))) return kind as RewardKind;
  if (/dennies/i.test(name)) return "dennies";
  return undefined;
}
export interface RewardDetail { kind?: string; name: string; quantity?: number; icon?: string }
export function localizeReward(value: RewardDetail, locale: unknown): RewardDetail {
  const kind = value.kind || identifyReward(value.name);
  return { ...value, kind, name: kind ? rewardName(kind, locale) : value.name };
}
const wordAmounts: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
};
const leadingQuantity = new RegExp(`^([\\d,]+|${Object.keys(wordAmounts).join("|")})\\s+(.+)$`, "i");
export function parseRewardText(value: string, icon?: string): RewardDetail {
  value = value.normalize("NFKC").trim().replace(/^and\s+/i, "");
  const match = value.match(/(?:[×x＊*]\s*([\d,]+)|\b([\d,]+)\s*[×x＊*])\s*/i);
  const leading = value.match(leadingQuantity);
  const amount = match ? Number((match[1] || match[2]).replace(/,/g, "")) : leading ? wordAmounts[leading[1].toLowerCase()] ?? Number(leading[1].replace(/,/g, "")) : undefined;
  const name = match ? value.replace(match[0], "").trim() : leading ? leading[2].trim() : value.trim();
  return { name, kind: identifyReward(name), quantity: amount && Number.isSafeInteger(amount) ? amount : undefined, icon };
}
export function normalizeRewardDetails(value: unknown, icons: string[] = []): RewardDetail[] {
  const split = (text: string) => text.split(/[、;\n+]|,\s+(?=[^\d\s]|\d+\s+\D)/).map(v => v.trim()).filter(Boolean);
  const list = typeof value === "string" ? split(value) : Array.isArray(value) ? value : [];
  return list.flatMap((v, i): RewardDetail[] => {
    if (typeof v === "string") return split(v).map((part, j) => parseRewardText(part, j === 0 ? icons[i] : undefined));
    if (!v || typeof v.name !== "string") return [];
    return [{ name: v.name, kind: v.kind || identifyReward(v.name), quantity: typeof (v.quantity ?? v.cnt ?? v.count) === "number" ? (v.quantity ?? v.cnt ?? v.count) : undefined, icon: v.icon || v.icon_url || icons[i] }];
  });
}
export function rewardLabel(value: RewardDetail, locale: UiLocale) { const r = localizeReward(value, locale); return r.name + (r.quantity === undefined ? "" : ` × ${r.quantity.toLocaleString(locale === "tw" ? "zh-TW" : locale === "jp" ? "ja" : locale === "kr" ? "ko" : locale === "cn" ? "zh-CN" : locale)}`); }
