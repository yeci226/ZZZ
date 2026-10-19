import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Client,
} from "discord.js";
import type { QuickDB } from "quick.db";
import { getNewsRuntime } from "../../../utilities/news/runtime.js";

export default {
  data: new SlashCommandBuilder()
    .setName("news")
    .setDescription(
      "Subscribe to official news and game updates, or browse recent articles",
    )
    .setNameLocalizations({
      "zh-TW": "新聞",
      "zh-CN": "新闻",
      ja: "ニュース",
      ko: "뉴스",
      fr: "actualités",
      vi: "tintức",
    })
    .setDescriptionLocalizations({
      "zh-TW": "設定官方新聞、遊戲更新通知，或瀏覽最新消息",
      "zh-CN": "设置官方新闻、游戏更新通知，或浏览最新消息",
      ja: "公式ニュース・ゲーム更新の通知設定と最新記事の閲覧",
      ko: "공식 소식 및 게임 업데이트 알림 설정과 최신 글 보기",
      fr: "Configurer les notifications officielles et consulter les actualités",
      vi: "Cài đặt thông báo tin chính thức, cập nhật trò chơi và xem tin mới",
    }),
  async execute(
    client: Client,
    interaction: ChatInputCommandInteraction,
    _args: unknown[],
    _tr: unknown,
    db: QuickDB,
  ) {
    await getNewsRuntime(client, "zzz").wizard.open(
      interaction,
      await db.get(`${interaction.user.id}.locale`),
    );
  },
};
