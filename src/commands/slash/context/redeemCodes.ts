import {
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  type Client,
  type MessageContextMenuCommandInteraction,
} from "discord.js";
import type { QuickDB } from "quick.db";
import { getLegacyAccountAtIndex } from "../../../utilities/accountStore.js";
import { blockExpiredAccount } from "../../../utilities/accountAccess.js";
import { recordedRedeemCodes, recordManualRedeem } from "../../../utilities/core/redeemEngine.js";
import { getUserLang, updateCookie } from "../../../utilities/utilities.js";
import { handleRedeemResult, redeemCodeDirect } from "../zzz/redeem.js";
import { handleRedeemContext } from "../../../utilities/zzz/redeemContext.js";
import { REDEEM_CONTEXT_NAME, REDEEM_CONTEXT_NAMES } from "../../../utilities/zzz/redeemContextCopy.js";

// Registered through src/main.ts like every file under commands/slash, so it lives in
// client.commands.slash and interactionCreate's isCommand() branch calls execute() below.
export default {
  data: new ContextMenuCommandBuilder()
    .setName(REDEEM_CONTEXT_NAME)
    .setNameLocalizations(REDEEM_CONTEXT_NAMES)
    .setType(ApplicationCommandType.Message),

  async execute(
    _client: Client,
    interaction: MessageContextMenuCommandInteraction,
    _args: unknown[],
    tr: (key: string, ...args: any[]) => string | undefined,
    db: QuickDB,
  ) {
    await handleRedeemContext(interaction, tr, {
      db,
      getAccount: (userId, index) => getLegacyAccountAtIndex(db as any, userId, index),
      blockExpired: (i, options) => blockExpiredAccount(i, db as any, options),
      recordedCodes: uid => recordedRedeemCodes(db, uid),
      redeem: redeemCodeDirect,
      record: (uid, code, reply) => recordManualRedeem(db, uid, code, reply),
      classify: handleRedeemResult,
      // Same cookie refresh `/codes redeem` runs after a successful redemption.
      refreshCookie: async (userId, index) => {
        const account = await getLegacyAccountAtIndex(db as any, userId, index);
        if (account?.cookie) await updateCookie(userId, index, account.cookie, "redeem");
      },
      getLocale: async (userId, fallback) => (await getUserLang(userId)) || fallback,
      sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
    });
  },
};
