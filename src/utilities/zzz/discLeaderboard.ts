import { existsSync, readFileSync } from "node:fs";
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  StringSelectMenuBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";
import {
  getDiscLeaderboardStore,
  type DiscLeaderboardStore,
  type RankedDiscEntry,
} from "./discLeaderboardStore.js";
import { renderDiscLeaderboard } from "./discLeaderboardRenderer.js";
import { getScoringStore } from "./combat/scoringStore.js";
import { discContent, discText } from "./discLeaderboardCopy.js";
import { messageSubtext } from "../core/messageSubtext.js";
import emoji from "../../assets/emoji.js";
import { getElementEmojiKey } from "./elements.js";
import { normalizeZzzLocale } from "./canvasFonts.js";
import type { DbAdapter } from "../accountStore.js";
import {
  paginateProfileCharacters,
  clampProfileCharacterPage,
  PROFILE_SELECT_NEXT_PAGE,
  PROFILE_SELECT_PREVIOUS_PAGE,
} from "./profileCharacterSelect.js";

let names:
  | Record<
      string,
      Record<
        string,
        { name: string; skins: Record<string, string>; color?: string }
      >
    >
  | undefined;
function translatedAgent(id: string, locale: string) {
  if (!names) {
    try {
      names = JSON.parse(
        readFileSync("src/assets/disc-leaderboard-names.json", "utf8"),
      );
    } catch {
      names = {};
    }
  }
  return names![normalizeZzzLocale(locale)]?.[id];
}
function agentName(id: string, locale: string, fallback: string) {
  return (
    translatedAgent(id, locale)?.name ||
    (["tw", "cn"].includes(normalizeZzzLocale(locale))
      ? fallback
      : getScoringStore().snapshot().agents[id]?.name || fallback)
  );
}

let catalog: Array<{ id: string; name: string; image: string }> | undefined;
let agentElements: Record<string, { elementType: number }> | undefined;
function agentElementEmoji(id: string): string | undefined {
  agentElements ??= JSON.parse(readFileSync("src/assets/disc-leaderboard-elements.json", "utf8")).agents;
  const key = getElementEmojiKey(agentElements![id]?.elementType, id);
  return key ? emoji[key as keyof typeof emoji] : undefined;
}
export function discLeaderboardAgents() {
  if (!catalog) {
    const data = JSON.parse(
      readFileSync("src/assets/gacha-simulation/catalog.json", "utf8"),
    );
    catalog = Object.values(data.items)
      .filter((item: any) => item.kind === "character")
      .map((item: any) => ({
        id: String(item.id),
        name: String(item.name),
        image: String(item.image),
      }));
  }
  // Scorable released agents can appear in profiles before the gacha art catalog is refreshed.
  for (const id of Object.keys(getScoringStore().snapshot().agents)) {
    if (catalog!.some((item) => item.id === id)) continue;
    const name = translatedAgent(id, "tw")?.name;
    if (name) {
      const icon = `src/assets/images/icons/roleCircle/${id}.webp`;
      catalog!.push({
        id,
        name,
        image: existsSync(icon) ? icon : "src/assets/images/None.png",
      });
    }
  }
  return catalog;
}
export function discLeaderboardChoices(query: string, locale = "tw") {
  const needle = query.toLowerCase().trim(),
    scoring = getScoringStore().snapshot();
  return discLeaderboardAgents()
    .filter(
      (agent) =>
        scoring.agents[agent.id] &&
        `${agent.id} ${agent.name} ${agentName(agent.id, locale, agent.name)} ${scoring.agents[agent.id].name}`
          .toLowerCase()
          .includes(needle),
    )
    .slice(0, 25)
    .map((agent) => ({
      name: agentName(agent.id, locale, agent.name),
      value: agent.id,
    }));
}

export function buildDiscLeaderboardEntry(characters: any[], locale = "tw") {
  const agents = characters
    .slice(0, 3)
    .filter((c) => /^\d{4}$/.test(String(c.id)));
  if (!agents.length) return [];
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      agents.map((agent) =>
        new ButtonBuilder()
          .setCustomId(`zdisc:open:${agent.id}`)
          .setLabel(
            (agents.length === 1
              ? discText(locale, "view")
              : discText(locale, "agentRank", {
                  name: agent.name_mi18n || agent.id,
                })
            ).slice(0, 80),
          )
          .setStyle(ButtonStyle.Secondary),
      ),
    ),
  ];
}

