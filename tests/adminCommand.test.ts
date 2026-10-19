import { ChannelType, MessageFlags, PermissionsBitField } from "discord.js";
import admin from "../src/commands/slash/zzz/admin";
import { createTranslator } from "../src/utilities/core/i18n";

const tr = createTranslator("tw");
const owner = "123456789012345678";
function environment(
  values: Record<string, any> = {},
  manage = true,
  allowed = true,
) {
  const channel = {
    id: "target",
    guildId: "g",
    type: ChannelType.GuildText,
    isThread: () => false,
    permissionsFor: () => ({ has: () => allowed }),
  };
  const bot = { user: { bot: true } };
  const db = {
    get: jest.fn(async (key: string) =>
      key === "autoDaily"
        ? { [owner]: { notifyType: "channel", guildId: "g", channelId: "old" } }
        : { notifyType: "channel", guildId: "g", channelId: "old" },
    ),
    set: jest.fn(async () => {}),
  };
  const interaction: any = {
    guildId: "g",
    user: { id: "admin" },
    memberPermissions: { has: () => manage },
    guild: {
      id: "g",
      channels: { fetch: jest.fn(async () => channel) },
      members: {
        me: bot,
        fetchMe: jest.fn(async () => bot),
        fetch: jest.fn(async () => ({ user: { bot: false } })),
      },
    },
    options: {
      getSubcommand: () => values.action || "move",
      getString: (key: string) =>
        values[key] ?? (key === "feature" ? "autoDaily" : null),
      getUser: () => values.user ?? null,
      getChannel: (key: string) =>
        values[key] ?? (key === "channel" ? channel : null),
    },
    reply: jest.fn(async () => {}),
    deferReply: jest.fn(async () => {}),
    editReply: jest.fn(async () => {}),
  };
  return {
    db,
    interaction,
    run: () => admin.execute({} as any, interaction, [], tr, db as any, {}),
  };
}
describe("admin notification command", () => {
  test("registration exposes five types, source filters, and guild permissions", () => {
    const schema = admin.data.toJSON();
    expect(schema.dm_permission).toBe(false);
    expect(schema.default_member_permissions).toBe(
      String(PermissionsBitField.Flags.ManageGuild),
    );
    for (const sub of schema.options as any[]) {
      const choices = sub.options
        .find((o: any) => o.name === "feature")
        .choices.map((c: any) => c.value);
      expect(choices).toEqual(
        expect.arrayContaining([
          "autoDaily",
          "autoRedeem",
          "noteReminder",
          "autoMimo",
          "news",
        ]),
      );
      expect(
        sub.options.find((o: any) => o.name === "source").required,
      ).not.toBe(true);
    }
  });
  test("non administrators and DMs cannot read or change settings", async () => {
    for (const dm of [false, true]) {
      const e = environment({}, dm);
      if (dm) e.interaction.guild = null;
      await e.run();
      expect(e.db.get).not.toHaveBeenCalled();
      expect(e.db.set).not.toHaveBeenCalled();
      expect(e.interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          flags: MessageFlags.Ephemeral,
          content: tr("admin_NoPermission"),
        }),
      );
    }
  });
  test("news requires source and rejects user targeting", async () => {
    for (const values of [
      { feature: "news" },
      { feature: "news", source: { id: "old" }, user: { id: owner } },
    ]) {
      const e = environment(values);
      await e.run();
      expect(e.interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: tr("admin_ManageNewsSource") }),
      );
      expect(e.db.set).not.toHaveBeenCalled();
    }
  });
  test("removing personal notifications requires a human user or valid ID", async () => {
    for (const values of [
      {},
      { userid: "bad" },
      { user: { id: owner, bot: true } },
    ]) {
      const e = environment({ ...values, action: "remove" });
      await e.run();
      expect(e.db.set).not.toHaveBeenCalled();
      expect(e.interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: tr("admin_ManageUser") }),
      );
    }
  });
  test("bad destination permissions do not change data", async () => {
    const e = environment({}, true, false);
    await e.run();
    expect(e.db.set).not.toHaveBeenCalled();
    expect(e.interaction.editReply).toHaveBeenCalledWith({
      content: tr("admin_ManagePermissions"),
    });
  });
  test("successful move returns private localized per-type counts", async () => {
    const e = environment();
    await e.run();
    expect(e.db.set).toHaveBeenCalledWith(
      `autoDaily.${owner}`,
      expect.objectContaining({
        channelId: "target",
        notificationEnabled: true,
      }),
    );
    expect(e.interaction.deferReply).toHaveBeenCalledWith({
      flags: MessageFlags.Ephemeral,
    });
    expect(e.interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: [
          expect.objectContaining({
            description: expect.stringContaining("成功 1"),
          }),
        ],
        allowedMentions: { parse: [] },
      }),
    );
  });
});
