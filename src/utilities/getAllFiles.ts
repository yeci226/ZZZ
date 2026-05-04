import { readdir } from "fs/promises";
import { join, extname } from "path";

export async function getAllFiles(dir: string, extension: string = ".js") {
  let files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(await getAllFiles(fullPath, extension));
    } else if (extname(entry.name) === extension) {
      files.push(fullPath);
    }
  }

  return files;
}
