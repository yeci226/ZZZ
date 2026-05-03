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
        .setName("agent1")
        .setDescription("第一位角色 | First agent")
        .setNameLocalizations({ "zh-TW": "角色1", vi: "nhânvật1", fr: "agent1" } as LocalizationMap)
        .setDescriptionLocalizations({ "zh-TW": "第一位角色（必填）", vi: "Nhân vật đầu tiên (bắt buộc)", fr: "Premier agent (requis)" } as LocalizationMap)
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption((option) =>
      option
        .setName("account")
        .setDescription("要使用的帳號 | Account to use")
        .setNameLocalizations({ "zh-TW": "帳號", vi: "tàikhoản", fr: "compte" } as LocalizationMap)
        .setDescriptionLocalizations({ "zh-TW": "選擇要查詢的帳號（預設第一個）", vi: "Chọn tài khoản cần truy vấn", fr: "Compte à utiliser (défaut: premier)" } as LocalizationMap)
        .setRequired(false)
        .setAutocomplete(true)
    )
    .addStringOption((option) =>
      option
        .setName("agent2")
        .setDescription("第二位角色（選填）| Second agent (optional)")
        .setNameLocalizations({ "zh-TW": "角色2", vi: "nhânvật2", fr: "agent2" } as LocalizationMap)
        .setDescriptionLocalizations({ "zh-TW": "第二位角色（選填）", vi: "Nhân vật thứ hai (tuỳ chọn)", fr: "Deuxième agent (optionnel)" } as LocalizationMap)
        .setRequired(false)
        .setAutocomplete(true)
    )
    .addStringOption((option) =>
      option
        .setName("agent3")
        .setDescription("第三位角色（選填）| Third agent (optional)")
        .setNameLocalizations({ "zh-TW": "角色3", vi: "nhânvật3", fr: "agent3" } as LocalizationMap)
        .setDescriptionLocalizations({ "zh-TW": "第三位角色（選填）", vi: "Nhân vật thứ ba (tuỳ chọn)", fr: "Troisième agent (optionnel)" } as LocalizationMap)
        .setRequired(false)
        .setAutocomplete(true)
    )
    .addStringOption((option) =>
      option
        .setName("bangboo")
        .setDescription("邦布（選填）| Bangboo (optional)")
        .setNameLocalizations({ "zh-TW": "邦布", vi: "bangboo", fr: "bangboo" } as LocalizationMap)
        .setDescriptionLocalizations({ "zh-TW": "選擇邦布（選填）", vi: "Chọn Bangboo (tuỳ chọn)", fr: "Bangboo (optionnel)" } as LocalizationMap)
        .setRequired(false)
        .setAutocomplete(true)
    )
    ,

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
    const paintingMode: boolean = (await db.get(`${interaction.user.id}.paintingMode`)) ?? false;
    const rankDependentPainting: boolean = (await db.get(`${interaction.user.id}.rankPainting`)) ?? false;

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
    handleTeamDraw(interaction, tr, zzz, agentIds, bangbooId, paintingMode, rankDependentPainting);
  },
};
