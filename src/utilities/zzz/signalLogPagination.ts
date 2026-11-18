export type SignalLogView = "home" | "wall" | "versions" | "cycles";
export const WALL_PAGE_SIZE = 35;
export const CYCLE_PAGE_SIZE = 10;

export interface SignalBannerChoice {
  label: string;
  value: string;
}

export function paginateSignalBannerChoices(
  choices: SignalBannerChoice[],
  requestedPage: number,
  pageSize = 25,
): { items: SignalBannerChoice[]; page: number; pages: number } {
  const size = Math.max(1, Math.min(25, Math.trunc(pageSize) || 25));
  const pages = Math.max(1, Math.ceil(choices.length / size));
  const page = Math.max(0, Math.min(Math.trunc(requestedPage) || 0, pages - 1));
  return { items: choices.slice(page * size, page * size + size), page, pages };
}

export function paginateSignalBannerChoicesWithPinned(
  choices: SignalBannerChoice[],
  requestedPage: number,
  pinned: SignalBannerChoice,
): { items: SignalBannerChoice[]; page: number; pages: number } {
  const pagination = paginateSignalBannerChoices(choices, requestedPage, 24);
  return { ...pagination, items: [pinned, ...pagination.items] };
}

export function normalizeSignalLogView(value: unknown): SignalLogView {
  if (value === "overview") return "wall";
  if (value === "records") return "cycles";
  return value === "home" || value === "wall" || value === "versions" || value === "cycles" ? value : "home";
}

export function legacyToggleView(view: SignalLogView): SignalLogView {
  return view === "cycles" ? "wall" : "cycles";
}

/** The live pity cell takes one slot on the first wall page. */
export function wallPageCount(sCount: number, hasLiveCell: boolean): number {
  return Math.max(1, Math.ceil((Math.max(0, sCount) + (hasLiveCell ? 1 : 0)) / WALL_PAGE_SIZE));
}
