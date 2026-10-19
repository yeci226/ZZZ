import { ApplicationIntegrationType, InteractionContextType, SlashCommandBuilder, type ChatInputCommandInteraction, type Client } from "discord.js";
import { openDiscLeaderboard } from "../../../utilities/zzz/discLeaderboard.js";
import { discLocalizations, discText } from "../../../utilities/zzz/discLeaderboardCopy.js";

export default {
  defer: true,
  ephemeral: false,
  data: new SlashCommandBuilder().setName("leaderboard").setNameLocalizations({ "zh-TW": "排行榜", "zh-CN": "排行榜", ja: "ランキング", ko: "순위", fr: "classement", vi: "xếp-hạng" })
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel)
    .setDescription(discText("en", "description")).setDescriptionLocalizations(discLocalizations("description"))
    .addStringOption(option => option.setName("agent").setNameLocalizations({ "zh-TW": "角色", "zh-CN": "角色", ja: "キャラクター", ko: "캐릭터", fr: "personnage", vi: "nhân-vật" })
      .setDescription(discText("en", "agentOption")).setDescriptionLocalizations(discLocalizations("agentOption")).setRequired(true).setAutocomplete(true))
    .addStringOption(option => option.setName("scope").setNameLocalizations({ "zh-TW": "範圍", "zh-CN": "范围", ja: "範囲", ko: "범위", fr: "portée", vi: "phạm-vi" })
      .setDescription(discText("en", "scopeOption")).setDescriptionLocalizations(discLocalizations("scopeOption"))
      .addChoices({ name: "Global", name_localizations: discLocalizations("global"), value: "global" }, { name: "This server", name_localizations: discLocalizations("server"), value: "server" })),
  async execute(_client: Client, interaction: ChatInputCommandInteraction) {
    await openDiscLeaderboard(interaction, interaction.options.getString("agent", true), interaction.options.getString("scope") === "server" ? "server" : "global");
  },
};
