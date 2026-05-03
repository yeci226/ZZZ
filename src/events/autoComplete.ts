import { client } from "../index.js";
import { Events, AutocompleteInteraction } from "discord.js";
import { drainPendingLogins } from "../utilities/webhookLogin.js";
import { ZenlessZoneZero } from "@yeci226/hoyoapi";
import { getUserCookie, getUserUid, getUserLang } from "../utilities/utilities.js";
// Use client.db directly

const langMap: Record<string, string> = {
  "zh-TW": "zh-tw",
  "zh-CN": "zh-cn",
  "vi": "vi-vn",
  "fr": "fr-fr",
  "ja": "ja-jp",
  "ko": "ko-kr",
};

async function resolveZzzClient(
  interaction: AutocompleteInteraction,
  userId: string,
): Promise<ZenlessZoneZero | null> {
  const accountIndexRaw = interaction.options.getString("account");
  const accountIndex = accountIndexRaw ? parseInt(accountIndexRaw) : 0;
  const [cookie, uid] = await Promise.all([
    getUserCookie(userId, accountIndex),
    getUserUid(userId, accountIndex),
  ]);
  if (!cookie || !uid) return null;
  const userLang = await getUserLang(userId);
  const lang = langMap[userLang ?? ""] ?? langMap[(interaction as any).locale ?? ""] ?? "en-us";
  return new ZenlessZoneZero({ cookie, lang, uid } as any);
}

client.on(Events.InteractionCreate, async (interaction: any) => {
  if (!interaction.isAutocomplete()) return;
  const autocompleteInteraction = interaction as AutocompleteInteraction;
  const focusedOption = autocompleteInteraction.options.getFocused(true);
  const { name: optionName } = focusedOption;

  if (optionName == "account") {
    // Drain any pending web-logins so newly bound accounts appear immediately.
    try { await drainPendingLogins(interaction.user.id); } catch {}

    const userAccounts: any[] =
      (await client.db.get(`${interaction.user.id}.account`)) || [];
    if (!userAccounts) return;

    const choices = [];
    for (const account of userAccounts) {
      choices.push({
        name: `${account.uid} ${account.nickname ? `- ${account.nickname}` : ""}`,
        value: `${userAccounts.indexOf(account)}`,
      });
    }

    await autocompleteInteraction.respond(choices);
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

      const choices = characters
        .filter((c: any) => !alreadySelected.includes(String(c.id)))
        .map((c: any) => ({
          name: `${(c as any).name_mi18n ?? c.name} Lv.${c.level}`,
          value: String(c.id),
        }))
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
      const choices = buddyList
        .map((b: any) => ({
          name: `${b.name} Lv.${b.level ?? "?"}`,
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
