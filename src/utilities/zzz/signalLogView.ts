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
  activeCalendarBanner,
  archiveCalendarMetadata,
  calendarBannerMetadata,
  importManualGachaArchive,
  mergedActiveCalendarBanner,
  syncOfficialGachaArchive,
  type GachaCalendarBanner,
} from "./gachaSync.js";
import { requestZzzRecordApi } from "./officialRecordApi.js";
import { renderSignalLog } from "./signalLogRenderer.js";
import { paginateSignalBannerChoices } from "./signalLogPagination.js";
import { signalCategoryText, signalText } from "./recordText.js";
import { formatSignalAction, signalActionText } from "./signalActionText.js";

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
  details?: any;
  calendarBanners?: GachaCalendarBanner[];
  stale: boolean;
}

type SignalCommandInteraction = ChatInputCommandInteraction | ButtonInteraction;

const sessions = new Map<string, SignalLogSession>();

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
  const session: SignalLogSession = { ...persisted };
  sessions.set(token, session);
  return session;
}

function hasRecords(ownerId: string, uid: string, source: GachaArchiveSource, category: GachaChannelCategory): boolean {
  return getGachaArchiveStore().countRecords({ ownerId, uid, source, channelCategory: category }) > 0;
}

function firstCategory(ownerId: string, uid: string, source: GachaArchiveSource): GachaChannelCategory {
  return GACHA_CATEGORY_ORDER.find((category) => hasRecords(ownerId, uid, source, category)) ?? "character_up";
}

function bannersFor(session: SignalLogSession): GachaArchiveBanner[] {
  const archive = getGachaArchiveStore();
  const metadata = archive.listBanners({
    ownerId: session.ownerId, uid: session.uid, source: session.source, channelCategory: session.category,
  });
  const known = new Set(metadata.map((banner) => banner.bannerId));
  const records = archive.listTimeline({
    ownerId: session.ownerId, uid: session.uid, source: session.source, channelCategory: session.category,
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
    ownerId: session.ownerId, uid: session.uid, source: session.source,
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

function newestBanner(session: SignalLogSession): string | null {
  const latest = getGachaArchiveStore().listRecords({
    ownerId: session.ownerId, uid: session.uid, source: session.source,
    channelCategory: session.category, limit: 1,
  })[0];
  return latest?.bannerId ?? null;
}

function archivedActiveBanner(session: SignalLogSession, now = new Date()): GachaArchiveBanner | undefined {
  const timestamp = now.getTime();
  return bannersFor(session).find((banner) => {
    const start = banner.startAt ? Date.parse(banner.startAt) : Number.NaN;
    const end = banner.endAt ? Date.parse(banner.endAt) : Number.NaN;
    return Number.isFinite(start) && Number.isFinite(end) && start <= timestamp && timestamp < end;
  });
}

function preferredBanner(session: SignalLogSession): string | null {
  if (session.source === "official") {
    const live = activeCalendarBanner(session.calendarBanners ?? [], session.category);
    if (live?.recordMatchable) return live.bannerId;
    const archived = archivedActiveBanner(session);
    if (archived) return archived.bannerId;
  }
  return newestBanner(session);
}

function displayBanner(session: SignalLogSession, selected?: GachaArchiveBanner): GachaArchiveBanner | undefined {
  if (selected?.upItems.length || selected?.name) return selected;
  const active = mergedActiveCalendarBanner(session.calendarBanners ?? [], session.category);
  if (!active) return selected;
  return {
    ownerId: session.ownerId,
    uid: session.uid,
    source: session.source,
    bannerId: active.bannerId,
    channelCategory: active.channelCategory,
    name: active.name,
    version: active.version,
    startAt: active.startAt,
    endAt: active.endAt,
    upItems: active.upItems,
  };
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
  const account = getGachaArchiveStore().getAccount(session.ownerId, session.uid, session.source);
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
  const allChoices = [
    ...banners.map((banner) => ({ label: bannerLabel(banner, banner.bannerId, session.locale).slice(0, 100), value: banner.bannerId })),
    ...(hasUnclassified(session) ? [{ label: copy.unclassified, value: "__unknown__" }] : []),
  ];
  if (allChoices.length) {
    const pagination = paginateSignalBannerChoices(allChoices, session.bannerPage);
    session.bannerPage = pagination.page;
    rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder().setCustomId(`glog-banner:${token}`).setPlaceholder(copy.bannerPlaceholder)
        .addOptions(pagination.items.map((choice) => ({
          ...choice, default: choice.value === (session.bannerId ?? "__unknown__"),
        }))),
    ));
  }
  const bannerPages = paginateSignalBannerChoices(allChoices, session.bannerPage).pages;
  rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`glog-banner-prev:${token}`).setLabel(copy.newer)
      .setStyle(ButtonStyle.Secondary).setDisabled(session.bannerPage <= 0),
    new ButtonBuilder().setCustomId(`glog-banner-next:${token}`).setLabel(copy.older)
      .setStyle(ButtonStyle.Secondary).setDisabled(session.bannerPage >= bannerPages - 1),
    new ButtonBuilder().setCustomId(`glog-page-prev:${token}`).setLabel(copy.previous)
      .setStyle(ButtonStyle.Secondary).setDisabled(session.page <= 0),
    new ButtonBuilder().setCustomId(`glog-page-next:${token}`).setLabel(copy.next)
      .setStyle(ButtonStyle.Secondary).setDisabled(session.page >= pageCount - 1),
  ));
  if (session.source === "manual" && session.invokerId === session.ownerId) {
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`glog-import:${token}`).setLabel(copy.importUrl).setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`glog-how:${token}`).setLabel(copy.howUrl).setStyle(ButtonStyle.Secondary),
    ));
  }
  return rows.slice(0, 5);
}

