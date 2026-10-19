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

export function shouldLoadCommand(
  command: { developmentOnly?: boolean; data?: { name?: string } },
  nodeEnv = process.env.NODE_ENV,
): boolean {
  // Incremental tsc builds can leave removed command modules in dist.
  // These settings are now available exclusively through /settings.
  if (["automimo", "reminder", "locale"].includes(command.data?.name ?? "")) return false;
  return command.developmentOnly !== true || nodeEnv === "dev";
}
