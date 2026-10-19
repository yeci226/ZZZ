import { uiText, renderSettingsPreview } from "../settings/presentation.js";
import { NewsPublisher } from "./publication.js";
import { randomBytes } from "node:crypto";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ContainerBuilder,
  MessageFlags,
  PermissionsBitField,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  type ChatInputCommandInteraction,
  type Client,
  type MessageComponentInteraction,
  type BaseInteraction,
} from "discord.js";
import {
  CATEGORIES,
  GAME_CONFIG,
  LOCALE_LABELS,
  newSubscription,
  resolveNewsLocale,
  type NewsCategory,
  type NewsGame,
  type NewsLocale,
  type NewsSubscription,
} from "./types.js";
import { COPY, CATEGORY_LABELS, destinationFailure } from "./copy.js";
import { NewsConflictError, NewsStore } from "./store.js";
import { NewsSources, type ArticlePage } from "./sources.js";

export const NEWS_SESSION_TTL = 15 * 60_000;
export const isNewsInteraction = (id: string): boolean =>
  id.startsWith("news:") || id === "news_type" || id === "news_post";
const FEED_LABELS: Record<NewsLocale, string[]> = {
  tw: ["公告", "活動", "資訊"],
  cn: ["公告", "活动", "资讯"],
  en: ["Notices", "Events", "Information"],
  jp: ["お知らせ", "イベント", "情報"],
  kr: ["공지", "이벤트", "정보"],
  fr: ["Annonces", "Événements", "Informations"],
  vi: ["Thông báo", "Sự kiện", "Thông tin"],
};
export interface NewsSession {
  token: string;
  userId: string;
  guildId: string | null;
  locale: NewsLocale;
  game: NewsGame;
  page: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  baseline?: NewsSubscription;
  draft: NewsSubscription;
  expiresAt: number;
  canManage: boolean;
  error: string;
  busy: boolean;
  feed: number;
  browsePage: number;
  pages: ArticlePage[];
}
export function createNewsSession(
  game: NewsGame,
  userId: string,
  guildId: string | null,
  locale: NewsLocale,
  draft: NewsSubscription,
  canManage: boolean,
  now = Date.now(),
): NewsSession {
  return {
    token: randomBytes(8).toString("hex"),
    userId,
    guildId,
    locale,
    game,
    page: 0,
    draft: structuredClone(draft),
    baseline: structuredClone(draft),
    expiresAt: now + NEWS_SESSION_TTL,
    canManage,
    error: "",
    busy: false,
    feed: 3,
    browsePage: 0,
    pages: [],
  };
}
function row(...buttons: ButtonBuilder[]) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
}
function button(
  s: NewsSession,
  action: string,
  label: string,
  style = ButtonStyle.Secondary,
  disabled = false,
) {
  return new ButtonBuilder()
    .setCustomId(`news:${s.token}:${action}`)
    .setLabel(label)
    .setStyle(style)
    .setDisabled(disabled);
}
export function subscriptionSummary(
  sub: NewsSubscription,
  locale: NewsLocale,
): string {
  const c = COPY[locale];
  return [
    `**${sub.enabled ? c.enabled : c.disabled}**${sub.invalidReason ? ` · ${destinationFailure(locale, sub.invalidReason)}` : ""}`,
    `**${c.destination}:** ${sub.scope === "dm" ? c.personal : sub.channelId ? `<#${sub.channelId}>` : c.notSet}`,
    `**${c.categories}:** ${sub.categories.map((category) => CATEGORY_LABELS[locale][category]).join("、") || c.notSet}`,
    `**${c.language}:** ${LOCALE_LABELS[sub.locale]}`,
    `**${c.mention}:** ${sub.roleId ? `<@&${sub.roleId}>` : c.none}`,
  ].join("\n");
}

