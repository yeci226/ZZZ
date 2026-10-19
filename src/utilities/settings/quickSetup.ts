import type { Client } from "discord.js";
import { accountLoginUrl } from "../accountAccess.js";
import { rewardName } from "../mimo/rewards.js";
import { setAutomationEnabled } from "./automation.js";
import { automationText } from "./automationCopy.js";
import {
  openSettingPanel,
  closeSettingPanel,
  panelMessage,
  settingButton,
  settingRow,
  type SettingInteraction,
  type SettingSession,
} from "./panel.js";
import { uiLocale, uiText } from "./presentation.js";
import { setupText, type SetupCopyKey } from "./setupCopy.js";
import {
  readQuickSetup,
  setQuickMimo,
  setQuickReminder,
  type QuickSetupSnapshot,
} from "./setupService.js";

const features = ["daily", "redeem", "mimo", "reminder"] as const;
type Feature = (typeof features)[number];
const notification = (locale: string, c: any) => {
  const enabled = c.notifyType !== "off" && c.notificationEnabled !== false;
  return `${uiText(locale, "notification")}: ${uiText(locale, !enabled ? "off" : c.notifyType === "dm" ? "dm" : "channel")}${enabled && c.notifyType === "channel" && c.channelId ? ` <#${c.channelId}>` : ""} · ${uiText(locale, "mention")}: ${uiText(locale, c.tag === true || c.tag === "true" ? "on" : "off")}`;
};
function problemText(locale: string, problem: string) {
  if (
    ["auth", "choose", "forbidden", "rewards", "reminderFix"].includes(problem)
  )
    return setupText(locale, problem as SetupCopyKey);
  return uiText(
    locale,
    problem === "settings_conflict" ? "conflict" : "failed",
  );
}
export async function openQuickSetup(
  client: Client,
  interaction: SettingInteraction,
  db: any,
  page = "home",
) {
  const owner = interaction.user.id;
  const locale = uiLocale(
    (await db.get(`${owner}.locale`)) || interaction.locale,
  );
  const back = (i: SettingInteraction) => openQuickSetup(client, i, db);
  const navigation = {
    backLabel: setupText(locale, "back"),
    reopenCommand: "setup" as const,
  };
  await openSettingPanel(interaction, {
    reopenCommand: "setup",
    locale,
    page,
    base: {},
    draft: {},
    data: { accountPage: 0, problems: {}, failures: {} },
    render: async (s) => {
      const snapshot = await readQuickSetup(db, owner);
      s.base = snapshot;
      const t = (key: Parameters<typeof uiText>[1]) => uiText(locale, key);
      const controls: any[] = [];
      if (s.page === "mimo") {
        const maxPage = Math.max(0, Math.ceil(snapshot.mimo.length / 5) - 1);
        s.data.accountPage = Math.min(maxPage, s.data.accountPage);
        for (const a of snapshot.mimo.slice(
          s.data.accountPage * 5,
          s.data.accountPage * 5 + 5,
        )) {
          const problem = s.data.failures[a.ltuid] || a.problem;
          controls.push({
            type: 9,
            components: [
              {
                type: 10,
                content: `**${a.name.replace(/[@*_`~|\\<>\r\n]/g, "").slice(0, 80)}** · ${t(a.config?.enabled ? "on" : "off")}\n${a.uid ? `UID ${a.uid}\n` : ""}${problem ? problemText(locale, problem) : notification(locale, a.config || { notifyType: "dm", tag: false })}`,
              },
            ],
            accessory: settingButton(
              s,
              `account-${a.ltuid}`,
              setupText(locale, "details"),
              2,
              a.problem === "forbidden",
            ),
          });
        }
        if (maxPage)
          controls.push(
            settingRow(
              settingButton(
                s,
                "previous",
                t("previous"),
                2,
                !s.data.accountPage,
              ),
              settingButton(
                s,
                "next",
                t("next"),
                2,
                s.data.accountPage >= maxPage,
              ),
            ),
          );
        controls.push(
          settingRow(
            settingButton(
              s,
              "retry-mimo",
              setupText(locale, "retry"),
              3,
              !snapshot.mimo.length,
            ),
            settingButton(s, "home", setupText(locale, "back")),
          ),
        );
      } else {
        for (const feature of features) {
          const enabled =
            feature === "mimo"
              ? snapshot.mimo.some((a) => a.config?.enabled)
              : snapshot[feature].enabled;
          let summary: string;
          if (feature === "mimo") {
            summary = setupText(locale, "enabledCount", {
              enabled: snapshot.mimo.filter((a) => a.config?.enabled).length,
              total: snapshot.mimo.length,
            });
            if (!snapshot.mimo.some((a) => a.config))
              summary += ` · ${rewardName("polychrome", locale)} · ${t("dm")} · ${t("mention")}: ${t("off")}`;
          } else if (feature === "daily")
            summary = `${snapshot.dailyNew ? setupText(locale, "allocated") : `${snapshot.daily.time.padStart(2, "0")}:00 (UTC+8)`}\n${notification(locale, snapshot.daily)}`;
          else if (feature === "reminder")
            summary = `${snapshot.reminderNew ? setupText(locale, "reminderDefaults") + "\n" : ""}${notification(locale, snapshot.reminder)}`;
          else summary = notification(locale, snapshot.redeem);
          const problem = s.data.problems[feature];
          controls.push({
            type: 9,
            components: [
              {
                type: 10,
                content: `**${automationText(locale, feature)}** · ${t(enabled ? "on" : "off")}\n${feature === "mimo" ? setupText(locale, "mimoDescription") : automationText(locale, `${feature}Desc`)}\n${summary}${problem ? `\n${problemText(locale, problem)}` : ""}`,
              },
            ],
            accessory: settingButton(
              s,
              `${enabled ? "off" : "on"}-${feature}`,
              t(enabled ? "disable" : "enable"),
              enabled ? 4 : 3,
            ),
          });
          if (
            enabled ||
            problem ||
            (feature === "mimo" &&
              snapshot.mimo.some((a) => a.config || a.problem))
          )
            controls.push(
              settingRow(
                settingButton(
                  s,
                  `details-${feature}`,
                  setupText(locale, "details"),
                ),
              ),
            );
        }
      }
      const login = accountLoginUrl(locale);
      const needsLogin =
        !snapshot.hasAccount ||
        Object.values(s.data.problems).includes("auth") ||
        snapshot.mimo.some((a) => a.problem === "auth");
      if (needsLogin)
        controls.push({
          type: 10,
          content: setupText(locale, "auth") + (!login ? " /account" : ""),
        });
      controls.push(
        settingRow(
          ...(needsLogin && login
            ? [
                {
                  type: 2,
                  style: 5,
                  label: setupText(locale, "login"),
                  url: login,
                },
              ]
            : []),
          settingButton(s, "recheck", setupText(locale, "recheck")),
          settingButton(s, "done", t("done")),
        ),
      );
      return panelMessage(
        s,
        setupText(locale, "title"),
        setupText(locale, "description"),
        controls,
      );
    },
    action: async (s: SettingSession, action, i) => {
      const snapshot = s.base as QuickSetupSnapshot;
      if (action === "home") {
        s.page = "home";
        return;
      }
      if (action === "next" || action === "previous") {
        s.data.accountPage = Math.max(
          0,
          s.data.accountPage + (action === "next" ? 1 : -1),
        );
        return;
      }
      if (action === "recheck") {
        const { drainPendingLogins } = await import("../webhookLogin.js");
        await drainPendingLogins(owner).catch(() => {});
        s.data.problems = {};
        s.data.failures = {};
        return;
      }
      if (action.startsWith("account-")) {
        const ltuid = action.slice(8),
          account = snapshot.mimo.find((a) => a.ltuid === ltuid);
        if (!account || account.problem === "forbidden")
          throw new Error("forbidden");
        const { openMimoSettings } = await import("../mimo/panel.js");
        await openMimoSettings(
          client,
          i,
          db,
          (next) => openQuickSetup(client, next, db, "mimo"),
          {
            ...navigation,
            ltuid,
            initialPage: account.problem === "choose" ? "account" : "home",
          },
        );
        return;
      }
      if (action.startsWith("details-")) {
        const feature = action.slice(8);
        if (feature === "mimo") {
          s.page = "mimo";
          return;
        }
        if (feature === "reminder") {
          const { openReminderSettings } =
            await import("../zzz/reminderWizard.js");
          await openReminderSettings(client, i, db, back, navigation);
          closeSettingPanel(s);
        } else if (feature === "daily" || feature === "redeem") {
          const { openAutomationSettings } = await import("./automation.js");
          await openAutomationSettings(
            client,
            i,
            db,
            feature === "daily" ? "autoDaily" : "autoRedeem",
            back,
            navigation,
          );
        }
        return;
      }
      const [operation, name] = action.split("-");
      if (
        !["on", "off", "retry"].includes(operation) ||
        !features.includes(name as Feature)
      )
        return;
      const feature = name as Feature,
        enabled = operation !== "off";
      try {
        if (feature === "mimo") {
          s.data.failures = await setQuickMimo(
            db,
            owner,
            snapshot.mimo,
            enabled,
          );
          if (!snapshot.mimo.length) throw new Error("auth");
          if (Object.keys(s.data.failures).length) s.page = "mimo";
        } else if (feature === "reminder")
          await setQuickReminder(client, db, owner, snapshot.reminder, enabled);
        else
          await setAutomationEnabled(
            db,
            owner,
            feature === "daily" ? "autoDaily" : "autoRedeem",
            snapshot[feature],
            enabled,
          );
        delete s.data.problems[feature];
        s.notice = uiText(locale, "saved");
      } catch (error) {
        const problem = error instanceof Error ? error.message : "failed";
        s.data.problems[feature] = problem;
        s.notice = problemText(locale, problem);
      }
    },
  });
}
