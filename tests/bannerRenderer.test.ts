import { loadImage } from "@napi-rs/canvas";
import { __bannerRendererInternals, renderOfficialBanner } from "../src/utilities/zzz/bannerRenderer";

const NOW = Date.UTC(2026, 8, 4, 0, 0, 0);

function schedule(overrides: Record<string, unknown> = {}) {
  return {
    gacha_type: "GACHA_TYPE_CHARACTER_UP",
    gacha_state: "GACHA_STATE_IN_PROGRESS",
    version: "3.1",
    start_ts: Math.floor((NOW - 86_400_000) / 1000),
    end_ts: Math.floor((NOW + 345_600_000) / 1000),
    avatar_list: [{ id: "1", full_name: "測試代理人", rarity: "S" }],
    ...overrides,
  };
}

describe("official banner renderer mapping", () => {
  it("labels the four supported limited channel types", () => {
    expect(__bannerRendererInternals.channelLabel("GACHA_TYPE_CHARACTER_UP")).toBe("獨家頻道");
    expect(__bannerRendererInternals.channelLabel("GACHA_TYPE_CHARACTER_RETURN")).toBe("獨家重映");
    expect(__bannerRendererInternals.channelLabel("GACHA_TYPE_WEAPON_UP")).toBe("音擎頻道");
    expect(__bannerRendererInternals.channelLabel("GACHA_TYPE_WEAPON_RETURN")).toBe("音擎迴響");
  });

  it("labels official ticket types without confusing the two master tapes", () => {
    expect(__bannerRendererInternals.ticketLabel("GACHA_TICKET_TYPE_POLYCHROME")).toBe("菲林");
    expect(__bannerRendererInternals.ticketLabel("GACHA_TICKET_TYPE_ENCRYPTED_MASTER_TAPE")).toBe("加密母帶");
    expect(__bannerRendererInternals.ticketLabel("GACHA_TICKET_TYPE_MASTER_TAPE")).toBe("原裝母帶");
    expect(__bannerRendererInternals.ticketLabel("GACHA_TICKET_TYPE_BOOPON")).toBe("邦布券");
  });

  it("pairs matching absolute periods and leaves an unmatched side empty", () => {
    const activeWeapon = schedule({
      gacha_type: "GACHA_TYPE_WEAPON_UP",
      avatar_list: undefined,
      weapon_list: [{ id: "w1", talent_title: "測試音擎", rarity: "S" }],
    });
    const futureAgent = schedule({
      gacha_state: "GACHA_STATE_NOT_START",
      start_ts: Math.floor((NOW + 500_000_000) / 1000),
      end_ts: Math.floor((NOW + 800_000_000) / 1000),
    });
    const rows = __bannerRendererInternals.pairSchedules({
      avatar_gacha_schedule_list: [schedule(), futureAgent],
      weapon_gacha_schedule_list: [activeWeapon],
    }, NOW);
    expect(rows).toHaveLength(2);
    expect(rows[0].agent?.state).toBe("active");
    expect(rows[0].weapon?.raw.gacha_type).toBe("GACHA_TYPE_WEAPON_UP");
    expect(rows[1].agent?.state).toBe("upcoming");
    expect(rows[1].weapon).toBeNull();
  });

  it("falls back to version, state and countdown while preserving API order", () => {
    const agents = [0, 1].map((index) => schedule({
      start_ts: undefined, end_ts: undefined, left_end_ts: 360_000,
      avatar_list: [{ id: `a${index}`, full_name: `代理人${index}`, rarity: "S" }],
    }));
    const weapons = [0, 1].map((index) => schedule({
      gacha_type: "GACHA_TYPE_WEAPON_UP", start_ts: undefined, end_ts: undefined, left_end_ts: 360_000,
      avatar_list: undefined, weapon_list: [{ id: `w${index}`, talent_title: `音擎${index}`, rarity: "S" }],
    }));
    const rows = __bannerRendererInternals.pairSchedules({
      avatar_gacha_schedule_list: agents,
      weapon_gacha_schedule_list: weapons,
    }, NOW);
    expect(rows.map((row: any) => [row.agent.raw.avatar_list[0].id, row.weapon.raw.weapon_list[0].id]))
      .toEqual([["a0", "w0"], ["a1", "w1"]]);
  });

  it("excludes ended schedules and sorts current periods before future periods", () => {
    const ended = schedule({
      start_ts: Math.floor((NOW - 800_000_000) / 1000),
      end_ts: Math.floor((NOW - 500_000_000) / 1000),
    });
    const upcoming = schedule({
      gacha_state: "GACHA_STATE_NOT_START",
      start_ts: Math.floor((NOW + 500_000_000) / 1000),
      end_ts: Math.floor((NOW + 800_000_000) / 1000),
    });
    const rows = __bannerRendererInternals.pairSchedules({
      avatar_gacha_schedule_list: [upcoming, ended, schedule()],
    }, NOW);
    expect(rows).toHaveLength(2);
    expect(rows.map((row: any) => row.agent.state)).toEqual(["active", "upcoming"]);
  });

  it("trusts an explicit completed state even when stale timestamps point forward", () => {
    expect(__bannerRendererInternals.scheduleState(schedule({
      gacha_state: "GACHA_STATE_COMPLETED",
      start_ts: Math.floor((NOW + 500_000_000) / 1000),
      end_ts: Math.floor((NOW + 800_000_000) / 1000),
    }), NOW)).toBe("ended");
  });

  it("keeps every UP item and grows a card after five items", () => {
    const oneRow = __bannerRendererInternals.pairSchedules({ avatar_gacha_schedule_list: [schedule()] }, NOW)[0].agent;
    const fiveItems = __bannerRendererInternals.pairSchedules({
      avatar_gacha_schedule_list: [schedule({
        avatar_list: Array.from({ length: 5 }, (_, index) => ({ id: index, full_name: `角色${index}`, rarity: index ? "A" : "S" })),
      })],
    }, NOW)[0].agent;
    const twoRows = __bannerRendererInternals.pairSchedules({
      avatar_gacha_schedule_list: [schedule({
        avatar_list: Array.from({ length: 6 }, (_, index) => ({ id: index, full_name: `角色${index}`, rarity: index ? "A" : "S" })),
      })],
    }, NOW)[0].agent;
    expect(__bannerRendererInternals.scheduleItems(twoRows?.raw)).toHaveLength(6);
    expect(__bannerRendererInternals.cardHeight(fiveItems)).toBe(__bannerRendererInternals.cardHeight(oneRow));
    expect(__bannerRendererInternals.cardHeight(twoRows))
      .toBeGreaterThan(__bannerRendererInternals.cardHeight(oneRow));
    expect(__bannerRendererInternals.cardHeight(twoRows) - __bannerRendererInternals.cardHeight(oneRow))
      .toBe(82);
  });

  it("preserves official agent card metadata used by the compact GtCard layout", () => {
    expect(__bannerRendererInternals.scheduleItems({ avatar_list: [{
      avatar_id: "1091", avatar_name: "雅", full_name: "星見雅·完整姓名", rarity: "S",
      avatar_element_type: 202, avatar_sub_element_type: 201, avatar_profession: 3,
    }] })[0]).toMatchObject({
      id: "1091", name: "雅", rarity: "S", elementType: 202, subElementType: 201, profession: 3,
    });
  });

  it("scales the official PC GtCard to the configured 76px layout", () => {
    expect(__bannerRendererInternals.gtCardMetrics).toEqual({
      outerSize: 76,
      pcSize: 48,
      scale: 76 / 48,
      gap: 6,
      perRow: 5,
    });
  });

  it("preserves the original art ratio for full-width agent and weapon art", () => {
    const agent = __bannerRendererInternals.originalRatioPlacement(152, 186, 42, 42, "width");
    expect(agent?.width).toBeCloseTo(42);
    expect(agent?.height).toBeCloseTo(186 * (42 / 152));
    expect((agent?.width ?? 0) / (agent?.height ?? 1)).toBeCloseTo(152 / 186);

    const weapon = __bannerRendererInternals.originalRatioPlacement(400, 300, 42, 42, "width");
    expect(weapon?.width).toBeCloseTo(42);
    expect(weapon?.height).toBeCloseTo(31.5);
    expect(weapon?.y).toBe(0);
  });

  it("anchors rarity and metadata overlays to the inner artwork", () => {
    const overlay = __bannerRendererInternals.overlayMetrics;
    expect(overlay.agentRarityX).toBe(overlay.avatarX - 1);
    expect(overlay.agentRarityY).toBeGreaterThanOrEqual(overlay.avatarY);
    expect(overlay.weaponLineX).toBe(overlay.avatarX);
    expect(overlay.weaponLineWidth).toBe(overlay.avatarSize);
    expect(overlay.weaponLineHeight).toBe(2);
  });

  it("does not invent a first-S status when the API omitted it", () => {
    expect(__bannerRendererInternals.guaranteeStatus({ gacha_type: "GACHA_TYPE_CHARACTER_RETURN" }))
      .toEqual({ visible: true, label: null });
    expect(__bannerRendererInternals.guaranteeStatus({ gacha_type: "GACHA_TYPE_CHARACTER_RETURN", sup_lock_show: true }))
      .toEqual({ visible: true, label: "未觸發" });
    expect(__bannerRendererInternals.guaranteeStatus({ gacha_type: "GACHA_TYPE_CHARACTER_RETURN", sup_lock_show: false }))
      .toEqual({ visible: true, label: "已觸發" });
  });

  it("removes the private resource row completely for a public-only view", async () => {
    const calendar = { avatar_gacha_schedule_list: [schedule({
      avatar_list: Array.from({ length: 6 }, (_, index) => ({
        id: String(index), full_name: `測試代理人${index}`, rarity: index ? "A" : "S",
      })),
    })] };
    const details = {
      tickets: [{ ticket_type: "GACHA_TICKET_TYPE_POLYCHROME", ticket_cnt: 12160 }],
      gacha_info_list: [{ gacha_type: "GACHA_TYPE_CHARACTER_UP", more_s_need_cnt: 12 }],
    };
    const [privateImage, publicImage] = await Promise.all([
      loadImage(await renderOfficialBanner({ uid: "130000001", locale: "tw", calendar, details, showPrivate: true })),
      loadImage(await renderOfficialBanner({ uid: "130000001", locale: "tw", calendar, details, showPrivate: false })),
    ]);
    expect(__bannerRendererInternals.outputScale).toBe(2);
    expect(privateImage.width).toBe(2088);
    expect(publicImage.width).toBe(2088);
    expect(privateImage.height % 2).toBe(0);
    expect(publicImage.height % 2).toBe(0);
    // Per-card pity no longer affects layout; privacy controls only the resource row.
    expect(privateImage.height - publicImage.height).toBe(68);
  });

  it("does not render cur_gacha_detail pity inside a banner card", async () => {
    const calendar = { avatar_gacha_schedule_list: [schedule()] };
    const common = {
      uid: "130000001", locale: "tw", calendar, showPrivate: true,
      details: { tickets: [{ ticket_type: "GACHA_TICKET_TYPE_POLYCHROME", ticket_cnt: 100 }] },
    };
    const withoutPity = await renderOfficialBanner(common);
    const withPity = await renderOfficialBanner({
      ...common,
      details: {
        ...common.details,
        gacha_info_list: [{ gacha_type: "GACHA_TYPE_CHARACTER_UP", more_s_need_cnt: 12 }],
      },
    });
    expect(withPity.equals(withoutPity)).toBe(true);
  });
});
