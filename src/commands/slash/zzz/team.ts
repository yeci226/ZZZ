import {
  ChatInputCommandInteraction,
  Client,
  LocalizationMap,
  SlashCommandBuilder,
  MessageFlags,
} from "discord.js";
import { getUserZZZData, getUserLang } from "../../../utilities/utilities.js";
import { handleTeamDraw } from "../../../utilities/zzz/team.js";
import { QuickDB } from "quick.db";

export default {
  data: new SlashCommandBuilder()
    .setName("team")
    .setDescription("Display your team composition with agents and bangboo")
    .setNameLocalizations({
      "zh-TW": "配隊",
      vi: "đội",
      fr: "équipe",
    } as LocalizationMap)
    .setDescriptionLocalizations({
      "zh-TW": "展示你的配隊組合（角色與邦布）",
      vi: "Hiển thị đội nhân vật và bangboo của bạn",
      fr: "Afficher votre équipe avec les agents et bangboo",
    } as LocalizationMap)
    .addStringOption((option) =>
      option
        .setName("account")
        .setDescription("Account to use")
        .setNameLocalizations({ "zh-TW": "帳號", vi: "tàikhoản", fr: "compte" } as LocalizationMap)
        .setRequired(false)
        .setAutocomplete(true)
    )
    .addStringOption((option) =>
      option
        .setName("agent1")
        .setDescription("First agent")
        .setNameLocalizations({ "zh-TW": "角色1", vi: "nhânvật1", fr: "agent1" } as LocalizationMap)
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption((option) =>
      option
        .setName("agent2")
        .setDescription("Second agent (optional)")
        .setNameLocalizations({ "zh-TW": "角色2", vi: "nhânvật2", fr: "agent2" } as LocalizationMap)
        .setRequired(false)
        .setAutocomplete(true)
    )
    .addStringOption((option) =>
      option
        .setName("agent3")
        .setDescription("Third agent (optional)")
        .setNameLocalizations({ "zh-TW": "角色3", vi: "nhânvật3", fr: "agent3" } as LocalizationMap)
        .setRequired(false)
        .setAutocomplete(true)
    )
    .addStringOption((option) =>
      option
        .setName("bangboo")
        .setDescription("Bangboo (optional)")
        .setNameLocalizations({ "zh-TW": "邦布", vi: "bangboo", fr: "bangboo" } as LocalizationMap)
        .setRequired(false)
        .setAutocomplete(true)
    ),

  async execute(
    _client: Client,
    interaction: ChatInputCommandInteraction,
    _args: any[],
    tr: any,
    db: QuickDB,
    emoji: any,
  ) {
    const accountIndex = parseInt(interaction.options.getString("account") || "0");
    const agent1Id = interaction.options.getString("agent1");
    const agent2Id = interaction.options.getString("agent2");
    const agent3Id = interaction.options.getString("agent3");
    const bangbooId = interaction.options.getString("bangboo");

    if (!agent1Id) {
      await interaction.reply({
        content: tr("team_NoAgent") || "Please select at least one agent.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const zzz = await getUserZZZData(
      interaction,
      tr,
      interaction.user.id,
      await getUserLang(interaction.user.id),
      accountIndex,
    );
    if (!zzz) return;

    await interaction.deferReply();

    const agentIds = [agent1Id, agent2Id, agent3Id].filter(Boolean) as string[];
    handleTeamDraw(interaction, tr, zzz, agentIds, bangbooId);
  },
};
