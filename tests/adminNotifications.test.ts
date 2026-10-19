import Database from "better-sqlite3";
import {
  manageAdminNotifications,
  type AdminNotificationDependencies,
  type AdminNotificationRequest,
} from "../src/utilities/core/adminNotifications";
import { MimoStore, defaultMimoConfig } from "../src/utilities/mimo/store";
import { NewsStore } from "../src/utilities/news/store";
import { newSubscription } from "../src/utilities/news/types";

const destination = {
  enabled: true,
  notifyType: "channel",
  notificationEnabled: true,
  guildId: "g",
  channelId: "old",
  time: "12",
  tag: true,
};
const request: AdminNotificationRequest = {
  action: "move",
  feature: "all",
  guildId: "g",
  targetChannelId: "new",
  sourceChannelId: "old",
};
describe("server notification administration", () => {
  let sql: Database.Database,
    mimo: MimoStore,
    news: NewsStore,
    data: Record<string, any>,
    deps: AdminNotificationDependencies;
  beforeEach(() => {
    sql = new Database(":memory:");
    mimo = new MimoStore(sql);
    news = new NewsStore(":memory:");
    data = {};
    deps = {
      db: {
        get: jest.fn(async (key) => {
          const [feature, owner] = key.split(".");
          return structuredClone(
            owner ? data[feature]?.[owner] : data[feature],
          );
        }),
        set: jest.fn(async (key, value) => {
          const [feature, owner] = key.split(".");
          data[feature] ??= {};
          data[feature][owner] = structuredClone(value);
        }),
      },
      mimo: () => mimo,
      news: () => news,
      channelGuild: jest.fn(async (id) => (id === "old" ? "g" : "other")),
      canMove: jest.fn(async () => true),
    };
  });
  afterEach(() => {
    sql.close();
    news.close();
  });
  function mimoRow(id: string, patch: any = {}) {
    const row = {
      ...defaultMimoConfig("u", id, "uid"),
      enabled: true,
      notifyType: "channel" as const,
      channelId: "old",
      guildId: "g",
      ...patch,
    };
    mimo.putConfig(row);
    return row;
  }
  function newsRow(channelId = "old", patch: any = {}) {
    return news.saveSubscription(
      {
        ...newSubscription("former-admin", "tw"),
        scope: "channel",
        id: `channel:${channelId}`,
        guildId: "g",
        channelId,
        enabled: true,
        ...patch,
      },
      0,
      100,
    );
  }
  test("all moves all five kinds and preserves automatic settings", async () => {
    for (const feature of ["autoDaily", "autoRedeem", "noteReminder"])
      data[feature] = { u: { ...destination, weeklyTarget: 1100 } };
    mimoRow("h");
    const source = newsRow();
    const results = await manageAdminNotifications(request, deps);
    expect(results.map((r) => r.outcome)).toEqual(Array(5).fill("success"));
    for (const feature of ["autoDaily", "autoRedeem", "noteReminder"])
      expect(data[feature].u).toMatchObject({
        ...destination,
        channelId: "new",
        weeklyTarget: 1100,
      });
    expect(mimo.get("h")).toMatchObject({
      channelId: "new",
      enabled: true,
      revision: 1,
    });
    expect(news.getSubscription("channel:new")).toMatchObject({
      categorySince: source.categorySince,
      locale: source.locale,
      categories: source.categories,
    });
    expect(news.getSubscription("channel:old")?.enabled).toBe(false);
  });
  test("one user's local notification never selects their DM or another guild", async () => {
    data.autoDaily = { u: { ...destination } };
    data.autoRedeem = { u: { ...destination, guildId: "other" } };
    data.noteReminder = {
      u: { ...destination, notifyType: "dm" },
      disabled: { ...destination, notificationEnabled: false },
    };
    mimoRow("other", { guildId: "other" });
    mimoRow("dm", { notifyType: "dm" });
    mimoRow("off", { notifyType: "off" });
    const before = structuredClone(data);
    await manageAdminNotifications(request, deps);
    expect(data.autoDaily.u.channelId).toBe("new");
    expect(data.autoRedeem).toEqual(before.autoRedeem);
    expect(data.noteReminder).toEqual(before.noteReminder);
    for (const id of ["other", "dm", "off"])
      expect(mimo.get(id)?.channelId).toBe("old");
  });
  test("specific feature and source do not select other rows", async () => {
    data.autoDaily = {
      u: { ...destination },
      v: { ...destination, channelId: "second" },
    };
    data.autoRedeem = { u: { ...destination } };
    await manageAdminNotifications({ ...request, feature: "autoDaily" }, deps);
    expect(data.autoDaily.v.channelId).toBe("second");
    expect(data.autoRedeem.u.channelId).toBe("old");
  });
  test("legacy destinations require verified channel ownership", async () => {
    data.autoDaily = {
      u: { ...destination, guildId: undefined },
      v: { ...destination, guildId: undefined, channelId: "outside" },
    };
    await manageAdminNotifications(
      { ...request, feature: "autoDaily", sourceChannelId: undefined },
      deps,
    );
    expect(data.autoDaily.u.channelId).toBe("new");
    expect(data.autoDaily.v.channelId).toBe("outside");
  });
  test.each(["autoDaily", "autoRedeem", "noteReminder"] as const)(
    "removing %s only disables notification",
    async (feature) => {
      data[feature] = {
        u: { ...destination, eventEnabled: true },
        v: { ...destination },
      };
      await manageAdminNotifications(
        { ...request, action: "remove", feature, userId: "u" },
        deps,
      );
      expect(data[feature].u).toMatchObject({
        enabled: true,
        eventEnabled: true,
        notificationEnabled: false,
        time: "12",
      });
      expect(data[feature].u.channelId).toBeUndefined();
      expect(data[feature].v).toEqual(destination);
    },
  );
  test("Mimo removal covers only the selected owner's matching accounts", async () => {
    mimoRow("one");
    mimoRow("two");
    mimoRow("other", { owner: "v" });
    mimoRow("elsewhere", { guildId: "elsewhere" });
    await manageAdminNotifications(
      { ...request, action: "remove", feature: "autoMimo", userId: "u" },
      deps,
    );
    for (const id of ["one", "two"])
      expect(mimo.get(id)).toMatchObject({
        enabled: true,
        notifyType: "off",
        order: ["polychrome"],
      });
    for (const id of ["other", "elsewhere"])
      expect(mimo.get(id)?.notifyType).toBe("channel");
  });
  test("news removal is scoped to channel, regardless of subscription creator", async () => {
    newsRow();
    newsRow("other");
    expect(
      await manageAdminNotifications(
        { ...request, action: "remove", feature: "news" },
        deps,
      ),
    ).toEqual([{ feature: "news", outcome: "success" }]);
    expect(news.getSubscription("channel:old")?.enabled).toBe(false);
    expect(news.getSubscription("channel:other")?.enabled).toBe(true);
    expect(deps.canMove).not.toHaveBeenCalled();
  });
  test("all without source moves personal notifications and reports skipped news", async () => {
    data.autoDaily = { u: { ...destination } };
    newsRow();
    const result = await manageAdminNotifications(
      { ...request, sourceChannelId: undefined },
      deps,
    );
    expect(data.autoDaily.u.channelId).toBe("new");
    expect(result).toContainEqual({
      feature: "news",
      outcome: "skipped",
      reason: "source_required",
    });
    expect(news.getSubscription("channel:old")?.enabled).toBe(true);
  });
  test.each([true, false])(
    "existing news target (enabled=%s) is never replaced",
    async (enabled) => {
      const source = newsRow();
      const target = newsRow("new", { enabled, locale: "en" });
      expect(
        await manageAdminNotifications({ ...request, feature: "news" }, deps),
      ).toEqual([
        { feature: "news", outcome: "conflict", reason: "target_exists" },
      ]);
      expect(news.getSubscription(source.id)).toEqual(source);
      expect(news.getSubscription(target.id)).toEqual(target);
    },
  );
  test("same channel and no matching rows do not write", async () => {
    data.autoDaily = { u: { ...destination } };
    newsRow();
    const result = await manageAdminNotifications(
      { ...request, targetChannelId: "old" },
      deps,
    );
    expect(result).toContainEqual({
      feature: "autoDaily",
      outcome: "skipped",
      reason: "same_channel",
    });
    expect(result).toContainEqual({
      feature: "news",
      outcome: "skipped",
      reason: "same_channel",
    });
    expect(deps.db.set).not.toHaveBeenCalled();
  });
  test("permissions and transient failures never disable the existing destination", async () => {
    data.autoDaily = { u: { ...destination }, v: { ...destination } };
    deps.canMove = jest.fn(async (owner) => {
      if (owner === "u") throw new Error("timeout");
      return false;
    });
    const results = await manageAdminNotifications(
      { ...request, feature: "autoDaily" },
      deps,
    );
    expect(results.map((r) => r.outcome)).toEqual(["failed", "skipped"]);
    expect(deps.db.set).not.toHaveBeenCalled();
  });
  test("changed destinations conflict, unrelated latest settings are preserved", async () => {
    data.autoDaily = { u: { ...destination }, v: { ...destination } };
    deps.canMove = async (owner) => {
      if (owner === "u") data.autoDaily.u.notifyType = "dm";
      else data.autoDaily.v.time = "20";
      return true;
    };
    const result = await manageAdminNotifications(
      { ...request, feature: "autoDaily" },
      deps,
    );
    expect(result.map((r) => r.outcome)).toEqual(["conflict", "success"]);
    expect(data.autoDaily.u.notifyType).toBe("dm");
    expect(data.autoDaily.v.time).toBe("20");
  });
  test("concurrent Mimo and news edits are not overwritten", async () => {
    mimoRow("h");
    const sub = newsRow();
    deps.canMove = async (owner) => {
      if (owner) {
        const c = mimo.get("h")!;
        mimo.save({ ...c, notifyType: "dm" }, ["notifyType"], c);
      } else news.saveSubscription({ ...sub, locale: "en" }, sub.revision);
      return true;
    };
    const results = await manageAdminNotifications(request, deps);
    expect(
      results
        .filter((r) => r.feature === "autoMimo" || r.feature === "news")
        .map((r) => r.outcome),
    ).toEqual(["conflict", "conflict"]);
    expect(mimo.get("h")?.notifyType).toBe("dm");
    expect(news.getSubscription("channel:new")).toBeNull();
  });
});
