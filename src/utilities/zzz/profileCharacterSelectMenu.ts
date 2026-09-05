import {
  ActionRowBuilder,
  StringSelectMenuBuilder,
} from "discord.js";
import emoji from "../../assets/emoji.js";
import { getElementEmojiKey } from "./elements.js";
import {
  encodeProfileCharacterSelectCustomId,
  paginateProfileCharacters,
  PROFILE_MAX_SELECTED_CHARACTERS,
  PROFILE_SELECT_NEXT_PAGE,
  PROFILE_SELECT_PREVIOUS_PAGE,
} from "./profileCharacterSelect.js";

function translated(
  tr: (key: string, args?: any) => string | undefined,
  key: string,
  fallback: string,
): string {
  return tr(key) || fallback;
}

export function buildProfileCharacterSelectRows(
  tr: (key: string, args?: any) => string | undefined,
  characters: any[],
  targetUserId: string,
  accountIndex: string | number,
  requestedPage = 0,
  selectedCharacterIds: readonly (string | number)[] = [],
): any[] {
  const pages = paginateProfileCharacters(characters);
  if (pages.length === 0) return [];

  const pageIndex = Math.max(0, Math.min(pages.length - 1, requestedPage));
  const page = pages[pageIndex]!;
  const selected = new Set(selectedCharacterIds.map((id) => String(id)));
  const options: any[] = page.characters.map((character: any) => {
    const characterId = String(character.id);
    const elementKey = getElementEmojiKey(
      character.element_type,
      character.id,
    );
    const option: any = {
      label: String(character.name_mi18n ?? character.name ?? characterId),
      description: String(
        tr("profile_CharactersFormat", {
          level: character.level,
          rank: character.rank,
        }) ?? "",
      ),
      value: `${targetUserId}-${accountIndex}-${characterId}`,
    };
    const characterEmoji = elementKey
      ? (emoji as any)[elementKey]
      : undefined;
    if (characterEmoji) option.emoji = characterEmoji;
    if (selected.has(characterId)) option.default = true;
    return option;
  });

  if (page.hasNext) {
    options.push({
      label: translated(tr, "profile_SelectCharacterNextPage", "下一頁"),
      value: PROFILE_SELECT_NEXT_PAGE,
    });
  }
  if (page.hasPrevious) {
    options.push({
      label: translated(
        tr,
        "profile_SelectCharacterPreviousPage",
        "上一頁",
      ),
      value: PROFILE_SELECT_PREVIOUS_PAGE,
    });
  }

  const placeholder = `${translated(
    tr,
    "profile_SelectCharacter",
    "選擇角色查看",
  )}${pages.length > 1 ? ` (${pageIndex + 1}/${pages.length})` : ""}`;
  const menu = new StringSelectMenuBuilder()
    .setCustomId(
      encodeProfileCharacterSelectCustomId({
        targetUserId,
        accountIndex: Number(accountIndex),
        page: pageIndex,
        selectedCharacterIds,
      }),
    )
    .setPlaceholder(placeholder)
    .setMinValues(1)
    .setMaxValues(Math.min(PROFILE_MAX_SELECTED_CHARACTERS, options.length))
    .addOptions(options);

  return [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu),
  ] as any[];
}
