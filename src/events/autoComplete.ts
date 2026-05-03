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

const elementLabels: Record<number, string> = {
  200: "物理", 201: "火", 202: "冰", 203: "電", 205: "以太",
};

const professionLabels: Record<number, string> = {
  1: "強攻", 2: "擊破", 3: "異常", 4: "支援", 5: "防禦", 6: "毀滅",
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
  const { name: optionName, value: focusedValue } = focusedOption;

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
