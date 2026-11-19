import { client } from "../index.js";
import { discLeaderboardChoices } from "../utilities/zzz/discLeaderboard.js";
import { simulationBannerChoices } from "../utilities/zzz/gachaSimulationCatalog.js";
import { Events, AutocompleteInteraction } from "discord.js";
import { drainPendingLogins } from "../utilities/webhookLogin.js";
import { drainPendingLoginsBounded } from "../utilities/shared/interactionPreflight.js";
import { createZzzClient, getZzzClientLanguage } from "../utilities/zzz/clientFactory.js";
import type { ZenlessZoneZero } from "@yeci226/hoyoapi";
import { getRedeemCodes, getUserLang } from "../utilities/utilities.js";
import { inspectAccountAccess } from "../utilities/accountAccess.js";
import { getLegacyAccounts } from "../utilities/accountStore.js";
import {
  formatZzzLiveScheduleChoice,
  getLiveScheduleChoices,
  getZzzScheduleAutocompleteChoices,
} from "../utilities/zzz/recordCache.js";
// Use client.db directly

const elementLabels: Record<number, string> = {
  200: "物理", 201: "火", 202: "冰", 203: "電", 204: "風", 205: "以太", 300: "流明",
};

const professionLabels: Record<number, string> = {
  1: "強攻", 2: "擊破", 3: "異常", 4: "支援", 5: "防禦", 6: "毀滅",
};

const LIVE_SCHEDULE_CACHE_TTL = 30_000;
const liveScheduleCache = new Map<
  string,
  { expiresAt: number; choices: Array<{ name: string; value: string }> }
>();

async function loadLiveScheduleChoices(
  interaction: AutocompleteInteraction,
  kind: "deadly" | "shiyu",
  targetUserId: string,
  locale: string,
): Promise<Array<{ name: string; value: string }>> {
  const accountIndex = parseInt(
    interaction.options.getString("account") || "0",
  );
  const key = `${kind}:${targetUserId}:${accountIndex}:${locale}`;
  const cached = liveScheduleCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.choices;

  const zzz = await resolveZzzClient(interaction, targetUserId, locale);
  if (!zzz) return [];
  const schedules = await Promise.all(
    [1, 2].map(async (schedule) => {
      try {
        const data =
          kind === "deadly"
            ? await zzz.record.deadlyAssault(schedule as any)
            : await zzz.record.hadalInfo(schedule as any);
        return formatZzzLiveScheduleChoice(kind, schedule, locale, data);
      } catch {
        return null;
      }
    }),
  );
  const choices = schedules.filter(
    (choice): choice is { name: string; value: string } => choice !== null,
  );
  liveScheduleCache.set(key, {
    expiresAt: Date.now() + LIVE_SCHEDULE_CACHE_TTL,
    choices,
  });
  return choices;
}

async function resolveZzzClient(
  interaction: AutocompleteInteraction,
  userId: string,
  localeOverride?: string,
): Promise<ZenlessZoneZero | null> {
  const accountIndexRaw = interaction.options.getString("account");
  const accountIndex = accountIndexRaw ? parseInt(accountIndexRaw) : 0;
  const access = await inspectAccountAccess(client.db, { ownerId: userId, accountIndex });
  if (access.status !== "ready") return null;
  const { cookie, uid } = access.account!;
  const userLang = localeOverride ?? (await getUserLang(userId));
  const lang = getZzzClientLanguage(userLang ?? (interaction as any).locale);
  return createZzzClient({ cookie, lang, uid } as any);
}

// Agent / bangboo autocomplete fires on every keystroke; HoYoLAB only needs to be asked
// once per (user, account) every few minutes. In-flight requests are shared too.
const RECORD_CACHE_TTL = 5 * 60_000;
const RECORD_CACHE_MAX = 500;
const recordCache = new Map<string, { expiresAt: number; data: Promise<any> }>();

