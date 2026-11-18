import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { GachaArchiveRecord } from "../../src/utilities/zzz/gachaArchive.js";
import { analyzeGachaRecords } from "../../src/utilities/zzz/gachaAnalysis.js";
import type { GachaStatCategory } from "../../src/utilities/zzz/gachaStatApi.js";
import {
  channelFromArchive,
  emptyChannel,
  type SignalChannelModel,
  type SignalItemKind,
  type SignalLogModel,
  type SignalSegment,
  type SignalSEntry,
} from "../../src/utilities/zzz/signalLogModel.js";
import { renderSignalLogImage, type SignalLogImageInput } from "../../src/utilities/zzz/signalLogRenderer.js";

const previewRoot = process.env.ZZZ_PREVIEW_OUTPUT_ROOT || join(process.cwd(), "previews");
const output = join(previewRoot, "signal-log-design");
const baseTime = Date.parse("2026-01-01T00:00:00.000Z");
const CATEGORIES: GachaStatCategory[] = ["character_up", "character_return", "weapon_up", "weapon_return", "standard", "bangboo"];

const AGENTS = ["1091", "1321", "1411", "1371", "1261"];
const WEAPONS = ["14109", "14104", "14119"];
const BANGBOO = ["54002", "54005"];
const PITIES = [74, 52, 80, 33, 66, 9, 78, 45, 61, 79, 27, 70];

/** Newest-first S entries cycling through the given ids. */
function sEntries(count: number, kind: SignalItemKind, ids: string[], limited: boolean): SignalSEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    itemId: ids[index % ids.length]!, kind, pity: PITIES[index % PITIES.length]!,
    isUp: limited ? index % 3 !== 1 : null,
    pulledAt: new Date(Date.UTC(2026, 8, 1) - index * 6 * 86_400_000).toISOString(),
  }));
}

function channel(category: GachaStatCategory, entries: SignalSEntry[], extra: Partial<SignalChannelModel> = {}): SignalChannelModel {
  const base = emptyChannel(category);
  const currentPity = extra.currentPity ?? 37;
  return {
    ...base, hasRecords: true, total: entries.length * 61 + currentPity, sCount: entries.length,
    upCount: base.limited ? entries.filter((entry) => entry.isUp).length : null,
    averageS: 61.4, averageUpCost: base.limited ? 84 : null,
    currentPity, toHardPity: base.hardPity - currentPity, guaranteed: base.limited ? false : null,
    entries, firstRecordAt: "2025-06-12T08:00:00.000Z", ...extra,
  };
}

function modelOf(channels: Partial<Record<GachaStatCategory, SignalChannelModel>>, withTickets = true): SignalLogModel {
  const all = {} as SignalLogModel["channels"];
  for (const category of CATEGORIES) all[category] = channels[category] ?? emptyChannel(category);
  return {
    channels: all,
    tickets: withTickets
      ? { monochrome: 31200, polychrome: 8240, encrypted: 12, original: 7, boopon: 18, pullsAvailable: Math.floor(8240 / 160) + 12 }
      : null,
  };
}

function segment(
  version: string, upNames: string[], start: string, end: string, ongoing: boolean, pulls: number, entries: SignalSEntry[],
): SignalSegment {
  return { key: `${version}:${start}`, version, upNames, startAt: start, endAt: end, ongoing, pulls, entries };
}

function versionSegments(): SignalSegment[] {
  const slice = (from: number, count: number) => sEntries(from + count, "character", AGENTS, true).slice(from);
  return [
    segment("3.2", ["星見雅"], "2026-08-20T02:00:00.000Z", "2026-09-10T02:00:00.000Z", true, 71, slice(0, 2)),
    segment("3.2", ["柚葉"], "2026-07-30T02:00:00.000Z", "2026-08-20T02:00:00.000Z", false, 118, slice(2, 3)),
    segment("3.1", ["鯨井未知留"], "2026-06-25T02:00:00.000Z", "2026-07-16T02:00:00.000Z", false, 96, slice(5, 2)),
    segment("3.0", ["雅", "耀嘉音"], "2026-05-14T02:00:00.000Z", "2026-06-04T02:00:00.000Z", false, 143, slice(7, 9)),
    segment("2.8", ["簡"], "2026-03-26T02:00:00.000Z", "2026-04-16T02:00:00.000Z", false, 64, []),
    segment("2.7", ["朱鳶"], "2026-02-12T02:00:00.000Z", "2026-03-05T02:00:00.000Z", false, 88, slice(16, 1)),
  ];
}

