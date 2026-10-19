import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { renderDiscLeaderboard, type DiscLeaderboardEntry } from "../utilities/zzz/discLeaderboardRenderer.js";
import { resolveCharacterPortrait } from "../utilities/zzz/characterPortrait.js";
import { profileScore } from "../utilities/zzz/combat/render.js";
import { drawOfficialCharacterProfile } from "../utilities/zzz/profileCharacter.js";
import { drawFormalCharacterProfile } from "../utilities/zzz/profileCharacterFormal.js";
import { createTranslator } from "../utilities/core/i18n.js";

const output = resolve("previews/disc-leaderboard");
await mkdir(output, { recursive: true });
const snapshot = JSON.parse(await readFile(`${output}/characters.json`, "utf8"));
const report = [];
for (const character of snapshot.characters) {
  const score = profileScore(character);
  if (!score?.complete || score.total === null) throw new Error(`Missing complete score for ${character.id}`);
  const appearance = resolveCharacterPortrait(character);
  const skins = character.skin_list;
  const localArt = (skin: any) => `${output}/assets/${skin.skin_id}.png`;
  for (const skin of skins) {
    try { await readFile(localArt(skin)); } catch {
      const response = await fetch(skin.skin_vertical_painting_url);
      if (!response.ok) throw new Error("Could not load official skin art");
      await mkdir(`${output}/assets`, { recursive: true });
      await writeFile(localArt(skin), Buffer.from(await response.arrayBuffer()));
    }
  }
  const selectedSkin = skins.find((skin: any) => skin.skin_vertical_painting_url === appearance.source) ?? skins.find((skin: any) => skin.is_original);
  const updatedLabel = new Date(snapshot.fetchedAt).toLocaleString("sv-SE", { timeZone: "Asia/Taipei" }).slice(5, 16).replace("-", "/");
  const viewer: DiscLeaderboardEntry = {
    rank: 0, playerName: "Yeci", portraitSource: localArt(selectedSkin),
    skinName: appearance.skinName, total: score.total, updatedLabel, isViewer: true,
  };
  const samples = [
    [552.6, "星見檔案"], [531.8, "早安新艾利都"], [515.2, "今天也想出雙爆"],
    [505.6, "咖啡加一份冰"], [495.3, "錄影帶收藏家"], [482.7, "六分街居民"],
    [470.2, "繩網漫遊者"], [450.3, "音擎調音師"], [439.8, "有空就去拉麵店吃一碗的普通繩匠"],
  ] as const;
  const entries: DiscLeaderboardEntry[] = samples.map(([total, name], index) => ({
    rank: 0, playerName: name, total, portraitSource: localArt(skins[index % skins.length]),
    skinName: skins[index % skins.length].skin_name, updatedLabel,
  }));
  entries.push(viewer);
  entries.sort((a, b) => Number(b.total.toFixed(1)) - Number(a.total.toFixed(1)));
  entries.forEach((entry, index) => { entry.rank = index && entry.total.toFixed(1) === entries[index - 1].total.toFixed(1) ? entries[index - 1].rank : index + 1; });
  const stem = character.id === 1581 ? "remielle" : "sunna";
  const leaderboard = await renderDiscLeaderboard({
    characterName: character.name_mi18n, characterId: String(character.id),
    portraitSource: viewer.portraitSource, accent: character.id === 1581 ? "#eaa6c5" : "#b0d2ae",
    scopeLabel: "全球排行", page: 1, pageCount: 1, participantCount: 10,
    entries, viewer, preview: true, updatedLabel,
  });
  await writeFile(`${output}/${stem}-leaderboard.png`, leaderboard);
  const image = await loadImage(leaderboard);
  const mobile = createCanvas(500, Math.round(image.height / 2));
  mobile.getContext("2d").drawImage(image, 0, 0, mobile.width, mobile.height);
  await writeFile(`${output}/${stem}-leaderboard-mobile.png`, mobile.toBuffer("image/png"));
  for (const style of ["official", "formal"] as const) {
    const buffer = style === "official"
      ? await drawOfficialCharacterProfile(createTranslator("tw"), "tw", "PREVIEW", character, false, false, score)
      : await drawFormalCharacterProfile(createTranslator("tw"), "tw", "PREVIEW", character, score);
    if (!buffer) throw new Error(`Could not render ${style} card`);
    await writeFile(`${output}/${stem}-${style}.png`, buffer);
    if (style === "formal") {
      const card = await loadImage(buffer), cropHeight = 218;
      const detail = createCanvas(card.width, cropHeight);
      detail.getContext("2d").drawImage(card, 0, card.height - cropHeight, card.width, cropHeight, 0, 0, card.width, cropHeight);
      await writeFile(`${output}/${stem}-scores.png`, detail.toBuffer("image/png"));
    }
  }
  report.push({ character: character.name_mi18n, id: character.id, total: score.total, grade: score.grade, skin: appearance.skinName, leaderboardRanks: "illustrative", otherPlayers: "fictional" });
}
await writeFile(`${output}/preview.json`, JSON.stringify({ fetchedAt: snapshot.fetchedAt, report }, null, 2));
const pair = await Promise.all(["remielle", "sunna"].map(name => loadImage(`${output}/${name}-leaderboard-mobile.png`)));
const comparison = createCanvas(1020, Math.max(...pair.map(image => image.height)));
const context = comparison.getContext("2d");
context.fillStyle = "#15151b"; context.fillRect(0, 0, comparison.width, comparison.height);
pair.forEach((image, index) => context.drawImage(image, index * 520, 0));
await writeFile(`${output}/leaderboards-preview.png`, comparison.toBuffer("image/png"));
console.log(JSON.stringify(report, null, 2));
