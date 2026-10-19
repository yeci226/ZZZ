import {
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  LocalizationMap,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";

import { isDeveloper } from "../../../utilities/contactDev.js";
import { buildFeedMessage } from "../../../utilities/interknot/views.js";
import { getInterknotStore } from "../../../utilities/interknot/store.js";
import { getUserLang } from "../../../utilities/utilities.js";

export default {
  // Keep out of production until manual acceptance is done.
  developmentOnly: true,
  data: new SlashCommandBuilder()
    .setName("interknot")
    .setDescription("The INTER-KNOT, also known as the Proxy Network, where everyone can read and write posts.")
    .setNameLocalizations({ "zh-TW": "繩網" } as LocalizationMap)
    .setDescriptionLocalizations({
      "zh-TW": "繩網，也稱為代理網絡，每個人都可以閱讀和發表帖子",
    } as LocalizationMap),

  async execute(_client: Client, interaction: ChatInputCommandInteraction, _args: any[], tr: any) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const locale = (await getUserLang(interaction.user.id)) || "tw";
    try {
      // Without a profile this returns the setup screen instead of the feed.
      await interaction.editReply(
        await buildFeedMessage(
          {
            store: getInterknotStore(),
            viewerId: interaction.user.id,
            guildId: interaction.guildId,
            isDeveloper: isDeveloper(interaction.user.id),
            locale,
            tr,
            now: Date.now(),
          },
          { main: "all", sub: "all", page: 0 },
        ),
      );
    } catch (error: any) {
      console.warn("[interknot] command failed");
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor("#E76161")
            .setTitle(tr("DrawError"))
            .setDescription(`\`${String(error?.message || error)}\``),
        ],
        components: [],
        files: [],
      });
    }
  },
};
