export interface InteractionPreflight {
  /** Whether the router must defer before any pending-login network work. */
  deferBeforeDrain: boolean;
  /** Whether the initial command response is a modal, so no drain is allowed first. */
  skipPendingLoginDrain: boolean;
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
  const getString = interaction.options?.getString;
  const getSubcommand = interaction.options?.getSubcommand;

  const isAccountCookieModal =
    commandName === "account" &&
    getString?.("options") === "SetUserCookie";
  const isSignalLogModal =
    commandName === "signal" &&
    getSubcommand?.(false) === "log" &&
    getString?.("options") === "query";
  const skipPendingLoginDrain = isAccountCookieModal || isSignalLogModal;

  return {
    deferBeforeDrain: commandName === "account" && !skipPendingLoginDrain,
    skipPendingLoginDrain,
  };
}
