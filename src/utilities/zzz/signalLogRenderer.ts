import type { GachaArchiveBanner } from "./gachaArchive.js";
import type { GachaSummary } from "./gachaAnalysis.js";
import { posterPityCycles, renderSignalCyclesPoster } from "./signalLogCycles.js";
import { CYCLE_PAGE_SIZE, wallPageCount, type SignalLogView } from "./signalLogPagination.js";
import type { GachaStatCategory } from "./gachaStatApi.js";
import type { SignalLogModel } from "./signalLogModel.js";
import { renderSignalHome } from "./signalLogHome.js";
import { renderSignalVersions, paginateSegments } from "./signalLogVersions.js";
import { renderSignalWall } from "./signalLogWall.js";

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
  if (!input.cycles) throw new Error("cycles input missing");
  return renderSignalCyclesPoster(input);
}

export function signalLogImagePageCount(
  input: Pick<SignalLogImageInput, "view" | "category" | "model" | "cycles">,
): number {
  const channel = input.model.channels[input.category];
  if (input.view === "versions") return paginateSegments(channel.segments).length;
  if (input.view === "cycles") return input.cycles ? Math.max(1, Math.ceil(posterPityCycles(input).length / CYCLE_PAGE_SIZE)) : 1;
  if (input.view !== "wall") return 1;
  return wallPageCount(channel.entries.length, channel.currentPity !== null);
}
