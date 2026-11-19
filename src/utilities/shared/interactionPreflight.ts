import { isPrivateRequested } from "./privateOption.js";

/** Longest the router waits on the pending-login queue before running a command. */
export const PENDING_LOGIN_DRAIN_BUDGET_MS = 700;

/**
 * Run a pending-login drain but never wait on it longer than the budget, so a
 * slow Supabase round trip cannot eat the 3-second first-response window.
 * Resolves true when the drain finished in time, false when it is still
 * running (it keeps going in the background). The drain's own failure, early
 * or late, goes to onError and can never become an unhandled rejection.
 */
export async function drainPendingLoginsBounded(
  drain: () => Promise<unknown>,
  onError?: (error: unknown) => void,
  budgetMs = PENDING_LOGIN_DRAIN_BUDGET_MS,
): Promise<boolean> {
  const finished = Promise.resolve()
    .then(drain)
    .then(
      () => true,
      (error) => {
        try {
          onError?.(error);
        } catch {
          // A failing logger must not turn into an unhandled rejection either.
        }
        return true;
      },
    );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), budgetMs);
  });
  try {
    return await Promise.race([finished, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Ephemerality of the early defer: the command's static default, or private
 * when the user passed the shared `private` option.
 */
export function earlyAckEphemeral(
  staticEphemeral: boolean,
  interaction: { options?: { getBoolean?: (name: string) => boolean | null } },
): boolean {
  return staticEphemeral || isPrivateRequested(interaction);
}

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
  // /contact-dev answers with a modal as its first response: no lookups first.
  if (commandName === "contact-dev") return { deferBeforeDrain: false, skipPendingLoginDrain: true, skipLocaleLookup: true };
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
