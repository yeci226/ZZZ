import {
  deliverAutoDailyPayload,
  normalizeAutoDailyNotifyType,
  resolveAndPersistAutoDailyGuildId,
} from "../src/utilities/core/autoDailyNotification";

describe("ZZZ auto-daily notification routing", () => {
  it("treats only an explicit dm setting as DM", () => {
    expect(normalizeAutoDailyNotifyType("dm")).toBe("dm");
    expect(normalizeAutoDailyNotifyType("channel")).toBe("channel");
    expect(normalizeAutoDailyNotifyType(undefined)).toBe("channel");
    expect(normalizeAutoDailyNotifyType("invalid")).toBe("channel");
  });

  it("never falls back to DM when channel delivery fails", async () => {
    const sendChannel = jest.fn().mockRejectedValue(new Error("channel failed"));
    const sendDm = jest.fn().mockResolvedValue(undefined);

    await expect(
      deliverAutoDailyPayload(undefined, sendChannel, sendDm),
    ).rejects.toThrow("channel failed");
    expect(sendChannel).toHaveBeenCalledTimes(1);
    expect(sendDm).not.toHaveBeenCalled();
  });

  it("uses DM only for an explicit dm setting", async () => {
    const sendChannel = jest.fn().mockResolvedValue(undefined);
    const sendDm = jest.fn().mockResolvedValue(undefined);

    await expect(
      deliverAutoDailyPayload("dm", sendChannel, sendDm),
    ).resolves.toBe("dm");
    expect(sendDm).toHaveBeenCalledTimes(1);
    expect(sendChannel).not.toHaveBeenCalled();
  });

  it("derives missing guildId from channel cache and persists the whole config", async () => {
    const config: Record<string, unknown> = {
      channelId: "channel-1",
      time: "4",
      tag: "false",
    };
    const db = { set: jest.fn().mockResolvedValue(undefined) };
    const client = {
      cluster: {
        broadcastEval: jest.fn().mockResolvedValue([null, "guild-1"]),
      },
      rest: { get: jest.fn() },
    };

    await expect(
      resolveAndPersistAutoDailyGuildId(client, db, "user-1", config),
    ).resolves.toBe("guild-1");
    expect(config.guildId).toBe("guild-1");
    expect(config.notifyType).toBe("channel");
    expect(db.set).toHaveBeenCalledWith("autoDaily.user-1", {
      channelId: "channel-1",
      guildId: "guild-1",
      notifyType: "channel",
      time: "4",
      tag: "false",
    });
    expect(client.rest.get).not.toHaveBeenCalled();
  });

  it("uses Discord REST metadata when no cluster has the channel cached", async () => {
    const config: Record<string, unknown> = { channelId: "channel-2" };
    const db = { set: jest.fn().mockResolvedValue(undefined) };
    const client = {
      cluster: { broadcastEval: jest.fn().mockResolvedValue([null, null]) },
      rest: { get: jest.fn().mockResolvedValue({ guild_id: "guild-2" }) },
    };

    await expect(
      resolveAndPersistAutoDailyGuildId(client, db, "user-2", config),
    ).resolves.toBe("guild-2");
    expect(db.set).toHaveBeenCalledWith(
      "autoDaily.user-2",
      expect.objectContaining({
        channelId: "channel-2",
        guildId: "guild-2",
        notifyType: "channel",
      }),
    );
  });
});
