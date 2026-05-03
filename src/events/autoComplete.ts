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
      const accountIndexRaw = autocompleteInteraction.options.getString("account");
      const accountIndex = accountIndexRaw ? parseInt(accountIndexRaw) : 0;

      const [cookie, uid] = await Promise.all([
        getUserCookie(userId, accountIndex),
        getUserUid(userId, accountIndex),
      ]);
      if (!cookie || !uid) {
        await autocompleteInteraction.respond([]);
        return;
      }

      const userLang = await getUserLang(userId);
      const lang = langMap[userLang ?? ""] ?? langMap[interaction.locale ?? ""] ?? "en-us";

      const zzz = new ZenlessZoneZero({ cookie, lang, uid } as any);
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
    } catch {
      await autocompleteInteraction.respond([]);
    }
    return;
  }

  if (optionName === "bangboo") {
    try {
      const userId = interaction.user.id;
      const accountIndexRaw = autocompleteInteraction.options.getString("account");
      const accountIndex = accountIndexRaw ? parseInt(accountIndexRaw) : 0;

      const [cookie, uid] = await Promise.all([
        getUserCookie(userId, accountIndex),
        getUserUid(userId, accountIndex),
      ]);
      if (!cookie || !uid) {
        await autocompleteInteraction.respond([]);
        return;
      }

      const userLang = await getUserLang(userId);
      const lang = langMap[userLang ?? ""] ?? langMap[interaction.locale ?? ""] ?? "en-us";

      const zzz = new ZenlessZoneZero({ cookie, lang, uid } as any);
      const record = await zzz.record.records();

      const choices = ((record as any).buddy_list as any[])
        .map((b: any) => ({
          name: `${b.name} Lv.${b.level ?? "?"}`,
          value: String(b.id),
        }))
        .slice(0, 25);

      await autocompleteInteraction.respond(choices);
    } catch {
      await autocompleteInteraction.respond([]);
    }
    return;
  }
});