/** All screens use Components V2, including image-only articles. */
export function renderNewsSession(
  s: NewsSession,
  guildSubscriptions: NewsSubscription[] = [],
) {
  const c = COPY[s.locale];
  const container = new ContainerBuilder();
  const text = (value: string) =>
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(value),
    );
  text(`## ${s.game.toUpperCase()} · ${c.title}`);
  if (s.error) text(s.error);
  if ([0, 1, 2, 3, 6].includes(s.page)) text(uiText(s.locale, s.page === 0 ? "homeGuide" : "editGuide"));
  const nav = () =>
    container.addActionRowComponents(
      row(
        button(s, "save", uiText(s.locale, "save"), ButtonStyle.Success),
        button(s, "cancel", c.cancel),
      ),
    );
  if (s.page === 0) {
    text(`${s.draft.enabled ? c.enabled : c.disabled} · ${s.draft.scope === "dm" ? c.personal : s.draft.channelId ? `<#${s.draft.channelId}>` : c.notSet}`);
    container.addActionRowComponents(
      row(
        button(s, "item-1", c.destination, ButtonStyle.Primary),
        button(s, "item-2", `${c.categories} · ${s.draft.categories.length}`),
        button(s, "item-3", LOCALE_LABELS[s.draft.locale]),
        button(
          s,
          "toggle",
          s.draft.enabled ? c.disable : c.enable,
          s.draft.enabled ? ButtonStyle.Danger : ButtonStyle.Success,
        ),
        button(s, "browse", c.browse),
      ),
    );
    container.addActionRowComponents(row(
      ...(s.draft.scope === "channel" ? [button(s, "item-6", c.mention)] : []),
      button(s, "done", uiText(s.locale, "done")),
    ));
    if (s.guildId && s.canManage)
      container.addActionRowComponents(
        row(
          button(s, "server", c.server),
          ...(s.draft.scope === "channel"
            ? [button(s, "home", c.personal)]
            : []),
        ),
      );
  } else if (s.page === 1) {
    text(`**${c.destination}** · ${uiText(s.locale, "pending")}`);
    container.addActionRowComponents(
      row(
        button(
          s,
          "personal",
          c.personal,
          s.draft.scope === "dm" ? ButtonStyle.Primary : ButtonStyle.Secondary,
        ),
        ...(s.guildId && s.canManage
          ? [
              button(
                s,
                "server",
                c.server,
                s.draft.scope === "channel"
                  ? ButtonStyle.Primary
                  : ButtonStyle.Secondary,
              ),
            ]
          : []),
      ),
    );
    if (s.draft.scope === "channel") {
      text(c.channelHelp);
      const select = new ChannelSelectMenuBuilder()
        .setCustomId(`news:${s.token}:channel`)
        .setPlaceholder(c.chooseChannel)
        .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setMinValues(1)
        .setMaxValues(1);
      if (s.draft.channelId) select.setDefaultChannels(s.draft.channelId);
      container.addActionRowComponents(
        new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(select),
      );
      if (s.draft.revision)
        container.addActionRowComponents(row(button(s, "overview", c.home)));
    }
    nav();
  } else if (s.page === 2) {
    text(`**${c.categories}** · ${uiText(s.locale, "pending")}`);
    text(c.instructions);
    container.addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`news:${s.token}:categories`)
          .setPlaceholder(c.categories)
          .setMinValues(1)
          .setMaxValues(CATEGORIES.length)
          .addOptions(
            CATEGORIES.map((category) => ({
              label: CATEGORY_LABELS[s.locale][category],
              value: category,
              default: s.draft.categories.includes(category),
            })),
          ),
      ),
    );
    nav();
  } else if (s.page === 3) {
    text(`**${c.language}** · ${uiText(s.locale, "pending")}`);
    container.addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`news:${s.token}:language`)
          .setPlaceholder(c.language)
          .setMinValues(1)
          .setMaxValues(1)
          .addOptions(
            GAME_CONFIG[s.game].locales.map((locale) => ({
              label: LOCALE_LABELS[locale],
              value: locale,
              default: locale === s.draft.locale,
            })),
          ),
      ),
    );
    nav();
  } else if (s.page === 6) {
    text(`**${c.mention}** · ${uiText(s.locale, "pending")}`);
    if (s.draft.scope === "channel") {
      const select = new RoleSelectMenuBuilder()
        .setCustomId(`news:${s.token}:role`)
        .setPlaceholder(c.chooseRole)
        .setMinValues(0)
        .setMaxValues(1);
      if (s.draft.roleId) select.setDefaultRoles(s.draft.roleId);
      container.addActionRowComponents(
        new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(select),
      );
      container.addActionRowComponents(row(button(s, "no-role", c.none)));
    }
    text(`${c.mention}: ${s.draft.roleId ? `<@&${s.draft.roleId}>` : c.none}`);
    nav();
  } else if (s.page === 4) {
    text(`### 4/4 · ${c.preview}`);
    text(
      subscriptionSummary(
        { ...s.draft, enabled: true, invalidReason: null },
        s.locale,
      ),
    );
    text(c.instructions);
    container.addActionRowComponents(
      row(
        button(s, "back", c.back),
        button(s, "save", c.save, ButtonStyle.Success),
        button(s, "cancel", c.cancel),
      ),
    );
  } else {
    text(`### ${c.browse} · ${c.page} ${s.browsePage + 1}`);
    container.addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`news:${s.token}:feed`)
          .setMinValues(1)
          .setMaxValues(1)
          .addOptions(
            FEED_LABELS[s.locale].map((label, index) => ({
              label,
              value: String(index + 1),
              default: s.feed === index + 1,
            })),
          ),
      ),
    );
    const page = s.pages[s.browsePage];
    if (page?.events.length) {
      container.addActionRowComponents(
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`news:${s.token}:article`)
            .setPlaceholder(c.chooseArticle)
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(
              page.events.slice(0, 25).map((event) => ({
                label: event.title.slice(0, 100) || "—",
                description: new Date(event.publishedAt)
                  .toISOString()
                  .slice(0, 10),
                value: event.id,
              })),
            ),
        ),
      );
    } else text(c.empty);
    container.addActionRowComponents(
      row(
        button(
          s,
          "browse-back",
          c.back,
          ButtonStyle.Secondary,
          s.browsePage === 0,
        ),
        button(
          s,
          "browse-next",
          c.next,
          ButtonStyle.Secondary,
          !page || page.last,
        ),
        button(s, "home", c.home),
      ),
    );
  }
  return {
    components: [container],
    allowedMentions: { parse: [] as never[], repliedUser: false },
  };
}

