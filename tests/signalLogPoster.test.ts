import { createCanvas, loadImage } from "@napi-rs/canvas";
import { getZzzOfficialFont } from "../src/utilities/zzz/canvasFonts.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GachaStatCategory } from "../src/utilities/zzz/gachaStatApi.js";
import { createScaledCanvas } from "../src/utilities/zzz/signalLogPaper.js";
import { drawPoster, loadPosterArt, posterTitleLines, resolvePosterSubject, type PosterSubject } from "../src/utilities/zzz/signalLogPoster.js";
import { emptyChannel, type SignalItemKind, type SignalLogModel, type SignalSEntry } from "../src/utilities/zzz/signalLogModel.js";

const CATEGORIES: GachaStatCategory[] = ["character_up", "character_return", "weapon_up", "weapon_return", "standard", "bangboo"];

function entry(itemId: string, kind: SignalItemKind, isUp: boolean | null, pulledAt: string | null): SignalSEntry {
  return { itemId, kind, pity: 50, isUp, pulledAt };
}

function modelWith(entries: Partial<Record<GachaStatCategory, SignalSEntry[]>>): SignalLogModel {
  const channels = {} as SignalLogModel["channels"];
  for (const category of CATEGORIES) {
    const channel = emptyChannel(category);
    const list = entries[category] ?? [];
    channels[category] = { ...channel, entries: list, hasRecords: list.length > 0, sCount: list.length, total: list.length };
  }
  return { channels, tickets: null };
}

const model = modelWith({
  character_up: [entry("1641", "character", true, "2026-06-01T00:00:00.000Z"), entry("1091", "character", false, "2026-01-01T00:00:00.000Z")],
  standard: [entry("1011", "character", null, "2026-03-01T00:00:00.000Z")],
});
const noUpModel = modelWith({ character_up: [entry("1011", "character", false, "2026-02-01T00:00:00.000Z"), entry("1021", "character", false, "2026-01-01T00:00:00.000Z")] });
const weaponModel = modelWith({ weapon_up: [entry("14109", "weapon", true, "2026-05-01T00:00:00.000Z")] });
const bangbooModel = modelWith({ bangboo: [entry("53001", "bangboo", null, "2026-05-01T00:00:00.000Z")] });
const unknownAgentModel = modelWith({ character_up: [entry("1999", "character", true, "2026-05-01T00:00:00.000Z")] });

describe("resolvePosterSubject", () => {
  it("picks the newest S-rank agent across channels for the home page", () => {
    expect(resolvePosterSubject({ view: "home", model, category: "character_up" }).agentId).toBe("1641");
  });

  it("prefers the newest UP on a channel and falls back to the newest S", () => {
    expect(resolvePosterSubject({ view: "wall", model, category: "character_up" }).agentId).toBe("1641");
    expect(resolvePosterSubject({ view: "wall", model: noUpModel, category: "character_up" }).agentId).toBe(noUpModel.channels.character_up.entries[0]!.itemId);
  });

  it("uses the newest S on the standard channel", () => {
    expect(resolvePosterSubject({ view: "wall", model, category: "standard" }).agentId).toBe("1011");
  });

  it("uses the signature agent for W-Engines", () => {
    expect(resolvePosterSubject({ view: "wall", model: weaponModel, category: "weapon_up" }).agentId).toBe("1091");
  });

  it("falls back from a home page with only W-Engines to its signature agent, then to nothing", () => {
    expect(resolvePosterSubject({ view: "home", model: weaponModel, category: "weapon_up" }).agentId).toBe("1091");
    expect(resolvePosterSubject({ view: "home", model: modelWith({}), category: "character_up" })).toMatchObject({ agentId: null, iconItem: null, accent: "#de493e" });
  });

  it("uses the banner's S-rank UP when pity cycles are filtered to one banner", () => {
    const banner = { upItems: [{ id: "1321", name: "", icon: "", rarity: "S" }] };
    expect(resolvePosterSubject({ view: "cycles", model, category: "character_up", banner }).agentId).toBe("1321");
  });

  it("takes the accent from the banner element, then the element table", () => {
    const banner = { upItems: [{ id: "1321", name: "", icon: "", rarity: "S", elementType: 202 }] };
    expect(resolvePosterSubject({ view: "cycles", model, category: "character_up", banner }).accent).toBe("#05777a");
    expect(resolvePosterSubject({ view: "wall", model: modelWith({ standard: [entry("1031", "character", null, null)] }), category: "standard" }).accent).not.toBe("#de493e");
  });

  it("keeps the bangboo as an icon subject", () => {
    expect(resolvePosterSubject({ view: "wall", model: bangbooModel, category: "bangboo" })).toMatchObject({ agentId: null, iconItem: { kind: "bangboo" } });
  });

  it("survives an agent unknown to every lookup table", async () => {
    const subject = resolvePosterSubject({ view: "wall", model: unknownAgentModel, category: "character_up" });
    expect(subject).toMatchObject({ agentId: "1999", accent: "#de493e" });
    await expect(loadPosterArt(subject)).resolves.toMatchObject({ type: "none", image: null });
  });
});

