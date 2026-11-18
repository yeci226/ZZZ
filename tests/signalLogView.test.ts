import { GachaArchiveStore } from "../src/utilities/zzz/gachaArchive.js";
import type { GachaStatCategory, GachaStatIndex, GachaStatPool, GachaStatRecord } from "../src/utilities/zzz/gachaStatApi.js";
import { emptyChannel, type SignalLogModel } from "../src/utilities/zzz/signalLogModel.js";

let mockStore: GachaArchiveStore;
jest.mock("../src/utilities/zzz/gachaArchive.js", () => ({
  ...jest.requireActual("../src/utilities/zzz/gachaArchive.js"),
  getGachaArchiveStore: () => mockStore,
}));

import {
  ALL_SIGNAL_BANNERS,
  HOME_CATEGORY_VALUE,
  applySignalLogAction,
  buildSignalLogModel,
  refreshOfficialStats,
  signalLogControls,
  type SignalLogSession,
} from "../src/utilities/zzz/signalLogSession.js";

const OWNER = "owner";
const UID = "1300000001";
const CATEGORIES: GachaStatCategory[] = ["character_up", "character_return", "weapon_up", "weapon_return", "standard", "bangboo"];

const statRecord = (sort: number): GachaStatRecord => ({
  itemId: "1581", name: "", icon: "", itemType: "ItemType_Avatar", rarity: "S", isUp: true,
  upTag: "UP_TAG_NONE", count: 30, sort, recordTime: 1785292496,
});
const pool = (version: string, records: GachaStatRecord[]): GachaStatPool => ({
  category: "character_up", version, state: "ended", startTs: 0, endTs: 0, upItems: [], records,
});

function seedOfficialStats(store: GachaArchiveStore, options: { dropVersion?: string } = {}): void {
  const index: GachaStatIndex = {
    totalCount: 300, totalS: 2, currentVersion: "3.2",
    tickets: { monochrome: 100, polychrome: 1600, encrypted: 3, original: 0, boopon: 7 },
    types: [{ category: "character_up", totalCount: 300, sCount: 2, upCount: 1, averageUp: 70, currentPity: 20, toHardPity: 70, versions: ["3.2", "3.1"] }],
  };
  store.saveOfficialStatIndex(OWNER, UID, index);
  [["3.2", 1], ["3.1", 2]].forEach(([version, sort]) => {
    if (version === options.dropVersion) return;
    store.saveOfficialStatPools(OWNER, UID, "character_up", String(version), [pool(String(version), [statRecord(Number(sort))])], true);
  });
}

const GACHA_TYPES: Record<string, string> = {
  character_up: "GACHA_TYPE_CHARACTER_UP", standard: "GACHA_TYPE_STANDARD",
};
function seedArchivedPulls(store: GachaArchiveStore, category: GachaStatCategory, count: number): void {
  store.addRecords(Array.from({ length: count }, (_, index) => ({
    ownerId: OWNER, uid: UID, source: "official" as const, gachaType: GACHA_TYPES[category] ?? "GACHA_TYPE_STANDARD",
    channelCategory: category, bannerId: null, recordId: `${category}-${index}`, itemId: "2001", name: "x",
    itemType: "ItemType_Avatar", rarity: "B", pulledAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
  })));
}

function seedBanners(store: GachaArchiveStore, count: number, category: GachaStatCategory = "character_up"): void {
  for (let index = 0; index < count; index++) {
    store.upsertBanner({
      ownerId: OWNER, uid: UID, source: "official", bannerId: `banner-${index}`, channelCategory: category,
      name: `Banner ${index}`, version: "3.1", startAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(), endAt: null, upItems: [],
    });
  }
}

const baseSession: SignalLogSession = {
  token: "t", invokerId: OWNER, ownerId: OWNER, accountIndex: 0, uid: UID, playerName: "p", locale: "tw",
  linked: true, region: "prod_gf_jp", source: "official", category: "character_up", bannerId: ALL_SIGNAL_BANNERS,
  bannerPage: 0, page: 0, view: "wall", stale: false,
};

function controlModel(): SignalLogModel {
  const channels = {} as SignalLogModel["channels"];
  for (const category of CATEGORIES) channels[category] = emptyChannel(category);
  channels.character_up = { ...channels.character_up, hasRecords: true, total: 100, currentPity: 20, hardPity: 90, guaranteed: false };
  channels.weapon_up = { ...channels.weapon_up, hasRecords: true, total: 10, currentPity: 78, hardPity: 80, guaranteed: true };
  channels.standard = { ...channels.standard, hasRecords: true, total: 10, currentPity: null, hardPity: 90 };
  return { channels, tickets: null };
}

let store: GachaArchiveStore;
beforeEach(() => {
  store = new GachaArchiveStore(":memory:");
  mockStore = store;
  store.upsertAccount({ ownerId: OWNER, uid: UID, source: "official", region: "prod_gf_jp" });
});
const build = () => buildSignalLogModel({ archive: store, ownerId: OWNER, uid: UID, unclassifiedLabel: "未分類" });

describe("building the model", () => {
  it("uses official statistics when they are stored and complete", () => {
    seedOfficialStats(store);
    const { model } = build();
    expect(model.channels.character_up.total).toBe(300);
    expect(model.tickets!.monochrome).toBe(100);
  });

  it("falls back to archived pulls for a channel whose statistics are incomplete", () => {
    seedOfficialStats(store, { dropVersion: "3.1" });
    seedArchivedPulls(store, "character_up", 120);
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const { model } = build();
    expect(model.channels.character_up.total).toBe(120);
    expect(model.tickets!.monochrome).toBe(100);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain("character_up");
    expect(String(warn.mock.calls[0]![0])).not.toContain(UID);
    warn.mockRestore();
  });

  it("uses archived pulls alone for import-only accounts", () => {
    seedArchivedPulls(store, "standard", 60);
    const { model, summaries } = build();
    expect(model.channels.standard).toMatchObject({ total: 60, hasRecords: true });
    expect(summaries.standard.total).toBe(60);
    expect(model.tickets).toBeNull();
  });
});

