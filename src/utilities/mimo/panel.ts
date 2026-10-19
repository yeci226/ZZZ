import { settingGuidance } from "../settings/guidance.js";
import { ChannelType, type Client } from "discord.js";
import { getHoyolabs } from "../accountStore.js";
import { blockExpiredAccount } from "../accountAccess.js";
import { validateNotificationChannelForUser } from "../core/notificationValidation.js";
import { openSettingPanel, panelMessage, settingEntry, settingFooter, settingRow, settingButton, settingSelect, settingId, type SettingSession, type SettingInteraction } from "../settings/panel.js";
import { uiLocale, uiText, renderSettingsPreview } from "../settings/presentation.js";
import { rewardName, rewardNames, rewardIcon } from "./rewards.js";
import { defaultMimoConfig, type MimoConfig } from "./store.js";
import { getMimoStore, mimoAccount } from "./runtime.js";
import { MimoApi, type MimoOffer } from "./api.js";
import { buildZZZRedeemCards } from "../canvas/redeemCard.js";
import type { SettingNavigation } from "../settings/panel.js";
const groups: Record<string, (keyof MimoConfig)[]> = { rewards: ["order"], priority: ["order"], notification: ["notifyType", "channelId", "guildId", "tag"] };
export async function openMimoSettings(client: Client, interaction: SettingInteraction, db: any, onBack?: (interaction: SettingInteraction) => Promise<void>, options: SettingNavigation & { ltuid?: string; initialPage?: "home" | "account" } = {}) {
  if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ flags: 64 });
  const store = getMimoStore(db), owner = interaction.user.id;
  const loadAccounts = async () => (await getHoyolabs(db, owner)).flatMap(h => h.characters.map(c => ({ ltuid: h.ltuid_v2, uid: c.uid, nickname: c.nickname || h.hoyolabName || c.uid, icon: h.hoyolabIcon, valid: !h.invalid && !c.invalid && !!h.cookie })));
  const available = async () => (await loadAccounts()).filter(a => (!options.ltuid || a.ltuid === options.ltuid) && (!store.get(a.ltuid) || store.get(a.ltuid)?.owner === owner));
  const accounts = await available();
  if (options.ltuid && !accounts.length) throw new Error("auth");
  const first = accounts.find(a => store.get(a.ltuid)?.owner === owner) || accounts[0];
  const config = first ? store.get(first.ltuid) || defaultMimoConfig(owner, first.ltuid, first.uid) : defaultMimoConfig(owner, "", "");
  if (config.owner !== owner) { await interaction.editReply(uiText(await db.get(`${owner}.locale`), "forbidden")); return; }
  async function blocked(s: SettingSession, i: any, config = s.draft) {
    const accounts = await loadAccounts();
    const accountIndex = accounts.findIndex(a => a.uid === config.uid && a.ltuid === config.ltuid);
    return accountIndex >= 0 && blockExpiredAccount(i, db, { ownerId: owner, accountIndex, locale: s.locale });
  }
  async function loadOffers(s: SettingSession, i: any): Promise<boolean> {
    if (s.data.catalogAt && Date.now() - s.data.catalogAt < 60000 && s.data.catalogAccount === s.draft.ltuid) return true;
    if (await blocked(s, i)) return false;
    const account = await mimoAccount(db, s.draft); if (!account) throw new Error("auth");
    const api = new MimoApi(account.cookie), game = await api.game();
    s.data.offers = game ? await api.shop(game.version_id) : []; s.data.catalogAt = Date.now(); s.data.catalogAccount = s.draft.ltuid;
    return true;
  }
  await openSettingPanel(interaction, { ...options, onBack, locale: uiLocale(await db.get(`${owner}.locale`)), page: options.initialPage || "home", base: config, draft: structuredClone(config), data: { accounts, offers: [], selectedRank: config.order[0], accountPage: 0 },
    render: async s => {
      const c = s.draft as MimoConfig, t = (key: Parameters<typeof uiText>[1]) => uiText(s.locale, key), title = "Auto Mimo";
      if (s.page === "home") {
        const current = c.ltuid ? store.get(c.ltuid) || c : c;
        const a = s.data.accounts.find((a: any) => a.uid === current.uid && a.ltuid === current.ltuid);
        const png = await renderSettingsPreview(s.locale, title, current.order.map((kind, i) => ({ name: rewardName(kind, s.locale), icon: rewardIcon(kind) || (s.data.offers as MimoOffer[]).find(o => o.kind === kind)?.icon, selected: true, rank: i + 1 })));
        const state = [t(current.enabled ? "on" : "off"), `${t("points")}: ${current.points ?? "—"}`, current.lastAt ? `<t:${Math.floor(current.lastAt / 1000)}:R>` : ""].filter(Boolean).join(" · ");
        return panelMessage(s, title, `${settingGuidance(s.locale, "mimo")}\n\n${t("homeGuide")}\n\n${state}` + (current.reason ? `\n${uiText(s.locale, current.reason as any)}` : ""), [
          settingEntry(s, "account", t("account"), a ? `${a.nickname} · UID ${current.uid}` : t("notSet")),
          settingEntry(s, "rewards", t("rewards"), current.order.map(k => rewardName(k, s.locale)).join(" · ") || t("emptySelection")),
          settingEntry(s, "priority", t("priority"), current.order.map(k => rewardName(k, s.locale)).join(" → ")),
          settingEntry(s, "notification", t("notification"), current.notifyType === "channel" ? `<#${current.channelId}>` : t(current.notifyType)),
          settingRow(settingButton(s, "toggle", t(current.enabled ? "disable" : "enable"), current.enabled ? 4 : 3), settingButton(s, "history", t("history")), settingButton(s, "done", t("done"))),
        ], png);
      }
      if (s.page === "account") {
        const items = s.data.accounts.slice(s.data.accountPage * 25, s.data.accountPage * 25 + 25);
        return panelMessage(s, t("account"), `${settingGuidance(s.locale, "account")}\n\n${t("pending")}\n${t("editGuide")}`, [
          ...(items.length ? [settingSelect(s, "account-value", t("account"), items.map((a: any) => ({ label: `${a.nickname} · ${a.uid}`, value: `${a.ltuid}/${a.uid}`, default: c.ltuid === a.ltuid && c.uid === a.uid })))] : []),
          ...(s.data.accounts.length > 25 ? [settingRow(settingButton(s, "previous-account", t("previous"), 2, !s.data.accountPage), settingButton(s, "next-account", t("next"), 2, (s.data.accountPage + 1) * 25 >= s.data.accounts.length))] : []), settingFooter(s),
        ], await renderSettingsPreview(s.locale, t("account"), items.slice(0, 6).map((a: any) => ({ name: a.nickname, detail: `UID ${a.uid}`, icon: a.icon || "account", selected: c.uid === a.uid && c.ltuid === a.ltuid }))));
      }
      if (s.page === "rewards" || s.page === "priority") {
        const offers = s.data.offers as MimoOffer[];
        const kinds = [...new Set([...offers.flatMap(o => o.kind ? [o.kind] : []), ...c.order])];
        const items = s.page === "priority" ? c.order : kinds;
        const png = await renderSettingsPreview(s.locale, t(s.page), items.map(k => ({ name: rewardName(k, s.locale), icon: rewardIcon(k) || offers.find(o => o.kind === k)?.icon, selected: c.order.includes(k), rank: s.page === "priority" ? c.order.indexOf(k) + 1 : undefined, detail: offers.find(o => o.kind === k) ? `${offers.find(o => o.kind === k)!.cost} ${t("points")}` : t("unavailable") })));
        return panelMessage(s, t(s.page), `${settingGuidance(s.locale, s.page)}\n\n${t("pending")}\n${t("editGuide")}`, [
          ...(items.length ? [settingSelect(s, s.page === "rewards" ? "reward-value" : "rank-value", t(s.page), items.map(k => ({ label: rewardName(k, s.locale), value: k, default: s.page === "rewards" ? c.order.includes(k) : s.data.selectedRank === k })), s.page === "rewards")] : []),
          ...(s.page === "priority" ? [settingRow(settingButton(s, "up", t("up")), settingButton(s, "down", t("down")))] : []), settingFooter(s),
        ], png);
      }
      if (s.page === "notification") return panelMessage(s, t("notification"), `${settingGuidance(s.locale, "notification")}\n\n${t("pending")}\n${t("editGuide")}`, [
        settingSelect(s, "notify-value", t("notification"), ["off", "dm", ...(interaction.guildId ? ["channel"] : [])].map(k => ({ label: t(k as "off"), value: k, default: c.notifyType === k }))),
        ...(c.notifyType === "channel" ? [settingRow({ type: 8, custom_id: settingId(s, "channel"), placeholder: t("channel"), channel_types: [ChannelType.GuildText, ChannelType.GuildAnnouncement], min_values: 1, max_values: 1, ...(c.channelId ? { default_values: [{ id: c.channelId, type: "channel" }] } : {}) })] : []),
        ...(c.notifyType !== "off" ? [settingRow(settingButton(s, "mention", `${t("mention")}: ${t(c.tag ? "on" : "off")}`, c.tag ? 3 : 2))] : []), settingFooter(s),
      ]);
      const result = store.results(c.ltuid)[0];
      const codes = store.purchases(c.ltuid).filter(p => p.code && p.status === "pending").slice(0, 10).map(p => `${rewardName(p.offer.kind || p.offer.name, s.locale)} · UID ${p.uid}\n\`${p.code}\``).join("\n");
      const pages = result ? await buildZZZRedeemCards({ ...result.payload, locale: s.locale }).catch(() => []) : [];
      s.data.resultPages = pages.length;
      const png = pages[s.data.resultPage || 0];
      return panelMessage(s, t("history"), codes || (result ? "" : t("unavailable")), [
        ...(pages.length > 1 ? [settingRow(settingButton(s, "previous-result", t("previous"), 2, !s.data.resultPage), settingButton(s, "next-result", t("next"), 2, (s.data.resultPage || 0) + 1 >= pages.length))] : []),
        settingRow(settingButton(s, "cancel", t("done")))], png);
    },
    action: async (s, action, i) => {
      const c = s.draft as MimoConfig;
      if (action.startsWith("edit-")) {
        const group = action.slice(5); if (!["account", ...Object.keys(groups)].includes(group)) return;
        const previousPage = s.page;
        s.data.accounts = await available(); s.base = c.ltuid ? store.get(c.ltuid) || c : c; s.draft = structuredClone(s.base); s.page = group;
        if (group === "rewards" && !await loadOffers(s, i)) s.page = previousPage;
      } else if (action === "cancel") { s.draft = structuredClone(s.base); s.page = "home"; }
      else if (action === "history") { s.page = "history"; s.data.resultPage = 0; }
      else if (action === "previous-result" && s.page === "history") s.data.resultPage = Math.max(0, s.data.resultPage - 1);
      else if (action === "next-result" && s.page === "history") s.data.resultPage = Math.min(s.data.resultPages - 1, s.data.resultPage + 1);
      else if (action === "account-value" && s.page === "account" && i.isStringSelectMenu()) {
        const [ltuid, uid] = i.values[0].split("/"); const a = s.data.accounts.find((a: any) => a.ltuid === ltuid && a.uid === uid); if (!a) throw new Error("invalid");
        const chosen = store.get(ltuid) || defaultMimoConfig(owner, ltuid, uid); if (chosen.owner !== owner) throw new Error("forbidden");
        s.base = chosen; s.draft = { ...chosen, uid }; s.data.catalogAt = 0;
      } else if (action === "next-account") s.data.accountPage = Math.min(Math.ceil(s.data.accounts.length / 25) - 1, s.data.accountPage + 1);
      else if (action === "previous-account") s.data.accountPage = Math.max(0, s.data.accountPage - 1);
      else if (action === "reward-value" && i.isStringSelectMenu() && s.page === "rewards") {
        const chosen = i.values.filter((v: string) => v in rewardNames); c.order = [...c.order.filter(v => chosen.includes(v)), ...chosen.filter((v: string) => !c.order.includes(v))];
      } else if (action === "rank-value" && s.page === "priority" && i.isStringSelectMenu()) s.data.selectedRank = i.values[0];
      else if (["up", "down"].includes(action) && s.page === "priority") { const index = c.order.indexOf(s.data.selectedRank), target = index + (action === "up" ? -1 : 1); if (index >= 0 && target >= 0 && target < c.order.length) [c.order[index], c.order[target]] = [c.order[target], c.order[index]]; }
      else if (action === "notify-value" && s.page === "notification" && i.isStringSelectMenu() && ["off", "dm", "channel"].includes(i.values[0])) { c.notifyType = i.values[0]; if (c.notifyType !== "channel") { delete c.channelId; delete c.guildId; } }
      else if (action === "channel" && s.page === "notification" && i.isChannelSelectMenu()) { c.channelId = i.values[0]; c.guildId = i.guildId; }
      else if (action === "mention" && s.page === "notification") c.tag = !c.tag;
      else if (action === "toggle" && s.page === "home") {
        const current = store.get(c.ltuid) || c;
        if (!current.enabled && await blocked(s, i, current)) return;
        if (!current.enabled && (!current.order.length || !await mimoAccount(db, current))) { s.page = "account"; s.notice = uiText(s.locale, "auth"); return; }
        s.draft = store.save({ ...current, enabled: !current.enabled, nextAt: 0, reason: undefined }, ["enabled", "nextAt", "reason"], current); s.base = structuredClone(s.draft);
      } else if (action === "save") {
        const accounts = await available();
        if (!c.ltuid || !c.uid || !c.order.length || !accounts.some(a => a.ltuid === c.ltuid && a.uid === c.uid)) throw new Error("invalid");
        if (s.page === "notification" && c.notifyType === "channel") {
          const channel = await i.guild?.channels.fetch(c.channelId), bot = await i.guild?.members.fetchMe(), member = await i.guild?.members.fetch(i.user.id);
          if (!channel || channel.guildId !== c.guildId || !bot || !member || !validateNotificationChannelForUser(channel, member, bot).ok) throw new Error("invalid");
        }
        const fields = s.page === "account" ? ["uid"] as (keyof MimoConfig)[] : groups[s.page]; if (!fields) return;
        s.draft = store.save(c, fields, s.base); s.base = structuredClone(s.draft); s.page = "home"; s.notice = uiText(s.locale, "saved");
      }
    },
  });
  void client;
}
