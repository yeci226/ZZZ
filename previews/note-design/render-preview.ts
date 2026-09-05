import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { renderOfficialNote } from "../../src/utilities/zzz/noteRenderer.js";

const previewRoot = process.env.ZZZ_PREVIEW_OUTPUT_ROOT || join(process.cwd(), "previews");
const output = join(previewRoot, "zzz-note-official-preview.png");
export async function renderNotePreview() {
const now = Date.parse("2026-09-05T00:00:00.000Z");
const [page] = await renderOfficialNote({
  uid: "130000000",
  playerName: "匿名繩匠",
  locale: "tw",
  now,
  note: {
    energy: { progress: { current: 123, max: 240 }, restore: 72000, day_type: 2, hour: 10, minute: 28 },
    member_card: { is_open: true, member_card_state: "MemberCardStateACK", exp_time: 29 * 86400 },
    vitality: { current: 400, max: 400 },
    card_sign: "CardSignNotDone",
    vhs_sale: { sale_state: "SaleStateDoing" },
    bounty_commission: { num: 8000, total: 8000, refresh_time: 277200 },
    weekly_task: { cur_point: 1150, max_point: 2100, refresh_time: Math.floor(now / 1000) + 104400 },
    temple_running: {
      current_currency: 0,
      weekly_currency_max: 5000,
      currency_next_refresh_ts: 302400,
      expedition_state: "ExpeditionStateEnd",
      bench_state: "BenchStateCanProduce",
      shelve_state: "ShelveStateSoldOut",
    },
  },
  calendar: { activity_list: [
    { activity_id: 1, name: "恰浪花逐夏而至", monochrome_got_cnt: 0, monochrome_cnt: 1050, state: "STATE_IN_PROGRESS", left_end_ts: 277200 },
    { activity_id: 2, name: "極危險通緝與悠遊假期", monochrome_got_cnt: 300, monochrome_cnt: 300, state: "STATE_COMPLETED", left_end_ts: 0 },
  ] },
});
return page!;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
const page = await renderNotePreview();
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, page);
}
