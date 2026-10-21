import type { GachaArchiveBanner, GachaArchiveSource, GachaChannelCategory } from "./gachaArchive.js";
import type { GachaSummary } from "./gachaAnalysis.js";
import { cycleTrackCells, renderSignalCycles } from "./signalLogCycles.js";
import { overviewMetrics, overviewStatCards, renderSignalOverview, sItemCounts, statsEntries } from "./signalLogOverview.js";
import type { SignalLogView } from "./signalLogPagination.js";
import {
  bannerUpItems,
  coverPlacement,
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
  view: SignalLogView;
  page: number;
  details?: any;
  pityEstimated?: boolean;
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
  coverPlacement,
  fittedNumberSize,
  statsEntries,
  overviewStatCards,
  overviewMetrics,
  cycleTrackCells,
  outputScale: OUTPUT_SCALE,
};