describe("refreshing official statistics", () => {
  it("reports a failed sync without throwing and leaves the stored statistics usable", async () => {
    seedOfficialStats(store);
    const sync = jest.fn().mockRejectedValue(new Error("Please log in"));
    await expect(refreshOfficialStats({ zzz: {}, ownerId: OWNER, uid: UID, archive: store, createClient: () => ({}) as any, sync })).resolves.toBe("failed");
    expect(build().model.channels.character_up.total).toBe(300);
  });

  it("skips accounts without a usable cookie and reports success otherwise", async () => {
    const sync = jest.fn().mockResolvedValue({ requests: 1 });
    await expect(refreshOfficialStats({ zzz: {}, ownerId: OWNER, uid: UID, archive: store, createClient: () => undefined, sync })).resolves.toBe("skipped");
    expect(sync).not.toHaveBeenCalled();
    await expect(refreshOfficialStats({ zzz: {}, ownerId: OWNER, uid: UID, archive: store, createClient: () => ({}) as any, sync })).resolves.toBe("synced");
  });
});

describe("controls", () => {
  it("shows only the channel menu on the home page, with a summary per channel", () => {
    const rows = signalLogControls({ ...baseSession, view: "home" }, controlModel(), 1).map((row) => row.toJSON());
    expect(rows).toHaveLength(1);
    const options = (rows[0] as any).components[0].options;
    expect(options.map((option: any) => option.value)).toEqual([HOME_CATEGORY_VALUE, ...CATEGORIES]);
    expect(options[1].description).toBe("20/90 · 小保底");
    expect(options[2].description).toBe("尚無紀錄");
    expect(options[3].description).toBe("78/80 · 大保底");
    expect(options[5].description).toBe("—/90");
    expect(options[0].default).toBe(true);
  });

  it("shows paging and three view buttons on channel views, with the current one disabled", () => {
    const rows = signalLogControls({ ...baseSession, view: "wall" }, controlModel(), 3).map((row) => row.toJSON());
    expect(rows).toHaveLength(2);
    const buttons = (rows[1] as any).components;
    expect(buttons.map((component: any) => component.custom_id.split(":")[0]))
      .toEqual(["glog-page-prev", "glog-page-next", "glog-view-wall", "glog-view-versions", "glog-view-cycles"]);
    expect(buttons[2].disabled).toBe(true);
    expect(buttons[3].disabled).toBe(false);
    expect(buttons[0].disabled).toBe(true);
    expect(buttons[1].disabled).toBe(false);
  });

  it("adds the banner menu only on pity cycles", () => {
    seedBanners(store, 2);
    expect(signalLogControls({ ...baseSession, view: "cycles" }, controlModel(), 1)).toHaveLength(3);
    expect(signalLogControls({ ...baseSession, view: "versions" }, controlModel(), 1)).toHaveLength(2);
  });

  it("adds the newer and older banner row when the banners span several pages", () => {
    seedBanners(store, 30);
    const rows = signalLogControls({ ...baseSession, view: "cycles" }, controlModel(), 1).map((row) => row.toJSON());
    expect(rows).toHaveLength(4);
    expect((rows[3] as any).components.map((component: any) => component.custom_id.split(":")[0])).toEqual(["glog-banner-prev", "glog-banner-next"]);
  });
});

describe("actions", () => {
  it("moves between the home page and channels, keeping the view when changing channel", () => {
    const state: SignalLogSession = { ...baseSession, view: "home", page: 2 };
    applySignalLogAction(state, "glog-category:t", "weapon_up");
    expect(state).toMatchObject({ view: "wall", category: "weapon_up", page: 0 });
    applySignalLogAction(state, "glog-view-versions:t");
    applySignalLogAction(state, "glog-category:t", "standard");
    expect(state).toMatchObject({ view: "versions", category: "standard", page: 0 });
    applySignalLogAction(state, "glog-category:t", HOME_CATEGORY_VALUE);
    expect(state.view).toBe("home");
  });

  it("resets the page when switching view and honours old toggle buttons", () => {
    const state: SignalLogSession = { ...baseSession, view: "wall", page: 4 };
    applySignalLogAction(state, "glog-view:t");
    expect(state).toMatchObject({ view: "cycles", page: 0 });
    applySignalLogAction(state, "glog-view:t");
    expect(state.view).toBe("wall");
  });

  it("returns to all banners when leaving the pity cycles", () => {
    const state: SignalLogSession = { ...baseSession, view: "cycles", bannerId: "banner-1", bannerPage: 1 };
    applySignalLogAction(state, "glog-view-wall:t");
    expect(state).toMatchObject({ view: "wall", bannerId: ALL_SIGNAL_BANNERS, bannerPage: 0 });
  });

  it("applies banner and page actions without throwing outside the pity cycles", () => {
    const state: SignalLogSession = { ...baseSession, view: "wall" };
    expect(() => {
      applySignalLogAction(state, "glog-banner:t", "banner-1");
      applySignalLogAction(state, "glog-banner-next:t");
      applySignalLogAction(state, "glog-banner-prev:t");
      applySignalLogAction(state, "glog-page-next:t");
    }).not.toThrow();
    expect(state.page).toBe(1);
  });

  it("ignores an unknown channel value", () => {
    const state: SignalLogSession = { ...baseSession, view: "wall", category: "character_up" };
    applySignalLogAction(state, "glog-category:t", "nonsense");
    expect(state.category).toBe("character_up");
  });
});
