import { paginateArchiveAccounts } from "../src/commands/slash/settings.js";
import type { GachaArchiveAccount } from "../src/utilities/zzz/gachaArchive.js";

function row(uid: string, source: "official" | "manual"): GachaArchiveAccount {
  return {
    ownerId: "owner",
    uid,
    region: "prod_gf_jp",
    source,
    weeklyEnabled: source === "official",
    lastSyncedAt: null,
    syncStatus: "idle",
    lastError: null,
    orphanedAt: null,
    purgeAfter: null,
    purgeWarnedAt: null,
    everLinked: true,
  };
}

describe("settings archive pagination", () => {
  it("paginates by UID so both sources and the all option remain together", () => {
    const rows = Array.from({ length: 18 }, (_, index) => [
      row(String(100000000 + index), "official"),
      row(String(100000000 + index), "manual"),
    ]).flat();
    const first = paginateArchiveAccounts(rows, 0);
    const last = paginateArchiveAccounts(rows, 99);
    expect(first).toMatchObject({ page: 0, pageCount: 3, totalUids: 18 });
    expect(new Set(first.rows.map((item) => item.uid)).size).toBe(8);
    expect(first.rows).toHaveLength(16);
    expect(last.page).toBe(2);
    expect(last.rows).toHaveLength(4);
  });
});
