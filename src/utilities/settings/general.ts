import { MessageFlags, type Client } from "discord.js";
import { createTranslator } from "../core/i18n.js";
import { buildSettingsComponents } from "../../commands/slash/settings.js";
import { automationText } from "./automationCopy.js";
import { uiLocale, uiText } from "./presentation.js";
import { setupText } from "./setupCopy.js";
import {
  closeSettingPanel,
  openSettingPanel,
  settingButton,
  type SettingInteraction,
} from "./panel.js";

/** Keep the original settings layout and controls; append only the new shortcuts. */
export async function openGeneralSettings(
  client: Client,
  interaction: SettingInteraction,
  db: any,
  archivePage = 0,
) {
  const locale = uiLocale(await db.get(`${interaction.user.id}.locale`));
  await openSettingPanel(interaction, {
    locale, page: "home", base: {}, draft: {}, data: {},
    render: async s => {
      const { container } = await buildSettingsComponents(
        s.owner, createTranslator(s.locale), db, archivePage,
      );
      const json = container.toJSON();
      const featureRows = (["daily", "redeem", "mimo", "reminder"] as const).map(feature => ({
        type: 9,
        components: [{
          type: 10,
          content: `**${automationText(s.locale, feature)}**\n${automationText(s.locale, `${feature}Desc`)}`,
        }],
        accessory: settingButton(s, `open-${feature}`, uiText(s.locale, "settings")),
      }));
      const count = (component: any): number => 1 + (component.components ?? []).reduce((n: number, child: any) => n + count(child), 0) + (component.accessory ? count(component.accessory) : 0);
      // Extra archive pages plus the ranking setting can reach Discord's 40-component limit.
      // Keep every shortcut and description, grouping them only when the full layout would overflow.
      const setupRow = { type: 1, components: [settingButton(s, "open-setup", setupText(s.locale, "title"), 3)] };
      const shortcuts = count(json) + count(setupRow) + featureRows.reduce((n, row) => n + count(row), 0) <= 40 ? featureRows : [
        { type: 10, content: featureRows.map(row => row.components[0].content).join("\n\n") },
        { type: 1, components: (["daily", "redeem", "mimo", "reminder"] as const).map(feature => settingButton(s, `open-${feature}`, automationText(s.locale, feature))) },
      ];
      return {
        flags: MessageFlags.IsComponentsV2,
        components: [{ ...json, components: [json.components[0], setupRow, ...json.components.slice(1), ...shortcuts] }], attachments: [], files: [], allowedMentions: { parse: [] },
      };
    },
    action: async (s, action, i) => {
      const onBack = (next: SettingInteraction) => openGeneralSettings(client, next, db);
      if (action === "open-setup") {
        const { openQuickSetup } = await import("./quickSetup.js");
        await openQuickSetup(client, i, db);
      } else if (action === "open-reminder") {
        const { openReminderSettings } = await import("../zzz/reminderWizard.js");
        await openReminderSettings(client, i, db, onBack);
        closeSettingPanel(s);
      } else if (action === "open-mimo") {
        const { openMimoSettings } = await import("../mimo/panel.js");
        await openMimoSettings(client, i, db, onBack);
      } else if (action === "open-daily" || action === "open-redeem") {
        const { openAutomationSettings } = await import("./automation.js");
        await openAutomationSettings(client, i, db, action === "open-daily" ? "autoDaily" : "autoRedeem", onBack);
      }
    },
  });
}
