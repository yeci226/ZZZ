import { loadImage } from "@napi-rs/canvas";
import { QuickDB } from "quick.db";

import { getLegacyAccountAtIndex } from "../utilities/accountStore.js";
import { createZzzClient, getZzzClientLanguage } from "../utilities/zzz/clientFactory.js";
import { renderOfficialBanner } from "../utilities/zzz/bannerRenderer.js";
import { renderMysteryMaze } from "../utilities/zzz/mysteryMazeRenderer.js";
import { renderOfficialNote } from "../utilities/zzz/noteRenderer.js";
import { requestZzzRecordApi, type ZzzRecordEndpoint } from "../utilities/zzz/officialRecordApi.js";
import { sanitizeOfficialValidationError, validateOfficialRecordPayload } from "../utilities/zzz/officialRecordValidation.js";

const ownerId = process.env.ZZZ_LIVE_VALIDATION_OWNER_ID;
if (!ownerId) {
  process.stdout.write("SKIP: set ZZZ_LIVE_VALIDATION_OWNER_ID to run credentialed ZZZ API validation.\n");
  process.exit(0);
}

const accountIndex = Math.max(0, Number(process.env.ZZZ_LIVE_VALIDATION_ACCOUNT_INDEX) || 0);
const locale = process.env.ZZZ_LIVE_VALIDATION_LOCALE || "tw";
const db = new QuickDB();

try {
  const account = await getLegacyAccountAtIndex(db as any, ownerId, accountIndex);
  if (!account?.uid || !account.cookie || account.invalid === true) throw new Error("Validation account is unavailable or invalid");
  const zzz = createZzzClient({
    cookie: account.cookie,
    uid: Number(account.uid),
    lang: getZzzClientLanguage(locale),
  } as any) as any;

  const note = await zzz.record.note();
  const noteIssues = validateOfficialRecordPayload("note", note);
  if (noteIssues.length) throw new Error(noteIssues.join("; "));

  const endpoints: ZzzRecordEndpoint[] = [
    "activity_calendar", "gacha_calendar", "cur_gacha_detail",
    "gacha_record", "zenkov_abstract_info", "zenkov_detail",
  ];
  const payloads = new Map<ZzzRecordEndpoint, any>();
  for (const endpoint of endpoints) {
    const query = endpoint === "gacha_record" ? { gacha_type: "GACHA_TYPE_CHARACTER_UP" } : {};
    const data = await requestZzzRecordApi<any>(zzz, endpoint, query);
    const issues = validateOfficialRecordPayload(endpoint, data);
    if (issues.length) throw new Error(issues.join("; "));
    payloads.set(endpoint, data);
  }

  const notePages = await renderOfficialNote({
    uid: "000000000", playerName: "Validation", locale, note,
    calendar: payloads.get("activity_calendar"),
  });
  const banner = await renderOfficialBanner({
    uid: "000000000", locale, calendar: payloads.get("gacha_calendar"),
    details: payloads.get("cur_gacha_detail"), showPrivate: true,
  });
  const mazePages = await renderMysteryMaze({
    uid: "000000000", locale, abstract: payloads.get("zenkov_abstract_info"),
    detail: payloads.get("zenkov_detail"),
  });
  for (const image of [...notePages, banner, ...mazePages.map((page) => page.buffer)]) {
    const decoded = await loadImage(image);
    if (!decoded.width || !decoded.height) throw new Error("Renderer returned an invalid image");
  }
  process.stdout.write(`PASS: validated ${endpoints.length + 1} endpoint contracts and ${notePages.length + mazePages.length + 1} rendered pages.\n`);
} catch (error) {
  process.stderr.write(`FAIL: ${sanitizeOfficialValidationError(error)}\n`);
  process.exitCode = 1;
} finally {
  await (db.driver as any).close?.();
}
