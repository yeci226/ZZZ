import {
  ChannelType,
  ComponentType,
  MessageFlags,
  PermissionsBitField,
} from "discord.js";
import { NewsStore } from "../src/utilities/news/store.js";
import { NewsSources } from "../src/utilities/news/sources.js";
import {
  CATEGORIES,
  GAME_CONFIG,
  newSubscription,
  resolveNewsLocale,
  type NewsGame,
  type NewsLocale,
} from "../src/utilities/news/types.js";
import { CATEGORY_LABELS, COPY } from "../src/utilities/news/copy.js";
import {
  NewsWizard,
  createNewsSession,
  renderNewsSession,
  validateNewsDestination,
  isNewsInteraction,
  type NewsSession,
} from "../src/utilities/news/wizard.js";

function interaction(
  s: NewsSession,
  action: string,
  extra: Record<string, unknown> = {},
): any {
  const i: any = {
    user: { id: s.userId },
    guildId: s.guildId,
    guild: null,
    locale: "zh-TW",
    customId: `news:${s.token}:${action}`,
    deferred: false,
    replied: false,
    isMessageComponent: () => true,
    isStringSelectMenu: () => false,
    isChannelSelectMenu: () => false,
    isRoleSelectMenu: () => false,
    editReply: jest.fn().mockResolvedValue(undefined),
    reply: jest.fn().mockResolvedValue(undefined),
    ...extra,
  };
  i.deferUpdate = jest.fn(async () => {
    i.deferred = true;
  });
  return i;
}
function mockGuild(manage = true) {
  const member = {
    permissions: new PermissionsBitField(
      manage ? [PermissionsBitField.Flags.ManageGuild] : [],
    ),
  };
  const bot = {};
  const channel = {
    id: "222222222222222222",
    type: ChannelType.GuildText,
    permissionsFor: jest.fn(
      (m: unknown) =>
        new PermissionsBitField(
          m === member
            ? [PermissionsBitField.Flags.ViewChannel]
            : [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.EmbedLinks,
                PermissionsBitField.Flags.AttachFiles,
              ],
        ),
    ),
  };
  const guild = {
    id: "333333333333333333",
    members: {
      fetch: jest.fn().mockResolvedValue(member),
      fetchMe: jest.fn().mockResolvedValue(bot),
    },
    channels: { fetch: jest.fn().mockResolvedValue(channel) },
    roles: {
      fetch: jest
        .fn()
        .mockResolvedValue({ id: "444444444444444444", mentionable: true }),
    },
  };
  return { guild, member, bot, channel };
}

