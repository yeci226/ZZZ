export const PROFILE_SELECT_PREFIX = "profile_SelectCharacter";
export const PROFILE_SELECT_NEXT_PAGE = "__profile_next_page__";
export const PROFILE_SELECT_PREVIOUS_PAGE = "__profile_previous_page__";
export const PROFILE_MAX_SELECTED_CHARACTERS = 3;

export type ProfileSelectableCharacter = {
  id: string | number;
};

export type ProfileCharacterSelectPage<
  T extends ProfileSelectableCharacter = ProfileSelectableCharacter,
> = {
  index: number;
  characters: T[];
  hasPrevious: boolean;
  hasNext: boolean;
};

export type ProfileCharacterSelectContext = {
  targetUserId: string;
  accountIndex: number;
  page: number;
  selectedCharacterIds: string[];
};

export type ProfileCharacterSelectResolution =
  | {
      kind: "navigate";
      page: number;
      selectedCharacterIds: string[];
    }
  | {
      kind: "submit";
      page: number;
      selectedCharacterIds: string[];
    }
  | {
      kind: "navigation-conflict";
      page: number;
      selectedCharacterIds: string[];
    }
  | {
      kind: "too-many";
      page: number;
      selectedCharacterIds: string[];
    }
  | {
      kind: "empty";
      page: number;
      selectedCharacterIds: string[];
    };

function characterId(character: ProfileSelectableCharacter): string {
  return String(character.id);
}

function uniqueIds(values: readonly (string | number)[]): string[] {
  return [...new Set(values.map((value) => String(value)).filter(Boolean))];
}

/**
 * Discord allows at most 25 String Select options. Navigation consumes one
 * option, so the first page holds 24 characters, middle pages 23, and the
 * final page holds up to 24 characters plus the previous-page option.
 */
export function paginateProfileCharacters<
  T extends ProfileSelectableCharacter,
>(characters: readonly T[]): ProfileCharacterSelectPage<T>[] {
  const allCharacters = [...characters];
  if (allCharacters.length === 0) return [];
  if (allCharacters.length <= 25) {
    return [
      {
        index: 0,
        characters: allCharacters,
        hasPrevious: false,
        hasNext: false,
      },
    ];
  }

  const pages: ProfileCharacterSelectPage<T>[] = [];
  let cursor = 0;
  let pageIndex = 0;

  const firstCharacters = allCharacters.slice(0, 24);
  pages.push({
    index: pageIndex,
    characters: firstCharacters,
    hasPrevious: false,
    hasNext: true,
  });
  cursor = firstCharacters.length;
  pageIndex += 1;

  while (cursor < allCharacters.length) {
    const remaining = allCharacters.length - cursor;
    const pageSize = remaining <= 24 ? remaining : 23;
    const pageCharacters = allCharacters.slice(cursor, cursor + pageSize);
    cursor += pageCharacters.length;
    pages.push({
      index: pageIndex,
      characters: pageCharacters,
      hasPrevious: true,
      hasNext: cursor < allCharacters.length,
    });
    pageIndex += 1;
  }

  return pages;
}

export function clampProfileCharacterPage(
  page: number,
  pageCount: number,
): number {
  if (pageCount <= 0) return 0;
  if (!Number.isFinite(page)) return 0;
  return Math.max(0, Math.min(pageCount - 1, Math.trunc(page)));
}

export function encodeProfileCharacterSelectCustomId(
  context: Omit<ProfileCharacterSelectContext, "selectedCharacterIds"> & {
    selectedCharacterIds?: readonly (string | number)[];
  },
): string {
  const selectedCharacterIds = uniqueIds(
    context.selectedCharacterIds ?? [],
  ).slice(0, PROFILE_MAX_SELECTED_CHARACTERS);
  return [
    PROFILE_SELECT_PREFIX,
    context.targetUserId,
    context.accountIndex,
    context.page,
    selectedCharacterIds.join(","),
  ].join(":");
}

export function parseProfileCharacterSelectCustomId(
  customId: string,
): ProfileCharacterSelectContext | null {
  const parts = customId.split(":");
  if (parts.length < 5 || parts[0] !== PROFILE_SELECT_PREFIX) return null;

  const targetUserId = parts[1] ?? "";
  const accountIndex = Number(parts[2]);
  const page = Number(parts[3]);
  if (
    !targetUserId ||
    !Number.isInteger(accountIndex) ||
    !Number.isInteger(page) ||
    page < 0
  ) {
    return null;
  }

  const selectedText = parts.slice(4).join(":");
  return {
    targetUserId,
    accountIndex,
    page,
    selectedCharacterIds: uniqueIds(
      selectedText ? selectedText.split(",") : [],
    ).slice(0, PROFILE_MAX_SELECTED_CHARACTERS),
  };
}

export function extractProfileCharacterIdFromOptionValue(
  value: string,
): string | null {
  if (
    value === PROFILE_SELECT_NEXT_PAGE ||
    value === PROFILE_SELECT_PREVIOUS_PAGE
  ) {
    return null;
  }
  const parts = value.split("-");
  if (parts.length < 3) return null;
  const characterId = parts.slice(2).join("-").trim();
  return characterId || null;
}

export function resolveProfileCharacterSelection<T extends ProfileSelectableCharacter>(
  pages: readonly ProfileCharacterSelectPage<T>[],
  currentPage: number,
  previouslySelectedIds: readonly (string | number)[],
  values: readonly string[],
): ProfileCharacterSelectResolution {
  if (pages.length === 0) {
    return {
      kind: "empty",
      page: 0,
      selectedCharacterIds: [],
    };
  }

  const page = clampProfileCharacterPage(currentPage, pages.length);
  const current = pages[page]!;
  const currentPageIds = new Set(current.characters.map(characterId));
  const submittedCharacterIds = uniqueIds(
    values
      .map(extractProfileCharacterIdFromOptionValue)
      .filter((value): value is string => value !== null)
      .filter((value) => currentPageIds.has(value)),
  );
  const retainedIds = uniqueIds(previouslySelectedIds).filter(
    (id) => !currentPageIds.has(id),
  );
  const selectedCharacterIds = uniqueIds([
    ...retainedIds,
    ...submittedCharacterIds,
  ]);
  const hasNext = values.includes(PROFILE_SELECT_NEXT_PAGE);
  const hasPrevious = values.includes(PROFILE_SELECT_PREVIOUS_PAGE);

  if (selectedCharacterIds.length > PROFILE_MAX_SELECTED_CHARACTERS) {
    return {
      kind: "too-many",
      page,
      selectedCharacterIds: uniqueIds(previouslySelectedIds).slice(
        0,
        PROFILE_MAX_SELECTED_CHARACTERS,
      ),
    };
  }

  if (hasNext && hasPrevious) {
    return {
      kind: "navigation-conflict",
      page,
      selectedCharacterIds,
    };
  }

  if (hasNext || hasPrevious) {
    const nextPage = hasNext ? page + 1 : page - 1;
    return {
      kind: "navigate",
      page: clampProfileCharacterPage(nextPage, pages.length),
      selectedCharacterIds,
    };
  }

  return {
    kind: selectedCharacterIds.length > 0 ? "submit" : "empty",
    page,
    selectedCharacterIds,
  };
}
