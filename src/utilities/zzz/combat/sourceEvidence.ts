import { createHash } from "node:crypto";
import { extractSkillReference, type REFERENCE_TEAM } from "./referenceSkills.js";
import { record } from "./stats.js";

export interface OfficialCombatFacts {
  schemaVersion: 1;
  snapshotSha256: string;
  id: string;
  name: string;
  source: { url: string; fetchedAt: string; sha256: string; pageRevision: string; gameVersion: null };
  skillTables: ReturnType<typeof extractSkillReference>["tables"];
  skillDescriptions: { category: string; name: string; text: string }[];
  ascensions: { level: string; rows: { name: string; values: string[] }[] }[];
  cinemas: { name: string; text: string }[];
  runtimeReady: false;
  missing: string[];
}
const textOnly = (html: string): string => html.replace(/<\/p>/g, "\n").replace(/<[^>]*>/g, "").replace(/\\n/g, "\n").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim();

/** Keep combat facts only; no account information, lore, images or executable expressions. */
export function extractOfficialCombatFacts(input: unknown, actor: (typeof REFERENCE_TEAM)[number], fetchedAt: string): OfficialCombatFacts {
  const reference = extractSkillReference(input, actor, fetchedAt);
  const page = record(record(input).data.page);
  const components = page.modules.flatMap((module: any) => module.components.map((component: any) => ({ module: module.name, id: component.component_id, data: component.data })));
  const talent = record(JSON.parse(components.find((component: any) => component.id === "agent_talent").data));
  const ascension = components.find((component: any) => component.id === "ascension");
  const cinemas = components.find((component: any) => component.id === "summaryList" && component.module === "意象影畫");
  const descriptions = talent.list.flatMap((group: any) => (group.children ?? []).map((child: any) => {
    if (typeof child.title !== "string" || typeof child.desc !== "string") throw new Error("Official skill text schema changed");
    return { category: group.title, name: child.title, text: textOnly(child.desc) };
  }));
  const numericRows = (rows: any[]) => rows.map(row => {
    if (typeof row.key !== "string" || !Array.isArray(row.values) || !row.values.every((value: unknown) => typeof value === "string")) throw new Error("Official ascension schema changed");
    return { name: row.key, values: row.values };
  });
  const facts: OfficialCombatFacts = {
    schemaVersion: 1, snapshotSha256: "",
    id: actor.id, name: reference.name,
    source: { url: reference.url, fetchedAt, sha256: createHash("sha256").update(JSON.stringify(components.filter((component: any) => ["agent_talent", "ascension", "summaryList"].includes(component.id)))).digest("hex"), pageRevision: String(page.version), gameVersion: null },
    skillTables: reference.tables,
    skillDescriptions: descriptions,
    ascensions: ascension ? JSON.parse(ascension.data).list.map((row: any) => ({ level: String(row.key), rows: numericRows(row.combatList) })) : [],
    cinemas: cinemas ? JSON.parse(cinemas.data).list.map((row: any) => ({ name: String(row.name), text: textOnly(String(row.desc)) })) : [],
    runtimeReady: false,
    missing: ["Target game version verification", "Per-hit animation timestamps and cancellation windows", "Clock pause behavior", "Per-hit anomaly buildup and contribution", "Independent in-game damage and timing captures"],
  };
  facts.snapshotSha256 = evidenceSnapshotHash(facts);
  return facts;
}

