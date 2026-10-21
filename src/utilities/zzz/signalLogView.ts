import { randomBytes } from "node:crypto";
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";
import { client } from "../../index.js";
import { getUserLang, getUserZZZData } from "../utilities.js";
import { createTranslator } from "../core/i18n.js";
import {
  getGachaArchiveStore,
  type GachaArchiveBanner,
  type GachaArchiveSource,
  type GachaChannelCategory,
} from "./gachaArchive.js";
import {
  analyzeGachaRecords,
  GACHA_CATEGORY_ORDER,
  latestBangbooSRecord,
  readLiveGachaState,
} from "./gachaAnalysis.js";
import { canViewPrivateGacha } from "./gachaPrivacy.js";
import {
  archiveCalendarMetadata,
  calendarBannerMetadata,
  syncOfficialGachaArchive,
  type GachaCalendarBanner,
} from "./gachaSync.js";
import { requestZzzRecordApi } from "./officialRecordApi.js";
import { renderSignalLog } from "./signalLogRenderer.js";
import {
  paginateSignalBannerChoicesWithPinned,
  signalLogPageCount,
  switchSignalLogView,
  type SignalLogView,
} from "./signalLogPagination.js";
import { signalCategoryText, signalText } from "./recordText.js";
import { signalActionText } from "./signalActionText.js";

export interface SignalLogSession {
  token: string;
  invokerId: string;
  ownerId: string;
  accountIndex: number;
  uid: string;
  playerName: string;
  locale: string;
  linked: boolean;
  region: string;
  source: GachaArchiveSource;
  category: GachaChannelCategory;
  bannerId: string | null;
  bannerPage: number;
  page: number;
  view: SignalLogView;
  details?: any;
  calendarBanners?: GachaCalendarBanner[];
  stale: boolean;
}

type SignalCommandInteraction = ChatInputCommandInteraction | ButtonInteraction;

const sessions = new Map<string, SignalLogSession>();
export const ALL_SIGNAL_BANNERS = "__all__";

function saveSession(session: SignalLogSession): void {
  sessions.set(session.token, session);
  getGachaArchiveStore().saveSignalLogSession(session);
  if (sessions.size > 1000) {
    const oldest = sessions.keys().next().value;
    if (oldest) sessions.delete(oldest);
  }
}

function sessionFrom(customId: string): SignalLogSession | null {
  const token = customId.split(":").pop() ?? "";
  const persisted = getGachaArchiveStore().getSignalLogSession(token);
  if (!persisted) {
    sessions.delete(token);
    return null;
  }
  const cached = sessions.get(token);
  if (cached) return cached;
  const session: SignalLogSession = { ...persisted, view: persisted.view ?? "overview" };
  sessions.set(token, session);
  return session;
}

function hasRecords(ownerId: string, uid: string, source: GachaArchiveSource, category: GachaChannelCategory): boolean {
  return getGachaArchiveStore().countRecords({ ownerId, uid, channelCategory: category }) > 0;
}

function firstCategory(ownerId: string, uid: string, source: GachaArchiveSource): GachaChannelCategory {
  return GACHA_CATEGORY_ORDER.find((category) => hasRecords(ownerId, uid, source, category)) ?? "character_up";
}

function bannersFor(session: SignalLogSession): GachaArchiveBanner[] {
  const archive = getGachaArchiveStore();
  const metadata = archive.listBanners({
    ownerId: session.ownerId, uid: session.uid, channelCategory: session.category,
  });
  const known = new Set(metadata.map((banner) => banner.bannerId));
  const records = archive.listTimeline({
    ownerId: session.ownerId, uid: session.uid, channelCategory: session.category,
  });
  for (const record of [...records].reverse()) {
    if (!record.bannerId || known.has(record.bannerId)) continue;
    known.add(record.bannerId);
    metadata.push({
      ownerId: session.ownerId, uid: session.uid, source: session.source,
      bannerId: record.bannerId, channelCategory: session.category,
      name: "", version: "", startAt: record.pulledAt, endAt: null, upItems: [],
    });
  }
  return metadata.sort((left, right) => String(right.startAt ?? "").localeCompare(String(left.startAt ?? "")));
}

function hasUnclassified(session: SignalLogSession): boolean {
  return getGachaArchiveStore().countRecords({
    ownerId: session.ownerId, uid: session.uid,
    channelCategory: session.category, bannerId: null,
  }) > 0;
}

