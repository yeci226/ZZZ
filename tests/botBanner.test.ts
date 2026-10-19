import { createCanvas, loadImage } from "@napi-rs/canvas";
import schedule from "node-schedule";
import { BotBannerUpdater, renderBotBanner, startBotBannerRotation } from "../src/utilities/zzz/botBanner.js";
import { getTodayWallpaper, refreshWallpapers } from "../src/utilities/zzz/wallpaperManager.js";

jest.mock("node-schedule", () => ({ __esModule: true, default: { scheduleJob: jest.fn() } }));
jest.mock("../src/utilities/zzz/wallpaperManager.js", () => ({
  ...jest.requireActual("../src/utilities/zzz/wallpaperManager.js"),
  getTodayWallpaper: jest.fn(),
  refreshWallpapers: jest.fn(),
}));
jest.mock("../src/utilities/core/logger.js", () => ({
  __esModule: true, default: class { error() {} warn() {} success() {} },
}));

const key = "zzz.botBanner.bot";
const todayFile = "/cache/wallpapers/wp_2026-09-27_today.img";

function setup() {
  const values = new Map<string, any>();
  const db = {
    get: jest.fn(async (name: string) => structuredClone(values.get(name) ?? null)),
    set: jest.fn(async (name: string, value: unknown) => { values.set(name, structuredClone(value)); }),
  };
  const user = { id: "bot", setBanner: jest.fn().mockResolvedValue(undefined) };
  const now = jest.fn(() => new Date("2026-09-27T00:00:00Z"));
  const getWallpaper = jest.fn().mockResolvedValue(todayFile);
  const render = jest.fn().mockResolvedValue(Buffer.from("banner"));
  const options = { now, getWallpaper, render };
  return { values, db, user, now, getWallpaper, render, options, updater: new BotBannerUpdater(options), client: { db, user } };
}

test("startup catches up once; overlapping ticks and a restart do not upload again that day", async () => {
  const { updater, client, options, values, user, getWallpaper, render } = setup();
  await Promise.all([updater.update(client), updater.update(client)]);
  expect(user.setBanner).toHaveBeenCalledTimes(1);
  expect(user.setBanner).toHaveBeenCalledWith(Buffer.from("banner"));
  expect(values.get(key)).toEqual({ date: "2026-09-27", wallpaper: "wp_2026-09-27_today.img" });
  expect(await updater.update(client)).toBe("unchanged");
  expect(await new BotBannerUpdater(options).update(client)).toBe("unchanged");
  expect(user.setBanner).toHaveBeenCalledTimes(1);
  expect(getWallpaper).toHaveBeenCalledTimes(1);
  expect(render).toHaveBeenCalledTimes(1);
});

test("switches exactly at Taipei midnight, independent of the server timezone", async () => {
  const { updater, client, now, getWallpaper, user, values } = setup();
  now.mockReturnValue(new Date("2026-09-26T15:59:59Z"));
  getWallpaper.mockResolvedValue("/cache/wp_2026-09-26_previous.img");
  expect(await updater.update(client)).toBe("updated");
  now.mockReturnValue(new Date("2026-09-26T16:00:00Z"));
  getWallpaper.mockResolvedValue(todayFile);
  expect(await updater.update(client)).toBe("updated");
  expect(await updater.update(client)).toBe("unchanged");
  expect(user.setBanner).toHaveBeenCalledTimes(2);
  expect(values.get(key).date).toBe("2026-09-27");
});

test("Discord failure keeps the old completion date so the next tick can retry", async () => {
  const { updater, client, user, values } = setup();
  values.set(key, { date: "2026-09-26", wallpaper: "old.img" });
  user.setBanner.mockRejectedValueOnce(new Error("temporarily unavailable"));
  expect(await updater.update(client)).toBe("failed");
  expect(values.get(key).date).toBe("2026-09-26");
  expect(await updater.update(client)).toBe("updated");
  expect(values.get(key).date).toBe("2026-09-27");
});

test("a failed persistence write is retried without re-uploading an accepted banner", async () => {
  const { updater, client, db, user, values } = setup();
  db.set.mockRejectedValueOnce(new Error("database busy"));
  expect(await updater.update(client)).toBe("failed");
  expect(values.has(key)).toBe(false);
  expect(await updater.update(client)).toBe("unchanged");
  expect(values.get(key).date).toBe("2026-09-27");
  expect(user.setBanner).toHaveBeenCalledTimes(1);
});

