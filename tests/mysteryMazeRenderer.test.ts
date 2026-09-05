import { loadImage } from "@napi-rs/canvas";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { mindscapeBadgeRect } from "../src/utilities/zzz/gtCardRenderer.js";
import {
  MYSTERY_MAZE_LAYOUT,
  mysteryMazeRectanglesOverlap,
  normalizeMysteryMazeData,
  renderMysteryMaze,
  rightAlignedIconValueRects,
} from "../src/utilities/zzz/mysteryMazeRenderer.js";

describe("official-style Mystery Maze renderer", () => {
  it("keeps overview, collection, team, and reward layout regions separate", () => {
    const amount = rightAlignedIconValueRects(972, 120, 22, 8);
    expect(mysteryMazeRectanglesOverlap(amount.icon, amount.value)).toBe(false);
    expect(
      mysteryMazeRectanglesOverlap(
        { x: 554, y: 0, width: 260, height: 18 },
        amount.icon,
      ),
    ).toBe(false);

    const { collection, record } = MYSTERY_MAZE_LAYOUT;
    expect(collection.columns).toBe(4);
    expect(collection.cardHeight).toBe(208);
    expect(collection.cardWidth * 4 + collection.columnGap * 3).toBe(948);
    expect(mysteryMazeRectanglesOverlap(record.info, record.team)).toBe(false);
    expect(mysteryMazeRectanglesOverlap(record.team, record.rewards)).toBe(
      false,
    );

    const collectionName = { x: 16, y: 168, width: 193, height: 36 };
    const collectionQuantity = { x: 135, y: 12, width: 78, height: 27 };
    expect(
      mysteryMazeRectanglesOverlap(collectionName, collectionQuantity),
    ).toBe(false);

    const avatarSize = 80;
    const avatarGap = 8;
    const finalAvatarX = record.team.x + 3 * (avatarSize + avatarGap);
    const avatars = {
      x: record.team.x,
      y: 83,
      width: finalAvatarX + avatarSize - record.team.x,
      height: avatarSize,
    };
    const finalBadge = mindscapeBadgeRect(finalAvatarX, 83, avatarSize, 6)!;
    const rewards = {
      x: record.rewards.x,
      y: 91,
      width: 4 * 60 + 3 * 6,
      height: 60,
    };
    expect(avatars.width).toBe(344);
    expect(finalBadge.x + finalBadge.width).toBeLessThanOrEqual(
      record.team.x + record.team.width,
    );
    expect(rewards.width).toBe(record.rewards.width);
    expect(mysteryMazeRectanglesOverlap(avatars, rewards)).toBe(false);
  });

  it("renders overview and paginates records without personal fixture data", async () => {
    const abstract = {
      season_unlock: true,
      season_data: {
        cur_season_id: 2,
        season_level: 18,
        season_stage: 3,
        season_quest: { cur_quest: 4, max_quest: 8 },
        season_coin: { cur_coin: 120, max_coin: 300 },
        refresh_time: 90000,
      },
      refresh_time: 3600,
      abyss_duty: { cur_duty: 2, max_duty: 4 },
      collect_total_value: 123456,
      map_list: [
        {
          map_id: 101,
          map_name: "測試地圖",
          hell_unlock: true,
          is_challenge: true,
          leave_percent: 4321,
          max_price: 99999,
        },
      ],
      collection_data: {
        medal_data: { cur: 0, total: 1, list: [] },
        goods_data: { cur: 0, total: 1, list: [] },
      },
    };
    const detail = {
      record_list: Array.from({ length: 5 }, (_, index) => ({
        map_name: `地圖 ${index + 1}`,
        is_success: index % 2 === 0,
        start_time: { year: 2026, month: 9, day: 1 },
        challenge_time: 60000,
        material_total_value: index * 100,
        avatar_list: [],
        item_list: [],
      })),
    };
    const pages = await renderMysteryMaze({
      uid: "100000000",
      locale: "tw",
      abstract,
      detail,
    });
    expect(pages).toHaveLength(4);
    expect(pages.map((page) => page.kind)).toEqual([
      "overview",
      "collection",
      "records",
      "records",
    ]);
    expect(
      pages.every((page) => page.buffer.subarray(1, 4).toString() === "PNG"),
    ).toBe(true);
  });

  it("normalizes official field variants and paginates complete collections", async () => {
    const abstract = {
      collect_data: {
        medals: {
          medal_list: Array.from({ length: 11 }, (_, id) => ({
            id,
            unlock: id % 2 === 0,
          })),
        },
        goods: {
          goods_list: Array.from({ length: 10 }, (_, id) => ({
            id,
            unlock: true,
          })),
        },
      },
      map_list: Array.from({ length: 8 }, (_, id) => ({
        map_id: id,
        map_name: `Map ${id}`,
      })),
    };
    const detail = {
      challenge_record_list: Array.from({ length: 5 }, () => ({
        is_success: true,
      })),
    };
    const normalized = normalizeMysteryMazeData(abstract, detail);
    expect(normalized.medals).toHaveLength(11);
    expect(normalized.goods).toHaveLength(10);
    expect(normalized.records).toHaveLength(5);
    const pages = await renderMysteryMaze({
      uid: "000000000",
      locale: "en",
      abstract,
      detail,
    });
    expect(pages).toHaveLength(5);
    const image = await loadImage(pages[0]!.buffer);
    expect(image.width).toBe(1044);
  });

  it("renders the anonymized rich fixture into overview, collection, and record pages", async () => {
    const fixture = JSON.parse(
      await readFile(
        join(process.cwd(), "tests", "fixtures", "mysteryMaze.rich.json"),
        "utf8",
      ),
    );
    const pages = await renderMysteryMaze({
      uid: "000000000",
      locale: "tw",
      ...fixture,
    });
    expect(pages.map((page) => page.kind)).toEqual([
      "overview",
      "collection",
      "collection",
      "records",
      "records",
    ]);
    expect(pages[1]).toMatchObject({ kind: "collection", page: 0, pages: 2 });
    expect(pages[3]).toMatchObject({ kind: "records", page: 0, pages: 2 });
    const collection = await loadImage(pages[1]!.buffer);
    const records = await loadImage(pages[3]!.buffer);
    expect(collection.width).toBe(1044);
    expect(collection.height).toBe(1292);
    expect(records.width).toBe(1044);
    expect(records.height).toBe(1036);
  });

  it("renders long names, large values, four agents, locked goods, and overflowing rewards", async () => {
    const goods = Array.from({ length: 20 }, (_, id) => ({
      goods_id: id,
      name: `極長的珍品名稱用於檢查雙行截斷與數量分離 ${id}`,
      number: id ? 999 : 0,
      unlock: id % 2 === 0,
    }));
    const record = {
      map_name: "極長的地圖名稱不應與右側日期或難度資訊互相重疊",
      is_success: true,
      difficult: "Hell",
      start_time: { year: 2026, month: 1, day: 1, hour: 12, minute: 30 },
      challenge_time: 9876543,
      material_total_value: "999999999999",
      avatar_list: Array.from({ length: 4 }, (_, id) => ({ id, rank: id * 2 })),
      item_list: Array.from({ length: 7 }, (_, id) => ({ id })),
    };
    const pages = await renderMysteryMaze({
      uid: "000000000",
      locale: "tw",
      abstract: {
        collect_total_value: "999999999999",
        map_list: [
          { map_id: 1, map_name: record.map_name, is_challenge: true },
        ],
        collection_data: { goods_data: { list: goods } },
      },
      detail: { record_list: Array.from({ length: 4 }, () => record) },
    });
    expect(pages.map((page) => page.kind)).toEqual([
      "overview",
      "collection",
      "records",
    ]);
    await expect(loadImage(pages[1]!.buffer)).resolves.toMatchObject({
      width: 1044,
      height: 1292,
    });
    await expect(loadImage(pages[2]!.buffer)).resolves.toMatchObject({
      width: 1044,
      height: 1036,
    });
  });

  it.each(["tw", "cn", "en", "jp", "kr", "fr", "vi"])(
    "renders the %s locale",
    async (locale) => {
      const pages = await renderMysteryMaze({
        uid: "000000000",
        locale,
        abstract: {
          collect_total_value: "999999999999",
          map_list: [
            {
              map_id: 1,
              map_name: "A very long localized map name",
              is_challenge: true,
            },
          ],
          collection_data: {
            goods_data: {
              list: [
                {
                  goods_id: 1,
                  name: "A very long localized collection item name",
                  number: 999,
                  unlock: false,
                },
              ],
            },
          },
        },
        detail: {
          record_list: [
            {
              map_name: "A very long localized map name",
              is_success: true,
              challenge_time: 9876543,
              avatar_list: Array.from({ length: 4 }, (_, id) => ({
                id,
                rank: id * 2,
              })),
              item_list: Array.from({ length: 4 }, (_, id) => ({ id })),
            },
          ],
        },
      });
      expect(pages).toHaveLength(3);
      expect(pages.map((page) => page.kind)).toEqual([
        "overview",
        "collection",
        "records",
      ]);
      expect(pages[0]!.buffer.subarray(1, 4).toString()).toBe("PNG");
    },
  );
});
