import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { showContactDevModal } from "../../utilities/contactDev.js";

export default {
  data: new SlashCommandBuilder()
    .setName("contact-dev")
    .setDescription("聯絡機器人開發者"),
  async execute(_client: any, interaction: ChatInputCommandInteraction) {
    await showContactDevModal(interaction);
  },
};
