import Database from "better-sqlite3";
import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { WallpaperManager } from "../../../src/utilities/zzz/wallpaperManager.js";
const directory = process.argv[2];
const sqlite = new Database(join(directory, "shared.sqlite"));
sqlite.pragma("busy_timeout = 5000");
const db = {
  async get(key: string) {
    const row = sqlite.prepare("SELECT value FROM kv WHERE key=?").get(key) as
      { value: string } | undefined;
    return row ? JSON.parse(row.value) : null;
  },
  async set(key: string, value: unknown) {
    sqlite
      .prepare("INSERT OR REPLACE INTO kv VALUES (?,?)")
      .run(key, JSON.stringify(value));
  },
};
try {
  const manager = new WallpaperManager({
    cacheDir: directory,
    now: () => new Date("2026-09-09T04:00:00Z"),
    download: async (url) => {
      await appendFile(join(directory, "downloads.log"), `${url}\n`);
      await new Promise((r) => setTimeout(r, 100));
      return readFile(join(directory, "source.png"));
    },
  });
  console.log(await manager.getToday(db));
} finally {
  sqlite.close();
}
