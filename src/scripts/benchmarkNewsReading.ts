/** Offline only: existing article snapshots and local files; no Discord or source requests. */
import Database from "better-sqlite3";
import { access, mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import {
  messageRequest,
  type NewsMessageDocument,
} from "../utilities/news/messages.js";
import type { NewsRequestOptions } from "../utilities/news/mediaDelivery.js";

async function main() {
  const database = resolve(process.argv[2] ?? "data/zzz-news.sqlite");
  const db = new Database(database, { readonly: true, fileMustExist: true });
  const directory = resolve("previews/news-reading-optimization");
  await mkdir(directory, { recursive: true });
  try {
    const rows = db.prepare("SELECT id,body FROM news_documents").all() as {
      id: string;
      body: string;
    }[];
    const seen = new Set<string>();
    const counts: Record<string, number> = {};
    const results = [];
    for (const row of rows) {
      const document = JSON.parse(row.body) as NewsMessageDocument;
      if (document.layout !== "paged-v1" || seen.has(document.version))
        continue;
      seen.add(document.version);
      for (let page = 0; page < document.parts.length; page++) {
        const media = document.parts[page].blocks.flatMap((b) =>
          b.type === "gallery" ? b.media : [],
        );
        const kind = !media.length
          ? "text"
          : media.every((m) => m.slice)
            ? "cuts"
            : media.some((m) => m.slice)
              ? "mixed"
              : "ordinary";
        if ((counts[kind] ?? 0) >= 4) continue;
        try {
          await Promise.all(
            media.filter((m) => m.file).map((m) => access(m.file!)),
          );
        } catch {
          continue;
        }
        const measure = async (mode: NewsRequestOptions["mediaDelivery"]) => {
          const durations: number[] = [],
            reads: number[] = [];
          let uploadBytes = 0,
            attachmentCount = 0;
          for (let n = 0; n < 15; n++) {
            const started = performance.now();
            const cached = JSON.parse(
              (
                db
                  .prepare("SELECT body FROM news_documents WHERE id=?")
                  .get(row.id) as { body: string }
              ).body,
            ) as NewsMessageDocument;
            const request = await messageRequest(
              cached,
              page,
              null,
              null,
              "0".repeat(24),
              {
                mediaDelivery: mode,
                onAttachmentsRead: (metrics) => {
                  if (n >= 3) reads.push(metrics.attachmentReadMs);
                },
              },
            );
            if (n >= 3) durations.push(performance.now() - started);
            uploadBytes = request.files.reduce(
              (sum, f) => sum + f.data.length,
              0,
            );
            attachmentCount = request.files.length;
          }
          durations.sort((a, b) => a - b);
          return {
            localP50Ms: durations[5],
            localP95Ms: durations[11],
            attachmentReadMeanMs:
              reads.reduce((a, b) => a + b, 0) / reads.length,
            uploadBytes,
            attachmentCount,
          };
        };
        try {
          const before = await measure("attachment"),
            after = await measure("official-url");
          results.push({
            title: document.event.title,
            kind,
            page: page + 1,
            before,
            after,
          });
          counts[kind] = (counts[kind] ?? 0) + 1;
        } catch {
          /* Skip legacy snapshots whose attachments are no longer usable. */
        }
      }
    }
    if (!results.length)
      throw new Error("No usable cached paged articles found");
    const report = {
      measuredAt: new Date().toISOString(),
      mode: "offline-local-request-preparation",
      iterations: 12,
      note: "Includes SQLite read, JSON parsing, rendering and local attachment reads. Excludes Discord upload, rate limits and client image loading. Before uses attachment mode; after uses official URLs.",
      results,
    };
    await writeFile(
      join(directory, "benchmark.json"),
      JSON.stringify(report, null, 2),
    );
    const round = (n: number) => n.toFixed(2);
    await writeFile(
      join(directory, "benchmark.md"),
      [
        "# 新聞翻頁離線比較",
        "",
        report.note,
        "",
        "| 頁面 | 類型 | 本地 P50 毫秒（前→後） | 上傳附件 MiB（前→後） |",
        "|---|---|---:|---:|",
        ...results.map(
          (r) =>
            `| ${r.title.replaceAll("|", "／")} · ${r.page} | ${r.kind} | ${round(r.before.localP50Ms)} → ${round(r.after.localP50Ms)} | ${round(r.before.uploadBytes / 1048576)} → ${round(r.after.uploadBytes / 1048576)} |`,
        ),
        "",
        "這不是 Discord 端到端耗時；切換時仍須等待 Discord API 更新及用戶端載入圖片。",
      ].join("\n"),
    );
    console.log(
      JSON.stringify({ counts, report: join(directory, "benchmark.md") }),
    );
  } finally {
    db.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
