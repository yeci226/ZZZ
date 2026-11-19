export interface AutoDailyProcessSummary {
  success: number;
  alreadySigned: number;
  /** A legacy invalid account completed its one-time classification probe. */
  legacyProbeCompleted?: boolean;
  /** Kept for callers that still collect delivery status; not part of sign-in completion. */
  notificationDelivered?: boolean;
}

/**
 * A user is processed for the day once at least one account was successfully
 * signed in or was already signed in. Notification delivery is independent:
 * retrying the whole sign-in pass because Discord rejected a DM/channel would
 * only create repeated API calls and log noise.
 */
export function shouldMarkAutoDailyProcessed(
  summary: AutoDailyProcessSummary,
): boolean {
  return summary.success + summary.alreadySigned > 0 || summary.legacyProbeCompleted === true;
}

/** After an all-failed run the user is not retried before this delay. */
export const AUTO_DAILY_RETRY_BACKOFF_MS = 3 * 60 * 60 * 1000;

export type AutoDailyFailureSignature =
  | "auth"
  | "role"
  | "geetest"
  | "generic";

export interface AutoDailyFailureEntry {
  sig: AutoDailyFailureSignature;
  /** Server day (YYYY-MM-DD) on which the user was last notified of `sig`. */
  notifiedDay?: string;
  /** Server day on which the error webhook last received `sig`. */
  webhookDay?: string;
}

/** Stored at `<userId>.autoDailyRetry`; only exists while a user is all-failed. */
export interface AutoDailyRetryState {
  day: string;
  nextTryAt: number;
  accounts: Record<string, AutoDailyFailureEntry>;
}

export function classifyAutoDailyFailure(info: {
  authenticationError: boolean;
  missingRoleError: boolean;
  message: string;
}): AutoDailyFailureSignature {
  if (info.authenticationError) return "auth";
  if (info.missingRoleError) return "role";
  if (/\b(10035|1034)\b/.test(info.message)) return "geetest";
  return "generic";
}

export function normalizeAutoDailyRetryState(
  raw: unknown,
): AutoDailyRetryState | null {
  const state = raw as Partial<AutoDailyRetryState> | null | undefined;
  if (
    !state ||
    typeof state.day !== "string" ||
    typeof state.nextTryAt !== "number" ||
    !state.accounts ||
    typeof state.accounts !== "object"
  )
    return null;
  return state as AutoDailyRetryState;
}

/** True while the user is inside the backoff window of an all-failed run today. */
export function isAutoDailyInBackoff(
  state: AutoDailyRetryState | null,
  today: string,
  now: number,
): boolean {
  return !!state && state.day === today && state.nextTryAt > now;
}
