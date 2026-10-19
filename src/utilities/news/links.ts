import { escapeMarkdown } from "discord.js";
import { quietText } from "./article.js";
export function linkedTitle(title: string, url: string): string {
  const label =
    title
      .replace(/<a?:\w+:\d+>/g, "")
      .replace(
        /[0-9#*]\uFE0F?\u20E3|\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|[\u200D\uFE0E\uFE0F\u{E0020}-\u{E007F}]/gu,
        "",
      )
      .replace(/\s+/g, " ")
      .trim() || "HoYoLAB";
  const escaped = escapeMarkdown(quietText(label)).replace(/[\[\]]/g, "\\$&");
  return `[${escaped.slice(0, 650).replace(/\\$/, "")}](<${url}>)`;
}
