import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} from "discord.js";

import { getUserZZZData } from "../utilities.js";
import {
  renderMysteryMaze,
  type MysteryMazeAbstract,
  type MysteryMazeDetail,
} from "./mysteryMazeRenderer.js";
import { requestZzzRecordApi } from "./officialRecordApi.js";
import {
  encodeMysteryMazeContext,
  paginateMysteryMazeMaps,
  parseMysteryMazeContext,
  type MysteryMazeContext,
} from "./mysteryMazeControls.js";

export {
  encodeMysteryMazeContext,
  paginateMysteryMazeMaps,
  parseMysteryMazeContext,
} from "./mysteryMazeControls.js";
export type { MysteryMazeContext } from "./mysteryMazeControls.js";

export async function buildMysteryMazeMessage(
  interaction: any,
  tr: any,
  locale: string,
  context: MysteryMazeContext,
) {
  const zzz = await getUserZZZData(
    interaction,
    tr,
    context.targetId,
    locale,
    context.accountIndex,
  );
  if (!zzz) return null;
  const abstract = await requestZzzRecordApi<MysteryMazeAbstract>(
    zzz,
    "zenkov_abstract_info",
  );
  let detail: MysteryMazeDetail = { record_list: [], map_list: [] };
  try {
    detail = await requestZzzRecordApi<MysteryMazeDetail>(
      zzz,
      "zenkov_detail",
      {
        map_ids: context.mapId !== "0" ? [context.mapId] : undefined,
        difficulty: context.difficulty || undefined,
      },
    );
  } catch {
    // The overview remains available when recent records are locked or empty.
  }
  const allMaps = Array.isArray(abstract?.map_list) ? abstract.map_list : [];
  const selectedMaps =
    context.mapId === "0"
      ? allMaps
      : allMaps.filter((map) => String(map?.map_id) === context.mapId);
  const pages = await renderMysteryMaze({
    uid: String(zzz.uid),
    locale,
    abstract: { ...abstract, map_list: selectedMaps },
    detail,
  });
  context.page = Math.max(0, Math.min(context.page, pages.length - 1));
  const rows: Array<ActionRowBuilder<any>> = [];

  const maps = allMaps;
  const mapChoices = paginateMysteryMazeMaps(maps, context.mapPage ?? 0);
  context.mapPage = mapChoices.page;
  rows.push(
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(encodeMysteryMazeContext("maze-map", context))
        .setPlaceholder("選擇地圖")
        .addOptions([
          { label: "全部地圖", value: "0", default: context.mapId === "0" },
          ...mapChoices.items.map((map) => ({
            label: String(map.map_name || `地圖 ${map.map_id}`).slice(0, 100),
            value: String(map.map_id),
            default: String(map.map_id) === context.mapId,
          })),
        ]),
    ),
  );
  if (mapChoices.pages > 1) {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(
            encodeMysteryMazeContext("maze-map-page", {
              ...context,
              mapPage: mapChoices.page - 1,
            }),
          )
          .setLabel("較新地圖")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(mapChoices.page === 0),
        new ButtonBuilder()
          .setCustomId(
            encodeMysteryMazeContext("maze-map-page", {
              ...context,
              mapPage: mapChoices.page + 1,
            }),
          )
          .setLabel("較舊地圖")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(mapChoices.page >= mapChoices.pages - 1),
      ),
    );
  }
  rows.push(
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(encodeMysteryMazeContext("maze-difficulty", context))
        .setPlaceholder("選擇難度")
        .addOptions(
          { label: "全部難度", value: "0", default: context.difficulty === 0 },
          { label: "困難", value: "1", default: context.difficulty === 1 },
          { label: "煉獄", value: "2", default: context.difficulty === 2 },
        ),
    ),
  );
  if (pages.length > 1) {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(
            encodeMysteryMazeContext("maze-page", {
              ...context,
              page: context.page - 1,
            }),
          )
          .setLabel("上一頁")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(context.page === 0),
        new ButtonBuilder()
          .setCustomId(
            encodeMysteryMazeContext("maze-page", {
              ...context,
              page: context.page + 1,
            }),
          )
          .setLabel("下一頁")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(context.page >= pages.length - 1),
      ),
    );
  }
  return {
    embeds: [],
    files: [
      new AttachmentBuilder(pages[context.page]!.buffer, {
        name: `zzz-mystery-maze-${zzz.uid}-${context.page}.png`,
      }),
    ],
    components: rows,
  };
}
