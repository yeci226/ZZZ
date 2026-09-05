export interface AutoDailyAccountAuthInput {
  uid?: unknown;
  cookie?: unknown;
  invalid?: boolean;
  legacyInvalidProbeCompleted?: boolean;
}

export type AutoDailyResultStatus = "success" | "already_signed" | "failed";

const EXPLICIT_AUTH_CODES = new Set([-100, -1071]);

function isPresent(value: unknown): boolean {
  return typeof value === "string" ? value.trim().length > 0 : Boolean(value);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const candidate = error as Record<string, unknown>;
    return String(candidate.message ?? candidate.error_description ?? "");
  }
  return "";
}

function getErrorCode(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const candidate = error as Record<string, unknown>;
  for (const value of [candidate.code, candidate.retcode, candidate.error_code]) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function getHttpStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const candidate = error as Record<string, unknown>;
  const response = candidate.response;
  if (response && typeof response === "object") {
    const status = Number((response as Record<string, unknown>).status);
    if (Number.isFinite(status)) return status;
  }
  const status = Number(candidate.status ?? candidate.statusCode);
  return Number.isFinite(status) ? status : null;
}

/**
 * AutoDaily should attempt an account when it has the two credentials needed
 * by the API, even if an older shared invalid flag is still set.
 */
export interface AutoDailyAuthOptions {
  allowLegacyInvalidRecovery?: boolean;
}

export function shouldSkipAutoDailyAccount(
  account: AutoDailyAccountAuthInput,
  options: AutoDailyAuthOptions = { allowLegacyInvalidRecovery: false },
): boolean {
  if (!isPresent(account.uid) || !isPresent(account.cookie)) return true;
  return (
    account.invalid === true &&
    (options.allowLegacyInvalidRecovery === false ||
      account.legacyInvalidProbeCompleted === true)
  );
}

/**
 * Only classify errors with direct authentication evidence as auth failures.
 * Transport, server, notification, and other incidental errors must not make
 * the general account invalid.
 */
export function isExplicitAuthenticationError(error: unknown): boolean {
  const code = getErrorCode(error);
  if (code !== null && EXPLICIT_AUTH_CODES.has(code)) return true;

  const status = getHttpStatus(error);
  if (status === 401) return true;

  const message = getErrorMessage(error).toLowerCase();
  if (!message || /notification\s+failed/.test(message)) return false;
  if (/尚未登入|尚未登录|not logged in/.test(message)) return true;

  return /(?:authentication|authorization|login|log[ -]?in|required|unauthori[sz]ed)/.test(
    message,
  ) &&
    !/(?:timeout|timed out|temporar|service unavailable|http\s+5\d\d|server)/.test(
      message,
    ) ||
    /(?:cookie|token)\s*(?:is\s*)?(?:invalid|expired|missing)|(?:invalid|expired)\s+(?:cookie|token)|(?:given\s+)?uid\s*(?:is\s*)?invalid/.test(
      message,
    );
}

export function isDailyAccountExpiredError(error: unknown): boolean {
  const code = getErrorCode(error);
  if (code === -100) return true;
  const message = getErrorMessage(error).toLowerCase();
  return /尚未登入|尚未登录|not logged in/.test(message);
}

export function shouldRestoreGeneralValidity(
  status: AutoDailyResultStatus,
): boolean {
  return status === "success" || status === "already_signed";
}

export function shouldMarkGeneralInvalid(error: unknown): boolean {
  return isExplicitAuthenticationError(error);
}
