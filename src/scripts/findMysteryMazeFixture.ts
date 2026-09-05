import Database from "better-sqlite3";
import { resolve, relative } from "node:path";

import {
  createZzzClient,
  getZzzClientLanguage,
} from "../utilities/zzz/clientFactory.js";
import {
  materializeMysteryMazeIcons,
  richnessTuple,
  sanitizeMysteryMazeFixture,
  selectRicherMysteryMazeSample,
  writeMysteryMazeFixtureAtomic,
  type MysteryMazeCandidate,
} from "../utilities/zzz/mysteryMazeFixture.js";
import type {
  MysteryMazeAbstract,
  MysteryMazeDetail,
} from "../utilities/zzz/mysteryMazeRenderer.js";
import { requestZzzRecordApi } from "../utilities/zzz/officialRecordApi.js";
import { sanitizeOfficialValidationError } from "../utilities/zzz/officialRecordValidation.js";

interface Options {
  baselineUser: string;
  accountIndex: number;
  limit: number;
  batchSize: number;
  delayMs: number;
  database: string;
  output: string;
  assets: string;
}

function parseInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum = Number.POSITIVE_INFINITY,
): number {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(maximum, Math.max(minimum, Math.trunc(parsed)))
    : fallback;
}

export function parseMysteryMazeFixtureArgs(argv: string[]): Options {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index++) {
    const key = argv[index];
    if (!key?.startsWith("--")) continue;
    const [inlineKey, inlineValue] = key.split("=", 2);
    if (inlineValue !== undefined) values.set(inlineKey!, inlineValue);
    else if (argv[index + 1] && !argv[index + 1]!.startsWith("--"))
      values.set(key, argv[++index]!);
  }
  const baselineUser = values.get("--baseline-user") ?? "";
  if (!/^\d{5,30}$/.test(baselineUser)) {
    throw new Error("--baseline-user must be a Discord user ID");
  }
  return {
    baselineUser,
    accountIndex: parseInteger(values.get("--account"), 0, 0),
    limit: parseInteger(values.get("--limit"), 50, 1, 50),
    batchSize: parseInteger(values.get("--batch-size"), 10, 1, 10),
    delayMs: parseInteger(values.get("--delay-ms"), 1000, 1000),
    database: resolve(values.get("--db") ?? "json.sqlite"),
    output: resolve(
      values.get("--output") ?? "tests/fixtures/mysteryMaze.rich.json",
    ),
    assets: resolve(
      values.get("--assets") ?? "tests/fixtures/mystery-maze-assets",
    ),
  };
}

function timestamp(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
    const date = Date.parse(value);
    return Number.isFinite(date) ? date : 0;
  }
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return timestamp(
      object.at ?? object.timestamp ?? object.lastRun ?? object.lastUpdate,
    );
  }
  return 0;
}

export function linkedAccountsFromRows(
  rows: Array<{ ID: string; json: string }>,
): MysteryMazeCandidate[] {
  const accounts: MysteryMazeCandidate[] = [];
  for (const row of rows) {
    let root: Record<string, any>;
    try {
      root = JSON.parse(row.json) as Record<string, any>;
    } catch {
      continue;
    }
    let accountIndex = 0;
    const hoyolabs = Array.isArray(root.hoyolabs) ? root.hoyolabs : [];
    for (const hoyolab of hoyolabs) {
      for (const character of Array.isArray(hoyolab?.characters)
        ? hoyolab.characters
        : []) {
        if (
          hoyolab?.invalid !== true &&
          character?.invalid !== true &&
          hoyolab?.cookie &&
          character?.uid
        ) {
          accounts.push({
            ownerId: row.ID,
            accountIndex,
            uid: String(character.uid),
            cookie: String(hoyolab.cookie),
            region:
              typeof character.region === "string"
                ? character.region
                : undefined,
            recentAt: timestamp(root.lastAutoDaily),
            updatedAt: timestamp(character.lastUpdate ?? hoyolab.lastUpdate),
          });
        }
        accountIndex++;
      }
    }
    if (hoyolabs.length) continue;
    for (const [legacyIndex, account] of (Array.isArray(root.account)
      ? root.account
      : []
    ).entries()) {
      if (account?.invalid === true || !account?.cookie || !account?.uid)
        continue;
      accounts.push({
        ownerId: row.ID,
        accountIndex: legacyIndex,
        uid: String(account.uid),
        cookie: String(account.cookie),
        region: typeof account.region === "string" ? account.region : undefined,
        recentAt: timestamp(root.lastAutoDaily),
        updatedAt: timestamp(account.lastUpdate),
      });
    }
  }
  return accounts;
}

