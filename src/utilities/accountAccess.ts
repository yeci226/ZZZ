import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } from "discord.js";
import { getLegacyAccountAtIndex, type AuthScope, type DbAdapter, type LegacyAccount } from "./accountStore.js";
import { getRedeemCookieState } from "./core/redeemCookieState.js";
import { getConfig } from "./core/config.js";

export interface AccountAccessOptions {
  ownerId: string;
  accountIndex: number;
  scope?: AuthScope;
  account?: LegacyAccount | null;
}
export interface AccountAccess {
  status: "ready" | "missing" | "expired";
  account: LegacyAccount | null;
}

/** Read existing evidence only. General and redemption credentials are independent. */
export async function inspectAccountAccess(db: DbAdapter, options: AccountAccessOptions): Promise<AccountAccess> {
  const account = options.account === undefined
    ? await getLegacyAccountAtIndex(db, options.ownerId, options.accountIndex) : options.account;
  if (!account) return { status: "missing", account: null };
  let expired = account.invalid === true;
  if (options.scope === "redeem") {
    const state = await getRedeemCookieState(db, String(account.uid));
    expired = state.invalid || state.needsCookieUpdate;
    if (!state.legacyMigrated) {
      expired ||= (await db.get(`${account.uid}.cookieExpired`)) === true
        || (await db.get(`${account.uid}.needsCookieUpdate`)) === true;
    }
  }
  return { status: expired ? "expired" : account.cookie && account.uid ? "ready" : "missing", account };
}

const pendingDrains = new WeakMap<object, Promise<void>>();

/** Slash commands already drain logins in the router. Old component messages need the same recovery. */
export async function getInteractiveAccountAccess(interaction: any, db: DbAdapter, options: AccountAccessOptions): Promise<AccountAccess> {
  let access = await inspectAccountAccess(db, options);
  if (access.status === "expired" && interaction.customId && interaction.user?.id === options.ownerId) {
    let drain = pendingDrains.get(interaction);
    if (!drain) {
      drain = import("./webhookLogin.js").then(({ drainPendingLogins }) => drainPendingLogins(options.ownerId)).then(() => undefined).catch(() => undefined);
      pendingDrains.set(interaction, drain);
    }
    await drain;
    access = await inspectAccountAccess(db, { ...options, account: undefined });
  }
  return access;
}

type Copy = { title: string; self: string; other: string; button: string; instruction: string };
const COPY: Record<string, Copy> = {
  tw: { title: "帳號登入已失效", self: "帳號 #{index} 的登入已失效，請重新綁定後再次執行。", other: "對方的帳號 #{index} 登入已失效，請由帳號擁有者重新綁定。", button: "重新綁定帳號", instruction: "請使用 `/account` 的綁定帳號功能重新登入。" },
  cn: { title: "账号登录已失效", self: "账号 #{index} 的登录已失效，请重新绑定后再次执行。", other: "对方的账号 #{index} 登录已失效，请由账号所有者重新绑定。", button: "重新绑定账号", instruction: "请使用 `/account` 的绑定账号功能重新登录。" },
  en: { title: "Account login expired", self: "The login for account #{index} has expired. Relink it, then try again.", other: "The selected user's account #{index} has expired. Its owner needs to relink it.", button: "Relink account", instruction: "Use the account linking option in `/account` to sign in again." },
  jp: { title: "ログインの有効期限切れ", self: "アカウント #{index} のログインが失効しています。再連携してから再実行してください。", other: "相手のアカウント #{index} のログインが失効しています。所有者に再連携を依頼してください。", button: "アカウントを再連携", instruction: "`/account` のアカウント連携から再ログインしてください。" },
  kr: { title: "계정 로그인 만료", self: "계정 #{index}의 로그인이 만료되었습니다. 다시 연동한 후 재시도하세요.", other: "상대방의 계정 #{index} 로그인이 만료되었습니다. 계정 소유자가 다시 연동해야 합니다.", button: "계정 다시 연동", instruction: "`/account`의 계정 연동 기능으로 다시 로그인하세요." },
  fr: { title: "Connexion au compte expirée", self: "La connexion au compte nº {index} a expiré. Reliez-le, puis réessayez.", other: "La connexion au compte nº {index} de cet utilisateur a expiré. Son propriétaire doit le relier.", button: "Relier le compte", instruction: "Reconnectez-vous via l’option de liaison de `/account`." },
  vi: { title: "Phiên đăng nhập đã hết hạn", self: "Phiên đăng nhập của tài khoản #{index} đã hết hạn. Hãy liên kết lại rồi thử lại.", other: "Phiên đăng nhập của tài khoản #{index} thuộc người dùng này đã hết hạn. Chủ tài khoản cần liên kết lại.", button: "Liên kết lại tài khoản", instruction: "Dùng chức năng liên kết tài khoản trong `/account` để đăng nhập lại." },
};

