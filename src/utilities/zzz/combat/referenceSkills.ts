import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { integer, record } from "./stats.js";

export const REFERENCE_TEAM = [
  { id: "1581", name: "蕾米埃爾", entry: "1112" },
  { id: "1401", name: "愛麗絲", entry: "838" },
  { id: "1171", name: "柏妮思", entry: "382" },
] as const;
export interface SkillTable {
  category: string;
  skill: string;
  levels: number[];
  rows: { name: string; values: string[] }[];
}
export interface SkillReference {
  id: string;
  name: string;
  url: string;
  fetchedAt: string;
  sha256: string;
  tables: SkillTable[];
  /** Published coefficients do not supply hit times, buildup or complete combat models. */
  runtimeReady: false;
}
export function extractSkillReference(
  input: unknown,
  actor: (typeof REFERENCE_TEAM)[number],
  fetchedAt: string,
): SkillReference {
  const root = record(input);
  if (root.retcode !== 0) throw new Error("Official skill source unavailable");
  if (String(root.data?.page?.id) !== actor.entry)
    throw new Error("Official skill source identity mismatch");
  const module = root.data?.page?.modules?.find((m: any) =>
    m.components?.some((c: any) => c.component_id === "agent_talent"),
  );
  const raw = module?.components.find(
    (c: any) => c.component_id === "agent_talent",
  )?.data;
  if (typeof raw !== "string")
    throw new Error("Official skill source changed schema");
  const groups = record(JSON.parse(raw)).list;
  if (!Array.isArray(groups) || !groups.length)
    throw new Error("Missing skill tables");
  const tables: SkillTable[] = [];
  for (const group of groups) {
    let current: SkillTable | undefined;
    if (typeof group.title !== "string" || !Array.isArray(group.attributes))
      throw new Error("Invalid skill category");
    for (const row of group.attributes) {
      if (
        typeof row.key !== "string" ||
        !Array.isArray(row.values) ||
        row.values.some((v: unknown) => typeof v !== "string")
      )
        throw new Error("Invalid skill row");
      if (
        row.values.length &&
        row.values.every((v: string) => /^Lv\.\d+/.test(v))
      ) {
        const levels = row.values.map((v: string) =>
          Number(v.match(/^Lv\.(\d+)/)![1]),
        );
        if (levels.some((n: number, i: number) => n !== i + 1))
          throw new Error("Unexpected skill levels");
        current = {
          category: group.title,
          skill: row.key || group.title,
          levels,
          rows: [],
        };
        tables.push(current);
      } else if (row.key) {
        if (
          !current ||
          row.values.length !== current.levels.length ||
          current.rows.some((r) => r.name === row.key)
        )
          throw new Error("Ambiguous skill row");
        current.rows.push({ name: row.key, values: row.values });
      }
    }
  }
  if (!tables.length || tables.some((t) => !t.rows.length))
    throw new Error("Incomplete skill tables");
  return {
    ...actor,
    url: `https://wiki.hoyolab.com/pc/zzz/entry/${actor.entry}?lang=zh-tw`,
    fetchedAt,
    sha256: createHash("sha256").update(raw).digest("hex"),
    tables,
    runtimeReady: false,
  };
}
export function loadReferenceTeam(): SkillReference[] {
  return JSON.parse(
    readFileSync("src/assets/combat/reference-team-skills.json", "utf8"),
  );
}
/** Deliberately accepts a single coefficient only; does not guess sums or per-second units. */
export function skillMultiplier(
  reference: SkillReference,
  skill: string,
  rowName: string,
  level: number,
): number {
  const table = reference.tables.find((t) => t.skill === skill),
    row = table?.rows.find((r) => r.name === rowName);
  if (!table || !row) throw new Error("Unknown skill coefficient");
  integer(level, "skill level", 1, table.levels.length);
  const value = row.values[level - 1];
  if (!/^\d+(?:\.\d+)?%$/.test(value))
    throw new Error("Coefficient needs a specific unit model");
  return Number(value.slice(0, -1)) / 100;
}