function bannerLabel(banner: GachaArchiveBanner | undefined, bannerId: string | null, locale?: string): string {
  const copy = signalText(locale);
  if (bannerId === null) return copy.unclassified;
  if (!banner) return `${copy.banner} ${bannerId.slice(-8)}`;
  const name = banner.name || banner.upItems.map((item) => item.name).filter(Boolean).join("／");
  const prefix = banner.version ? `${banner.version} ` : "";
  return `${prefix}${name || `${copy.banner} ${banner.bannerId.slice(-8)}`}`;
}

function displayBanner(session: SignalLogSession, selected?: GachaArchiveBanner): GachaArchiveBanner | undefined {
  if (session.bannerId === ALL_SIGNAL_BANNERS) return undefined;
  return selected;
}

async function validateSession(
  interaction: ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction,
  session: SignalLogSession,
): Promise<boolean> {
  const actionCopy = signalActionText(session.locale);
  const deny = async (content: string) => {
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
    } else {
      await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    }
  };
  if (interaction.user.id !== session.invokerId) {
    await deny(actionCopy.onlyInvoker);
    return false;
  }
  if (!(await canViewPrivateGacha(client.db, interaction.user.id, session.ownerId))) {
    await deny(actionCopy.privateDisabled);
    return false;
  }
  const account = getGachaArchiveStore().getAccount(session.ownerId, session.uid);
  if (account?.orphanedAt && interaction.user.id !== session.ownerId) {
    await deny(actionCopy.orphaned);
    return false;
  }
  return true;
}

function controls(session: SignalLogSession, pageCount: number): ActionRowBuilder<any>[] {
  const token = session.token;
  const copy = signalText(session.locale);
  const rows: ActionRowBuilder<any>[] = [];
  rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder().setCustomId(`glog-category:${token}`).setPlaceholder(copy.categoryPlaceholder)
      .addOptions(GACHA_CATEGORY_ORDER.map((category) => ({
        label: signalCategoryText(session.locale, category), value: category, default: session.category === category,
      }))),
  ));
  const banners = bannersFor(session);
  const bannerChoices = [
    ...banners.map((banner) => ({ label: bannerLabel(banner, banner.bannerId, session.locale).slice(0, 100), value: banner.bannerId })),
    ...(hasUnclassified(session) ? [{ label: copy.unclassified, value: "__unknown__" }] : []),
  ];
  if (bannerChoices.length) {
    const pagination = paginateSignalBannerChoicesWithPinned(
      bannerChoices,
      session.bannerPage,
      { label: copy.allRecords, value: ALL_SIGNAL_BANNERS },
    );
    session.bannerPage = pagination.page;
    rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder().setCustomId(`glog-banner:${token}`).setPlaceholder(copy.bannerPlaceholder)
        .addOptions(pagination.items.map((choice) => ({
          ...choice, default: choice.value === (session.bannerId ?? "__unknown__"),
        }))),
    ));
  }
  const bannerPages = paginateSignalBannerChoicesWithPinned(
    bannerChoices,
    session.bannerPage,
    { label: copy.allRecords, value: ALL_SIGNAL_BANNERS },
  ).pages;
  rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`glog-banner-prev:${token}`).setLabel(copy.newer)
      .setStyle(ButtonStyle.Secondary).setDisabled(session.bannerPage <= 0),
    new ButtonBuilder().setCustomId(`glog-banner-next:${token}`).setLabel(copy.older)
      .setStyle(ButtonStyle.Secondary).setDisabled(session.bannerPage >= bannerPages - 1),
    new ButtonBuilder().setCustomId(`glog-page-prev:${token}`).setLabel(copy.previous)
      .setStyle(ButtonStyle.Secondary).setDisabled(session.page <= 0),
    new ButtonBuilder().setCustomId(`glog-page-next:${token}`).setLabel(copy.next)
      .setStyle(ButtonStyle.Secondary).setDisabled(session.page >= pageCount - 1),
    new ButtonBuilder().setCustomId(`glog-view:${token}`)
      .setLabel(session.view === "overview" ? copy.viewRecords : copy.overview)
      .setStyle(ButtonStyle.Primary),
  ));
  return rows.slice(0, 5);
}

