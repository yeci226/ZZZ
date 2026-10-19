import {
  claimPendingLogin,
  renewPendingLogin,
  finishPendingLogin,
  decryptString,
} from "./core/supabase.js";

export interface LoginRole {
  uid: string;
  nickname: string;
  region?: string | undefined;
  error?: string | undefined;
}
export interface LoginResult {
  status: "success" | "partial" | "no_roles" | "failed";
  roles: LoginRole[];
  skipped?: LoginRole[] | undefined;
  code?: string | undefined;
}
export interface BindOptions {
  alreadyBound?: LoginRole[];
  assertLease?: () => void;
}
type Row = NonNullable<Awaited<ReturnType<typeof claimPendingLogin>>>;
type Bind = (
  row: Row,
  cookie: string,
  options: BindOptions,
) => Promise<LoginResult>;

// ponytail: one local drain at a time; database leases cover shards. Add parallel per-user drains only if queue latency requires it.
let running = false;
let timer: ReturnType<typeof setTimeout> | undefined;
export async function processLoginQueue(
  bind: Bind,
  discordUserId?: string,
): Promise<LoginRole[]> {
  if (running) return [];
  running = true;
  const all: LoginRole[] = [];
  try {
    for (let n = 0; n < 10; n++) {
      const row = await claimPendingLogin(discordUserId);
      if (!row) break;
      let lost = false;
      let timedOut = false;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const heartbeat = setInterval(() => {
        void renewPendingLogin(row)
          .then((ok) => {
            if (!ok) lost = true;
          })
          .catch(() => {
            lost = true;
          });
      }, 30000);
      heartbeat.unref();
      const assertLease = () => {
        if (lost || timedOut) throw new Error("lease_lost");
      };
      let result: LoginResult;
      try {
        let cookie: string;
        try {
          cookie = decryptString(row.encrypted_cookies);
        } catch {
          throw new Error("invalid_credentials");
        }
        result = await Promise.race([
          bind(row, cookie, {
            alreadyBound: row.receipt.roles ?? [],
            assertLease,
          }),
          new Promise<never>((_, reject) => {
            timeout = setTimeout(() => {
              timedOut = true;
              reject(new Error("sync_timeout"));
            }, 120000);
          }),
        ]);
      } catch (e) {
        const code =
          e instanceof Error && e.message === "invalid_credentials"
            ? "invalid_credentials"
            : "sync_error";
        result = { status: "failed", roles: row.receipt.roles ?? [], code };
      } finally {
        clearInterval(heartbeat);
        clearTimeout(timeout);
      }
      if (lost) continue;
      const transient =
        (result.status === "failed" || result.status === "partial") &&
        result.code !== "account_limit" &&
        result.code !== "invalid_credentials";
      const delay = [15, 30, 60][row.receipt.attempts - 1];
      const receipt =
        transient && delay
          ? {
              ...result,
              status: "retrying",
              nextRetryAt: new Date(Date.now() + delay * 1000).toISOString(),
            }
          : result;
      if (await finishPendingLogin(row, receipt)) all.push(...result.roles);
    }
  } finally {
    running = false;
  }
  return all;
}
export function startLoginQueue(bind: Bind) {
  if (timer) return;
  const tick = async () => {
    try {
      await processLoginQueue(bind);
    } catch {
      console.warn("[WebLogin] queue unavailable; retrying later");
    } finally {
      timer = setTimeout(tick, 5000);
      timer.unref();
    }
  };
  timer = setTimeout(tick, 0);
  timer.unref();
}
