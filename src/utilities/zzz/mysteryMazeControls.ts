export interface MysteryMazeContext {
  invokerId: string;
  targetId: string;
  accountIndex: number;
  page: number;
  mapId: string;
  difficulty: number;
  mapPage?: number;
}

type MazeControl =
  "maze-page" | "maze-map" | "maze-difficulty" | "maze-map-page";

export function encodeMysteryMazeContext(
  prefix: MazeControl,
  value: MysteryMazeContext,
): string {
  return [
    prefix,
    value.invokerId,
    value.targetId,
    value.accountIndex,
    value.page,
    value.mapId || "0",
    value.difficulty,
    value.mapPage ?? 0,
  ].join(":");
}

export function parseMysteryMazeContext(
  customId: string,
): MysteryMazeContext | null {
  const [
    prefix,
    invokerId,
    targetId,
    account,
    page,
    mapId,
    difficulty,
    rawMapPage,
  ] = customId.split(":");
  if (
    !["maze-page", "maze-map", "maze-difficulty", "maze-map-page"].includes(
      prefix,
    ) ||
    !invokerId ||
    !targetId
  )
    return null;
  const accountIndex = Number(account),
    pageIndex = Number(page),
    difficultyValue = Number(difficulty);
  if (![accountIndex, pageIndex, difficultyValue].every(Number.isFinite))
    return null;
  return {
    invokerId,
    targetId,
    accountIndex,
    page: pageIndex,
    mapId: mapId || "0",
    difficulty: difficultyValue,
    mapPage: Math.max(0, Number(rawMapPage) || 0),
  };
}

export function paginateMysteryMazeMaps<T>(
  maps: readonly T[],
  requestedPage = 0,
) {
  const pages = Math.max(1, Math.ceil(maps.length / 24));
  const page = Math.max(0, Math.min(Math.trunc(requestedPage), pages - 1));
  return { page, pages, items: maps.slice(page * 24, (page + 1) * 24) };
}
