import { readFile, writeFile } from "node:fs/promises";
import { extractAccountCombatFacts } from "../utilities/zzz/combat/sourceEvidence.js";

const path = process.argv[2];
if (!path) throw new Error("Provide a previously authorized character snapshot path");
const evidence = extractAccountCombatFacts(JSON.parse(await readFile(path, "utf8")));
await writeFile("src/assets/combat/evidence/account-combat-text.json", JSON.stringify(evidence, null, 2) + "\n");
console.log(JSON.stringify({ actors: evidence.actors.map(actor => ({id: actor.id, skills: actor.skills.length, awakeningLevels: actor.awakening.length})), snapshotHash: evidence.snapshotSha256, runtimeReady: false }));