export async function buildSignalLogMessage(session: SignalLogSession) {
  const archive = getGachaArchiveStore();
  const account = archive.getAccount(session.ownerId, session.uid);
  const region = session.region || account?.region || "";
  if (session.calendarBanners?.length) {
    archiveCalendarMetadata(
      archive,
      session.ownerId,
      session.uid,
      session.source,
      region,
      session.calendarBanners,
    );
  }
  archive.classifyUnresolvedUpRecords({
    ownerId: session.ownerId, uid: session.uid, source: session.source, region,
  });
  const banner = session.bannerId === ALL_SIGNAL_BANNERS
    ? undefined
    : bannersFor(session).find((item) => item.bannerId === session.bannerId);
  const timeline = archive.listTimeline({
    ownerId: session.ownerId, uid: session.uid, channelCategory: session.category,
  });
  const live = session.source === "official" ? readLiveGachaState(session.details, session.category) : { pity: null, guaranteed: null };
  const summary = analyzeGachaRecords({
    records: timeline,
    category: session.category,
    bannerId: session.bannerId === ALL_SIGNAL_BANNERS ? undefined : session.bannerId,
    livePity: live.pity, liveGuaranteed: live.guaranteed,
  });
  const latestBangboo = session.category === "bangboo" ? latestBangbooSRecord(timeline) : null;
  const pityEstimated = live.pity === null && summary.currentPity !== null;
  const pageCount = signalLogPageCount(summary, session.view, pityEstimated);
  session.page = Math.min(Math.max(0, session.page), pageCount - 1);
  const renderedBanner = displayBanner(session, banner);
  const image = await renderSignalLog({
    locale: session.locale,
    source: session.source, uid: session.uid, playerName: session.playerName,
    archivedAt: account?.lastSyncedAt, stale: session.stale || account?.syncStatus === "failed",
    category: session.category,
    bannerLabel: session.bannerId === ALL_SIGNAL_BANNERS
      ? signalText(session.locale).allRecords
      : bannerLabel(banner, session.bannerId, session.locale),
    banner: renderedBanner,
    headerItem: latestBangboo ? {
      id: latestBangboo.itemId,
      name: latestBangboo.name,
      itemType: "bangboo",
      rarity: "S",
    } : undefined,
    summary, view: session.view, page: session.page, details: session.details,
    pityEstimated,
  });
  saveSession(session);
  return {
    embeds: [],
    files: [new AttachmentBuilder(image, { name: `zzz-signal-${session.uid}-${session.source}.png` })],
    components: controls(session, pageCount),
  };
}

export async function createSignalLogSession(input: {
  interaction: SignalCommandInteraction;
  ownerId: string;
  accountIndex: number;
  source: GachaArchiveSource;
  zzz?: any;
  uid?: string;
  playerName?: string | null;
  linked?: boolean;
  region?: string | null;
}): Promise<SignalLogSession> {
  const sessionLocale = (await getUserLang(input.interaction.user.id)) || "tw";
  const actionCopy = signalActionText(sessionLocale);
  let uid = String(input.uid ?? input.zzz?.uid ?? "");
  if (!uid) {
    const first = getGachaArchiveStore().listAccounts(input.ownerId)
      .find((account) => !account.orphanedAt);
    uid = first?.uid ?? "";
  }
  if (!uid) throw new Error(input.source === "manual" ? actionCopy.manualMissing : actionCopy.accountMissing);
  const archive = getGachaArchiveStore();
  let existingAccount = archive.getAccount(input.ownerId, uid);
  if (!existingAccount) {
    existingAccount = archive.upsertAccount({
      ownerId: input.ownerId,
      uid,
      source: input.source,
      region: input.region ?? input.zzz?.region,
      everLinked: input.linked ?? !!input.zzz,
    });
  }
  if (existingAccount?.orphanedAt && input.interaction.user.id !== input.ownerId) {
    throw new Error(actionCopy.orphaned);
  }
  const session: SignalLogSession = {
    token: randomBytes(6).toString("base64url"), invokerId: input.interaction.user.id,
    ownerId: input.ownerId, accountIndex: input.accountIndex, uid,
    playerName: String(input.playerName ?? input.zzz?.nickname ?? ""),
    locale: sessionLocale,
    source: input.source,
    linked: input.linked ?? !!input.zzz,
    region: String(input.region ?? input.zzz?.region ?? ""),
    category: firstCategory(input.ownerId, uid, input.source), bannerId: null,
    bannerPage: 0, page: 0, view: "overview", stale: false,
  };
  if (input.source === "official" && input.zzz) {
    try {
      const weeklySetting = input.interaction.user.id === input.ownerId
        ? await client.db.get<boolean>(`${input.ownerId}.gachaWeeklyArchive`)
        : undefined;
      await syncOfficialGachaArchive({
        zzz: input.zzz, ownerId: input.ownerId,
        enableWeekly: input.interaction.user.id === input.ownerId ? weeklySetting !== false : undefined,
      });
      if (input.interaction.user.id === input.ownerId && weeklySetting == null) {
        await client.db.set(`${input.ownerId}.gachaWeeklyArchive`, true);
      }
    } catch {
      session.stale = true;
      if (!getGachaArchiveStore().countRecords({ ownerId: input.ownerId, uid })) {
        throw new Error(actionCopy.syncUnavailable);
      }
    }
    try { session.details = await requestZzzRecordApi(input.zzz, "cur_gacha_detail"); } catch { session.stale = true; }
  }
  if (input.zzz) {
    try {
      session.calendarBanners = calendarBannerMetadata(await requestZzzRecordApi(input.zzz, "gacha_calendar"));
    } catch {
      session.calendarBanners = [];
    }
  }
  if (session.calendarBanners?.length) {
    archiveCalendarMetadata(
      archive,
      session.ownerId,
      session.uid,
      session.source,
      session.region,
      session.calendarBanners,
    );
  }
  session.category = firstCategory(input.ownerId, uid, input.source);
  session.bannerId = ALL_SIGNAL_BANNERS;
  saveSession(session);
  return session;
}