export function recordDiscCharacters(
  interaction: {
    user: {
      id: string;
      displayName?: string;
      username?: string;
      displayAvatarURL?: (options: any) => string;
    };
    guildId?: string | null;
    createdTimestamp: number;
    id: string;
  },
  ownerId: string,
  uid: string,
  characters: any[],
  locale = "tw",
  store?: DiscLeaderboardStore,
): string {
  if (ownerId !== interaction.user.id) return "";
  try {
    const target = store ?? getDiscLeaderboardStore();
    if (!target.enabled(ownerId)) return discContent(locale, "hidden");
    const statuses = characters.map((character) =>
      target.record({
        ownerId,
        requesterId: interaction.user.id,
        uid,
        guildId: interaction.guildId,
        playerName:
          interaction.user.displayName ||
          interaction.user.username ||
          discText(locale, "proxy"),
        avatarSource: interaction.user.displayAvatarURL?.({
          extension: "png",
          size: 128,
        }),
        character,
        requestedAt: interaction.createdTimestamp,
        requestId: interaction.id,
      }),
    );
    if (statuses.some((status) => status === "recorded"))
      return discContent(locale, "enrolled");
    if (statuses.includes("other-owner")) return discContent(locale, "duplicate");
    return "";
  } catch {
    console.warn("[disc-leaderboard] enrollment failed");
    return discContent(locale, "enrollFailed");
  }
}

export function leaderboardCharacterSelect(
  owner: string,
  agent: string,
  scope: "global" | "server",
  rankPage: number,
  locale = "tw",
  requestedPage?: number,
) {
  const scoring = getScoringStore().snapshot();
  const pages = paginateProfileCharacters(
    discLeaderboardAgents().filter((item) => scoring.agents[item.id]),
  );
  const page = clampProfileCharacterPage(
    requestedPage ??
      pages.findIndex((p) => p.characters.some((c) => c.id === agent)),
    pages.length,
  );
  const current = pages[page];
  const menu = new StringSelectMenuBuilder()
    .setCustomId(
      `zdisc:select:${owner}:${agent}:${scope === "global" ? "g" : "s"}:${rankPage}:${page}`,
    )
    .setMinValues(1)
    .setMaxValues(1)
    .setPlaceholder(
      discText(locale, "switchAgent", { page: page + 1, pages: pages.length }),
    );
  menu.addOptions(
    current.characters.map((item) => ({
      label: agentName(item.id, locale, item.name).slice(0, 100),
      value: item.id,
      default: item.id === agent,
      emoji: agentElementEmoji(item.id),
    })),
  );
  if (current.hasNext)
    menu.addOptions({
      label: discText(locale, "nextAgents"),
      value: PROFILE_SELECT_NEXT_PAGE,
      emoji: "▶️",
    });
  if (current.hasPrevious)
    menu.addOptions({
      label: discText(locale, "previousAgents"),
      value: PROFILE_SELECT_PREVIOUS_PAGE,
      emoji: "◀️",
    });
  return {
    page,
    row: new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu),
  };
}

export function leaderboardControls(
  owner: string,
  agent: string,
  scope: "global" | "server",
  page: number,
  pages: number,
  guild: boolean,
  enabled: boolean,
  locale = "tw",
  selectorPage?: number,
) {
  const selector = leaderboardCharacterSelect(
    owner,
    agent,
    scope,
    page,
    locale,
    selectorPage,
  );
  const id = (action: string) =>
    `zdisc:panel:${owner}:${agent}:${scope === "global" ? "g" : "s"}:${page}:${action}:${selector.page}`;
  const button = (
    action: string,
    label: string,
    disabled = false,
    style: ButtonStyle = ButtonStyle.Secondary,
  ) =>
    new ButtonBuilder()
      .setCustomId(id(action))
      .setLabel(label)
      .setStyle(style)
      .setDisabled(disabled);
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      button(
        "global",
        discText(locale, "global"),
        scope === "global",
        ButtonStyle.Primary,
      ),
      button(
        "server",
        discText(locale, "server"),
        !guild || scope === "server",
      ),
      button("refresh", discText(locale, "refresh")),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      button("previous", discText(locale, "previous"), page <= 1),
      button("next", discText(locale, "next"), page >= pages),
      button(
        enabled ? "leave" : "join",
        discText(locale, enabled ? "leave" : "join"),
        false,
        enabled ? ButtonStyle.Secondary : ButtonStyle.Success,
      ),
    ),
    selector.row,
  ];
}

