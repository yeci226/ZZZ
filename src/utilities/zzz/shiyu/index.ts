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
import { GlobalFonts } from "@napi-rs/canvas";
import { join } from "path";
import { processShiyuData } from "./data.js";
import { loadShiyuAssets, loadDynamicImages } from "./assets.js";
import { drawShiyuCanvas } from "./drawer.js";
import { ShiyuContext } from "./types.js";

const drawQueue = new Queue({ autostart: true });

// Register fonts
GlobalFonts.registerFromPath(join(".", "src", "assets", "en-us.ttf"), "EN");
GlobalFonts.registerFromPath(join(".", "src", "assets", "zh-tw.ttf"), "TW");
GlobalFonts.registerFromPath(join(".", "src", "assets", "zh-cn.ttf"), "CN");
GlobalFonts.registerFromPath(join(".", "src", "assets", "vi-vn.ttf"), "VI");
GlobalFonts.registerFromPath(join(".", "src", "assets", "ja-jp.ttf"), "JP");
GlobalFonts.registerFromPath(join(".", "src", "assets", "ko-kr.ttf"), "KR");
GlobalFonts.registerFromPath(join(".", "src", "assets", "fr-fr.ttf"), "FR");
GlobalFonts.registerFromPath(
  join(".", "src", "assets", "Nunito-BlackItalic.ttf"),
  "Nunito",
);

const fonts = {
  tw: "TW",
  cn: "CN",
  vi: "VI",
  jp: "JP",
  kr: "KR",
  fr: "FR",
  default: "EN",
};

export async function handleShiyuDraw(
  interaction: ChatInputCommandInteraction,
  tr: (key: string, args?: any) => string,
  user: User,
  zzz: ZenlessZoneZero,
  schedule: number,
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
        (await getUserLang(interaction.user.id)) ||
        toI18nLang(interaction.locale) ||
        "en";
      const hadalData = await zzz.record.hadalInfo(schedule);
      console.log(hadalData);
      if (!hadalData.hadal_info_v2.fourth_layer_detail)
        return failedReply(interaction, tr("NonData"), tr("NonDataDesc"));

      // Generate
      const context: ShiyuContext = {
        tr,
        userLocale,
        selectedFont: fonts[userLocale as keyof typeof fonts] || fonts.default,
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
