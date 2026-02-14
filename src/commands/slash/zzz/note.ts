import {
  CommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  LocalizationMap,
  Client,
  ChatInputCommandInteraction,
} from "discord.js";
import moment from "moment-timezone";
import {
  getStaminaColor,
  getUserZZZData,
} from "../../../utilities/utilities.js";
import { QuickDB } from "quick.db";

export default {
  data: new SlashCommandBuilder()
    .setName("note")
    .setDescription("View current energy")
    .setNameLocalizations({
      "zh-TW": "即時便箋",
      vi: "ghichúnhanh",
      fr: "note",
    } as LocalizationMap)
    .setDescriptionLocalizations({
      "zh-TW": "查看當前電量",
      vi: "Kiểm tra điện lượng hiện tại",
      fr: "Afficher les charges de batterie actuelles",
    } as LocalizationMap)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("check")
        .setDescription("...")
        .setNameLocalizations({
          "zh-TW": "查看",
          vi: "kiểmtra",
          fr: "vérifier",
        } as LocalizationMap)
        .addStringOption((option) =>
          option
            .setName("account")
            .setDescription("...")
            .setNameLocalizations({
              "zh-TW": "帳號",
              vi: "tàikhoản",
              fr: "compte",
            } as LocalizationMap)
            .setRequired(false)
            .setAutocomplete(true),
        )
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("...")
            .setNameLocalizations({
              "zh-TW": "使用者",
              vi: "ngườidùng",
              fr: "utilisateur",
            } as LocalizationMap)
            .setRequired(false),
        ),
    ),

  async execute(
    client: Client,
    interaction: ChatInputCommandInteraction,
    args: any[],
    tr: any,
    db: QuickDB,
    emoji: any,
  ) {
    const subCommand = interaction.options.getSubcommand();
    if (subCommand == "check") {
      const targetUser =
        interaction.options.getUser("user") || interaction.user;
      const accountIndex = parseInt(
        interaction.options.getString("account") || "0",
      );

      const zzz = await getUserZZZData(
        interaction,
        tr,
        targetUser.id,
        undefined,
        accountIndex,
      );
      if (zzz == null) return;

      try {
        const res: any = await zzz.record.note();
        const embed = new EmbedBuilder()
          .setColor(getStaminaColor(res.energy.progress.current) as any)
          .setThumbnail(
            targetUser.displayAvatarURL({
              size: 4096,
              forceStatic: false,
            }),
          )
          .setAuthor({
            name: tr("note_Title") + " - " + zzz.uid,
          })
          .addFields(
            {
              name: emoji.battery + tr("note_Energy"),
              value:
                res.energy.progress.current != res.energy.progress.max
                  ? res.energy.progress.current +
                    "/" +
                    res.energy.progress.max +
                    ` - <t:${moment(new Date()).unix() + parseInt(res.energy.restore)}:R>`
                  : tr("note_Energy_Full"),
              inline: false,
            },
            {
              name: "◉ " + tr("note_Vitality"),
              value: res.vitality.current + "/" + res.vitality.max,
              inline: false,
            },
            {
              name: "◉ " + tr("note_Card"),
              value:
                res.card_sign == "CardSignDone"
                  ? tr("note_Card_Done")
                  : tr("note_Card_NotDone"),
              inline: false,
            },
            {
              name: "◉ " + tr("note_VHS"),
              value:
                res.vhs_sale.sale_state == "SaleStateDoing"
                  ? tr("note_VHS_Doing")
                  : tr("note_VHS_NotDoing"),
              inline: false,
            },
          );

        if (
          res.energy.progress.current + 20 >= res.energy.progress.max &&
          res.energy.progress.current != res.energy.progress.max
        )
          embed.setTitle(tr("note_EnergyFull"));

        interaction.reply({
          embeds: [embed],
        });
      } catch (e: any) {
        interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle(tr("note_Error"))
              .setConfig("#E76161", "sob")
              .setImage(
                "https://media.discordapp.net/attachments/1149960935654559835/1258313139078955039/image.png",
              )
              .setDescription(
                tr("note_Error_Description") + "\n\n" + `\`${e.message}\``,
              ),
          ],
        });
      }
    }
  },
};