/** Each ranking page has at most ten players; values pin the actual winning account. */
export function leaderboardPlayerSelect(
  owner: string,
  agent: string,
  scope: "global" | "server",
  page: number,
  entries: Array<RankedDiscEntry & { nickname?: string }>,
  locale = "tw",
) {
  if (!entries.length) return [];
  const line = (value: string) => value.replace(/\s+/g, " ").trim();
  return [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`zdisc:player:${owner}:${agent}:${scope === "global" ? "g" : "s"}:${page}`)
      .setPlaceholder(discText(locale, "selectPlayer"))
      .setMinValues(1).setMaxValues(1)
      .addOptions(entries.slice(0, 10).map(entry => ({
        label: `#${entry.rank} ${line(entry.nickname || entry.playerName)}`.slice(0, 100),
        description: `UID ${entry.uid} · ${entry.total.toFixed(1)} / 600 · ${line(entry.playerName)}`.slice(0, 100),
        value: `${entry.ownerId}:${entry.uid}`,
      })))),
  ];
}

/** Resolve only display names for the ranked UID, without migrating or changing account data. */
async function leaderboardNicknames(entries: RankedDiscEntry[], db?: Pick<DbAdapter, "get">) {
  const names = new Map<string, string>();
  if (!db) return names;
  await Promise.all([...new Set(entries.map(entry => entry.ownerId))].map(async owner => {
    const results = await Promise.allSettled([
      Promise.resolve().then(() => db.get(`${owner}.hoyolabs`)),
      Promise.resolve().then(() => db.get(`${owner}.account`)),
    ]);
    const grouped: any = results[0].status === "fulfilled" ? results[0].value : null;
    const legacy: any = results[1].status === "fulfilled" ? results[1].value : null;
    const hoyolabs = Array.isArray(grouped) ? grouped : Array.isArray(grouped?.hoyolabs) ? grouped.hoyolabs : [];
    const accounts = [
      ...hoyolabs.flatMap((h: any) => Array.isArray(h?.characters) ? h.characters : []),
      ...(Array.isArray(legacy) ? legacy : []),
    ];
    for (const entry of entries.filter(entry => entry.ownerId === owner)) {
      const account = accounts.find((a: any) => String(a?.uid) === entry.uid && typeof a?.nickname === "string" && a.nickname.trim());
      if (account) names.set(`${owner}/${entry.uid}`, account.nickname.trim().replace(/\s+/g, " ").slice(0, 100));
    }
  }));
  return names;
}

export async function discLeaderboardPayload(
  owner: string,
  agentId: string,
  scope: "global" | "server",
  guildId: string | null,
  requestedPage = 1,
  store = getDiscLeaderboardStore(),
  locale = "tw",
  selectorPage?: number,
  accountDb?: Pick<DbAdapter, "get">,
) {
  const agent = discLeaderboardAgents().find((agent) => agent.id === agentId);
  if (!agent) throw new Error(discText(locale, "selectAgent"));
  if (scope === "server" && !guildId)
    throw new Error(discText(locale, "guildOnly"));
  const scoring = getScoringStore().snapshot();
  // Version updates publish an entire board in one transaction; keep the last board visible during calculation.
  void store
    .syncScoring(scoring)
    .catch(() => console.warn("[disc-leaderboard] scoring refresh failed"));
  const ranking = store.page(
    agentId,
    owner,
    scope === "server" ? guildId : null,
    requestedPage,
  );
  const updated = ranking.entries.reduce(
    (last, entry) => Math.max(last, entry.updatedAt),
    ranking.viewer?.updatedAt ?? 0,
  );
  const nicknames = await leaderboardNicknames(
    [...ranking.entries, ...(ranking.viewer ? [ranking.viewer] : [])],
    accountDb,
  );
  const date = (at: number) =>
    new Date(at)
      .toLocaleString("sv-SE", { timeZone: "Asia/Taipei" })
      .slice(5, 16)
      .replace("-", "/");
  const row = (entry: RankedDiscEntry) => {
    const skinId = entry.portraitSource?.match(/_(\d+)\.png(?:\?.*)?$/)?.[1];
    const original = skinId === agentId || skinId === `31${agentId}0`;
    const translatedSkin = translatedAgent(agentId, locale)?.skins[
      skinId ?? ""
    ];
    return {
      ...entry,
      nickname: nicknames.get(`${entry.ownerId}/${entry.uid}`),
      skinName: original ? null : (translatedSkin ?? entry.skinName),
      accent:
        entry.portraitColor ??
        translatedAgent(agentId, locale)?.color ??
        translatedAgent(agentId, "tw")?.color ??
        "#b0d2ae",
      isViewer: entry.ownerId === owner,
      updatedLabel: date(entry.updatedAt),
    };
  };
  const buffer = await renderDiscLeaderboard({
    locale,
    characterName: agentName(agent.id, locale, agent.name),
    characterId: agent.id,
    portraitSource:
      ranking.viewer?.portraitSource ||
      ranking.entries[0]?.portraitSource ||
      agent.image,
    accent:
      (ranking.viewer ?? ranking.entries[0])?.portraitColor ??
      translatedAgent(agentId, locale)?.color ??
      translatedAgent(agentId, "tw")?.color ??
      "#b0d2ae",
    scopeLabel: discText(locale, scope === "global" ? "global" : "server"),
    page: ranking.page,
    pageCount: ranking.pageCount,
    participantCount: ranking.participantCount,
    participating: ranking.enabled,
    entries: ranking.entries.map(row),
    viewer: ranking.viewer ? row(ranking.viewer) : undefined,
    updatedLabel: updated ? date(updated) : discText(locale, "noData"),
  });
  const notice = discText(locale, ranking.enabled ? "guide" : "hiddenGuide");
  return {
    content: messageSubtext(`${notice}${scope === "server" ? ` ${discText(locale, "serverGuide")}` : ""}${ranking.scoringHash !== scoring.hash ? ` ${discText(locale, "updating")}` : ""}`),
    embeds: [],
    attachments: [],
    files: [new AttachmentBuilder(buffer, { name: "disc-leaderboard.png" })],
    components: [...leaderboardControls(
      owner,
      agentId,
      scope,
      ranking.page,
      ranking.pageCount,
      Boolean(guildId),
      ranking.enabled,
      locale,
      selectorPage,
    ), ...leaderboardPlayerSelect(owner, agentId, scope, ranking.page, ranking.entries.map(row), locale)],
    allowedMentions: { parse: [] as never[] },
  };
}

