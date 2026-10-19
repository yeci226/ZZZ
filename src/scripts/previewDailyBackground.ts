/** Offline comparison: uses the captured pre-change renderer and explicit sample inputs. */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import ts from "typescript";
import {
  buildZZZDailyCard,
  type ZZZDailyCardPayload,
} from "../utilities/canvas/dailyCard.js";

async function main() {
  const directory = resolve("previews/daily-background");
  await mkdir(directory, { recursive: true });
  const snapshot = await readFile(
    join(directory, "dailyCard.before.txt"),
    "utf8",
  );
  const beforeSource = snapshot
    .replace(/^import .*getTodayWallpaper.*\n/m, "")
    .replace(/^import .*client.*\n/m, "")
    .replace(
      "payload: ZZZDailyCardPayload,",
      "payload: ZZZDailyCardPayload, options: { background: string; now: Date },",
    )
    .replace(
      "await getTodayWallpaper(client.db).catch(() => null)",
      "options.background",
    )
    .replace("moment().tz", "moment(options.now).tz");
  const beforeModule = join(directory, "before-renderer.mjs");
  await writeFile(
    beforeModule,
    ts.transpileModule(beforeSource, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
  );
  const before = (await import(pathToFileURL(beforeModule).href))
    .buildZZZDailyCard as typeof buildZZZDailyCard;
  const cache = resolve("cache/wallpapers");
  const names = (await readdir(cache))
    .filter((n) => /^wp_/.test(n) && /\.(png|img|jpg|webp)$/.test(n))
    .sort()
    .reverse();
  const bright = process.argv[2]
    ? resolve(process.argv[2])
    : join(cache, names[0]);
  const original = await loadImage(await readFile(bright));
  const variants: { name: string; file: string }[] = [
    { name: "bright", file: bright },
  ];
  for (const [name, w, h] of [
    ["dark", 1920, 1080],
    ["portrait", 720, 1280],
    ["ultrawide", 3200, 800],
  ] as const) {
    const canvas = createCanvas(w, h),
      ctx = canvas.getContext("2d");
    ctx.fillStyle = "#273b51";
    ctx.fillRect(0, 0, w, h);
    const scale = Math.min(w / original.width, h / original.height);
    ctx.drawImage(
      original,
      (w - original.width * scale) / 2,
      (h - original.height * scale) / 2,
      original.width * scale,
      original.height * scale,
    );
    if (name === "dark") {
      ctx.fillStyle = "rgba(0,0,0,.6)";
      ctx.fillRect(0, 0, w, h);
    } else {
      ctx.fillStyle = "#ffffff";
      ctx.font = '32px "ZZZFontEn", sans-serif';
      ctx.fillText(`${name.toUpperCase()} FIXTURE — TOP`, 24, 52);
      ctx.fillText("BOTTOM — KEEP FULL FRAME", 24, h - 32);
    }
    const file = join(directory, `${name}-fixture.png`);
    await writeFile(file, canvas.toBuffer("image/png"));
    variants.push({ name, file });
  }
  const payload: ZZZDailyCardPayload = {
    nickname: "繩匠",
    uid: "800000001",
    status: "success",
    rewardName: "菲林",
    rewardCount: 60,
    rewardIcon: resolve(
      "src/assets/images/zzz/official-record/icon-feilin.a3d8b035.png",
    ),
    tomorrowRewardName: "丁尼",
    tomorrowRewardCount: 3000,
    tomorrowRewardIcon: resolve(
      "src/assets/images/zzz/official-record/icon-season-coins.8fb93ad4.png",
    ),
    totalDays: 9,
    shortSignDay: 9,
    signCntMissed: 0,
  };
  const overview = createCanvas(1600, variants.length * 500);
  const ctx = overview.getContext("2d");
  ctx.fillStyle = "#17191d";
  ctx.fillRect(0, 0, overview.width, overview.height);
  for (let row = 0; row < variants.length; row++) {
    const variant = variants[row];
    for (const [column, renderer] of [
      [0, before],
      [1, buildZZZDailyCard],
    ] as const) {
      const label = column ? "after" : "before";
      const buffer = await renderer(payload, {
        background: variant.file,
        now: new Date("2026-09-09T04:00:00Z"),
      });
      await writeFile(join(directory, `${variant.name}-${label}.png`), buffer);
      const image = await loadImage(buffer);
      ctx.fillStyle = "#ffffff";
      ctx.font = '24px "ZZZFontEn", sans-serif';
      ctx.fillText(
        `${variant.name.toUpperCase()} / ${label.toUpperCase()}`,
        column * 800 + 16,
        row * 500 + 32,
      );
      ctx.drawImage(image, column * 800, row * 500 + 50, 800, 450);
      const small = createCanvas(400, 225);
      small.getContext("2d").drawImage(image, 0, 0, 400, 225);
      await writeFile(
        join(directory, `${variant.name}-${label}-400.png`),
        small.toBuffer("image/png"),
      );
    }
  }
  await writeFile(
    join(directory, "comparison.png"),
    overview.toBuffer("image/png"),
  );
  console.log(`Daily comparison: ${join(directory, "comparison.png")}`);
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
