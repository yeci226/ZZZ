import { client } from "../../../index.js";
import {
  EmbedBuilder,
  AttachmentBuilder,
  ChatInputCommandInteraction,
  User,
} from "discord.js";
import { ZenlessZoneZero } from "@yeci226/hoyoapi";
import Queue from "queue";
import {
  getRandomColor,
  drawInQueueReply,
  getUserLang,
  failedReply,
} from "../../utilities.js";
import { toI18nLang } from "../../core/i18n.js";
import { processShiyuData } from "./data.js";

import { loadShiyuAssets, loadDynamicImages } from "./assets.js";
import { drawShiyuCanvas } from "./drawer.js";
import { ShiyuContext } from "./types.js";
import { saveShiyuHistory } from "../recordCache.js";
import { getZzzCanvasFont } from "../canvasFonts.js";
const drawQueue = new Queue({ autostart: true });

function buildShiyuCanvasTranslator(
  tr: (key: string, args?: any) => string,
  locale: string,
): (key: string, args?: any) => string {
  const normalized = locale.toLowerCase();
  if (normalized === "tw" || normalized === "zh-tw" || normalized === "cn" || normalized === "zh-cn") {
    return tr;
  }
  const english: Record<string, string | ((args?: any) => string)> = {
    ShiyuDefense_Period: (args) => `Shiyu Defense · Period ${args?.period ?? "?"}`,
    ShiyuDefense: "Shiyu Defense",
    FirstFrontier: "First Frontier",
    SecondFrontier: "Second Frontier",
    ThirdFrontier: "Third Frontier",
    FourthFrontier: "Fourth Frontier",
    FifthFrontier: "Fifth Frontier",
    TotalTime: "Total Time",
    SpentTime: "Time",
    levelFormat: (args) => `Lv.${args?.level ?? "?"}`,
  };
  return (key, args) => {
    const value = english[key];
    if (typeof value === "function") return value(args);
    if (typeof value === "string") return value;
    return tr(key, args);
  };
}

export async function handleShiyuDraw(
  interaction: ChatInputCommandInteraction,
  tr: (key: string, args?: any) => string,
  user: User,
  zzz: ZenlessZoneZero,
  schedule: number,
  options: {
    db?: any;
    dataOverride?: any;
    accountIndex?: number;
    targetUserId?: string;
    locale?: string;
  } = {},
) {
  const drawTask = async () => {
    try {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle(tr("Searching"))
            .setColor(getRandomColor() as any)
            .setImage(
              "https://static.wikia.nocookie.net/zenless-zone-zero/images/b/bb/Bangboo_Net_Loading.gif",
            ),
        ],
      });

      // Request
      const userLocale =
        options.locale ||
        (await getUserLang(interaction.user.id)) ||
        toI18nLang(interaction.locale) ||
        "en";
      const hadalData =
        options.dataOverride ?? (await zzz.record.hadalInfo(schedule));
      if (!hadalData?.hadal_info_v2?.fourth_layer_detail)
        return failedReply(interaction, tr("NonData"), tr("NonDataDesc"));
      if (!options.dataOverride && options.db && options.targetUserId) {
        try {
          await saveShiyuHistory(
            options.db,
            options.targetUserId,
            options.accountIndex ?? 0,
            schedule,
            hadalData,
          );
        } catch (cacheError) {
          console.warn("[shiyu] failed to save history", cacheError);
        }
      }

      // Generate
      const context: ShiyuContext = {
        tr: buildShiyuCanvasTranslator(tr, userLocale),
        userLocale,
        selectedFont: getZzzCanvasFont(userLocale),
      };

      const floors = processShiyuData(hadalData, context);
      const staticAssets = await loadShiyuAssets();
      const dynamicImages = await loadDynamicImages(floors);

      console.log(floors);

      const imageBuffer = await drawShiyuCanvas(
        floors,
        hadalData,
        context,
        staticAssets,
        dynamicImages,
      );

      if (!imageBuffer) throw new Error(tr("profile_NoImageData"));

      const image = new AttachmentBuilder(imageBuffer, {
        name: `Shiyu_${zzz.uid}.png`,
      });

      interaction.editReply({
        embeds: [],
        files: [image],
      });
    } catch (error: any) {
      if (error?.code == "-501000") {
        interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle(tr("note_Error"))
              .setColor("#E76161")
              .setImage(
                "https://media.discordapp.net/attachments/1149960935654559835/1258313139078955039/image.png",
              )
              .setDescription(
                tr("note_Error_Description") + "\n\n" + `\`${error.message}\``,
              ),
          ],
        });
      } else {
        interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor("#E76161")
              .setTitle(tr("DrawError"))
              .setDescription(`\`${error}\``)
              .setThumbnail(
                "https://static.wikia.nocookie.net/zenless-zone-zero/images/0/02/Sticker_Set_1_Anby_sob.png",
              ),
          ],
        });
      }
    }
  };

  drawQueue.push(drawTask);

  if (drawQueue.length !== 1) {
    drawInQueueReply(
      interaction,
      tr("DrawInQueue", { position: drawQueue.length - 1 }),
    );
  }
}