export async function validateNewsDestination(
  client: Client,
  interaction: Pick<MessageComponentInteraction, "user" | "guild" | "guildId">,
  sub: NewsSubscription,
): Promise<void> {
  if (sub.scope === "dm") {
    if (
      sub.userId !== interaction.user.id ||
      sub.id !== `dm:${interaction.user.id}` ||
      sub.roleId ||
      sub.channelId ||
      sub.guildId
    )
      throw new Error("forbidden");
    return;
  }
  const guild = interaction.guild;
  if (!guild || guild.id !== sub.guildId || !sub.channelId)
    throw new Error("invalid");
  const member = await guild.members.fetch({
    user: interaction.user.id,
    force: true,
  });
  if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild))
    throw new Error("forbidden");
  const channel = await guild.channels.fetch(sub.channelId, { force: true });
  if (
    !channel ||
    ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(
      channel.type,
    )
  )
    throw new Error("invalid");
  const bot = await guild.members.fetchMe({ force: true });
  const userPermissions = channel.permissionsFor(member);
  const botPermissions = channel.permissionsFor(bot);
  if (
    !userPermissions?.has(PermissionsBitField.Flags.ViewChannel) ||
    !botPermissions?.has([
      PermissionsBitField.Flags.ViewChannel,
      PermissionsBitField.Flags.SendMessages,
      PermissionsBitField.Flags.EmbedLinks,
      PermissionsBitField.Flags.AttachFiles,
    ])
  )
    throw new Error("invalid");
  if (sub.roleId) {
    const role = await guild.roles.fetch(sub.roleId, { force: true });
    if (
      !role ||
      role.id === guild.id ||
      (!role.mentionable &&
        !botPermissions.has(PermissionsBitField.Flags.MentionEveryone))
    )
      throw new Error("invalid");
  }
  void client;
}