export function createMinimumIntervalGate(
  delayMs: number,
  now: () => number = Date.now,
  wait: (milliseconds: number) => Promise<void> = (milliseconds) =>
    new Promise((resolveWait) => setTimeout(resolveWait, milliseconds)),
) {
  let lastRequestAt: number | null = null;
  return async <T>(operation: () => Promise<T>): Promise<T> => {
    if (lastRequestAt !== null) {
      const remaining = delayMs - (now() - lastRequestAt);
      if (remaining > 0) await wait(remaining);
    }
    try {
      return await operation();
    } finally {
      lastRequestAt = now();
    }
  };
}

export function sanitizeMysteryMazeScanError(error: unknown): string {
  return sanitizeOfficialValidationError(error).replace(
    /\b\d{9,30}\b/g,
    "[redacted-id]",
  );
}

function rateLimitedRequester(delayMs: number) {
  const clients = new Map<string, any>();
  const run = createMinimumIntervalGate(delayMs);
  return <T>(
    account: MysteryMazeCandidate,
    endpoint: "zenkov_abstract_info" | "zenkov_detail",
  ): Promise<T> =>
    run(async () => {
      const key = `${account.ownerId}:${account.accountIndex}`;
      let zzz = clients.get(key);
      if (!zzz) {
        zzz = createZzzClient({
          cookie: account.cookie,
          uid: Number(account.uid),
          lang: getZzzClientLanguage("tw"),
        } as any) as any;
        clients.set(key, zzz);
      }
      return requestZzzRecordApi<T>(
        zzz,
        endpoint,
        account.region ? { region: account.region } : {},
      );
    });
}

async function main() {
  const options = parseMysteryMazeFixtureArgs(process.argv.slice(2));
  const database = new Database(options.database, {
    readonly: true,
    fileMustExist: true,
  });
  let rows: Array<{ ID: string; json: string }>;
  try {
    rows = database.prepare("SELECT ID, json FROM json").all() as Array<{
      ID: string;
      json: string;
    }>;
  } finally {
    database.close();
  }
  const accounts = linkedAccountsFromRows(rows);
  const baseline = accounts.find(
    (account) =>
      account.ownerId === options.baselineUser &&
      account.accountIndex === options.accountIndex,
  );
  if (!baseline) throw new Error("baseline account is unavailable or invalid");
  const request = rateLimitedRequester(options.delayMs);
  const result = await selectRicherMysteryMazeSample({
    baseline,
    candidates: accounts,
    limit: options.limit,
    batchSize: options.batchSize,
    fetcher: {
      abstract: (account) =>
        request<MysteryMazeAbstract>(account, "zenkov_abstract_info"),
      detail: (account) => request<MysteryMazeDetail>(account, "zenkov_detail"),
    },
    onFailure: () => {},
  });
  process.stdout.write(
    `Baseline richness: ${richnessTuple(result.baseline).join("/")}\n`,
  );
  process.stdout.write(
    `Anonymous accounts scanned: ${result.scanned}; failed: ${result.failed}\n`,
  );
  if (!result.selected) {
    process.stderr.write(
      "No strictly richer complete sample was found; existing fixture was not changed.\n",
    );
    process.exitCode = 2;
    return;
  }
  const sanitized = sanitizeMysteryMazeFixture(result.selected.payload);
  const localized = await materializeMysteryMazeIcons(sanitized, {
    assetDirectory: options.assets,
    referenceDirectory: relative(process.cwd(), options.assets),
  });
  await writeMysteryMazeFixtureAtomic(options.output, localized);
  process.stdout.write(
    `Selected richness: ${richnessTuple(result.selected.richness).join("/")}\n`,
  );
  process.stdout.write(
    `Anonymized fixture written to ${relative(process.cwd(), options.output)}\n`,
  );
}

if (
  process.argv[1]?.endsWith("findMysteryMazeFixture.ts") ||
  process.argv[1]?.endsWith("findMysteryMazeFixture.js")
) {
  main().catch((error) => {
    process.stderr.write(
      `Fixture scan failed: ${sanitizeMysteryMazeScanError(error)}\n`,
    );
    process.exitCode = 1;
  });
}
