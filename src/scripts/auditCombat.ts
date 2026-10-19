import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, sep } from "node:path";
import { getScoringStore } from "../utilities/zzz/combat/scoringStore.js";
import { discScoringReleased } from "../utilities/zzz/combat/scoringRelease.js";
import {
  loadCombatRelease,
  releaseIssues,
  combatReleased,
} from "../utilities/zzz/combat/release.js";
import { combatCatalog } from "../utilities/zzz/combat/catalog.js";
import { loadReferenceTeam } from "../utilities/zzz/combat/referenceSkills.js";
import { coverageIssues, focusCoverageReport, loadCombatCoverage } from "../utilities/zzz/combat/coverage.js";
import { evidenceSnapshotIssues } from "../utilities/zzz/combat/sourceEvidence.js";

const release = loadCombatRelease(),
  weights = getScoringStore().snapshot(),
  coverage = loadCombatCoverage();
const current = JSON.parse(
  readFileSync("src/assets/gacha-simulation/catalog.json", "utf8"),
);
const currentAgentIds = Object.values(current.items as Record<string, any>)
  .filter((item) => ["agent", "character"].includes(item.kind))
  .map((item) => String(item.id));
const officialSnapshots = JSON.parse(readFileSync("src/assets/combat/evidence/official-focus-team.json", "utf8"));
const timingSnapshot = JSON.parse(readFileSync("src/assets/combat/evidence/timing-candidates.json", "utf8"));
const accountTextSnapshot = JSON.parse(readFileSync("src/assets/combat/evidence/account-combat-text.json", "utf8"));
const snapshotIssues = [
  ...officialSnapshots.flatMap((snapshot: any) => [
    ...evidenceSnapshotIssues(snapshot, "official").map(issue => `${snapshot.id}: ${issue}`),
    ...(coverage.sources[`official-agent-${snapshot.id}`]?.sha256 === snapshot.source.sha256 ? [] : [`${snapshot.id}: coverage references a different official source hash`]),
  ]),
  ...evidenceSnapshotIssues(timingSnapshot, "timing"),
  ...evidenceSnapshotIssues(accountTextSnapshot, "official").map(issue => `Current character text: ${issue}`),
  ...(coverage.sources["official-character-api-text"]?.sha256 === accountTextSnapshot.source.sha256 ? [] : ["Coverage references a different current character text hash"]),
];
const videoDirectory = resolve("previews/combat/video-evidence"),
  videoCandidatesPath = resolve(videoDirectory, "candidates.json");
const videoCandidates = existsSync(videoCandidatesPath)
  ? JSON.parse(readFileSync(videoCandidatesPath, "utf8"))
  : null;
