import {
  CommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
} from "discord.js";
import moment from "moment-timezone";
import {
  getStaminaColor,
  getUserZZZData,
} from "../../../utilities/utilities.js";

export default {
  data: new SlashCommandBuilder()
    .setName("note")
    .setDescription("View current energy")
    .setNameLocalizations({
      "zh-TW": "即時便箋",
    })
    .setDescriptionLocalizations({
      "zh-TW": "查看當前電量",
    })
    .addSubcommand((subcommand) =>
      subcommand
        .setName("check")
        .setDescription("...")
        .setNameLocalizations({
          "zh-TW": "查看",
        })
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("...")
            .setNameLocalizations({
              "zh-TW": "使用者",
            })
            .setRequired(false)
        )
    ),

  /**
   *
   * @param {Client} client
   * @param {CommandInteraction} interaction
   * @param {String[]} args
   */
  async execute(client, interaction, args, tr, db, emoji) {
    const subCommand = interaction.options.getSubcommand();
    if (subCommand == "check") {
      const targetUser =
        interaction.options.getUser("user") || interaction.user;

      const zzz = await getUserZZZData(interaction, tr, targetUser.id);
      if (zzz == null) return;

      let res;
      try {
        res = await zzz.record.note();
      } catch (e) {
        interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle(tr("note_Error"))
              .setColor("#E76161")
              .setThumbnail(
                "https://static.wikia.nocookie.net/zenless-zone-zero/images/0/02/Sticker_Set_1_Anby_sob.png"
              )
              .setImage(
                "https://media.discordapp.net/attachments/1149960935654559835/1258313139078955039/image.png"
              )
              .setDescription(tr("note_Error_Description")),
          ],
        });
      }

      const embed = new EmbedBuilder()
        .setColor(getStaminaColor(res.energy.progress.current))
        .setThumbnail(
          targetUser.displayAvatarURL({
            size: 4096,
            dynamic: true,
          })
        )
        .setAuthor({
          name: tr("note_Title") + " - " + zzz.uid,
        })
        .addFields(
          {
            name: emoji.battery + tr("note_Energy"),
            value:
              res.energy.progress.current != res.energy.progress.max
                ? res.energy.progress.current + "/" + res.energy.progress.max
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
          }
        );

      if (
        res.energy.progress.current + 20 >= res.energy.progress.max &&
        res.energy.progress.current != res.energy.progress.max
      )
        embed.setTitle(tr("note_EnergyFull"));

      interaction.reply({
        embeds: [embed],
      });
    }
  },
};