function localeKey(locale: string) {
  const value = locale.toLowerCase();
  if (["tw", "zh-tw", "zh-hant"].includes(value)) return "tw";
  if (["cn", "zh", "zh-cn", "zh-hans"].includes(value)) return "cn";
  if (["jp", "ja", "ja-jp"].includes(value)) return "jp";
  if (["kr", "ko", "ko-kr"].includes(value)) return "kr";
  return value.split("-")[0] in COPY ? value.split("-")[0] : "en";
}

/** Shared with /account; the login website establishes the user's identity itself. */
export function accountLoginUrl(locale: string): string | undefined {
  const base = getConfig().WEB_LOGIN_URL;
  if (!base) return undefined;
  try {
    const url = new URL(`${base.replace(/\/+$/, "")}/login`);
    if (!["https:", "http:"].includes(url.protocol)) return undefined;
    url.searchParams.set("botId", "zzz");
    if (["tw", "cn"].includes(localeKey(locale))) url.searchParams.set("lang", "zh-TW");
    return url.toString();
  } catch { return undefined; }
}

const notices = new WeakMap<object, Promise<void>>();

/** Never replace/delete an existing card when a component's account expires. */
export async function notifyExpiredAccount(interaction: any, options: { ownerId: string; accountIndex: number; locale?: string }): Promise<void> {
  const existing = notices.get(interaction);
  if (existing) return existing;
  const task = (async () => {
    const locale = options.locale || interaction.locale || "en";
    const copy = COPY[localeKey(locale)];
    const own = interaction.user.id === options.ownerId;
    const url = own ? accountLoginUrl(locale) : undefined;
    const description = (own ? copy.self : copy.other).replace("{index}", String(options.accountIndex));
    const payload = {
      embeds: [new EmbedBuilder().setColor("#E76161").setTitle(copy.title)
        .setDescription(description + (own && !url ? `\n\n${copy.instruction}` : ""))],
      components: url ? [new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(copy.button).setURL(url),
      )] : [],
      allowedMentions: { parse: [] as never[] },
    };
    if (!interaction.deferred && !interaction.replied) {
      await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
    } else if (interaction.deferred && !interaction.replied && !interaction.customId && interaction.ephemeral === true) {
      await interaction.editReply(payload);
    } else {
      const removePlaceholder = interaction.deferred && !interaction.replied && !interaction.customId;
      // Discord treats the first follow-up after deferReply as the original response,
      // inheriting its visibility. Complete the public placeholder before sending private details.
      if (removePlaceholder) await interaction.editReply({ content: "…", embeds: [], components: [], files: [] });
      await interaction.followUp({ ...payload, flags: MessageFlags.Ephemeral });
      if (removePlaceholder) await interaction.deleteReply();
    }
  })();
  notices.set(interaction, task);
  return task;
}

export async function blockExpiredAccount(interaction: any, db: DbAdapter, options: AccountAccessOptions & { locale?: string }): Promise<boolean> {
  const access = await getInteractiveAccountAccess(interaction, db, options);
  if (access.status !== "expired") return false;
  const locale = options.locale || await db.get<string>(`${interaction.user.id}.locale`) || interaction.locale;
  await notifyExpiredAccount(interaction, { ...options, locale });
  return true;
}
