export interface InteractionPreflight {
  /** Whether the router must defer before any pending-login network work. */
  deferBeforeDrain: boolean;
  /** Whether the initial command response is a modal, so no drain is allowed first. */
  skipPendingLoginDrain: boolean;
  /** Whether the initial command response is a modal, so locale DB work is also skipped. */
  skipLocaleLookup: boolean;
}

type CommandInteractionLike = {
  commandName?: string;
  options?: {
    getString?: (...args: any[]) => string | null;
    getSubcommand?: (...args: any[]) => string | null;
  };
};

/**
 * Decide how the router may safely handle command preflight work.
 *
 * A command that opens a modal cannot be deferred, and a web-login account
 * command must be deferred before the pending-login Supabase query. Keep this
 * decision pure so the ordering remains covered by a focused regression test.
 */
export function getInteractionPreflight(
  interaction: CommandInteractionLike,
): InteractionPreflight {
  const commandName = interaction.commandName ?? "";
  if (commandName === "leaderboard") return { deferBeforeDrain: true, skipPendingLoginDrain: true, skipLocaleLookup: true };
  // Fixed animation samples have no account dependency; ACK before locale/database work.
  if (["gacha-preview", "gacha-simulate", "gacha-simulation-settings", "gacha-simulation-details"].includes(commandName)) return { deferBeforeDrain: true, skipPendingLoginDrain: true, skipLocaleLookup: true };
  // Public news does not depend on pending account logins. ACK before DB work.
  if (commandName === "news") return { deferBeforeDrain: true, skipPendingLoginDrain: true, skipLocaleLookup: false };
  const isAccountCookieModal =
    commandName === "account" &&
    interaction.options?.getString?.("options") === "SetUserCookie";
  const isSignalLogModal =
    commandName === "signal" &&
    interaction.options?.getSubcommand?.(false) === "log" &&
    interaction.options?.getString?.("options") === "query";
  const skipPendingLoginDrain = isAccountCookieModal || isSignalLogModal;

  return {
    deferBeforeDrain: ["account", "banner", "automimo", "setup"].includes(commandName) && !skipPendingLoginDrain,
    skipPendingLoginDrain,
    skipLocaleLookup: skipPendingLoginDrain,
  };
}
