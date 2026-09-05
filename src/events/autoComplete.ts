import { client } from "../index.js";
import { Events, AutocompleteInteraction } from "discord.js";
import { drainPendingLogins } from "../utilities/webhookLogin.js";
import { createZzzClient, getZzzClientLanguage } from "../utilities/zzz/clientFactory.js";
import type { ZenlessZoneZero } from "@yeci226/hoyoapi";
import { getUserCookie, getUserUid, getUserLang } from "../utilities/utilities.js";
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
  const [cookie, uid] = await Promise.all([
    getUserCookie(userId, accountIndex),
    getUserUid(userId, accountIndex),
  ]);
  if (!cookie || !uid) return null;
  const userLang = localeOverride ?? (await getUserLang(userId));
  const lang = getZzzClientLanguage(userLang ?? (interaction as any).locale);
  return createZzzClient({ cookie, lang, uid } as any);
}

client.on(Events.InteractionCreate, async (interaction: any) => {
  if (!interaction.isAutocomplete()) return;
  const autocompleteInteraction = interaction as AutocompleteInteraction;
  const focusedOption = autocompleteInteraction.options.getFocused(true);
  const { name: optionName, value: focusedValue } = focusedOption;

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

  if (optionName == "account") {
    // Drain any pending web-logins so newly bound accounts appear immediately.
    try { await drainPendingLogins(interaction.user.id); } catch {}

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
      const source = autocompleteInteraction.options.getString("source") || "official";
      const { getGachaArchiveStore } = await import("../utilities/zzz/gachaArchive.js");
      const linked = new Set(userAccounts.map((account) => String(account.uid)));
      for (const account of getGachaArchiveStore().listAccounts(targetUserId)) {
        if (account.source !== source || linked.has(account.uid)) continue;
        choices.push({ name: `${account.uid} - ${source === "manual" ? "手動匯入封存" : "官方封存"}`, value: `archive:${account.uid}` });
      }
    }
    const query = String(focusedValue || "").toLowerCase();
    await autocompleteInteraction.respond(choices.filter((choice) =>
      !query || choice.name.toLowerCase().includes(query) || choice.value.toLowerCase().includes(query)).slice(0, 25));
  }

  if (optionName === "agent1" || optionName === "agent2" || optionName === "agent3") {
    try {
      const userId = interaction.user.id;
      const zzz = await resolveZzzClient(autocompleteInteraction, userId);
      if (!zzz) {
        await autocompleteInteraction.respond([]);
        return;
      }

      const characters = await zzz.record.characters();

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
      const zzz = await resolveZzzClient(autocompleteInteraction, userId);
      if (!zzz) {
        await autocompleteInteraction.respond([]);
        return;
      }

      const record = await zzz.record.records();

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
