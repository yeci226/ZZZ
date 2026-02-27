import fs from "fs";
import path from "path";
import fetch from "node-fetch";

const downloadImage = async (url: string, filepath: string) => {
  const res = await fetch(url);
  if (!res.ok) return false;

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const dir = path.dirname(filepath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(filepath, buffer);
  return true;
};

export async function downloadPaintingCache(url: string) {
  if (!url || !url.startsWith("http")) return url;

  try {
    const filename = url.split("/").pop() || `${Date.now()}.png`;
    const filepath = path.resolve(
      "src/assets/images/zzz/paintings",
      filename.split("?")[0],
    );

    if (fs.existsSync(filepath)) return filepath;

    const success = await downloadImage(url, filepath);
    return success ? filepath : url;
  } catch (error) {
    console.error(`[downloadPaintingCache] Failed to download ${url}:`, error);
    return url;
  }
}
