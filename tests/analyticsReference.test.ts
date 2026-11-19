import {
  AnalyticsSource,
  parseReferenceRuns,
  matchReferenceRuns,
  safeVideo,
  analyticsSource,
} from "../src/utilities/zzz/analyticsSource";
import {
  buildAnalyticsEntry,
  handleAnalyticsReference,
} from "../src/utilities/zzz/analyticsReference";

const actor = (id: number) => ({
  attacker_id: id,
  agent_name: `Agent ${id}`,
  damage_dealt: 300,
  equipment: {
    mindscape: "M0",
    w_engine: "Engine",
    substats: { crit_rate: 8 },
  },
});
const run = (extra: Record<string, unknown> = {}) => ({
  id: "run_test",
  dps: 10,
  duration_sec: 90,
  total_damage: 900,
  actors: [actor(1011), actor(1021), actor(1031)],
  events: [{ agent_name: "Agent 1011", skill_name: "Basic", damage: 100 }],
  status: "pending",
  ...extra,
});
const payload = (...runs: unknown[]) => ({ runs });
const mockInteraction = (customId: string, userId = "123") => ({
  customId,
  user: { id: userId },
  locale: "zh-TW",
  reply: jest.fn().mockResolvedValue(undefined),
  deferReply: jest.fn().mockResolvedValue(undefined),
  deferUpdate: jest.fn().mockResolvedValue(undefined),
  editReply: jest.fn().mockResolvedValue(undefined),
  followUp: jest.fn().mockResolvedValue(undefined),
});
const entry = (selected = [{ id: 1011 }]) => {
  const rows = buildAnalyticsEntry(
    "123",
    "tw",
    selected,
    [1011, 1021, 1031].map((id) => ({ id, rank: 0, name: `角色${id}` })),
  );
  return (rows[0].toJSON().components[0] as any).custom_id as string;
};

afterEach(() => jest.restoreAllMocks());

test("excludes beta/archive/improvement flags, invalid numbers and duplicate actors; public pending is not a moderation decision", () => {
  const parsed = parseReferenceRuns(
    payload(
      run(),
      run({ id: "run_beta", beta_revision: "3.2" }),
      run({ id: "run_archive", beta_archive: { version: "3.1" } }),
      run({ id: "run_bad", needs_improvement: true }),
      run({ id: "run_nan", dps: NaN }),
      run({ id: "run_zero", duration_sec: 0 }),
      run({ id: "run_duplicate", actors: [actor(1011), actor(1011)] }),
      null,
    ),
  );
  expect(parsed.map((r) => r.id)).toEqual(["run_test"]);
  expect(() => parseReferenceRuns({ error: "unavailable" })).toThrow();
  expect(safeVideo("https://youtu.be/test")).toBeDefined();
  expect(safeVideo("https://youtube.com.evil.test/x")).toBeUndefined();
  expect(safeVideo("javascript:alert(1)")).toBeUndefined();
});

test("matches all selected agents and requires the entire team to be owned", () => {
  const runs = parseReferenceRuns(
    payload(
      run(),
      run({ id: "run_other", actors: [actor(1011), actor(1041)], dps: 20 }),
    ),
  );
  expect(matchReferenceRuns(runs, ["1011"]).map((r) => r.id)).toEqual([
    "run_other",
    "run_test",
  ]);
  expect(
    matchReferenceRuns(runs, ["1011", "1021"], ["1011", "1021", "1031"]).map(
      (r) => r.id,
    ),
  ).toEqual(["run_test"]);
  expect(matchReferenceRuns(runs, [], ["1011", "1021"])).toEqual([]);
});

test("coalesces requests, caches for an hour, falls back for up to 24 hours and backs off failures", async () => {
  let now = 1000;
  const fetch = jest.fn().mockResolvedValue(payload(run()));
  const source = new AnalyticsSource(fetch, () => now);
  await Promise.all([source.get(), source.get()]);
  expect(fetch).toHaveBeenCalledTimes(1);
  await source.get();
  expect(fetch).toHaveBeenCalledTimes(1);
  now += 3600001;
  fetch.mockRejectedValue(new Error("offline"));
  expect((await source.get()).stale).toBe(true);
  expect((await source.get()).stale).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(2);
  now += 86400000;
  await expect(source.get()).rejects.toThrow("offline");
});

test("rejects another user and expired sessions before fetching", async () => {
  const fetch = jest.spyOn(analyticsSource, "get");
  const id = entry();
  const other = mockInteraction(id, "456");
  await handleAnalyticsReference(other as any);
  expect(other.reply).toHaveBeenCalled();
  const now = Date.now();
  jest.spyOn(Date, "now").mockReturnValue(now + 31 * 60000);
  const expired = mockInteraction(id);
  await handleAnalyticsReference(expired as any);
  expect(expired.reply).toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

test("renders private reference views, damage aggregates, source links and explicitly unverified exports", async () => {
  jest.spyOn(analyticsSource, "get").mockResolvedValue({
    runs: parseReferenceRuns(
      payload(
        run({
          combat_log_url: "present",
          youtube_url: "https://youtu.be/test",
        }),
      ),
    ),
    fetchedAt: 1000,
    stale: false,
  });
  const id = entry();
  const open = mockInteraction(id);
  await handleAnalyticsReference(open as any);
  expect(open.deferReply).toHaveBeenCalledWith({ flags: 64 });
  const message = open.editReply.mock.calls[0][0];
  expect(message.embeds[0].toJSON().description).toContain("不是此帳號");
  expect(
    message.components
      .map((r: any) => r.toJSON())
      .every((r: any) => r.components.length <= 5),
  ).toBe(true);
  for (const mode of ["gear", "damage"]) {
    const view = mockInteraction(id.replace(":open:teams:", `:view:${mode}:`));
    await handleAnalyticsReference(view as any);
    expect(view.deferUpdate).toHaveBeenCalled();
    expect(
      view.editReply.mock.calls[0][0].embeds[0].toJSON().fields.length,
    ).toBeGreaterThan(0);
  }
  const download = mockInteraction(id.replace(":open:", ":export:"));
  await handleAnalyticsReference(download as any);
  const exported = JSON.parse(
    download.editReply.mock.calls[0][0].files[0].attachment.toString(),
  );
  expect(exported.calibrationReady).toBe(false);
  expect(exported.verified).toBe(false);
  expect(exported).not.toHaveProperty("roster");
});

test("empty roster matches and upstream failure have usable replies", async () => {
  jest
    .spyOn(analyticsSource, "get")
    .mockResolvedValueOnce({ runs: [], fetchedAt: 1000, stale: false })
    .mockRejectedValueOnce(new Error("offline"));
  const empty = mockInteraction(entry([]));
  await handleAnalyticsReference(empty as any);
  expect(
    empty.editReply.mock.calls[0][0].embeds[0].toJSON().description,
  ).toContain("沒有符合");
  const failed = mockInteraction(entry());
  await handleAnalyticsReference(failed as any);
  expect(failed.editReply.mock.calls[0][0].content).toContain("暫時無法");
});