function cycleFixture(): GachaArchiveRecord[] {
  const records: GachaArchiveRecord[] = [];
  let sequence = 1;
  const push = (rank: "S" | "A" | "B", itemId: string, name: string, itemType: string) => {
    records.push({
      ownerId: "preview", uid: "130000000", source: "official",
      gachaType: "GACHA_TYPE_CHARACTER_UP", channelCategory: "character_up", bannerId: "3.1-agent-a",
      recordId: String(sequence).padStart(8, "0"), itemId, name, itemType, rarity: rank,
      pulledAt: new Date(baseTime + sequence * 60_000).toISOString(),
    });
    sequence++;
  };
  [42, 78, 31, 69, 54, 80, 27, 76, 48, 83, 39].forEach((length, cycle) => {
    for (let pull = 1; pull <= length; pull++) {
      if (pull === length) {
        const standard = cycle % 3 === 1;
        push("S", standard ? "1021" : "1091", standard ? "貓又" : "星見雅", "代理人");
      } else if (pull % 10 === 0) push("A", "1031", "安比", "代理人");
      else push("B", "12001", "殘響-I型", "音擎");
    }
  });
  for (let pull = 0; pull < 18; pull++) {
    if (pull === 9) push("A", "1031", "安比", "代理人");
    else push("B", "12001", "殘響-I型", "音擎");
  }
  return records;
}

export async function renderSignalPreviews(): Promise<Record<string, Buffer>> {
  const common = { uid: "130000000", playerName: "匿名繩匠", archivedAt: "2026-09-04T00:15:00.000Z", page: 0 };
  const view = (model: SignalLogModel, view: SignalLogImageInput["view"], category: GachaStatCategory, locale = "tw") =>
    ({ ...common, locale, view, category, model }) satisfies SignalLogImageInput;

  const exclusive = modelOf({ character_up: channel("character_up", sEntries(45, "character", AGENTS, true), { currentPity: 37 }) });
  const home = modelOf({
    character_up: channel("character_up", sEntries(12, "character", AGENTS, true), { currentPity: 52 }),
    weapon_up: channel("weapon_up", sEntries(8, "weapon", WEAPONS, true), { currentPity: 21 }),
    standard: channel("standard", sEntries(5, "character", AGENTS, false), { currentPity: 64 }),
    bangboo: channel("bangboo", sEntries(2, "bangboo", BANGBOO, false), { currentPity: 9 }),
  });
  const weapons = modelOf({ weapon_up: channel("weapon_up", sEntries(15, "weapon", WEAPONS, true), { currentPity: 21 }) });
  const bangboo = modelOf({ bangboo: channel("bangboo", sEntries(2, "bangboo", BANGBOO, false), { currentPity: 9 }) });
  const byVersion = modelOf({
    character_up: channel("character_up", sEntries(17, "character", AGENTS, true), { segments: versionSegments(), currentPity: 52 }),
  });
  const summary = analyzeGachaRecords({ records: cycleFixture(), category: "character_up", bannerId: "3.1-agent-a" });
  const cycleModel = modelOf({
    character_up: channelFromArchive({ category: "character_up", summary, pityEstimated: false, banners: [], unclassifiedLabel: "未分類" }),
  });

  const result: Record<string, Buffer> = {};
  result["首頁.png"] = await renderSignalLogImage(view(home, "home", "character_up"));
  result["首頁-無紀錄.png"] = await renderSignalLogImage(view(modelOf({}, false), "home", "character_up"));
  result["S牆-全身立繪.png"] = await renderSignalLogImage(view(exclusive, "wall", "character_up"));

  const emptyArt = mkdtempSync(join(tmpdir(), "zzz-empty-art-"));
  const previousArt = process.env.ZZZ_AGENT_ART_DIR;
  process.env.ZZZ_AGENT_ART_DIR = emptyArt;
  try {
    result["S牆-退回半身圖.png"] = await renderSignalLogImage(view(exclusive, "wall", "character_up"));
  } finally {
    if (previousArt === undefined) delete process.env.ZZZ_AGENT_ART_DIR;
    else process.env.ZZZ_AGENT_ART_DIR = previousArt;
    rmSync(emptyArt, { recursive: true, force: true });
  }

  result["S牆-音擎.png"] = await renderSignalLogImage(view(weapons, "wall", "weapon_up"));
  result["S牆-邦布.png"] = await renderSignalLogImage(view(bangboo, "wall", "bangboo"));
  result["依版本.png"] = await renderSignalLogImage(view(byVersion, "versions", "character_up"));
  result["保底週期.png"] = await renderSignalLogImage({
    ...view(cycleModel, "cycles", "character_up"),
    cycles: { summary, pityEstimated: false, openCycleIsLive: true, bannerLabel: null },
  });
  result["S牆-fr.png"] = await renderSignalLogImage(view(exclusive, "wall", "character_up", "fr"));
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  mkdirSync(output, { recursive: true });
  const previews = await renderSignalPreviews();
  for (const [name, buffer] of Object.entries(previews)) writeFileSync(join(output, name), buffer);
}
