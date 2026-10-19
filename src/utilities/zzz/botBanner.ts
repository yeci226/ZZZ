import { createCanvas, loadImage } from "@napi-rs/canvas";
import { basename } from "node:path";
import schedule from "node-schedule";
import Logger from "../core/logger.js";
import {
  getTodayWallpaper,
  refreshWallpapers,
  wallpaperDate,
} from "./wallpaperManager.js";

interface BannerDb {
  get(key: string): Promise<any>;
  set(key: string, value: any): Promise<any>;
}

interface BannerUser {
  id: string;
  setBanner(image: Buffer): Promise<unknown>;
}

interface BannerClient {
  db: BannerDb;
  user: BannerUser | null;
}

interface BannerState {
  date: string;
  wallpaper: string;
}

interface BannerOptions {
  now?: () => Date;
  getWallpaper?: (db: BannerDb) => Promise<string | null>;
  render?: (wallpaper: string) => Promise<Buffer>;
}

type BannerResult = "updated" | "unchanged" | "unavailable" | "failed";

/** A bounded 5:2 image, cropped without stretching the daily wallpaper. */
export async function renderBotBanner(wallpaper: string | Buffer): Promise<Buffer> {
  const image = await loadImage(wallpaper);
  const canvas = createCanvas(1200, 480);
  const ctx = canvas.getContext("2d");
  const scale = Math.max(canvas.width / image.width, canvas.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  ctx.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
  return canvas.encode("png");
}

export class BotBannerUpdater {
  private readonly logger = new Logger("每日Banner");
  private readonly now: () => Date;
  private readonly getWallpaper: NonNullable<BannerOptions["getWallpaper"]>;
  private readonly render: NonNullable<BannerOptions["render"]>;
  private readonly pending = new Map<string, Promise<BannerResult>>();
  // If Discord accepted the image but saving failed, retry only the DB write.
  private readonly unsaved = new Map<string, BannerState>();

  constructor(options: BannerOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.getWallpaper = options.getWallpaper ?? getTodayWallpaper;
    this.render = options.render ?? renderBotBanner;
  }

  update(client: BannerClient): Promise<BannerResult> {
    const user = client.user;
    if (!user) return Promise.resolve("unavailable");
    const running = this.pending.get(user.id);
    if (running) return running;
    const result = this.apply(client.db, user)
      .catch((error): BannerResult => {
        this.logger.error(`更新失敗，下個整點重試：${error instanceof Error ? error.message : String(error)}`);
        return "failed";
      })
      .finally(() => this.pending.delete(user.id));
    this.pending.set(user.id, result);
    return result;
  }

  private async apply(db: BannerDb, user: BannerUser): Promise<BannerResult> {
    const date = wallpaperDate(this.now());
    const key = `zzz.botBanner.${user.id}`;
    const unsaved = this.unsaved.get(user.id);
    if (unsaved?.date === date) {
      await db.set(key, unsaved);
      this.unsaved.delete(user.id);
      return "unchanged";
    }
    if ((await db.get(key))?.date === date) return "unchanged";

    const wallpaper = await this.getWallpaper(db);
    // The wallpaper manager may return yesterday's cache while offline.
    // Keep the current banner and leave today eligible for the next retry.
    if (!wallpaper || !basename(wallpaper).startsWith(`wp_${date}_`)) {
      this.logger.warn("今日壁紙尚未就緒，保留目前 Banner，下個整點重試");
      return "unavailable";
    }
    const image = await this.render(wallpaper);
    if (wallpaperDate(this.now()) !== date) return "unavailable";
    await user.setBanner(image);
    const state = { date, wallpaper: basename(wallpaper) };
    this.unsaved.set(user.id, state);
    await db.set(key, state);
    this.unsaved.delete(user.id);
    this.logger.success(`已套用 ${date} 的簽到壁紙`);
    return "updated";
  }
}

const updater = new BotBannerUpdater();

/** Cluster zero owns the global bot profile; hourly ticks also retry failures. */
export function startBotBannerRotation(client: BannerClient & { cluster: { id: number } }): void {
  if (client.cluster.id !== 0) return;
  schedule.scheduleJob({ rule: "0 * * * *", tz: "Asia/Taipei" }, () => {
    void updater.update(client);
  });
  void refreshWallpapers(client.db)
    .then(() => updater.update(client))
    .catch((error) => new Logger("每日Banner").error(String(error)));
}
