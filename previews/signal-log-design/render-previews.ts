import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { GachaArchiveRecord, GachaArchiveSource } from "../../src/utilities/zzz/gachaArchive.js";
import { analyzeGachaRecords } from "../../src/utilities/zzz/gachaAnalysis.js";
import { renderSignalLog } from "../../src/utilities/zzz/signalLogRenderer.js";

const previewRoot = process.env.ZZZ_PREVIEW_OUTPUT_ROOT || join(process.cwd(), "previews");
const output = join(previewRoot, "signal-log-design");
const baseTime = Date.parse("2026-01-01T00:00:00.000Z");

function fixture(source: GachaArchiveSource): GachaArchiveRecord[] {
  const records: GachaArchiveRecord[] = [];
  let sequence = 1;
  const cycles = [42, 78, 31, 69, 54, 80, 27, 76, 48, 83, 39];
  cycles.forEach((length, cycle) => {
    for (let pull = 1; pull <= length; pull++) {
      const isS = pull === length;
      const isA = !isS && pull % 10 === 0;
      const standard = isS && cycle % 3 === 1;
      records.push({
        ownerId: "preview", uid: "130000000", source,
        gachaType: "GACHA_TYPE_CHARACTER_UP", channelCategory: "character_up", bannerId: "3.1-agent-a",
        recordId: String(sequence).padStart(8, "0"),
        itemId: isS ? (standard ? "1021" : "1091") : isA ? "1031" : "12001",
        name: isS ? (standard ? "貓又" : "星見雅") : isA ? "安比" : "殘響-I型",
        itemType: isS || isA ? "代理人" : "音擎", rarity: isS ? "S" : isA ? "A" : "B",
        pulledAt: new Date(baseTime + sequence * 60_000).toISOString(),
      });
      sequence++;
    }
  });
  for (let pull = 0; pull < 18; pull++) {
    records.push({
      ownerId: "preview", uid: "130000000", source,
      gachaType: "GACHA_TYPE_CHARACTER_UP", channelCategory: "character_up", bannerId: "3.1-agent-a",
      recordId: String(sequence).padStart(8, "0"), itemId: pull === 9 ? "1031" : "12001",
      name: pull === 9 ? "安比" : "殘響-I型", itemType: pull === 9 ? "代理人" : "音擎",
      rarity: pull === 9 ? "A" : "B", pulledAt: new Date(baseTime + sequence * 60_000).toISOString(),
    });
    sequence++;
  }
  return records;
}

export async function renderSignalPreviews() {
  const official = analyzeGachaRecords({
    records: fixture("official"), category: "character_up", bannerId: "3.1-agent-a",
    livePity: 78, liveGuaranteed: true,
  });
  const manual = analyzeGachaRecords({
    records: fixture("manual"), category: "character_up", bannerId: "3.1-agent-a",
  });
  const common = {
    uid: "130000000", playerName: "匿名繩匠", archivedAt: "2026-09-04T00:15:00.000Z",
    category: "character_up" as const, bannerLabel: "3.1 星見雅",
    banner: {
      name: "星見雅", version: "3.1", channelCategory: "character_up" as const,
      upItems: [{
        id: "1091", name: "星見雅", icon: "", rarity: "S", itemType: "character" as const,
        elementType: 202, subElementType: 201, profession: 3,
      }],
    },
  };
  const [officialOverview, manualOverview, records] = await Promise.all([
    renderSignalLog({ ...common, source: "official", summary: official, view: "overview", page: 0,
      details: { tickets: [
        { ticket_type: "TICKET_TYPE_POLYCHROME", ticket_cnt: 8240 },
        { ticket_type: "TICKET_TYPE_ENCRYPTED_MASTER_TAPE", ticket_cnt: 12 },
        { ticket_type: "TICKET_TYPE_MASTER_TAPE", ticket_cnt: 7 },
        { ticket_type: "TICKET_TYPE_BOOPON", ticket_cnt: 18 },
      ] } }),
    renderSignalLog({ ...common, source: "manual", summary: manual, view: "overview", page: 0, pityEstimated: true }),
    renderSignalLog({ ...common, source: "official", summary: official, view: "records", page: 0 }),
  ]);
  return { officialOverview, manualOverview, records };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  mkdirSync(output, { recursive: true });
  const previews = await renderSignalPreviews();
  writeFileSync(join(output, "官方限定總覽.png"), previews.officialOverview);
  writeFileSync(join(output, "手動匯入總覽.png"), previews.manualOverview);
  writeFileSync(join(output, "完整紀錄20格.png"), previews.records);
}