export async function buildSignalLogMessage(session: SignalLogSession) {
  const archive = getGachaArchiveStore();
  const account = archive.getAccount(session.ownerId, session.uid, session.source);
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
  const banner = bannersFor(session).find((item) => item.bannerId === session.bannerId);
  const timeline = archive.listTimeline({
    ownerId: session.ownerId, uid: session.uid, source: session.source, channelCategory: session.category,
  });
  const live = session.source === "official" ? readLiveGachaState(session.details, session.category) : { pity: null, guaranteed: null };
  const summary = analyzeGachaRecords({
    records: timeline, category: session.category, bannerId: session.bannerId,
    livePity: live.pity, liveGuaranteed: live.guaranteed,
  });
  const latestBangboo = session.category === "bangboo" ? latestBangbooSRecord(timeline) : null;
  const total = summary.sRecords.length;
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  session.page = Math.min(Math.max(0, session.page), pageCount - 1);
  const renderedBanner = displayBanner(session, banner);
  const image = await renderSignalLog({
    locale: session.locale,
    source: session.source, uid: session.uid, playerName: session.playerName,
    archivedAt: account?.lastSyncedAt, stale: session.stale || account?.syncStatus === "failed",
    category: session.category, bannerLabel: bannerLabel(banner, session.bannerId, session.locale),
    banner: renderedBanner,
    headerItem: latestBangboo ? {
      id: latestBangboo.itemId,
      name: latestBangboo.name,
      itemType: "bangboo",
      rarity: "S",
    } : undefined,
    summary, view: "overview", page: session.page, details: session.details,
    pityEstimated: live.pity === null && summary.currentPity !== null,
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
      .find((account) => account.source === input.source && !account.orphanedAt);
    uid = first?.uid ?? "";
  }
  if (!uid) throw new Error(input.source === "manual" ? actionCopy.manualMissing : actionCopy.accountMissing);
  const archive = getGachaArchiveStore();
  let existingAccount = archive.getAccount(input.ownerId, uid, input.source);
  if (!existingAccount && input.source === "manual") {
    existingAccount = archive.upsertAccount({
      ownerId: input.ownerId,
      uid,
      source: "manual",
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
    bannerPage: 0, page: 0, stale: false,
  };
  if (input.source === "official" && input.zzz) {
    try {
      await syncOfficialGachaArchive({
        zzz: input.zzz, ownerId: input.ownerId,
        enableWeekly: input.interaction.user.id === input.ownerId,
      });
      if (input.interaction.user.id === input.ownerId) await client.db.set(`${input.ownerId}.gachaWeeklyArchive`, true);
    } catch {
      session.stale = true;
      if (!getGachaArchiveStore().countRecords({ ownerId: input.ownerId, uid, source: "official" })) {
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
  const active = input.source === "official"
    ? GACHA_CATEGORY_ORDER.map((category) => activeCalendarBanner(session.calendarBanners ?? [], category)).find(Boolean) ?? null
    : null;
  if (active) session.category = active.channelCategory;
  session.bannerId = preferredBanner(session);
  saveSession(session);
  return session;
}

async function resolveOfficialClient(interaction: ButtonInteraction | StringSelectMenuInteraction, session: SignalLogSession): Promise<any> {
  const locale = (await getUserLang(interaction.user.id)) || "tw";
  const tr = createTranslator(locale);
  return getUserZZZData(interaction as any, tr, session.ownerId, locale, session.accountIndex);
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
    session.bannerId = preferredBanner(session); session.bannerPage = 0; session.page = 0;
  } else if (interaction.customId.startsWith("glog-banner:")) {
    session.bannerId = selected === "__unknown__" ? null : String(selected ?? ""); session.page = 0;
  } else if (interaction.customId.startsWith("glog-banner-prev:")) {
    session.bannerPage = Math.max(0, session.bannerPage - 1);
  } else if (interaction.customId.startsWith("glog-banner-next:")) {
    session.bannerPage++; 
  } else if (interaction.customId.startsWith("glog-page-prev:")) {
    session.page = Math.max(0, session.page - 1);
  } else if (interaction.customId.startsWith("glog-page-next:")) {
    session.page++;
  } else if (interaction.customId.startsWith("glog-how:")) {
    const actionCopy = signalActionText(session.locale);
    await interaction.followUp({
      content: `${actionCopy.howIntro}\n\`\`\`powershell\nStart-Process powershell -Verb runAs -ArgumentList '-NoExit -Command \"Invoke-Expression (New-Object Net.WebClient).DownloadString(\\\"https://raw.githubusercontent.com/yeci226/ZZZ-ToS-PP/main/getSignal.ps1\\\")\"'\n\`\`\``,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (!(await validateSession(interaction, session))) return;
  const payload = await buildSignalLogMessage(session);
  await interaction.editReply({ ...payload, attachments: [] });
}

export async function handleSignalLogImport(interaction: ModalSubmitInteraction): Promise<void> {
  const session = sessionFrom(interaction.customId);
  if (!session) {
    const locale = (await getUserLang(interaction.user.id)) || "tw";
    await interaction.reply({ content: signalActionText(locale).archiveMissing, flags: MessageFlags.Ephemeral });
    return;
  }
  if (!(await validateSession(interaction, session))) return;
  const actionCopy = signalActionText(session.locale);
  if (session.source !== "manual" || interaction.user.id !== session.ownerId) {
    const payload = { content: actionCopy.ownerImportOnly, flags: MessageFlags.Ephemeral } as const;
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
    else await interaction.reply(payload);
    return;
  }
  const url = interaction.fields.getTextInputValue("signalUrl");
  await interaction.deferUpdate();
  try {
    const result = await importManualGachaArchive({
      ownerId: session.ownerId, uid: session.uid, url,
      region: session.region, everLinked: session.linked,
    });
    session.uid = result.uid; session.category = firstCategory(session.ownerId, session.uid, "manual");
    if (session.calendarBanners?.length) {
      archiveCalendarMetadata(
        getGachaArchiveStore(),
        session.ownerId,
        session.uid,
        "manual",
        session.region,
        session.calendarBanners,
      );
    }
    session.bannerId = preferredBanner(session); session.page = 0; session.bannerPage = 0; session.stale = false;
    const payload = await buildSignalLogMessage(session);
    await interaction.editReply({ ...payload, attachments: [] });
    await interaction.followUp({
      content: formatSignalAction(actionCopy.importComplete, { inserted: result.inserted, fetched: result.fetched }),
      flags: MessageFlags.Ephemeral,
    });
  } catch (error: any) {
    await interaction.followUp({
      embeds: [new EmbedBuilder().setColor("#E76161").setTitle(actionCopy.importFailedTitle)
        .setDescription(`\`${String(error?.message || error).replace(/authkey=[^&\s]+/gi, "authkey=[redacted]").slice(0, 800)}\``)],
      flags: MessageFlags.Ephemeral,
    });
  }
}

export function getSignalLogSession(customId: string): SignalLogSession | null {
  return sessionFrom(customId);
}
