import type { GachaArchiveBanner, GachaArchiveSource, GachaChannelCategory } from "./gachaArchive.js";
import type { GachaSummary } from "./gachaAnalysis.js";
import { cycleTrackCells, renderSignalCycles } from "./signalLogCycles.js";
import { overviewMetrics, overviewStatCards, hasTopBadge, renderSignalOverview, sItemCounts, statsEntries } from "./signalLogOverview.js";
import { wallPageCount, type LegacySignalLogView, type SignalLogView } from "./signalLogPagination.js";
import type { GachaStatCategory } from "./gachaStatApi.js";
import type { SignalLogModel } from "./signalLogModel.js";
import { renderSignalHome } from "./signalLogHome.js";
import { renderSignalVersions, paginateSegments } from "./signalLogVersions.js";
import { renderSignalWall } from "./signalLogWall.js";
import {
  bannerUpItems,
  fittedNumberSize,
  gtCardKind,
  gtCardSource,
  itemIcon,
  OUTPUT_SCALE,
} from "./signalLogPaper.js";

export interface SignalLogRenderInput {
  locale?: string;
  source: GachaArchiveSource;
  uid: string;
  playerName?: string | null;
  archivedAt?: string | null;
  stale?: boolean;
  category: GachaChannelCategory;
  bannerLabel: string;
  banner?: Pick<GachaArchiveBanner, "name" | "version" | "channelCategory" | "upItems">;
  headerItem?: {
    id: string;
    name: string;
    itemType: "bangboo";
    rarity: "S";
    icon?: string;
  };
  summary: GachaSummary;
  view: LegacySignalLogView;
  page: number;
  details?: any;
  pityEstimated?: boolean;
  /** False when a past-banner filter ends before the channel's newest pull. Defaults to true. */
  openCycleIsLive?: boolean;
}

export async function renderSignalLog(input: SignalLogRenderInput): Promise<Buffer> {
  return input.view === "records" ? renderSignalCycles(input) : renderSignalOverview(input);
}

export const __signalLogRendererInternals = {
  itemIcon,
  sItemCounts,
  bannerUpItems,
  gtCardKind,
  gtCardSource,
  fittedNumberSize,
  statsEntries,
  overviewStatCards,
  overviewMetrics,
  cycleTrackCells,
  hasTopBadge,
  outputScale: OUTPUT_SCALE,
};

export interface SignalLogImageInput {
  locale?: string;
  uid: string;
  playerName?: string | null;
  archivedAt?: string | null;
  stale?: boolean;
  view: SignalLogView;
  page: number;
  category: GachaStatCategory;
  model: SignalLogModel;
  cycles?: {
    summary: GachaSummary;
    pityEstimated: boolean;
    openCycleIsLive: boolean;
    bannerLabel: string | null;
    banner?: Pick<GachaArchiveBanner, "name" | "version" | "upItems">;
  };
}

export async function renderSignalLogImage(input: SignalLogImageInput): Promise<Buffer> {
  if (input.view === "home") return renderSignalHome(input);
  if (input.view === "wall") return renderSignalWall(input);
  if (input.view === "versions") return renderSignalVersions(input);
  throw new Error("view not implemented");
}

export function signalLogImagePageCount(
  input: Pick<SignalLogImageInput, "view" | "category" | "model" | "cycles">,
): number {
  const channel = input.model.channels[input.category];
  if (input.view === "versions") return paginateSegments(channel.segments).length;
  if (input.view !== "wall") return 1;
  return wallPageCount(channel.entries.length, channel.currentPity !== null);
}
