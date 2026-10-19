import { client } from "../../index.js";
import { getLegacyAccounts } from "../accountStore.js";
import { getUserLang } from "../utilities.js";
import { createZzzClient, getZzzClientLanguage } from "./clientFactory.js";
import { getGachaArchiveStore } from "./gachaArchive.js";
import { syncOfficialGachaArchive } from "./gachaSync.js";

export type GachaImportContinuation = "synced" | "failed" | "unlinked";

export async function continueOfficialGachaArchive(
  ownerId: string,
  uid: string,
): Promise<GachaImportContinuation> {
  try {
    const accounts = await getLegacyAccounts(client.db as any, ownerId);
    const linked = accounts.find((account) => String(account.uid) === uid && account.cookie);
    if (!linked) return "unlinked";
    if (linked.invalid === true) return "failed";

    const setting = await client.db.get<boolean>(`${ownerId}.gachaWeeklyArchive`);
    const locale = (await getUserLang(ownerId)) || "tw";
    const zzz = createZzzClient({
      cookie: linked.cookie,
      lang: getZzzClientLanguage(locale),
      uid: Number(linked.uid),
    });
    await syncOfficialGachaArchive({ zzz, ownerId, enableWeekly: setting !== false });
    if (setting == null) await client.db.set(`${ownerId}.gachaWeeklyArchive`, true);
    return "synced";
  } catch {
    try {
      const setting = await client.db.get<boolean>(`${ownerId}.gachaWeeklyArchive`);
      if (setting !== false) {
        getGachaArchiveStore().setWeeklyEnabled(ownerId, uid, true);
        if (setting == null) await client.db.set(`${ownerId}.gachaWeeklyArchive`, true);
      }
    } catch {
      // The imported records are already committed; a later archive run can retry.
    }
    return "failed";
  }
}
