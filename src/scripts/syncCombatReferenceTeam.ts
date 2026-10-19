import { mkdir, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
  REFERENCE_TEAM,
  extractSkillReference,
} from "../utilities/zzz/combat/referenceSkills.js";

const headers = {
  "x-rpc-wiki_app": "zzz",
  "x-rpc-language": "zh-tw",
  Referer: "https://wiki.hoyolab.com/",
  Origin: "https://wiki.hoyolab.com",
};
const references = await Promise.all(
  REFERENCE_TEAM.map(async (actor) => {
    const response = await fetch(
      `https://sg-wiki-api.hoyolab.com/hoyowiki/zzz/wapi/entry_page?entry_page_id=${actor.entry}&lang=zh-tw`,
      { headers, signal: AbortSignal.timeout(15_000) },
    );
    if (!response.ok) throw new Error(`Skill source HTTP ${response.status}`);
    return extractSkillReference(
      await response.json(),
      actor,
      new Date().toISOString(),
    );
  }),
);
await mkdir("src/assets/combat", { recursive: true });
const temporary = `src/assets/combat/.reference-${randomUUID()}.json`;
await writeFile(temporary, JSON.stringify(references, null, 2) + "\n");
await rename(temporary, "src/assets/combat/reference-team-skills.json");
console.log(
  references
    .map(
      (r) =>
        `${r.name}: ${r.tables.length} skill tables, ${r.sha256.slice(0, 12)} (timings unverified)`,
    )
    .join("\n"),
);