export class NewsWizard {
  readonly sessions = new Map<string, NewsSession>();
  constructor(
    readonly client: Client,
    readonly game: NewsGame,
    readonly store: NewsStore,
    readonly sources: NewsSources,
    readonly reader = new NewsPublisher(client, store, sources),
  ) {}
  private async render(s: NewsSession) {
    const message = renderNewsSession(
      s,
      this.store.subscriptions().filter((sub) => sub.guildId === s.guildId),
    );
    if (![0, 2].includes(s.page)) return { ...message, attachments: [], files: [] };
    const labels = s.draft.categories.map(category => CATEGORY_LABELS[s.locale][category]);
    const png = await renderSettingsPreview(s.locale, `${s.game.toUpperCase()} · ${COPY[s.locale].title}`, labels.map(name => ({ name, selected: true })));
    const container = message.components[0].toJSON();
    container.components.splice(2, 0, { type: 12, items: [{ media: { url: "attachment://news-settings.png" }, description: COPY[s.locale].title }] } as any);
    return { ...message, components: [container], attachments: [], files: [{ attachment: png, name: "news-settings.png" }] };
  }
  private personal(s: NewsSession): NewsSubscription {
    return (
      this.store.getSubscription(`dm:${s.userId}`) ??
      newSubscription(s.userId, s.locale)
    );
  }
  async open(
    interaction: ChatInputCommandInteraction,
    savedLocale: unknown,
  ): Promise<void> {
    if (!interaction.deferred && !interaction.replied)
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const locale = resolveNewsLocale(
      this.game,
      savedLocale,
      interaction.locale,
    );
    for (const [key, value] of this.sessions)
      if (value.userId === interaction.user.id || value.expiresAt <= Date.now())
        this.sessions.delete(key);
    const s = createNewsSession(
      this.game,
      interaction.user.id,
      interaction.guildId,
      locale,
      this.store.getSubscription(`dm:${interaction.user.id}`) ??
        newSubscription(interaction.user.id, locale),
      Boolean(
        interaction.memberPermissions?.has(
          PermissionsBitField.Flags.ManageGuild,
        ),
      ),
    );
    this.sessions.set(s.token, s);
    await interaction.editReply({
      ...await this.render(s),
      flags: MessageFlags.IsComponentsV2,
    });
  }
  async handle(base: BaseInteraction): Promise<void> {
    if (!base.isMessageComponent() || !isNewsInteraction(base.customId)) return;
    const interaction = base;
    const [, token, action] = interaction.customId.split(":");
    const s = token ? this.sessions.get(token) : undefined;
    const c =
      COPY[s?.locale ?? resolveNewsLocale(this.game, interaction.locale)];
    if (!s || s.expiresAt <= Date.now()) {
      if (s) this.sessions.delete(s.token);
      await interaction.reply({
        content: c.expired,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (s.userId !== interaction.user.id || s.guildId !== interaction.guildId) {
      await interaction.reply({
        content: c.forbidden,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (s.busy) {
      await interaction.deferUpdate();
      return;
    }
    s.busy = true;
    try {
      await interaction.deferUpdate();
      s.error = "";
      // Never trust the permission snapshot from when the menu was opened.
      if (
        s.draft.scope === "channel" ||
        action === "server" ||
        action === "channel"
      ) {
        const member = await interaction.guild?.members.fetch({
          user: s.userId,
          force: true,
        });
        if (!member?.permissions.has(PermissionsBitField.Flags.ManageGuild))
          throw new Error("forbidden");
      }
      if (action === "home" || action === "cancel") {
        s.page = 0;
        s.draft = action === "cancel" ? structuredClone(this.store.getSubscription(s.draft.id) || s.baseline || this.personal(s)) : this.personal(s);
        if (action === "cancel") s.error = c.cancelled;
      } else if (action === "overview" && s.page === 1 && s.draft.revision) {
        const current = this.store.getSubscription(s.draft.id);
        if (!current) throw new Error("invalid");
        s.draft = current;
        s.page = 0;
      } else if (/^item-[1236]$/.test(action) && s.page === 0) {
        s.draft = this.store.getSubscription(s.draft.id) || s.draft;
        s.baseline = structuredClone(s.draft);
        s.page = Number(action.slice(5)) as NewsSession["page"];
      } else if (action === "done") {
        this.sessions.delete(s.token);
        await interaction.editReply({ components: [{ type: 10, content: uiText(s.locale, "done") }], flags: MessageFlags.IsComponentsV2, attachments: [] }); return;
      } else if (action === "personal") {
        s.draft = this.personal(s);
        s.baseline = structuredClone(s.draft);
        s.page = 1;
      } else if (action === "server") {
        s.draft = {
          ...newSubscription(s.userId, s.locale),
          id: "channel:",
          scope: "channel",
          guildId: s.guildId,
        };
        s.baseline = structuredClone(s.draft);
        s.page = 1;
      } else if (
        action === "channel" &&
        interaction.isChannelSelectMenu() &&
        s.page === 1
      ) {
        const channelId = interaction.values[0];
        if (!channelId) throw new Error("invalid");
        const candidate = this.store.getSubscription(
          `channel:${channelId}`,
        ) ?? {
          ...newSubscription(s.userId, s.locale),
          id: `channel:${channelId}`,
          scope: "channel" as const,
          guildId: s.guildId,
          channelId,
        };
        // A broken role should be repairable in the wizard.
        await validateNewsDestination(this.client, interaction, {
          ...candidate,
          roleId: null,
        });
        s.draft = candidate;
        s.baseline = structuredClone(candidate);
      } else if (
        action === "categories" &&
        interaction.isStringSelectMenu() &&
        s.page === 2
      ) {
        if (
          !interaction.values.length ||
          interaction.values.some(
            (value) => !CATEGORIES.includes(value as NewsCategory),
          )
        )
          throw new Error("invalid");
        s.draft.categories = [...new Set(interaction.values)] as NewsCategory[];
      } else if (
        action === "language" &&
        interaction.isStringSelectMenu() &&
        s.page === 3
      ) {
        if (
          !GAME_CONFIG[this.game].locales.includes(
            interaction.values[0] as NewsLocale,
          )
        )
          throw new Error("invalid");
        s.draft.locale = interaction.values[0] as NewsLocale;
      } else if (
        action === "role" &&
        interaction.isRoleSelectMenu() &&
        s.page === 6 &&
        s.draft.scope === "channel"
      ) {
        s.draft.roleId = interaction.values[0] ?? null;
      } else if (action === "no-role" && s.page === 6) {
        s.draft.roleId = null;
      } else if (action === "save" && [1, 2, 3, 6].includes(s.page)) {
        const fields: (keyof NewsSubscription)[] = s.page === 1 ? ["scope", "guildId", "channelId", "roleId"] : s.page === 2 ? ["categories"] : s.page === 3 ? ["locale"] : ["roleId"];
        const current = this.store.getSubscription(s.draft.id) || s.baseline || newSubscription(s.userId, s.locale);
        const baseline = s.baseline || current;
        for (const field of fields) if (JSON.stringify(current[field]) !== JSON.stringify(baseline[field])) throw new NewsConflictError();
        const merged = { ...current, id: s.draft.id };
        for (const field of fields) (merged as any)[field] = s.draft[field];
        if (!merged.categories.length) throw new Error("invalid");
        await validateNewsDestination(this.client, interaction, merged);
        s.draft = this.store.saveSubscription({ ...merged, userId: s.userId, invalidReason: null }, current.revision);
        s.baseline = structuredClone(s.draft); s.page = 0; s.error = c.saved;
      } else if (action === "toggle" && s.page === 0) {
        if (!s.draft.revision) s.page = 1;
        else {
          if (!s.draft.enabled)
            await validateNewsDestination(this.client, interaction, s.draft);
          s.draft = this.store.saveSubscription(
            { ...s.draft, enabled: !s.draft.enabled, invalidReason: null },
            s.draft.revision,
          );
        }
      } else if (
        action === "browse" ||
        (action === "feed" && interaction.isStringSelectMenu() && s.page === 5)
      ) {
        const feed =
          action === "feed" && interaction.isStringSelectMenu()
            ? Number(interaction.values[0])
            : 3;
        if (![1, 2, 3].includes(feed)) throw new Error("invalid");
        const page = await this.sources.articles(s.locale, feed);
        s.feed = feed;
        s.pages = [page];
        s.browsePage = 0;
        s.page = 5;
      } else if (action === "browse-back" && s.page === 5 && s.browsePage > 0) {
        s.browsePage--;
      } else if (action === "browse-next" && s.page === 5) {
        const page = s.pages[s.browsePage];
        if (!page || page.last || !page.cursor) throw new Error("invalid");
        if (!s.pages[s.browsePage + 1])
          s.pages.push(
            await this.sources.articles(s.locale, s.feed, page.cursor),
          );
        s.browsePage++;
      } else if (
        action === "article" &&
        interaction.isStringSelectMenu() &&
        s.page === 5
      ) {
        const event = s.pages[s.browsePage]?.events.find(
          (e) => e.id === interaction.values[0],
        );
        if (!event) throw new Error("invalid");
        await this.reader.open(
          interaction,
          event,
          s.locale,
          `news:${s.token}:home`,
        );
        return;
      } else {
        throw new Error("invalid");
      }
      await interaction.editReply({
        ...await this.render(s),
        attachments: [],
        flags: MessageFlags.IsComponentsV2,
      });
    } catch (error) {
      s.error =
        error instanceof NewsConflictError
          ? c.conflict
          : error instanceof Error && error.message === "forbidden"
            ? c.forbidden
            : error instanceof Error && error.message === "invalid"
              ? c.invalid
              : c.failed;
      if (interaction.deferred || interaction.replied)
        await interaction
          .editReply({
            ...await this.render(s),
            attachments: [],
            flags: MessageFlags.IsComponentsV2,
          })
          .catch(() => {});
      else
        await interaction
          .reply({ content: s.error, flags: MessageFlags.Ephemeral })
          .catch(() => {});
    } finally {
      s.busy = false;
    }
  }
}