async function resolveOfficialClient(interaction: ButtonInteraction | StringSelectMenuInteraction, session: SignalLogSession): Promise<any> {
  const locale = (await getUserLang(interaction.user.id)) || "tw";
  const tr = createTranslator(locale);
  return getUserZZZData(interaction as any, tr, session.ownerId, locale, session.accountIndex, { authMode: "optional" });
}

async function hydrateLiveSession(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  session: SignalLogSession,
): Promise<void> {
  const needsDetails = session.source === "official"
    && (session.details === undefined || (session.stale && session.details === null));
  const needsCalendar = session.calendarBanners === undefined
    || (session.stale && session.calendarBanners.length === 0);
  if (!session.linked || (!needsDetails && !needsCalendar)) return;
  try {
    const zzz = await resolveOfficialClient(interaction, session);
    if (!zzz || String(zzz.uid) !== session.uid) throw new Error("Linked account does not match archive");
    if (needsDetails) session.details = await requestZzzRecordApi(zzz, "cur_gacha_detail");
    if (needsCalendar) {
      session.calendarBanners = calendarBannerMetadata(await requestZzzRecordApi(zzz, "gacha_calendar"));
    }
    session.stale = false;
  } catch {
    if (needsDetails) session.details = null;
    if (needsCalendar) session.calendarBanners = [];
    if (session.source === "official") session.stale = true;
  }
}

export async function handleSignalLogComponent(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
): Promise<void> {
  const session = sessionFrom(interaction.customId);
  if (!session) {
    const locale = (await getUserLang(interaction.user.id)) || "tw";
    await interaction.followUp({ content: signalActionText(locale).archiveMissing, flags: MessageFlags.Ephemeral });
    return;
  }
  if (!(await validateSession(interaction, session))) return;
  await hydrateLiveSession(interaction, session);
  const selected = interaction.isStringSelectMenu() ? interaction.values[0] : undefined;
  if (interaction.customId.startsWith("glog-category:") && GACHA_CATEGORY_ORDER.includes(selected as GachaChannelCategory)) {
    session.category = selected as GachaChannelCategory;
    session.bannerId = ALL_SIGNAL_BANNERS; session.bannerPage = 0; session.page = 0;
  } else if (interaction.customId.startsWith("glog-banner:")) {
    session.bannerId = selected === "__unknown__" ? null : String(selected ?? ALL_SIGNAL_BANNERS); session.page = 0;
  } else if (interaction.customId.startsWith("glog-banner-prev:")) {
    session.bannerPage = Math.max(0, session.bannerPage - 1);
  } else if (interaction.customId.startsWith("glog-banner-next:")) {
    session.bannerPage++; 
  } else if (interaction.customId.startsWith("glog-page-prev:")) {
    session.page = Math.max(0, session.page - 1);
  } else if (interaction.customId.startsWith("glog-page-next:")) {
    session.page++;
  } else if (interaction.customId.startsWith("glog-view:")) {
    Object.assign(session, switchSignalLogView(session.view));
  } else if (interaction.customId.startsWith("glog-how:")) {
    await interaction.followUp({
      content: "這是舊版紀錄訊息，請改用 `/調頻 匯入`。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (!(await validateSession(interaction, session))) return;
  const payload = await buildSignalLogMessage(session);
  await interaction.editReply({ ...payload, attachments: [] });
}

export async function handleSignalLogImport(interaction: ModalSubmitInteraction): Promise<void> {
  await interaction.reply({
    content: "這是舊版匯入視窗，請改用 `/調頻 匯入`。",
    flags: MessageFlags.Ephemeral,
  });
}

export function getSignalLogSession(customId: string): SignalLogSession | null {
  return sessionFrom(customId);
}
