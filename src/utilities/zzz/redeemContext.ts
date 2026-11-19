import { EmbedBuilder, MessageFlags, escapeMarkdown } from "discord.js";
import { classifyRedeem, safeRedeemMessage, type Reply } from "../core/redeemEngine.js";
import { extractRedeemCodes, MAX_REDEEM_CODES, type CodeSourceMessage } from "./redeemCodeExtract.js";
import { redeemContextText } from "./redeemContextCopy.js";

/** Same spacing `/codes redeemall` leaves between two cdkey requests. */
export const REDEEM_CONTEXT_GAP_MS = 3000;

type Translate = (key: string, ...args: any[]) => string | undefined;
type Status = "success" | "already" | "invalid" | "failed";

export interface RedeemContextAccount {
  uid: string;
  cookie?: string;
  nickname?: string | null;
  region?: unknown;
}

/** Everything that touches the network, the database or the clock, so the flow can be tested offline. */
export interface RedeemContextDeps {
  db: unknown;
  getAccount(userId: string, accountIndex: number): Promise<RedeemContextAccount | null | undefined>;
  blockExpired(interaction: any, options: { ownerId: string; accountIndex: number; account: any; scope: "redeem" }): Promise<boolean>;
  recordedCodes(uid: string): Promise<string[]>;
  redeem(uid: string, cookie: string, code: string, region?: unknown): Promise<Reply>;
  record(uid: string, code: string, reply: Reply): void;
  /** `/codes redeem`'s classifier: throws for auth/retry replies and adds finished codes to `recorded`. */
  classify(code: string, reply: Reply, recorded: string[], tr: Translate): Promise<{ status: string; message: string }>;
  refreshCookie(userId: string, accountIndex: number): Promise<void>;
  getLocale(userId: string, fallback: string): Promise<string>;
  sleep(ms: number): Promise<void>;
}

const ICONS: Record<Status, string> = { success: "✅", already: "ℹ️", invalid: "⚠️", failed: "❌" };
const inFlight = new Set<string>();

function toStatus(value: string): Status {
  return value === "success" || value === "already" || value === "invalid" ? value : "failed";
}

export async function handleRedeemContext(interaction: any, tr: Translate, deps: RedeemContextDeps): Promise<void> {
  if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const locale = await deps.getLocale(interaction.user.id, interaction.locale).catch(() => interaction.locale as string);
  const say = (key: Parameters<typeof redeemContextText>[1]) => redeemContextText(locale, key);
  const target = interaction.targetMessage as CodeSourceMessage | undefined;
  const { codes, truncated } = extractRedeemCodes(target ?? {});
  const noMentions = { parse: [] as never[] };

  if (!codes.length) {
    await interaction.editReply({ content: say("notFound"), embeds: [], allowedMentions: noMentions });
    return;
  }

  // Like `/codes redeem` without an account option: the first (default) bound account.
  const accountIndex = 0;
  const account = await deps.getAccount(interaction.user.id, accountIndex);
  if (!account?.uid || !account.cookie) {
    await interaction.editReply({
      content: "",
      embeds: [new EmbedBuilder().setColor("#E76161")
        .setTitle(tr("error_NoAccount") || say("noAccountTitle"))
        .setDescription(tr("error_NoAccountDesc") || say("noAccountDesc"))],
      allowedMentions: noMentions,
    });
    return;
  }
  if (await deps.blockExpired(interaction, { ownerId: interaction.user.id, accountIndex, account, scope: "redeem" })) return;

  const uid = String(account.uid);
  if (inFlight.has(uid)) {
    await interaction.editReply({ content: say("busy"), embeds: [], allowedMentions: noMentions });
    return;
  }
  inFlight.add(uid);
  const rows: Array<{ code: string; status: Status; message: string }> = [];
  let cookieOk = true;
  let touched = false;
  try {
    const recorded = await deps.recordedCodes(uid);
    let requested = false;
    for (const code of codes) {
      if (recorded.includes(code)) {
        rows.push({ code, status: "already", message: tr("redeem_Already") || "" });
        continue;
      }
      if (!cookieOk) {
        rows.push({ code, status: "failed", message: say("skipped") });
        continue;
      }
      if (requested) await deps.sleep(REDEEM_CONTEXT_GAP_MS);
      requested = true;
      try {
        const reply = await deps.redeem(uid, account.cookie, code, account.region);
        deps.record(uid, code, reply);
        if (classifyRedeem(reply) === "auth") cookieOk = false;
        const result = await deps.classify(code, reply, recorded, tr);
        rows.push({ code, status: toStatus(result.status), message: result.message });
        if (result.status === "success") touched = true;
      } catch (error: any) {
        rows.push({ code, status: "failed", message: safeRedeemMessage(error?.message) || tr("redeem_Failed") || "" });
      }
    }
    if (touched) await deps.refreshCookie(interaction.user.id, accountIndex).catch(() => undefined);
  } finally {
    inFlight.delete(uid);
  }

  const lines = rows.map(row => `${ICONS[row.status]} \`${escapeMarkdown(row.code)}\` - ${escapeMarkdown(row.message)}`);
  const footer = [say("usedUid").replace("{uid}", uid)];
  if (truncated) footer.push(say("truncated").replace("{max}", String(MAX_REDEEM_CODES)));
  await interaction.editReply({
    content: "",
    embeds: [new EmbedBuilder().setColor(rows.some(row => row.status === "success") ? "#4CAF50" : "#9E9E9E")
      .setTitle(say("title")).setDescription(lines.join("\n")).setFooter({ text: footer.join("\n") })],
    allowedMentions: noMentions,
  });
}