/** Hash the exact normalized artifact, including provenance, excluding only this digest. */
export function evidenceSnapshotHash(input: object): string {
  const { snapshotSha256: _digest, ...content } = input as Record<string, unknown>;
  return createHash("sha256").update(JSON.stringify(content)).digest("hex");
}
export function evidenceSnapshotIssues(input: unknown, kind: "official" | "timing"): string[] {
  const snapshot = record(input), issues: string[] = [];
  if (snapshot.schemaVersion !== 1) issues.push("Unsupported evidence snapshot schema");
  if (snapshot.runtimeReady !== false) issues.push("Reference evidence cannot mark a runtime model ready");
  if (typeof snapshot.snapshotSha256 !== "string" || evidenceSnapshotHash(snapshot) !== snapshot.snapshotSha256) issues.push("Evidence snapshot hash mismatch");
  const sources = kind === "official" ? [snapshot.source] : snapshot.sources;
  if (!Array.isArray(sources) || !sources.length || sources.some(source => !source || !/^https:\/\//.test(source.url) || !/^[a-f0-9]{64}$/.test(source.sha256) || !Number.isFinite(Date.parse(source.fetchedAt)))) issues.push("Invalid evidence source provenance");
  if (kind === "timing" && (typeof snapshot.revision !== "string" || !/^[a-f0-9]{40}$/.test(snapshot.revision) || !Array.isArray(sources) || sources.some((source: any) => typeof source?.url !== "string" || !source.url.includes(`/${snapshot.revision}/`)))) issues.push("Timing reference is not pinned to its source revision");
  return issues;
}

/** Whitelist only public combat descriptions from a previously authorized character response. */
export function extractAccountCombatFacts(input: unknown) {
  const snapshot = record(input);
  if (!Array.isArray(snapshot.team) || !snapshot.team.length || snapshot.team.length > 3 || !Number.isFinite(Date.parse(snapshot.fetchedAt))) throw new Error("Invalid character evidence snapshot");
  const string = (value: unknown): string => { if (typeof value !== "string") throw new Error("Combat description schema changed"); return textOnly(value); };
  const actors = snapshot.team.map((raw: unknown) => {
    const actor = record(raw);
    if (!Number.isInteger(actor.id) || !Array.isArray(actor.skills) || !Array.isArray(actor.ranks) || !Array.isArray(actor.equip)) throw new Error("Incomplete character combat text");
    const item = (value: unknown) => { const row = record(value); return { name: string(row.title), text: string(row.text) }; };
    return {
      id: String(actor.id),
      skills: actor.skills.map((skill: any) => ({ type: skill.skill_type, level: skill.level, descriptions: skill.items.map(item) })),
      cinemas: actor.ranks.map((rank: any) => ({ rank: rank.pos, name: string(rank.name), text: string(rank.desc) })),
      awakening: (actor.skill_awaken?.skill_awaken_items ?? []).map((level: any) => ({ level: level.awaken_level, skills: level.awaken_skill_items.flatMap((skill: any) => skill.skill_items.map(item)) })),
      weapon: actor.weapon ? { id: String(actor.weapon.id), refinement: actor.weapon.star, name: string(actor.weapon.name), talent: string(actor.weapon.talent_content) } : null,
      sets: [...new Map(actor.equip.map((disc: any) => { const suit = record(disc.equip_suit); return [String(suit.suit_id), {id: String(suit.suit_id), name: string(suit.name), twoPiece: string(suit.desc1), fourPiece: string(suit.desc2)}] as const; })).values()],
    };
  });
  if (new Set(actors.map(actor => actor.id)).size !== actors.length) throw new Error("Duplicate character combat text");
  const result = {
    schemaVersion: 1, snapshotSha256: "", runtimeReady: false,
    source: { url: "https://sg-public-api.hoyolab.com/event/game_record_zzz/api/zzz/avatar/info", fetchedAt: snapshot.fetchedAt, sha256: createHash("sha256").update(JSON.stringify(actors)).digest("hex"), gameVersion: null },
    actors,
    note: "Current public combat descriptions extracted from the authorized account response. Identifiers, credentials and equipment rolls are omitted. Text gives mechanics and some numeric facts, not complete coefficients, animation timing or in-game validation.",
  };
  result.snapshotSha256 = evidenceSnapshotHash(result);
  return result;
}

/** RFC 4180 rows: quoted commas in timing lists must not shift numeric columns. */
export function parseEvidenceCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []; let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') { if (quoted && text[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted; }
    else if (ch === "," && !quoted) { row.push(field); field = ""; }
    else if ((ch === "\n" || ch === "\r") && !quoted) { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(field); if (row.some(Boolean)) rows.push(row); row = []; field = ""; }
    else field += ch;
  }
  if (quoted) throw new Error("Unterminated evidence CSV field");
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift();
  if (!header?.length || new Set(header).size !== header.length || rows.some(values => values.length !== header.length)) throw new Error("Evidence CSV schema changed");
  return rows.map(values => Object.fromEntries(header.map((key, index) => [key, values[index]])));
}
