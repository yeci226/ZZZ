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
