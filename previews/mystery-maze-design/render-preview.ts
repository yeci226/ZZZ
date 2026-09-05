import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { renderMysteryMaze } from "../../src/utilities/zzz/mysteryMazeRenderer.js";

export async function renderMysteryMazePreview() {
  const fixture = JSON.parse(
    await readFile(
      join(process.cwd(), "tests", "fixtures", "mysteryMaze.rich.json"),
      "utf8",
    ),
  );
  return renderMysteryMaze({
    uid: "000000000",
    locale: "tw",
    abstract: fixture.abstract,
    detail: fixture.detail,
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const previewRoot =
    process.env.ZZZ_PREVIEW_OUTPUT_ROOT || join(process.cwd(), "previews");
  const output = join(previewRoot, "mystery-maze-design");
  await mkdir(output, { recursive: true });
  const pages = await renderMysteryMazePreview();
  for (let index = 0; index < pages.length; index++) {
    await writeFile(
      join(output, `迷宮詭域-${String(index + 1).padStart(2, "0")}.png`),
      pages[index]!.buffer,
    );
  }
}
