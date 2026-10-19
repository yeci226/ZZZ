/** Percentages use percentage points (24 means 24%), never fractions. */
export const SUB_ROLL = {
  HP: 112, ATK: 19, DEF: 15, "HP%": 3, "ATK%": 3, "DEF%": 4.8,
  CRIT_Rate: 2.4, CRIT_DMG: 4.8, PEN: 9, Anomaly_Proficiency: 9,
} as const;
export type SubStat = keyof typeof SUB_ROLL;
export type Stat = SubStat | "Element_DMG" | "PEN_Ratio" | "Impact" | "Energy_Regen" | "Anomaly_Mastery";
export const MAIN_MAX: Record<Stat, number> = {
  HP: 2200, ATK: 316, DEF: 184, "HP%": 30, "ATK%": 30, "DEF%": 48,
  CRIT_Rate: 24, CRIT_DMG: 48, PEN: 0, Anomaly_Proficiency: 92,
  Element_DMG: 30, PEN_Ratio: 24, Impact: 18, Energy_Regen: 60, Anomaly_Mastery: 30,
};
export const MAIN_SLOTS: Record<number, readonly Stat[]> = {
  1: ["HP"], 2: ["ATK"], 3: ["DEF"],
  4: ["HP%", "ATK%", "DEF%", "CRIT_Rate", "CRIT_DMG", "Anomaly_Proficiency"],
  5: ["HP%", "ATK%", "DEF%", "Element_DMG", "PEN_Ratio"],
  6: ["HP%", "ATK%", "DEF%", "Impact", "Energy_Regen", "Anomaly_Mastery"],
};
export const ELEMENTS = ["physical", "fire", "ice", "electric", "ether", "wind", "luminous"] as const;
export type Element = typeof ELEMENTS[number];
export interface DiscStat { stat: Stat; value: number; element?: Element }
export interface DriveDisc {
  slot: number;
  rarity: "S" | "A" | "B";
  level: number;
  main: DiscStat;
  subs: DiscStat[];
}

const fullIds: Record<number, Stat> = {
  11103: "HP", 11102: "HP%", 12103: "ATK", 12102: "ATK%", 13103: "DEF", 13102: "DEF%",
  20103: "CRIT_Rate", 21103: "CRIT_DMG", 23203: "PEN", 23103: "PEN_Ratio",
  31203: "Anomaly_Proficiency", 31402: "Anomaly_Mastery", 12202: "Impact", 30502: "Energy_Regen",
  31503: "Element_DMG", 31603: "Element_DMG", 31703: "Element_DMG", 31803: "Element_DMG", 31903: "Element_DMG",
};
const elementalIds: Record<number, Element> = {
  31503: "physical", 31603: "fire", 31703: "ice", 31803: "electric", 31903: "ether",
  12: "physical", 13: "fire", 14: "ice", 15: "electric", 16: "ether",
};
const systemStats: Record<number, Stat> = {201: "CRIT_Rate", 211: "CRIT_DMG", 232: "PEN", 231: "PEN", 312: "Anomaly_Proficiency"};
const shortStats: Record<number, Stat> = {4: "Impact", 5: "CRIT_Rate", 6: "CRIT_DMG", 7: "Anomaly_Mastery", 8: "Anomaly_Proficiency", 9: "PEN_Ratio", 10: "Energy_Regen", 11: "PEN", 232: "PEN"};

export function record(value: unknown): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected an object");
  return value as Record<string, any>;
}
export function finite(value: unknown, label: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "") throw new Error(`Missing ${label}`);
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`Invalid ${label}`);
  return n;
}
export function integer(value: unknown, label: string, min: number, max: number): number {
  const n = finite(value, label, min, max);
  if (!Number.isInteger(n)) throw new Error(`Invalid ${label}`);
  return n;
}

/** Read HoYoLAB display values. Unknown IDs are errors, not zero-weight stats. */
export function normalizeDiscStat(input: unknown, main = false): DiscStat {
  const p = record(input);
  const raw = p.base ?? p.value;
  if (typeof raw !== "string" && typeof raw !== "number") throw new Error("Missing stat value");
  const text = String(raw).trim().replace(/％/g, "%");
  if (!/^\d+(?:\.\d+)?%?$/.test(text)) throw new Error("Invalid stat value");
  const percent = text.endsWith("%");
  const value = finite(text.replace("%", ""), "stat value");
  const id = Number(p.property_id ?? p.id), system = Number(p.system_id);
  let stat = fullIds[id];
  if (!stat) {
    const base = ({ 1: "HP", 2: "ATK", 3: "DEF", 111: "HP", 121: "ATK", 131: "DEF" } as Record<number, string>)[id]
      ?? ({ 111: "HP", 121: "ATK", 131: "DEF" } as Record<number, string>)[system];
    if (base) stat = (base + (percent ? "%" : "")) as Stat;
    else stat = shortStats[id] ?? (elementalIds[id] ? "Element_DMG" : undefined) ?? (!main ? systemStats[system] : undefined);
  }
  if (!stat) throw new Error(`Unknown disc stat ${id}/${system}`);
  const element = elementalIds[id];
  return { stat, value, ...(element ? { element } : {}) };
}

export function normalizeDisc(input: unknown, fallbackSlot?: number): DriveDisc {
  const d = record(input);
  const slot = integer(d.equipment_type ?? fallbackSlot, "disc slot", 1, 6);
  if (!["S", "A", "B"].includes(d.rarity)) throw new Error("Unknown disc rarity");
  const level = integer(d.level, "disc level", 0, {S: 15, A: 12, B: 9}[d.rarity as "S" | "A" | "B"]);
  if (!Array.isArray(d.main_properties) || d.main_properties.length !== 1 || !Array.isArray(d.properties)) throw new Error("Incomplete disc properties");
  const main = normalizeDiscStat(d.main_properties[0], true);
  const subs = d.properties.map((p: unknown) => normalizeDiscStat(p));
  if (!MAIN_SLOTS[slot].includes(main.stat) || subs.length > 4 || new Set(subs.map(s => s.stat)).size !== subs.length
    || subs.some(s => !(s.stat in SUB_ROLL) || s.stat === main.stat)) throw new Error("Illegal disc properties");
  if (main.value <= 0 || main.value > MAIN_MAX[main.stat] + 0.001) throw new Error("Invalid main stat value");
  const rarityScale = { S: 1, A: 2 / 3, B: 1 / 3 }[d.rarity as "S" | "A" | "B"];
  let rolls = 0;
  for (const sub of subs) {
    const unit = SUB_ROLL[sub.stat as SubStat] * rarityScale;
    const count = Math.round(sub.value / unit);
    // Displayed flat values may be rounded; never trust the enhancement dots alone.
    if (count < 1 || count > 6 || Math.abs(sub.value - count * unit) > (Number.isInteger(unit) ? 0.01 : 0.51)) throw new Error("Invalid substat rolls");
    rolls += count;
  }
  if (rolls > 4 + Math.floor(level / 3)) throw new Error("Substat rolls exceed disc level");
  return { slot, rarity: d.rarity, level, main, subs };
}