describe("loadPosterArt", () => {
  it("falls back from full art to the wide portrait", async () => {
    const subject: PosterSubject = { agentId: "1091", iconItem: null, accent: "#05777a" };
    expect((await loadPosterArt(subject)).type).toBe("full");
    process.env.ZZZ_AGENT_ART_DIR = mkdtempSync(join(tmpdir(), "zzz-art-"));
    try {
      const art = await loadPosterArt(subject);
      expect(art.type).toBe("wide");
      expect(art.crop).toHaveLength(4);
    } finally { delete process.env.ZZZ_AGENT_ART_DIR; }
  });
});

describe("drawPoster", () => {
  const subjects: Array<[string, PosterSubject]> = [
    ["full", { agentId: "1091", iconItem: null, accent: "#05777a" }],
    ["wide", { agentId: "1091", iconItem: null, accent: "#05777a" }],
    ["icon", { agentId: null, iconItem: { id: "53001", kind: "bangboo" }, accent: "#de493e" }],
    ["none", { agentId: null, iconItem: null, accent: "#de493e" }],
  ];

  it.each(subjects)("draws the %s fallback and long names without throwing", async (name, subject) => {
    if (name === "wide") process.env.ZZZ_AGENT_ART_DIR = mkdtempSync(join(tmpdir(), "zzz-art-"));
    try {
      const { canvas, ctx } = createScaledCanvas(700);
      await drawPoster(ctx, 700, { subject, title: "Résonance Amplificateur", chip: "3.3 賽維里安／諾姆／很長的卡池名稱", playerName: "名字非常非常非常非常長的繩匠", uid: "1300000001", locale: "fr" });
      expect((await loadImage(canvas.toBuffer("image/png"))).width).toBe(2000);
    } finally { delete process.env.ZZZ_AGENT_ART_DIR; }
  });
});

describe("posterTitleLines", () => {
  const ctx = createCanvas(400, 100).getContext("2d");
  const measure = (locale: string, line: string, size: number) => {
    ctx.font = `bold ${size}px ${getZzzOfficialFont(locale)}`;
    return ctx.measureText(line).width;
  };

  it("wraps a two-word English title instead of truncating", () => {
    const { lines } = posterTitleLines(ctx, "en", "Exclusive Channel", 224);
    expect(lines).toEqual(["Exclusive", "Channel"]);
  });

  it("keeps a short CJK title on one line at 46px", () => {
    expect(posterTitleLines(ctx, "tw", "獨家頻道", 224)).toEqual({ lines: ["獨家頻道"], size: 46 });
  });

  it("wraps a long French title within the width", () => {
    const { lines, size } = posterTitleLines(ctx, "fr", "Résonance Amplificateur", 224);
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(line).not.toContain("…");
      expect(measure("fr", line, size)).toBeLessThanOrEqual(224);
    }
  });

  it("breaks between characters and truncates only the last line", () => {
    const { lines, size } = posterTitleLines(ctx, "en", "W".repeat(60), 224);
    expect(lines).toHaveLength(2);
    for (const line of lines) expect(measure("en", line, size)).toBeLessThanOrEqual(224);
    expect(lines[1]!.endsWith("…")).toBe(true);
  });
});
