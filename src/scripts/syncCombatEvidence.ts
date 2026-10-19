import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { REFERENCE_TEAM } from "../utilities/zzz/combat/referenceSkills.js";
import { evidenceSnapshotHash, extractOfficialCombatFacts, parseEvidenceCsv } from "../utilities/zzz/combat/sourceEvidence.js";

const directory = "src/assets/combat/evidence";
const fetchedAt = new Date().toISOString();
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
async function source(url: string, headers?: Record<string, string>) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Public combat evidence HTTP ${response.status}`);
  const body = await response.text();
  return { body, sha256: digest(body), url, fetchedAt };
}
const headers = { "x-rpc-wiki_app": "zzz", "x-rpc-language": "zh-tw", Referer: "https://wiki.hoyolab.com/", Origin: "https://wiki.hoyolab.com" };
const official = await Promise.all(REFERENCE_TEAM.map(async actor => {
  const result = await source(`https://sg-wiki-api.hoyolab.com/hoyowiki/zzz/wapi/entry_page?entry_page_id=${actor.entry}&lang=zh-tw`, headers);
  return extractOfficialCombatFacts(JSON.parse(result.body), actor, fetchedAt);
}));
// Pinned source facts only. No third-party implementation is copied or executed.
const revision = "e248e9f149a6b889290579d8e673e132be9bde31";
const [skills, characters] = await Promise.all(["skill.csv", "character.csv"].map(file => source(`https://raw.githubusercontent.com/ZSim-Dev/ZSim/${revision}/zsim/data/${file}`)));
const skillRows = parseEvidenceCsv(skills.body), characterRows = parseEvidenceCsv(characters.body);
if (!skillRows.length || !Object.hasOwn(skillRows[0], "ticks") || !Object.hasOwn(skillRows[0], "tick_list") || !Object.hasOwn(skillRows[0], "anomaly_accumulation")) throw new Error("Timing candidate schema changed");
const fields = ["skill_tag", "skill_text", "comment", "damage_ratio", "damage_ratio_growth", "stun_ratio", "stun_ratio_growth", "sp_threshold", "sp_consume", "sp_recovery", "fever_recovery", "initial_level", "anomaly_accumulation", "element_type", "element_damage_percent", "ticks", "hit_times", "swap_cancel_ticks", "tick_list", "anomaly_update_list"];
const candidate = {
  schemaVersion: 1, snapshotSha256: "", runtimeReady: false, gameVersion: null, revision,
  sources: [skills, characters].map(({ body: _body, ...metadata }) => metadata),
  note: "Unverified numeric/timing candidates from a 2025-11-27 source. Tick units, hit distribution, current game version and in-game agreement still require review. Upstream support flags are not our verification.",
  actors: REFERENCE_TEAM.map(actor => ({
    id: actor.id, name: actor.name,
    upstreamStatus: Object.fromEntries(["动作建模", "Buff支持", "影画支持", "精细测帧"].map(key => [key, characterRows.find(row => row.CID === actor.id)?.[key] ?? null])),
    actions: skillRows.filter(row => row.CID === actor.id).map(row => Object.fromEntries(fields.map(key => [key, row[key]]))),
    blockers: actor.id === "1581" ? ["No actor or skill rows in this source", "No per-hit timing evidence"] : actor.id === "1171" ? ["Upstream marks character incomplete", "Source predates the active level-6 awakening build", "No reviewed in-game captures"] : ["Unverified current-version compatibility", "No reviewed in-game captures"],
  })),
};
candidate.snapshotSha256 = evidenceSnapshotHash(candidate);
await mkdir(directory, { recursive: true });
await writeFile(`${directory}/official-focus-team.json`, JSON.stringify(official, null, 2) + "\n");
await writeFile(`${directory}/timing-candidates.json`, JSON.stringify(candidate, null, 2) + "\n");
console.log(JSON.stringify({ official: official.map(actor => ({ id: actor.id, tables: actor.skillTables.length, descriptions: actor.skillDescriptions.length, ascensions: actor.ascensions.length, cinemas: actor.cinemas.length })), timingCandidates: candidate.actors.map(actor => ({ id: actor.id, actions: actor.actions.length, blockers: actor.blockers })), runtimeReady: false }, null, 2));