test.each([null, "/cache/wp_2026-09-26_old.img"])("missing or stale wallpaper %s does not mark today complete", async (file) => {
  const { updater, client, getWallpaper, user, db } = setup();
  getWallpaper.mockResolvedValueOnce(file);
  expect(await updater.update(client)).toBe("unavailable");
  expect(user.setBanner).not.toHaveBeenCalled();
  expect(db.set).not.toHaveBeenCalled();
  expect(await updater.update(client)).toBe("updated");
});

test("download/render errors release the in-flight guard and leave the banner intact", async () => {
  const { updater, client, getWallpaper, render, user, db } = setup();
  getWallpaper.mockRejectedValueOnce(new Error("offline"));
  expect(await updater.update(client)).toBe("failed");
  render.mockRejectedValueOnce(new Error("corrupt image"));
  expect(await updater.update(client)).toBe("failed");
  expect(user.setBanner).not.toHaveBeenCalled();
  expect(db.set).not.toHaveBeenCalled();
  expect(await updater.update(client)).toBe("updated");
});

test("does not upload a stale image if wallpaper preparation crosses midnight", async () => {
  const { updater, client, now, render, user, db } = setup();
  render.mockImplementationOnce(async () => {
    now.mockReturnValue(new Date("2026-09-27T16:00:00Z"));
    return Buffer.from("banner");
  });
  expect(await updater.update(client)).toBe("unavailable");
  expect(user.setBanner).not.toHaveBeenCalled();
  expect(db.set).not.toHaveBeenCalled();
});

test("bot ids have separate completion state and no update runs without a logged-in user", async () => {
  const { updater, client, user, db } = setup();
  expect(await updater.update({ db, user: null })).toBe("unavailable");
  expect(db.get).not.toHaveBeenCalled();
  await updater.update(client);
  const otherUser = { ...user, id: "test-bot", setBanner: jest.fn().mockResolvedValue(undefined) };
  expect(await updater.update({ db, user: otherUser })).toBe("updated");
  expect(otherUser.setBanner).toHaveBeenCalledTimes(1);
});

test("renders a bounded centered crop without squeezing the wallpaper", async () => {
  const source = createCanvas(1600, 900);
  const ctx = source.getContext("2d");
  ctx.fillStyle = "#ff0000";
  ctx.fillRect(0, 0, 1600, 900);
  ctx.fillStyle = "#0000ff";
  ctx.fillRect(0, 130, 1600, 640);
  ctx.fillStyle = "#00ff00";
  ctx.fillRect(400, 250, 400, 400);
  const image = await loadImage(await renderBotBanner(source.toBuffer("image/png")));
  expect([image.width, image.height]).toEqual([1200, 480]);
  const output = createCanvas(1200, 480);
  const pixels = output.getContext("2d");
  pixels.drawImage(image, 0, 0);
  expect([...pixels.getImageData(20, 20, 1, 1).data]).toEqual([0, 0, 255, 255]);
  // The source's 400 x 400 square scales uniformly to 300 x 300.
  expect([...pixels.getImageData(450, 100, 1, 1).data]).toEqual([0, 255, 0, 255]);
  expect([...pixels.getImageData(450, 380, 1, 1).data]).toEqual([0, 255, 0, 255]);
  expect([...pixels.getImageData(450, 400, 1, 1).data]).toEqual([0, 0, 255, 255]);
});

test("only cluster zero schedules rotation and startup waits for the wallpaper pool", async () => {
  const { client, user } = setup();
  startBotBannerRotation({ ...client, cluster: { id: 1 } });
  expect(schedule.scheduleJob).not.toHaveBeenCalled();
  expect(refreshWallpapers).not.toHaveBeenCalled();
  let finishRefresh!: () => void;
  jest.mocked(refreshWallpapers).mockReturnValueOnce(new Promise<void>((resolve) => { finishRefresh = resolve; }));
  jest.mocked(getTodayWallpaper).mockResolvedValue(null);
  startBotBannerRotation({ ...client, cluster: { id: 0 } });
  expect(schedule.scheduleJob).toHaveBeenCalledWith({ rule: "0 * * * *", tz: "Asia/Taipei" }, expect.any(Function));
  expect(getTodayWallpaper).not.toHaveBeenCalled();
  finishRefresh();
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(getTodayWallpaper).toHaveBeenCalledWith(client.db);
  expect(user.setBanner).not.toHaveBeenCalled();
  const tick = jest.mocked(schedule.scheduleJob).mock.calls[0][1] as () => void;
  tick();
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(getTodayWallpaper).toHaveBeenCalledTimes(2);
});
