import {
  classifyPermanentNotificationError,
  disableDestinationsMatching,
  disableNotificationDestination,
  enableNotificationDestination,
  isNotificationEnabled,
} from "../src/utilities/core/notificationDestination";

describe("notification destination lifecycle", () => {
  it.each([
    [10003, "unknown_channel"],
    [10004, "unknown_guild"],
    [10007, "unknown_member"],
    [50001, "missing_access"],
    [50007, "cannot_dm"],
    [50013, "missing_permissions"],
    [50278, "no_mutual_guild"],
  ])("classifies permanent Discord code %s", (code, reason) => {
    expect(classifyPermanentNotificationError({ code })).toBe(reason);
  });

  it("does not classify transient Discord and network failures", () => {
    expect(classifyPermanentNotificationError({ code: 429 })).toBeNull();
    expect(classifyPermanentNotificationError({ code: 500 })).toBeNull();
    expect(classifyPermanentNotificationError(new Error("ETIMEDOUT"))).toBeNull();
  });

  it("keeps the feature row while removing an invalid channel", async () => {
    const db = { set: jest.fn().mockResolvedValue(undefined) };
    const config = {
      enabled: true,
      time: "12",
      channelId: "channel-1",
      guildId: "guild-1",
    };

    const next = await disableNotificationDestination(
      db,
      "autoDaily",
      "user-1",
      config,
      "missing_access",
    );

    expect(next).toMatchObject({
      enabled: true,
      time: "12",
      notificationEnabled: false,
      notificationInvalidReason: "missing_access",
    });
    expect(next).not.toHaveProperty("channelId");
    expect(next).not.toHaveProperty("guildId");
    expect(db.set).toHaveBeenCalledWith("autoDaily.user-1", next);
  });

  it("treats legacy rows as enabled and clears invalid metadata on re-enable", () => {
    expect(isNotificationEnabled({ channelId: "legacy" })).toBe(true);
    expect(isNotificationEnabled({ notificationEnabled: false })).toBe(false);
    expect(
      enableNotificationDestination(
        {
          notificationEnabled: false,
          notificationInvalidReason: "unknown_channel",
          notificationInvalidatedAt: "2026-01-01T00:00:00.000Z",
        },
        { notifyType: "channel", channelId: "new", guildId: "guild" },
      ),
    ).toEqual({
      notificationEnabled: true,
      notifyType: "channel",
      channelId: "new",
      guildId: "guild",
    });
  });

  it("disables only destinations that belong to a deleted guild", async () => {
    const roots: Record<string, any> = {
      autoDaily: {
        a: { enabled: true, guildId: "gone", channelId: "one" },
        b: { enabled: true, guildId: "kept", channelId: "two" },
      },
      autoRedeem: { c: { enabled: true, guildId: "gone", channelId: "three" } },
      noteReminder: {},
    };
    const writes: Array<[string, any]> = [];
    const db = {
      get: jest.fn(async (key: string) => roots[key]),
      set: jest.fn(async (key: string, value: any) => writes.push([key, value])),
    };

    await expect(
      disableDestinationsMatching(db, { guildId: "gone" }, "guild_unavailable"),
    ).resolves.toBe(2);
    expect(writes.map(([key]) => key)).toEqual([
      "autoDaily.a",
      "autoRedeem.c",
    ]);
    expect(writes.every(([, value]) => value.notificationEnabled === false)).toBe(true);
  });
});
