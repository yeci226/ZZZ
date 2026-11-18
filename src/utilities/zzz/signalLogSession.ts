import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} from "discord.js";
import {
  getGachaArchiveStore,
  type GachaArchiveBanner,
  type GachaArchiveSource,
  type GachaArchiveStore,
  type GachaChannelCategory,
} from "./gachaArchive.js";
import {
  analyzeGachaRecords,
  GACHA_CATEGORY_ORDER,
  readLiveGachaState,
  type GachaSummary,
} from "./gachaAnalysis.js";
import type { GachaCalendarBanner } from "./gachaSync.js";
import { createGachaStatClient, type GachaStatCategory } from "./gachaStatApi.js";
import { syncOfficialGachaStats } from "./gachaStatSync.js";
import {
  channelFromArchive,
  isLimitedCategory,
  modelFromOfficialStats,
  ticketsFromDetails,
  type SignalLogModel,
} from "./signalLogModel.js";
import {
  legacyToggleView,
  paginateSignalBannerChoicesWithPinned,
  type SignalLogView,
} from "./signalLogPagination.js";
import { signalCategoryText, signalText } from "./recordText.js";

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

export const ALL_SIGNAL_BANNERS = "__all__";
export const HOME_CATEGORY_VALUE = "__home__";
const UNKNOWN_BANNER_VALUE = "__unknown__";

export function bannersFor(session: SignalLogSession): GachaArchiveBanner[] {
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

export function bannerLabel(banner: GachaArchiveBanner | undefined, bannerId: string | null, locale?: string): string {
  const copy = signalText(locale);
  if (bannerId === null) return copy.unclassified;
  if (!banner) return `${copy.banner} ${bannerId.slice(-8)}`;
  const name = banner.name || banner.upItems.map((item) => item.name).filter(Boolean).join("／");
  const prefix = banner.version ? `${banner.version} ` : "";
  return `${prefix}${name || `${copy.banner} ${banner.bannerId.slice(-8)}`}`;
}

/** The session's channel as a statistics channel; the model has no "unknown" channel. */
export function statCategoryOf(session: Pick<SignalLogSession, "category">): GachaStatCategory {
  return session.category === "unknown" ? "character_up" : session.category;
}

export function buildSignalLogModel(input: {
  archive: GachaArchiveStore;
  ownerId: string;
  uid: string;
  details?: any;
  unclassifiedLabel: string;
}): {
  model: SignalLogModel;
  summaries: Record<GachaStatCategory, GachaSummary>;
  officialFetchedAt: string | null;
} {
  const { archive, ownerId, uid } = input;
  const summaries = {} as Record<GachaStatCategory, GachaSummary>;
  const archived = {} as SignalLogModel["channels"];
  for (const category of GACHA_CATEGORY_ORDER as GachaStatCategory[]) {
    const timeline = archive.listTimeline({ ownerId, uid, channelCategory: category });
    const live = readLiveGachaState(input.details, category);
    const summary = analyzeGachaRecords({
      records: timeline, category, livePity: live.pity, liveGuaranteed: live.guaranteed,
    });
    summaries[category] = summary;
    archived[category] = channelFromArchive({
      category, summary,
      pityEstimated: live.pity === null && summary.currentPity !== null,
      banners: archive.listBanners({ ownerId, uid, channelCategory: category }),
      unclassifiedLabel: input.unclassifiedLabel,
    });
  }

  const stored = archive.getOfficialStatIndex(ownerId, uid);
  if (!stored) {
    return { model: { channels: archived, tickets: ticketsFromDetails(input.details) }, summaries, officialFetchedAt: null };
  }
  const { model, incomplete } = modelFromOfficialStats(stored.index, archive.listOfficialStatPools(ownerId, uid));
  for (const category of incomplete) {
    console.warn(
      `[signal-log] official statistics incomplete for ${category}: official S ${model.channels[category].sCount}, archive S ${archived[category].sCount}; using archive`,
    );
    model.channels[category] = archived[category];
  }
  return { model, summaries, officialFetchedAt: stored.fetchedAt };
}

export async function refreshOfficialStats(input: {
  zzz: unknown;
  ownerId: string;
  uid: string;
  archive: GachaArchiveStore;
  createClient?: typeof createGachaStatClient;
  sync?: typeof syncOfficialGachaStats;
}): Promise<"synced" | "skipped" | "failed"> {
  const createClient = input.createClient ?? createGachaStatClient;
  const sync = input.sync ?? syncOfficialGachaStats;
  try {
    const client = createClient((input.zzz ?? {}) as any);
    if (!client) return "skipped";
    await sync({ client, ownerId: input.ownerId, uid: input.uid, archive: input.archive });
    return "synced";
  } catch {
    return "failed";
  }
}

function channelDescription(model: SignalLogModel, category: GachaStatCategory, locale: string): string {
  const copy = signalText(locale);
  const channel = model.channels[category];
  if (!channel.hasRecords) return copy.empty;
  let text = `${channel.currentPity ?? "—"}/${channel.hardPity}`;
  if (isLimitedCategory(category) && channel.guaranteed !== null) {
    text += ` · ${channel.guaranteed ? copy.bigGuarantee : copy.smallGuarantee}`;
  }
  return text.slice(0, 100);
}

export function signalLogControls(
  session: SignalLogSession,
  model: SignalLogModel,
  pageCount: number,
): ActionRowBuilder<any>[] {
  const token = session.token;
  const copy = signalText(session.locale);
  const rows: ActionRowBuilder<any>[] = [];
  const onHome = session.view === "home";
  rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder().setCustomId(`glog-category:${token}`).setPlaceholder(copy.categoryPlaceholder)
      .addOptions([
        { label: copy.homeOption.slice(0, 100), value: HOME_CATEGORY_VALUE, default: onHome },
        ...(GACHA_CATEGORY_ORDER as GachaStatCategory[]).map((category) => ({
          label: signalCategoryText(session.locale, category).slice(0, 100),
          value: category,
          description: channelDescription(model, category, session.locale),
          default: !onHome && session.category === category,
        })),
      ]),
  ));
  if (onHome) return rows;

  let bannerRow: ActionRowBuilder<any> | null = null;
  if (session.view === "cycles") {
    const banners = bannersFor(session);
    const choices = [
      ...banners.map((banner) => ({ label: bannerLabel(banner, banner.bannerId, session.locale).slice(0, 100), value: banner.bannerId })),
      ...(hasUnclassified(session) ? [{ label: copy.unclassified, value: UNKNOWN_BANNER_VALUE }] : []),
    ];
    if (choices.length) {
      const pagination = paginateSignalBannerChoicesWithPinned(
        choices, session.bannerPage, { label: copy.allRecords, value: ALL_SIGNAL_BANNERS },
      );
      session.bannerPage = pagination.page;
      rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder().setCustomId(`glog-banner:${token}`).setPlaceholder(copy.bannerPlaceholder)
          .addOptions(pagination.items.map((choice) => ({
            ...choice, default: choice.value === (session.bannerId ?? UNKNOWN_BANNER_VALUE),
          }))),
      ));
      if (pagination.pages > 1) {
        bannerRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(`glog-banner-prev:${token}`).setLabel(copy.newer)
            .setStyle(ButtonStyle.Secondary).setDisabled(session.bannerPage <= 0),
          new ButtonBuilder().setCustomId(`glog-banner-next:${token}`).setLabel(copy.older)
            .setStyle(ButtonStyle.Secondary).setDisabled(session.bannerPage >= pagination.pages - 1),
        );
      }
    }
  }

  const viewButton = (view: Exclude<SignalLogView, "home">, label: string) =>
    new ButtonBuilder().setCustomId(`glog-view-${view}:${token}`).setLabel(label)
      .setStyle(session.view === view ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(session.view === view);
  rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`glog-page-prev:${token}`).setLabel(copy.previous)
      .setStyle(ButtonStyle.Secondary).setDisabled(session.page <= 0),
    new ButtonBuilder().setCustomId(`glog-page-next:${token}`).setLabel(copy.next)
      .setStyle(ButtonStyle.Secondary).setDisabled(session.page >= pageCount - 1),
    viewButton("wall", copy.viewWall),
    viewButton("versions", copy.viewVersions),
    viewButton("cycles", copy.pityCycles),
  ));
  if (bannerRow) rows.push(bannerRow);
  return rows;
}

