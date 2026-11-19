import { LocalizationMap, MessageFlags, SlashCommandBooleanOption } from "discord.js";

export const PRIVATE_OPTION_NAME = "private";

/** Pass to `.addBooleanOption(...)`: adds the optional "only visible to me" switch. */
export function buildPrivateOption(option: SlashCommandBooleanOption): SlashCommandBooleanOption {
  return option
    .setName(PRIVATE_OPTION_NAME)
    .setDescription("Show the result only to you")
    .setNameLocalizations({
      "zh-TW": "僅自己可見",
      "zh-CN": "仅自己可见",
      ja: "自分のみ",
      ko: "나만보기",
      fr: "privé",
      vi: "riêngtư",
    } as LocalizationMap)
    .setDescriptionLocalizations({
      "zh-TW": "只有你看得到這則結果",
      "zh-CN": "只有你能看到这条结果",
      ja: "結果を自分だけに表示します",
      ko: "결과를 나에게만 표시합니다",
      fr: "Afficher le résultat uniquement pour vous",
      vi: "Chỉ hiển thị kết quả cho riêng bạn",
    } as LocalizationMap)
    .setRequired(false);
}

type OptionsLike = { options?: { getBoolean?: (name: string) => boolean | null } };

export function isPrivateRequested(interaction: OptionsLike): boolean {
  return interaction.options?.getBoolean?.(PRIVATE_OPTION_NAME) === true;
}

/**
 * Options for the FIRST response (deferReply/reply): ephemeral only when the user asked.
 * Returns undefined otherwise so the default call is exactly what it was before.
 */
export function privateReplyOptions(interaction: OptionsLike): { flags: MessageFlags.Ephemeral } | undefined {
  return isPrivateRequested(interaction) ? { flags: MessageFlags.Ephemeral } : undefined;
}
