import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(__dirname, path), "utf8");
const autoRedeemSource = read("../src/utilities/zzz/autoRedeem.ts");
const manualRedeemSource = read("../src/commands/slash/zzz/redeem.ts");
const readySource = read("../src/events/ready.ts");
const utilitiesSource = read("../src/utilities/utilities.ts");

const calls = (source: string, names: string) =>
  Array.from(source.matchAll(new RegExp(`\\b(${names})\\s*\\(([^)]*)\\)`, "g")));

const everyCallHasRedeemScope = (matches: RegExpMatchArray[]) =>
  matches.length > 0 &&
  matches.every((match) => /,[\s\S]*["']redeem["']\s*,?\s*$/.test(match[2] ?? ""));

describe("ZZZ redeem refresh scope wiring", () => {
  it("uses redeem state helpers instead of legacy ambiguous auth keys", () => {
    expect(autoRedeemSource).not.toMatch(
      /["'`]\.?(?:cookieExpired|needsCookieUpdate|lastCookieRefreshAttempt)["'`]/,
    );
    expect(autoRedeemSource).toContain("migrateLegacyRedeemCookieState");
    expect(autoRedeemSource).toContain("getRedeemCookieState");
  });

  it("passes redeem scope through automatic and manual redeem refresh calls", () => {
    expect(everyCallHasRedeemScope(calls(autoRedeemSource, "autoRefreshCookie"))).toBe(true);
    expect(everyCallHasRedeemScope(calls(manualRedeemSource, "autoRefreshCookie|updateCookie"))).toBe(true);
    expect(everyCallHasRedeemScope(calls(readySource, "autoRefreshCookie"))).toBe(true);
  });

  it("defines scoped cookie refresh primitives", () => {
    expect(utilitiesSource).toMatch(
      /export async function autoRefreshCookie\([\s\S]*?scope:\s*AuthScope\s*=\s*["']general["']/,
    );
    expect(utilitiesSource).toMatch(
      /export async function updateCookie\([\s\S]*?scope:\s*AuthScope\s*=\s*["']general["']/,
    );
  });
});
