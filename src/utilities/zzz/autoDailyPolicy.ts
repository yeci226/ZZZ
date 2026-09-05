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


