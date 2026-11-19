import { randomBytes } from "node:crypto";
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  escapeMarkdown,
  type ButtonInteraction,
} from "discord.js";
import {
  ANALYTICS_URL,
  analyticsSource,
  matchReferenceRuns,
  type ReferenceSnapshot,
} from "./analyticsSource.js";

type Character = {
  id: string | number;
  name?: string;
  name_mi18n?: string;
  rank?: number;
};
type ReferenceSession = {
  userId: string;
  locale: string;
  selected: string[];
  roster?: { id: string; name: string; rank?: number }[];
  expires: number;
  snapshot?: ReferenceSnapshot;
};
const sessions = new Map<string, ReferenceSession>();
const TTL = 30 * 60_000;
const chinese = (locale: string) => /^(tw|cn|zh)/i.test(locale);
const say = (locale: string, zh: string, en: string) =>
  chinese(locale) ? zh : en;
const safe = (value: string) =>
  escapeMarkdown(value.replace(/@/g, "＠").replace(/[\r\n]/g, " "));

/** Keep only the already-authorized profile's character IDs/names/ranks. */
export function buildAnalyticsEntry(
  userId: string,
  locale: string,
  selected: Character[],
  roster?: Character[],
) {
  for (const [key, session] of sessions)
    if (session.expires <= Date.now()) sessions.delete(key);
  while (sessions.size >= 2000) sessions.delete(sessions.keys().next().value!);
  const token = randomBytes(12).toString("hex");
  const session: ReferenceSession = {
    userId,
    locale,
    selected: selected.map((c) => String(c.id)),
    roster: roster?.map((c) => ({
      id: String(c.id),
      name: String(c.name_mi18n ?? c.name ?? c.id),
      rank: Number.isInteger(c.rank) ? c.rank : undefined,
    })),
    expires: Date.now() + TTL,
  };
  sessions.set(token, session);
  const owned = selected.length === 0 && roster ? "owned" : "all";
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`zref:${token}:open:teams:${owned}:0`)
      .setLabel(
        say(
          locale,
          selected.length ? "參考隊伍" : "依持有角色找隊伍",
          selected.length ? "Reference teams" : "Teams for this roster",
        ),
      )
      .setStyle(ButtonStyle.Secondary),
  );
  if (selected.length)
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`zref:${token}:open:gear:all:0`)
        .setLabel(say(locale, "參考配裝", "Reference builds"))
        .setStyle(ButtonStyle.Secondary),
    );
  return [row];
}