const publicVideos = (Array.isArray(videoCandidates?.videos) ? videoCandidates.videos : []).map((candidate: any) => {
  const artifacts = [candidate.localVideo, ...(candidate.observations ?? [])].filter((artifact: any) => artifact?.path);
  const artifactIssues = artifacts.flatMap((artifact: any) => {
    const path = resolve(String(artifact.path));
    if (!path.startsWith(videoDirectory + sep) || !/\.(?:mp4|png|jpe?g)$/.test(path)) return ["Candidate artifact is outside the video evidence directory"];
    if (!existsSync(path)) return [`Missing artifact: ${artifact.path}`];
    const actual = createHash("sha256").update(readFileSync(path)).digest("hex");
    return actual === artifact.sha256 ? [] : [`Artifact hash mismatch: ${artifact.path}`];
  });
  return {
    bvid: candidate.bvid,
    url: candidate.url,
    title: candidate.title,
    publishedAt: candidate.publishedAt ?? candidate.publishedText,
    status: "candidate",
    calibrationReady: false,
    matchesRequestedTeam: candidate.matchesRequestedTeam ?? null,
    explicitGameVersion: candidate.explicitGameVersion ?? null,
    titleClaims: candidate.titleClaims,
    observedTeam: candidate.observedTeam ?? [],
    observedPanelCount: candidate.observedPanels?.length ?? 0,
    observedFrameCount: candidate.observations?.filter((observation: any) => observation.kind === "viewed-video-frame").length ?? 0,
    observedEquipment: candidate.observedEquipment ?? [],
    observedResult: candidate.observedResult ?? null,
    videoHash: candidate.localVideo?.sha256 ?? null,
    artifactIssues,
    limitations: candidate.notes ?? [],
  };
});
const report: Record<string, unknown> = {
  generatedAt: new Date().toISOString(),
  released: combatReleased(),
  scoring: {
    released: discScoringReleased(),
    revision: weights.revision,
    hash: weights.hash,
    profiles: Object.keys(weights.agents).length,
    cataloguedAgents: currentAgentIds.length,
    missingWeights: currentAgentIds.filter((id) => !weights.agents[id]),
  },
  rosterDrift: currentAgentIds.filter(
    (id) => !release.agents.some((a) => a.id === id),
  ),
  verifiedCombatAdapters: combatCatalog.supported(),
  publicVideoCandidates: {
    source: existsSync(videoCandidatesPath) ? "previews/combat/video-evidence/candidates.json" : null,
    videos: publicVideos,
    note: "Public recordings are observation candidates, not verified runtime models. Title shorthand is separate from viewed panels. Result-screen scores are not damage; a multi-enemy clear time does not calibrate a single-target simulation.",
  },
  coverage: {
    revision: coverage.revision,
    gameVersion: coverage.gameVersion,
    modelVersion: coverage.modelVersion,
    inventories: Object.fromEntries(Object.entries(coverage.inventories).map(([kind, inventory]) => [kind, {status: inventory.status, count: inventory.ids.length}])),
    issues: coverageIssues(coverage),
    focus: focusCoverageReport(coverage),
    snapshotIssues,
    referenceFacts: {
      official: officialSnapshots.map((snapshot: any) => ({id: snapshot.id, skillTables: snapshot.skillTables.length, descriptions: snapshot.skillDescriptions.length, ascensionBreakpoints: snapshot.ascensions.length, cinemaDescriptions: snapshot.cinemas.length, sourceHash: snapshot.source.sha256, snapshotHash: snapshot.snapshotSha256})),
      timing: timingSnapshot.actors.map((actor: any) => ({id: actor.id, actionCandidates: actor.actions.length, upstreamStatus: actor.upstreamStatus, blockers: actor.blockers})),
      timingRevision: timingSnapshot.revision,
      currentCharacterText: accountTextSnapshot.actors.map((actor: any) => ({id: actor.id, skillCategories: actor.skills.length, awakeningLevels: actor.awakening.length, equippedWeapon: actor.weapon?.id, sets: actor.sets.map((set: any) => set.id)})),
    },
    note: "Local gacha/art inventories are candidates, not evidence that content has been released. Official wiki page revisions are not game versions. Source candidates are never auto-promoted to verified models.",
  },
  releaseIssues: releaseIssues(release),
  focusTeam: loadReferenceTeam().map((actor) => ({
    id: actor.id,
    name: actor.name,
    source: actor.url,
    hash: actor.sha256,
    skillTables: actor.tables.length,
    sourceFetchedAt: actor.fetchedAt,
    combatReady: combatCatalog.supported().includes(actor.id),
    pending: [
      "Per-hit timings, cancel windows and clock pauses",
      "Complete character states and cinema mechanics",
      "Equipment adapters and in-game panel checks",
      "In-game team damage validation",
    ],
  })),
};
if (process.argv.includes("--remote")) {
  const repo = "ZztIsolation/zzz_calculator",
    revision = "123f2b780739de3c4bd66ac0ddc71f7b1f70f4a0";
  const base = `https://raw.githubusercontent.com/${repo}/${revision}/data/`;
  const data = await Promise.all(
    ["agents", "agent_skills", "w_engines", "drive_disc_sets"].map(
      async (name) => {
        const response = await fetch(`${base}${name}.json`, {
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok)
          throw new Error(`Source audit HTTP ${response.status}`);
        return response.json();
      },
    ),
  );
  const moves = data[1].agentSkills.flatMap((agent: any) =>
    agent.categories.flatMap((category: any) => category.moves),
  );
  report.referenceAudit = {
    repository: repo,
    revision,
    agents: data[0].agents.length,
    skillProfiles: data[1].agentSkills.length,
    sourceNotes: data[0].notes,
    moves: moves.length,
    movesWithExplicitDuration: moves.filter(
      (move: any) =>
        move.durationMs !== undefined || move.durationFrames !== undefined,
    ).length,
    skillProfileIds: data[1].agentSkills.map((agent: any) => agent.agentId),
    note: "Reference data is not imported as verified runtime models. Missing per-hit timings and mechanics require independent evidence.",
  };
  const zsimRevision = "e248e9f149a6b889290579d8e673e132be9bde31";
  const csvResponse = await fetch(
    `https://raw.githubusercontent.com/ZSim-Dev/ZSim/${zsimRevision}/zsim/data/character.csv`,
    { signal: AbortSignal.timeout(15000) },
  );
  if (!csvResponse.ok) throw new Error(`ZSim audit HTTP ${csvResponse.status}`);
  // Character inventory has no quoted commas; reject a changed schema rather than miscount it.
  const rows = (await csvResponse.text())
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split(","));
  const header = rows.shift()!;
  if (rows.some((row) => row.length !== header.length) || header[0] !== "CID")
    throw new Error("ZSim inventory schema changed");
  const ids = rows.map((row) => row[0]);
  report.timingReferenceAudit = {
    repository: "ZSim-Dev/ZSim",
    revision: zsimRevision,
    agents: rows.length,
    missingCurrentAgents: release.agents.filter(
      (agent) => !ids.includes(agent.id),
    ),
    statusColumns: header.slice(-4),
    statuses: rows.map((row) => ({
      id: row[0],
      name: row[1],
      status: row.slice(-4),
    })),
    note: "ZSim contains tick-based skills, but its character inventory and self-reported support are incomplete for this release. It is a reference, not a verified full-roster runtime.",
  };
}
console.log(JSON.stringify(report, null, 2));
if (
  process.argv.includes("--require-release") &&
  (!combatReleased() ||
    snapshotIssues.length > 0 ||
    currentAgentIds.some((id) => !release.agents.some((a) => a.id === id)))
)
  process.exitCode = 1;