export async function openDiscLeaderboard(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  agent: string,
  scope: "global" | "server" = "global",
) {
  if (!interaction.deferred && !interaction.replied)
    await interaction.deferReply(
      interaction.isButton() ? { flags: MessageFlags.Ephemeral } : {},
    );
  const locale =
    (await interaction.client.db.get(`${interaction.user.id}.locale`)) ||
    interaction.locale;
  if (
    !discLeaderboardAgents().some((item) => item.id === agent) ||
    (scope === "server" && !interaction.guildId)
  ) {
    await interaction.editReply({
      content: discContent(
        locale,
        scope === "server" && !interaction.guildId
          ? "guildOnly"
          : "selectAgent",
      ),
    });
    return;
  }
  await interaction.editReply(
    await discLeaderboardPayload(
      interaction.user.id,
      agent,
      scope,
      interaction.guildId,
      1,
      getDiscLeaderboardStore(),
      locale,
      undefined,
      interaction.client.db,
    ),
  );
}

export async function handleDiscLeaderboardInteraction(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  db: any,
) {
  const parts = interaction.customId.split(":");
  if (
    interaction.isButton() &&
    parts[1] === "open" &&
    /^\d{4}$/.test(parts[2] ?? "")
  )
    return openDiscLeaderboard(interaction, parts[2]);
  const locale =
    (await db.get(`${interaction.user.id}.locale`)) || interaction.locale;
  if (
    !["panel", "settings", "select", "player"].includes(parts[1]) ||
    !/^\d+$/.test(parts[2] ?? "")
  ) {
    await interaction.reply({
      content: discContent(locale, "expired"),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  // Shared leaderboard controls are public; the private settings panel still belongs to its owner.
  if (
    parts[1] === "settings" && parts[2] !== interaction.user.id
  ) {
    await interaction.reply({
      content: discContent(locale, "forbidden"),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const store = getDiscLeaderboardStore();
  if (parts[1] === "player" && interaction.isStringSelectMenu()) {
    const [, , , agent, scopeCode, pageRaw] = parts;
    const value = interaction.values[0] ?? "";
    const offered = interaction.message.components.some(row => {
      const json: any = row.toJSON();
      return json.components?.some((component: any) =>
        component.custom_id === interaction.customId &&
        component.options?.some((option: any) => option.value === value));
    });
    if (parts.length !== 6 || !/^\d{4}$/.test(agent) ||
      !discLeaderboardAgents().some(item => item.id === agent) ||
      !["g", "s"].includes(scopeCode) || !/^[1-9]\d{0,7}$/.test(pageRaw) ||
      (scopeCode === "s" && !interaction.guildId) ||
      interaction.values.length !== 1 || !/^\d{1,20}:\d{1,20}$/.test(value) || !offered) {
      await interaction.reply({ content: discContent(locale, "expired"), flags: MessageFlags.Ephemeral });
      return;
    }
    const [targetOwner, uid] = value.split(":");
    const { showDiscLeaderboardPlayer } = await import("./discLeaderboardPlayer.js");
    await showDiscLeaderboardPlayer(interaction, db, {
      agentId: agent, ownerId: targetOwner, uid,
      guildId: scopeCode === "s" ? interaction.guildId : null,
    }, store, locale);
    return;
  }
  if (parts[1] === "select" && interaction.isStringSelectMenu()) {
    const [, , owner, agent, scopeCode, rankPageRaw, selectPageRaw] = parts;
    const scope = scopeCode === "g" ? "global" : "server";
    const valid =
      /^\d{4}$/.test(agent) &&
      ["g", "s"].includes(scopeCode) &&
      /^\d{1,8}$/.test(rankPageRaw) &&
      /^\d{1,4}$/.test(selectPageRaw) &&
      (scope === "global" || Boolean(interaction.guildId));
    const pages = paginateProfileCharacters(
      discLeaderboardAgents().filter(
        (item) => getScoringStore().snapshot().agents[item.id],
      ),
    );
    const page = pages[Number(selectPageRaw)],
      value = interaction.values[0];
    if (
      !valid ||
      !page ||
      interaction.values.length !== 1 ||
      ![
        ...page.characters.map((c) => c.id),
        ...(page.hasNext ? [PROFILE_SELECT_NEXT_PAGE] : []),
        ...(page.hasPrevious ? [PROFILE_SELECT_PREVIOUS_PAGE] : []),
      ].includes(value)
    ) {
      await interaction.reply({
        content: discContent(locale, "expired"),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await interaction.deferUpdate();
    if (
      [PROFILE_SELECT_NEXT_PAGE, PROFILE_SELECT_PREVIOUS_PAGE].includes(value)
    ) {
      const selectedPage =
        Number(selectPageRaw) + (value === PROFILE_SELECT_NEXT_PAGE ? 1 : -1);
      const selector = leaderboardCharacterSelect(
        owner,
        agent,
        scope,
        Number(rankPageRaw),
        locale,
        selectedPage,
      );
      // Browsing agent options does not redraw the PNG or change its ranking page.
      const components = interaction.message.components.map((row) => {
        const json: any = row.toJSON();
        if (
          json.components?.some((c: any) =>
            c.custom_id?.startsWith("zdisc:select:"),
          )
        )
          return selector.row.toJSON();
        for (const c of json.components ?? [])
          if (c.custom_id?.startsWith("zdisc:panel:"))
            c.custom_id = `${c.custom_id.split(":").slice(0, 7).join(":")}:${selectedPage}`;
        return json;
      });
      await interaction.editReply({ components });
      return;
    }
    await interaction.editReply(
      await discLeaderboardPayload(
        interaction.user.id,
        value,
        scope,
        interaction.guildId,
        1,
        store,
        locale,
        Number(selectPageRaw),
        db,
      ),
    );
    return;
  }
  if (!interaction.isButton()) {
    await interaction.reply({
      content: discContent(locale, "expired"),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (parts[1] === "settings") {
    if (!["on", "off"].includes(parts[3])) return;
    await interaction.deferUpdate();
    store.setEnabled(interaction.user.id, parts[3] === "on");
    const { openGeneralSettings } = await import("../settings/general.js");
    await openGeneralSettings(interaction.client, interaction, db);
    return;
  }
  const [, , , agent, scopeCode, pageRaw, action] = parts;
  if (
    !/^\d{4}$/.test(agent) ||
    !discLeaderboardAgents().some((item) => item.id === agent) ||
    !["g", "s"].includes(scopeCode) ||
    !/^\d{1,8}$/.test(pageRaw) ||
    ![
      "global",
      "server",
      "refresh",
      "previous",
      "next",
      "leave",
      "join",
    ].includes(action)
  ) {
    await interaction.reply({
      content: discContent(locale, "expired"),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const scope =
    action === "global"
      ? "global"
      : action === "server"
        ? "server"
        : scopeCode === "g"
          ? "global"
          : "server";
  if (scope === "server" && !interaction.guildId) {
    await interaction.reply({
      content: discContent(locale, "guildOnly"),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  await interaction.deferUpdate();
  if (action === "leave" || action === "join")
    store.setEnabled(interaction.user.id, action === "join");
  const page = ["global", "server"].includes(action)
    ? 1
    : Number(pageRaw) +
      (action === "next" ? 1 : action === "previous" ? -1 : 0);
  const selectorPage = /^\d{1,4}$/.test(parts[7] ?? "")
    ? Number(parts[7])
    : undefined;
  await interaction.editReply(
    await discLeaderboardPayload(
      interaction.user.id,
      agent,
      scope,
      interaction.guildId,
      page,
      store,
      locale,
      selectorPage,
      db,
    ),
  );
}