export async function handleAnalyticsReference(interaction: ButtonInteraction) {
  const match =
    /^zref:([a-f0-9]{24}):(open|view|export):(teams|gear|damage):(all|owned):(\d{1,6})$/.exec(
      interaction.customId,
    );
  const session = match ? sessions.get(match[1]) : undefined;
  const locale = session?.locale ?? interaction.locale;
  if (!match || !session || session.expires <= Date.now()) {
    await interaction.reply({
      content: say(
        locale,
        "參考資料入口已過期，請重新開啟 /profile。",
        "This reference session expired. Open /profile again.",
      ),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (session.userId !== interaction.user.id) {
    await interaction.reply({
      content: say(
        locale,
        "請使用自己的 /profile 開啟參考資料。",
        "Open references from your own /profile command.",
      ),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const [, token, action, mode, filter, rawPage] = match;
  if (filter === "owned" && !session.roster) {
    await interaction.reply({
      content: say(
        locale,
        "請從 /profile 主頁開啟持有角色篩選。",
        "Open the roster filter from /profile.",
      ),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (action === "view") await interaction.deferUpdate();
  else await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    session.snapshot ??= await analyticsSource.get();
    const snapshot = session.snapshot;
    const runs = matchReferenceRuns(
      snapshot.runs,
      session.selected,
      filter === "owned" ? session.roster!.map((c) => c.id) : undefined,
    );
    const page = Math.min(Number(rawPage), Math.max(0, runs.length - 1));
    const run = runs[page];
    const control = (
      label: string,
      nextMode = mode,
      nextFilter = filter,
      nextPage = page,
    ) =>
      new ButtonBuilder()
        .setCustomId(`zref:${token}:view:${nextMode}:${nextFilter}:${nextPage}`)
        .setLabel(label)
        .setStyle(ButtonStyle.Secondary);
    const tabs = new ActionRowBuilder<ButtonBuilder>().addComponents(
      control(say(locale, "隊伍", "Team"), "teams").setDisabled(
        mode === "teams",
      ),
      control(say(locale, "配裝", "Builds"), "gear").setDisabled(
        mode === "gear",
      ),
      control(say(locale, "傷害分析", "Damage"), "damage").setDisabled(
        mode === "damage",
      ),
    );
    if (session.roster)
      tabs.addComponents(
        control(
          say(
            locale,
            filter === "owned" ? "查看全部隊伍" : "只看持有角色",
            filter === "owned" ? "All teams" : "Owned agents only",
          ),
          mode,
          filter === "owned" ? "all" : "owned",
          0,
        ),
      );
    const embed = new EmbedBuilder()
      .setColor(0x68d4ba)
      .setTitle(
        say(
          locale,
          "外部測試紀錄 · ZZZ Analytics",
          "External test record · ZZZ Analytics",
        ),
      )
      .setURL(ANALYTICS_URL);
    const disclaimer = say(
      locale,
      "來源使用中性訓練測試環境；已排除有 Beta 標記及待改善的紀錄。未標記不代表已驗證為正式服。DPS 為來源紀錄，不是此帳號的傷害預測。",
      "Source uses a neutral training test environment. Beta-tagged and needs-improvement records are excluded; untagged does not mean verified live-server data. DPS belongs to the source run, not this account.",
    );
    embed.setFooter({
      text: say(
        locale,
        `擷取 ${new Date(snapshot.fetchedAt).toISOString()}${snapshot.stale ? " · 使用快取" : ""} · 配裝名稱沿用來源`,
        `Fetched ${new Date(snapshot.fetchedAt).toISOString()}${snapshot.stale ? " · cached" : ""} · Source gear names`,
      ),
    });
    const components = [tabs];
    if (!run) {
      embed.setDescription(
        say(
          locale,
          "目前沒有符合角色條件的參考紀錄。\n\n",
          "No reference records match these agents.\n\n",
        ) + disclaimer,
      );
    } else {
      const name = (id: string, fallback: string) =>
        safe(session.roster?.find((c) => c.id === id)?.name ?? fallback);
      embed.setDescription(
        `**${run.actors.map((a) => name(a.id, a.name)).join(" / ")}**\n${say(locale, "來源 DPS", "Source DPS")}: **${Math.round(run.dps).toLocaleString("en-US")}** · ${run.duration}s\n${safe(run.date)} · ${page + 1}/${runs.length}\n\n${disclaimer}`,
      );
      if (mode === "gear") {
        for (const actor of run.actors) {
          const e = actor.equipment;
          const stats = Object.entries(actor.substats)
            .map(([key, value]) => `${safe(key)}: ${value}`)
            .join(" · ");
          embed.addFields({
            name: name(actor.id, actor.name),
            value:
              `${safe(e.mindscape || "?")} · ${safe(e.w_engine || "?")} ${safe(e.phase || "?")}\n4pc: ${safe(e.disc_4pc || "?")} / 2pc: ${safe(e.disc_2pc || "?")}\n4 / 5 / 6: ${[e.slot4, e.slot5, e.slot6].map((v) => safe(v || "?")).join(" / ")}\n${say(locale, "副詞條（來源值）", "Substats (source values)")}: ${stats || "—"}`.slice(
                0,
                1024,
              ),
          });
        }
      } else if (mode === "damage") {
        embed.addFields({
          name: say(locale, "角色傷害占比", "Agent damage share"),
          value: run.actors
            .map(
              (a) =>
                `${name(a.id, a.name)}: ${Math.round(a.damage).toLocaleString("en-US")} (${run.damage > 0 ? ((a.damage / run.damage) * 100).toFixed(1) : "0"}%)`,
            )
            .join("\n"),
        });
        embed.addFields({
          name: say(
            locale,
            "主要招式（來源彙總，非逐擊時間軸）",
            "Top skills (source aggregates, not a hit timeline)",
          ),
          value:
            run.events
              .map(
                (e) =>
                  `${safe(e.actor)} / ${safe(e.name)}: ${Math.round(e.damage).toLocaleString("en-US")}`,
              )
              .join("\n")
              .slice(0, 1024) || "—",
        });
      } else {
        for (const actor of run.actors) {
          const owned = session.roster?.find((c) => c.id === actor.id);
          const comparison = !session.roster
            ? ""
            : !owned
              ? say(locale, " · 未持有", " · Not owned")
              : owned.rank === undefined
                ? say(locale, " · 已持有", " · Owned")
                : say(
                    locale,
                    ` · 此帳號 M${owned.rank}`,
                    ` · Account M${owned.rank}`,
                  );
          embed.addFields({
            name: name(actor.id, actor.name),
            value: `${safe(actor.equipment.mindscape || "?")}${comparison}\n${safe(actor.equipment.w_engine || "?")} ${safe(actor.equipment.phase || "?")}`,
          });
        }
        embed.addFields({
          name: say(locale, "比較條件", "Comparison conditions"),
          value: say(
            locale,
            "按來源 DPS 排序，僅篩選角色持有情況；不代表音擎、影畫、驅動盤相同，也不代表最佳配隊。",
            "Sorted by source DPS; roster filtering checks agents only. Engines, mindscapes and discs may differ. This is not a best-team ranking.",
          ),
        });
      }
      const navigation = new ActionRowBuilder<ButtonBuilder>().addComponents(
        control(
          say(locale, "上一筆", "Previous"),
          mode,
          filter,
          Math.max(0, page - 1),
        ).setDisabled(page === 0),
        control(
          say(locale, "下一筆", "Next"),
          mode,
          filter,
          page + 1,
        ).setDisabled(page >= runs.length - 1),
      );
      if (run.video)
        navigation.addComponents(
          new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setURL(run.video)
            .setLabel(say(locale, "來源影片", "Video")),
        );
      if (run.hasLog)
        navigation.addComponents(
          new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setURL(
              `${ANALYTICS_URL}/api/parse?id=${encodeURIComponent(run.id)}`,
            )
            .setLabel(say(locale, "來源戰鬥日誌", "Source combat log")),
        );
      navigation.addComponents(
        new ButtonBuilder()
          .setCustomId(`zref:${token}:export:${mode}:${filter}:${page}`)
          .setStyle(ButtonStyle.Secondary)
          .setLabel(say(locale, "匯出參考紀錄", "Export reference")),
      );
      components.push(navigation);
      if (action === "export") {
        const evidence = {
          schemaVersion: 1,
          source: `${ANALYTICS_URL}/api/runs`,
          fetchedAt: snapshot.fetchedAt,
          calibrationReady: false,
          verified: false,
          note: "External training reference only. Skill events are aggregated; not independent live-game calibration evidence.",
          run,
        };
        await interaction.editReply({
          content: say(
            locale,
            "已匯出來源參考紀錄，尚未通過本地戰鬥模型校準。",
            "Exported source reference; not calibrated against the local combat model.",
          ),
          files: [
            new AttachmentBuilder(
              Buffer.from(JSON.stringify(evidence, null, 2)),
              { name: `${run.id}.json` },
            ),
          ],
          allowedMentions: { parse: [] },
        });
        return;
      }
    }
    await interaction.editReply({
      embeds: [embed],
      components,
      allowedMentions: { parse: [] },
    });
  } catch {
    const content = say(
      locale,
      "暫時無法取得外部參考資料，請稍後重試。",
      "External reference data is temporarily unavailable. Try again later.",
    );
    if (action === "view")
      await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
    else await interaction.editReply({ content });
  }
}
