import { randomBytes } from "node:crypto";
import {
  AttachmentBuilder,
  MessageFlags,
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
  type GachaArchiveSource,
  type GachaChannelCategory,
} from "./gachaArchive.js";
import { analyzeGachaRecords, GACHA_CATEGORY_ORDER, readLiveGachaState } from "./gachaAnalysis.js";
import { canViewPrivateGacha } from "./gachaPrivacy.js";
import {
  archiveCalendarMetadata,
  calendarBannerMetadata,
  syncOfficialGachaArchive,
} from "./gachaSync.js";
import { requestZzzRecordApi } from "./officialRecordApi.js";
import { renderSignalLogImage, signalLogImagePageCount, type SignalLogImageInput } from "./signalLogRenderer.js";
import { signalText } from "./recordText.js";
import { normalizeSignalLogView } from "./signalLogPagination.js";
import { signalActionText } from "./signalActionText.js";
import {
  ALL_SIGNAL_BANNERS,
  applySignalLogAction,
  bannerLabel,
  bannersFor,
  buildSignalLogModel,
  refreshOfficialStats,
  signalLogControls,
  statCategoryOf,
  type SignalLogSession,
} from "./signalLogSession.js";

export {
  ALL_SIGNAL_BANNERS,
  HOME_CATEGORY_VALUE,
  applySignalLogAction,
  buildSignalLogModel,
  refreshOfficialStats,
  signalLogControls,
  type SignalLogSession,
} from "./signalLogSession.js";

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
  const session: SignalLogSession = { ...persisted, view: normalizeSignalLogView(persisted.view) };
  sessions.set(token, session);
  return session;
}

function hasRecords(ownerId: string, uid: string, source: GachaArchiveSource, category: GachaChannelCategory): boolean {
  return getGachaArchiveStore().countRecords({ ownerId, uid, channelCategory: category }) > 0;
}

function firstCategory(ownerId: string, uid: string, source: GachaArchiveSource): GachaChannelCategory {
  return GACHA_CATEGORY_ORDER.find((category) => hasRecords(ownerId, uid, source, category)) ?? "character_up";
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
  const copy = signalText(session.locale);
  const details = session.source === "official" ? session.details : undefined;
  const { model, officialFetchedAt } = buildSignalLogModel({
    archive, ownerId: session.ownerId, uid: session.uid, details, unclassifiedLabel: copy.unclassified,
  });
  const category = statCategoryOf(session);
  let cycles: SignalLogImageInput["cycles"];
  if (session.view === "cycles") {
    const allBanners = session.bannerId === ALL_SIGNAL_BANNERS;
    const banner = allBanners ? undefined : bannersFor(session).find((item) => item.bannerId === session.bannerId);
    const timeline = archive.listTimeline({
      ownerId: session.ownerId, uid: session.uid, channelCategory: session.category,
    });
    const live = session.source === "official" ? readLiveGachaState(session.details, session.category) : { pity: null, guaranteed: null };
    const summary = analyzeGachaRecords({
      records: timeline,
      category: session.category,
      bannerId: allBanners ? undefined : session.bannerId,
      livePity: live.pity, liveGuaranteed: live.guaranteed,
    });
    cycles = {
      summary,
      pityEstimated: live.pity === null && summary.currentPity !== null,
      // Only the channel's newest pulls are still waiting for an S.
      openCycleIsLive: !summary.records.length || summary.records[0]!.recordId === timeline.at(-1)?.recordId,
      bannerLabel: allBanners ? null : bannerLabel(banner, session.bannerId, session.locale),
      banner,
    };
  }
  const pageCount = signalLogImagePageCount({ view: session.view, category, model, cycles });
  session.page = Math.min(Math.max(0, session.page), pageCount - 1);
  const image = await renderSignalLogImage({
    locale: session.locale, uid: session.uid, playerName: session.playerName,
    archivedAt: officialFetchedAt ?? account?.lastSyncedAt,
    stale: session.stale || account?.syncStatus === "failed",
    view: session.view, page: session.page, category, model, cycles,
  });
  saveSession(session);
  return {
    embeds: [],
    files: [new AttachmentBuilder(image, { name: `zzz-signal-${session.uid}-${session.source}.png` })],
    components: signalLogControls(session, model, pageCount),
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
    bannerPage: 0, page: 0, view: "home", stale: false,
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
    if (await refreshOfficialStats({ zzz: input.zzz, ownerId: input.ownerId, uid, archive }) === "failed") {
      session.stale = true;
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
  if (interaction.customId.startsWith("glog-how:")) {
    await interaction.followUp({
      content: "這是舊版紀錄訊息，請改用 `/調頻 匯入`。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  applySignalLogAction(session, interaction.customId, selected);
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