function setView(session: SignalLogSession, view: SignalLogView): void {
  session.view = view;
  session.page = 0;
  if (view !== "cycles") {
    session.bannerId = ALL_SIGNAL_BANNERS;
    session.bannerPage = 0;
  }
}

/** Applies a component interaction to the session state. */
export function applySignalLogAction(session: SignalLogSession, customId: string, selected?: string): void {
  const is = (prefix: string) => customId.startsWith(prefix);
  if (is("glog-category:")) {
    if (selected === HOME_CATEGORY_VALUE) {
      setView(session, "home");
    } else if (GACHA_CATEGORY_ORDER.includes(selected as GachaChannelCategory)) {
      session.category = selected as GachaChannelCategory;
      session.bannerId = ALL_SIGNAL_BANNERS;
      session.bannerPage = 0;
      session.page = 0;
      if (session.view === "home") session.view = "wall";
    }
  } else if (is("glog-banner:")) {
    session.bannerId = selected === UNKNOWN_BANNER_VALUE ? null : String(selected ?? ALL_SIGNAL_BANNERS);
    session.page = 0;
  } else if (is("glog-banner-prev:")) {
    session.bannerPage = Math.max(0, session.bannerPage - 1);
  } else if (is("glog-banner-next:")) {
    session.bannerPage++;
  } else if (is("glog-page-prev:")) {
    session.page = Math.max(0, session.page - 1);
  } else if (is("glog-page-next:")) {
    session.page++;
  } else if (is("glog-view-wall:")) {
    setView(session, "wall");
  } else if (is("glog-view-versions:")) {
    setView(session, "versions");
  } else if (is("glog-view-cycles:")) {
    setView(session, "cycles");
  } else if (is("glog-view:")) {
    setView(session, legacyToggleView(session.view));
  }
}