async function cachedZzzRecord(
  interaction: AutocompleteInteraction,
  userId: string,
  kind: "characters" | "records",
): Promise<any | null> {
  const accountIndex = parseInt(interaction.options.getString("account") || "0");
  const key = `${kind}:${userId}:${accountIndex}`;
  const now = Date.now();
  const hit = recordCache.get(key);
  if (hit && hit.expiresAt > now) return hit.data;
  recordCache.delete(key);

  const data = (async () => {
    const zzz = await resolveZzzClient(interaction, userId);
    if (!zzz) return null;
    return kind === "characters" ? await zzz.record.characters() : await zzz.record.records();
  })();
  recordCache.set(key, { expiresAt: now + RECORD_CACHE_TTL, data });
  // Never keep failures or "no account" results; let the next keystroke retry.
  const forget = () => { if (recordCache.get(key)?.data === data) recordCache.delete(key); };
  data.then((value) => { if (value == null) forget(); }, forget);
  while (recordCache.size > RECORD_CACHE_MAX) {
    const oldest = recordCache.keys().next().value;
    if (oldest === undefined) break;
    recordCache.delete(oldest);
  }
  return data;
}

client.on(Events.InteractionCreate, async (interaction: any) => {
  if (!interaction.isAutocomplete()) return;
  const autocompleteInteraction = interaction as AutocompleteInteraction;
  const focusedOption = autocompleteInteraction.options.getFocused(true);
  const { name: optionName, value: focusedValue } = focusedOption;

  if (autocompleteInteraction.commandName === "leaderboard") {
    const locale = await client.db.get(`${interaction.user.id}.locale`) || interaction.locale;
    await autocompleteInteraction.respond(discLeaderboardChoices(String(focusedValue), locale)).catch(() => {});
    return;
  }

  if (["gacha-simulate", "gacha-simulation-settings", "gacha-simulation-details"].includes(autocompleteInteraction.commandName) && optionName === "banner") {
    try { await autocompleteInteraction.respond(simulationBannerChoices(String(focusedValue))); }
    catch { await autocompleteInteraction.respond([]).catch(() => {}); }
    return;
  }

  if (
    optionName === "schedule" &&
    (autocompleteInteraction.commandName === "deadlyassault" ||
      autocompleteInteraction.commandName === "shiyudefense")
  ) {
    try {
      const kind = autocompleteInteraction.commandName === "deadlyassault" ? "deadly" : "shiyu";
      const targetUserId =
        (autocompleteInteraction.options as any).getUser?.("user")?.id ||
        interaction.user.id;
      const accountIndex = parseInt(
        autocompleteInteraction.options.getString("account") || "0",
      );
      const locale = (await getUserLang(interaction.user.id)) || "en";
      const liveChoices = await loadLiveScheduleChoices(
        autocompleteInteraction,
        kind,
        targetUserId,
        locale,
      );
      const liveValues = new Set(liveChoices.map((choice) => choice.value));
      const fallbackChoices = getLiveScheduleChoices(kind, locale).filter(
        (choice) => !liveValues.has(choice.value),
      );
      const historyChoices = await getZzzScheduleAutocompleteChoices(
        client.db as any,
        kind,
        targetUserId,
        accountIndex,
        locale,
        "",
      );
      const query = String(focusedValue || "").toLowerCase();
      const choices = [...liveChoices, ...fallbackChoices, ...historyChoices]
        .filter(
          (choice) =>
            !query ||
            choice.name.toLowerCase().includes(query) ||
            choice.value.toLowerCase().includes(query),
        )
        .slice(0, 25);
      await autocompleteInteraction.respond(choices);
    } catch (err) {
      console.error(`[autoComplete/${optionName}] Error:`, err);
      await autocompleteInteraction.respond([]);
    }
    return;
  }

  if (optionName === "code" && autocompleteInteraction.commandName === "codes") {
    // Known codes only come from the cached code list; a free-typed code is still accepted by Discord.
    let choices: Array<{ name: string; value: string }> = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const query = String(focusedValue || "").trim().toLowerCase();
      // Autocomplete must answer within ~3s; do not wait for a slow code-list refresh.
      const codes: any[] = await Promise.race([
        getRedeemCodes(),
        new Promise<any[]>((resolve) => { timer = setTimeout(() => resolve([]), 2000); }),
      ]);
      choices = codes
        .filter((item: any) => typeof item?.code === "string" && (!query || item.code.toLowerCase().includes(query)))
        .map((item: any) => {
          const rewards = (Array.isArray(item.rewards) ? item.rewards : [item.rewards])
            .filter((reward: any) => typeof reward === "string" && reward.trim())
            .join(", ");
          return {
            name: (rewards ? `${item.code} - ${rewards}` : item.code).slice(0, 100),
            value: String(item.code).slice(0, 100),
          };
        })
        .slice(0, 25);
    } catch (err) {
      console.error(`[autoComplete/${optionName}] Error:`, err);
    } finally {
      if (timer) clearTimeout(timer);
    }
    try { await autocompleteInteraction.respond(choices); } catch {}
    return;
  }

  if (optionName == "account") {
    // Drain any pending web-logins so newly bound accounts appear immediately.
    // Bounded so a slow queue cannot make the autocomplete miss its 3s window.
    await drainPendingLoginsBounded(() => drainPendingLogins(interaction.user.id));

    const supportsTargetUser = ["signal", "banner", "note", "mysterymaze"].includes(autocompleteInteraction.commandName);
    const targetUserId = supportsTargetUser
      ? ((autocompleteInteraction.options as any).getUser?.("user")?.id || interaction.user.id)
      : interaction.user.id;
    const userAccounts = await getLegacyAccounts(client.db as any, targetUserId);

    const choices: Array<{ name: string; value: string }> = [];
    for (const account of userAccounts) {
      choices.push({
        name: `${account.uid} ${account.nickname ? `- ${account.nickname}` : ""}`,
        value: `${userAccounts.indexOf(account)}`,
      });
    }
    if (autocompleteInteraction.commandName === "signal") {
      const { getGachaArchiveStore } = await import("../utilities/zzz/gachaArchive.js");
      const linked = new Set(userAccounts.map((account) => String(account.uid)));
      for (const account of getGachaArchiveStore().listAccounts(targetUserId)) {
        if (linked.has(account.uid)) continue;
        choices.push({ name: `${account.uid} - 已匯入紀錄`, value: `archive:${account.uid}` });
      }
    }
    const query = String(focusedValue || "").toLowerCase();
    try {
      await autocompleteInteraction.respond(choices.filter((choice) =>
        !query || choice.name.toLowerCase().includes(query) || choice.value.toLowerCase().includes(query)).slice(0, 25));
    } catch {}
  }

  if (optionName === "agent1" || optionName === "agent2" || optionName === "agent3") {
    try {
      const userId = interaction.user.id;
      const characters = await cachedZzzRecord(autocompleteInteraction, userId, "characters");
      if (!characters) {
        await autocompleteInteraction.respond([]);
        return;
      }

      // Exclude already-selected agents
      const otherAgentFields = ["agent1", "agent2", "agent3"].filter((f) => f !== optionName);
      const alreadySelected = otherAgentFields
        .map((f) => autocompleteInteraction.options.getString(f))
        .filter(Boolean) as string[];

      const query = (focusedValue as string).toLowerCase();

      const choices = characters
        .filter((c: any) => !alreadySelected.includes(String(c.id)))
        .filter((c: any) => {
          if (!query) return true;
          const name: string = ((c as any).name_mi18n ?? c.name ?? "").toLowerCase();
          return name.includes(query);
        })
        .map((c: any) => {
          const name: string = (c as any).name_mi18n ?? c.name ?? "";
          const level: number = c.level ?? 0;
          const rank: number = c.rank ?? 0;
          const elem: string = elementLabels[(c as any).element_type as number] ?? "";
          const prof: string = professionLabels[(c as any).avatar_profession as number] ?? "";
          // Format: 名字  Lv.60  M6  火  強攻
          const label = [name, `Lv.${level}`, `M${rank}`, elem, prof]
            .filter(Boolean)
            .join("  ");
          return { name: label.slice(0, 100), value: String(c.id) };
        })
        .slice(0, 25);

      await autocompleteInteraction.respond(choices);
    } catch (err) {
      console.error(`[autoComplete/${optionName}] Error:`, err);
      await autocompleteInteraction.respond([]);
    }
    return;
  }

  if (optionName === "bangboo") {
    try {
      const userId = interaction.user.id;
      const record = await cachedZzzRecord(autocompleteInteraction, userId, "records");
      if (!record) {
        await autocompleteInteraction.respond([]);
        return;
      }

      const buddyList: any[] = (record as any).buddy_list ?? [];
      const query = (focusedValue as string).toLowerCase();
      const choices = buddyList
        .filter((b: any) => {
          if (!query) return true;
          return (b.name ?? "").toLowerCase().includes(query);
        })
        .map((b: any) => ({
          name: `${b.name}  Lv.${b.level ?? "?"}`,
          value: String(b.id),
        }))
        .slice(0, 25);

      await autocompleteInteraction.respond(choices);
    } catch (err) {
      console.error(`[autoComplete/${optionName}] Error:`, err);
      await autocompleteInteraction.respond([]);
    }
    return;
  }
});
