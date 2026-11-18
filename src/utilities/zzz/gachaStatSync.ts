import { GachaArchiveStore, getGachaArchiveStore } from "./gachaArchive.js";
import { GACHA_CATEGORY_ORDER } from "./gachaAnalysis.js";
import type { GachaStatClient, GachaStatPool, GachaStatRecord } from "./gachaStatApi.js";

const recordKey = (record: GachaStatRecord): string => `${record.itemId}|${record.recordTime}|${record.sort}`;

export async function syncOfficialGachaStats(options: {
  client: GachaStatClient;
  ownerId: string;
  uid: string;
  archive?: GachaArchiveStore;
  delayMs?: number;
}): Promise<{ requests: number }> {
  const { client, ownerId, uid } = options;
  const archive = options.archive ?? getGachaArchiveStore();
  const delayMs = options.delayMs ?? 250;
  let requests = 0;

  // Count a client call and pause before every call except the first.
  const call = async <T>(run: () => Promise<T>): Promise<T> => {
    if (requests > 0 && delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    requests += 1;
    return run();
  };

  const index = await call(() => client.index());
  archive.saveOfficialStatIndex(ownerId, uid, index);

  const stored = archive.listOfficialStatPools(ownerId, uid);
  for (const category of GACHA_CATEGORY_ORDER) {
    const type = index.types.find((item) => item.category === category);
    if (!type || !type.versions.length || category === "unknown") continue;

    const current = await call(() => client.currentPools(category));
    const finalVersions = new Set(stored
      .filter((row) => row.category === category && row.final)
      .map((row) => row.version));
    const wanted = type.versions.filter((version) => !finalVersions.has(version));
    const history = wanted.length ? await call(() => client.historyPools(category, wanted)) : [];

    const currentRecordKeys = new Set(current.flatMap((pool) => pool.records.map(recordKey)));
    const currentPoolsToSave: GachaStatPool[] = [...current];
    for (const pool of history.filter((item) => item.version === index.currentVersion)) {
      const records = pool.records.filter((item) => !currentRecordKeys.has(recordKey(item)));
      if (records.length || !pool.records.length) currentPoolsToSave.push({ ...pool, records });
    }
    archive.saveOfficialStatPools(ownerId, uid, category, index.currentVersion, currentPoolsToSave, false);

    for (const version of wanted) {
      if (version === index.currentVersion) continue;
      archive.saveOfficialStatPools(ownerId, uid, category, version, history.filter((pool) => pool.version === version), true);
    }
  }
  return { requests };
}
