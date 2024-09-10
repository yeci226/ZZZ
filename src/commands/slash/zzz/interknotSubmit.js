import {
  CommandInteraction,
  ContextMenuCommandBuilder,
  ApplicationCommandType,
} from "discord.js";

export default {
  data: new ContextMenuCommandBuilder()
    .setName("submit")
    .setNameLocalizations({
      "zh-TW": "提交",
    })
    .setType(ApplicationCommandType.Message),

  /**
   *
   * @param {Client} client
   * @param {CommandInteraction} interaction
   * @param {String[]} args
   */
  async execute(client, interaction, args, tr, db, emoji) {},
};