describe.each(["hsr", "zzz"] as NewsGame[])("%s news wizard", (game) => {
  let store: NewsStore, wizard: NewsWizard, session: NewsSession;
  beforeEach(() => {
    store = new NewsStore(":memory:");
    wizard = new NewsWizard({} as any, game, store, new NewsSources(game));
    session = createNewsSession(
      game,
      "111111111111111111",
      null,
      "tw",
      newSubscription("111111111111111111", "tw"),
      false,
    );
    wizard.sessions.set(session.token, session);
  });
  afterEach(() => store.close());
  test("command opens ephemeral and saved locale wins", async () => {
    const i: any = {
      user: { id: session.userId },
      guildId: null,
      locale: "en-US",
      deferred: false,
      replied: false,
      editReply: jest.fn(),
      deferReply: jest.fn(),
    };
    await wizard.open(i, "tw");
    expect(i.deferReply).toHaveBeenCalledWith({
      flags: MessageFlags.Ephemeral,
    });
    expect(i.editReply.mock.calls[0][0].flags).toBe(
      MessageFlags.IsComponentsV2,
    );
    expect([...wizard.sessions.values()][0]?.locale).toBe("tw");
  });
  test("categories save independently without enabling the subscription", async () => {
    await wizard.handle(interaction(session, "item-2"));
    expect(session.page).toBe(2);
    await wizard.handle(
      interaction(session, "categories", {
        isStringSelectMenu: () => true,
        values: ["preload", "character_reveal", "banner"],
      }),
    );
    expect(store.subscriptions()).toEqual([]);

    await wizard.handle(interaction(session, "save"));
    expect(store.getSubscription(session.draft.id)).toMatchObject({
      enabled: false,
      categories: ["preload", "character_reveal", "banner"],
    });
  });
  test("cancel leaves previously saved data unchanged", async () => {
    const existing = store.saveSubscription(
      { ...session.draft, enabled: true },
      0,
    );
    session.draft = structuredClone(existing);
    session.page = 2;
    await wizard.handle(
      interaction(session, "categories", {
        isStringSelectMenu: () => true,
        values: ["banner"],
      }),
    );
    await wizard.handle(interaction(session, "cancel"));
    expect(store.getSubscription(existing.id)).toEqual(existing);
    expect(session.draft.categories).toEqual(existing.categories);
  });
  test("back to homepage discards unsaved draft", async () => {
    const existing = store.saveSubscription(
      { ...session.draft, enabled: true },
      0,
    );
    session.draft = { ...existing, categories: ["banner"] };
    session.page = 1;
    await wizard.handle(interaction(session, "cancel"));
    expect(session.draft.categories).toEqual(existing.categories);
  });
  test("expired and foreign interactions cannot mutate subscriptions", async () => {
    session.page = 4;
    const foreign = interaction(session, "save", { user: { id: "other" } });
    await wizard.handle(foreign);
    expect(foreign.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: COPY.tw.forbidden }),
    );
    session.expiresAt = Date.now() - 1;
    const expired = interaction(session, "save");
    await wizard.handle(expired);
    expect(expired.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: COPY.tw.expired }),
    );
    expect(store.subscriptions()).toEqual([]);
  });
  test("empty and invalid category values are rejected", async () => {
    session.page = 2;
    for (const values of [[], ["fake"]]) {
      await wizard.handle(
        interaction(session, "categories", {
          isStringSelectMenu: () => true,
          values,
        }),
      );
      expect(session.error).toBe(COPY.tw.invalid);
    }
  });
  test("concurrent administrators get a conflict instead of overwriting", async () => {
    const { guild } = mockGuild();
    session.guildId = guild.id;
    session.canManage = true;
    session.page = 2;
    session.draft = {
      ...session.draft,
      id: "channel:222222222222222222",
      scope: "channel",
      guildId: guild.id,
      channelId: "222222222222222222",
    };
    session.baseline = structuredClone(session.draft);
    store.saveSubscription(
      { ...session.draft, categories: ["banner"], enabled: true },
      0,
    );
    await wizard.handle(interaction(session, "save", { guild }));
    expect(session.error).toBe(COPY.tw.conflict);
    expect(store.getSubscription(session.draft.id)?.categories).toEqual([
      "banner",
    ]);
  });
  test("revoked ManageGuild prevents server changes", async () => {
    const { guild } = mockGuild(false);
    session.guildId = guild.id;
    session.canManage = true;
    await wizard.handle(interaction(session, "server", { guild }));
    expect(session.error).toBe(COPY.tw.forbidden);
    expect(session.draft.scope).toBe("dm");
  });
  test("existing server subscription has a direct overview and disable path", async () => {
    const { guild } = mockGuild();
    session.guildId = guild.id;
    session.canManage = true;
    session.draft = store.saveSubscription(
      {
        ...session.draft,
        id: "channel:222222222222222222",
        scope: "channel",
        guildId: guild.id,
        channelId: "222222222222222222",
        enabled: true,
      },
      0,
    );
    session.page = 1;
    await wizard.handle(interaction(session, "overview", { guild }));
    expect(session.page).toBe(0);
    await wizard.handle(interaction(session, "toggle", { guild }));
    expect(store.getSubscription(session.draft.id)?.enabled).toBe(false);
  });
  test("all supported locales and pages serialize valid Discord components", () => {
    for (const locale of GAME_CONFIG[game].locales)
      for (const page of [0, 1, 2, 3, 4, 5] as const) {
        session.locale = locale;
        session.page = page;
        const json = renderNewsSession(session).components[0]!.toJSON();
        expect(json.type).toBe(ComponentType.Container);
        expect(JSON.stringify(json)).not.toContain("undefined");
        if (page === 2) {
          const select = (
            json.components.find(
              (r: any) => r.type === ComponentType.ActionRow,
            ) as any
          ).components[0];
          expect(select.min_values).toBe(1);
          expect(select.max_values).toBe(CATEGORIES.length);
          expect(select.options).toHaveLength(9);
        }
      }
  });
  test("empty feed does not create an invalid empty select menu", async () => {
    jest
      .spyOn(wizard.sources, "articles")
      .mockResolvedValue({ events: [], ids: [], cursor: null, last: true });
    await wizard.handle(interaction(session, "browse"));
    expect(session.page).toBe(5);
    expect(
      JSON.stringify(renderNewsSession(session).components[0]!.toJSON()),
    ).toContain(COPY.tw.empty);
  });
  test("article lookup is limited to articles on the current page", async () => {
    session.page = 5;
    const fetch = jest.spyOn(wizard.sources, "fullArticle");
    await wizard.handle(
      interaction(session, "article", {
        isStringSelectMenu: () => true,
        values: ["post:zzz:tw:evil"],
      }),
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(session.error).toBe(COPY.tw.invalid);
  });
});

test("complete copy and category translations for all seven locales", () => {
  for (const locale of Object.keys(COPY) as NewsLocale[]) {
    expect(Object.keys(COPY[locale]).sort()).toEqual(
      Object.keys(COPY.en).sort(),
    );
    expect(Object.keys(CATEGORY_LABELS[locale]).sort()).toEqual(
      [...CATEGORIES].sort(),
    );
    expect(
      Object.values(COPY[locale]).every((value) => value.trim().length > 0),
    ).toBe(true);
  }
  expect(resolveNewsLocale("hsr", "ja-JP", "zh-CN")).toBe("cn");
  expect(resolveNewsLocale("zzz", "ko-KR")).toBe("kr");
});

test("destination validation rejects missing permissions and unsafe role targets", async () => {
  const { guild, channel } = mockGuild();
  const sub = {
    ...newSubscription("111111111111111111", "tw"),
    id: "channel:222222222222222222",
    scope: "channel" as const,
    guildId: guild.id,
    channelId: channel.id,
  };
  const i: any = { user: { id: sub.userId }, guild, guildId: guild.id };
  await expect(
    validateNewsDestination({} as any, i, sub),
  ).resolves.toBeUndefined();
  guild.roles.fetch.mockResolvedValue({ id: guild.id, mentionable: true });
  await expect(
    validateNewsDestination({} as any, i, { ...sub, roleId: guild.id }),
  ).rejects.toThrow("invalid");
  guild.roles.fetch.mockResolvedValue({
    id: "444444444444444444",
    mentionable: false,
  });
  await expect(
    validateNewsDestination({} as any, i, {
      ...sub,
      roleId: "444444444444444444",
    }),
  ).rejects.toThrow("invalid");
  channel.permissionsFor.mockReturnValue(new PermissionsBitField([]));
  await expect(validateNewsDestination({} as any, i, sub)).rejects.toThrow(
    "invalid",
  );
});

test("both new and legacy custom IDs are exclusively claimed by the news router", () => {
  expect(
    ["news:abc:save", "news_type", "news_post"].every(isNewsInteraction),
  ).toBe(true);
  expect(isNewsInteraction("reminder:abc:save")).toBe(false);
});
