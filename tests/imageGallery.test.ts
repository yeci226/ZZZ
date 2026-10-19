import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { buildImageGallery, safeGalleryPath } from "../src/utilities/imageGallery.js";

it("indexes nested media, links every folder, escapes names, and loads GIFs only on request", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "gallery-test-"));
  try {
    await mkdir(path.join(dir, "zzz/gacha/ten-s00-a00-b10"), { recursive: true });
    await writeFile(path.join(dir, "舊圖片 &.png"), "png");
    await writeFile(path.join(dir, "zzz/gacha/ten-s00-a00-b10/test.gif"), "GIF89a");
    const index = await buildImageGallery(dir);
    expect(index.entries).toHaveLength(2);
    const data = async (file: string) => JSON.parse((await readFile(path.join(dir, file), "utf8")).match(/<script id="data" type="application\/json">(.*?)<\/script>/s)![1]);
    expect(await data("index.html")).toEqual(expect.arrayContaining([expect.objectContaining({ name: "zzz", url: "/zzz/", folder: true, count: 1 })]));
    expect(await data("zzz/gacha/index.html")).toEqual([expect.objectContaining({ label: "十抽・0S／0A／10B", folder: true })]);
    expect(await data("zzz/gacha/ten-s00-a00-b10/index.html")).toEqual([expect.objectContaining({ name: "test.gif", url: "/zzz/gacha/ten-s00-a00-b10/test.gif", type: "gif" })]);
    const page = await readFile(path.join(dir, "zzz/gacha/ten-s00-a00-b10/index.html"), "utf8");
    expect(page).toContain("x.type==='gif'&&!x.thumbnail");
    expect(page).toContain('href="/zzz/gacha/"');
    expect(index.entries.find(e => e.type === "png")!.pathname).toContain("%26");
    expect(() => safeGalleryPath("/%2e%2e/secret")).toThrow();
    expect(() => safeGalleryPath("/folder%5csecret")).toThrow();
  } finally { await rm(dir, { recursive: true, force: true }); }
});
