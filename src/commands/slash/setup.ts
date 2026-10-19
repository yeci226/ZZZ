import {
  SlashCommandBuilder,
  type Client,
  type ChatInputCommandInteraction,
} from "discord.js";
import { openQuickSetup } from "../../utilities/settings/quickSetup.js";

export default {
  data: new SlashCommandBuilder()
    .setName("setup")
    .setNameLocalizations({ "zh-TW": "快速設定", "zh-CN": "快速设置" })
    .setDescription(
      "Quickly enable automatic check-in, redemption, Mimo and reminders",
    )
    .setDescriptionLocalizations({
      "zh-TW": "快速開啟自動簽到、兌換、Mimo 與遊戲提醒",
      "zh-CN": "快速开启自动签到、兑换、Mimo 与游戏提醒",
      ja: "自動チェックイン・コード交換・Mimo・通知をかんたん設定",
      ko: "자동 출석, 코드 교환, Mimo 및 알림 빠른 설정",
      fr: "Configurer rapidement connexion, codes, Mimo et rappels",
      vi: "Thiết lập nhanh điểm danh, đổi mã, Mimo và nhắc nhở",
    }),
  async execute(
    client: Client,
    interaction: ChatInputCommandInteraction,
    _args: unknown[],
    _tr: unknown,
    db: any,
  ) {
    await openQuickSetup(client, interaction, db);
  },
};
