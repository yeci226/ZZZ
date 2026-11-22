/**
 * 屬性表情符號：先用 emoji.ts 既有的伺服器表情符號，缺少者（新屬性）自動上傳為
 * 機器人的應用程式表情符號，ID 記錄在 element-emojis.generated.json。
 */
import fs from "fs";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import emoji from "../../assets/emoji.js";
import Logger from "../core/logger.js";
import {
  ELEMENT_ICON_BY_TYPE,
  getElementEmojiKey,
  getElementIconFileByName,
  knownElementIconNames,
} from "./elements.js";

type AppEmoji = { id: string; name: string };
type Manifest = Record<string, Record<string, AppEmoji>>;

const MANIFEST_FILE = "./src/assets/element-emojis.generated.json";
const MANIFEST_TTL_MS = 10 * 60 * 1000;
const APP_EMOJI_LIMIT = 2000;
const EMOJI_MAX_BYTES = 256 * 1024;
const staticEmoji = emoji as Record<string, string>;

let applicationId: string | undefined;
let manifestCache: { data: Manifest; loadedAt: number } | undefined;

/** 每個 cluster 啟動時記錄應用程式 ID，查詢時才知道要用哪一組表情符號。 */
export function setElementEmojiApplication(id: string | undefined) {
  applicationId = id;
}

function readManifest(file: string): Manifest {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

/** 其他 cluster 不負責上傳，定期重讀清單以取得新表情符號。 */
function manifest(file: string = MANIFEST_FILE): Manifest {
  if (!manifestCache || Date.now() - manifestCache.loadedAt > MANIFEST_TTL_MS)
    manifestCache = { data: readManifest(file), loadedAt: Date.now() };
  return manifestCache.data;
}

export function resetElementEmojiCache() {
  manifestCache = undefined;
}

export const appEmojiName = (iconName: string) => `zzz_elem_${iconName}`;

function emojiForKey(key: string | undefined, file?: string) {
  if (!key) return undefined;
  if (staticEmoji[key]) return staticEmoji[key];
  const app = applicationId ? manifest(file)[applicationId]?.[key] : undefined;
  return app ? `<:${app.name}:${app.id}>` : undefined;
}

/** 屬性表情符號字串；新屬性尚未上傳時退回基本屬性。 */
export function elementEmoji(
  elementType: number,
  characterId?: string | number,
  subElementType?: number | null,
  file?: string,
): string | undefined {
  return (
    emojiForKey(getElementEmojiKey(elementType, characterId, subElementType), file) ??
    emojiForKey(ELEMENT_ICON_BY_TYPE[elementType], file)
  );
}

async function renderEmojiPng(iconPath: string): Promise<Buffer> {
  const image = await loadImage(iconPath);
  const size = 128;
  const scale = Math.min(size / image.width, size / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  const canvas = createCanvas(size, size);
  canvas
    .getContext("2d")
    .drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
  return canvas.toBuffer("image/png");
}

type EmojiClient = {
  application: {
    id: string;
    emojis: {
      fetch(): Promise<{ values(): Iterable<{ id: string; name: string | null }> }>;
      create(options: { attachment: Buffer; name: string }): Promise<{
        id: string;
        name: string | null;
      }>;
    };
  } | null;
};

/** 把 emoji.ts 沒有的屬性圖示上傳成應用程式表情符號（只新增、不刪除）。 */
export async function syncElementEmojis(
  client: EmojiClient,
  file: string = MANIFEST_FILE,
): Promise<number> {
  const logger = new Logger("屬性表情符號");
  const application = client.application;
  if (!application) return 0;

  const missing = knownElementIconNames().filter((name) => !staticEmoji[name]);
  if (!missing.length) return 0;

  const data = readManifest(file);
  const entries = (data[application.id] ??= {});
  const existing = [...(await application.emojis.fetch()).values()];
  const byName = new Map(existing.map((e) => [e.name ?? "", e]));
  let count = existing.length;
  let created = 0;

  for (const name of missing) {
    const emojiName = appEmojiName(name);
    const found = byName.get(emojiName);
    if (found) {
      entries[name] = { id: found.id, name: emojiName };
      continue;
    }
    const iconPath = getElementIconFileByName(name);
    if (!iconPath) continue;
    if (count >= APP_EMOJI_LIMIT) {
      logger.warn(`應用程式表情符號已達上限 ${APP_EMOJI_LIMIT}，略過 ${name}`);
      break;
    }
    try {
      const png = await renderEmojiPng(iconPath);
      if (png.length > EMOJI_MAX_BYTES) {
        logger.warn(`${name} 超過表情符號大小上限，略過`);
        continue;
      }
      const emoji = await application.emojis.create({
        attachment: png,
        name: emojiName,
      });
      entries[name] = { id: emoji.id, name: emojiName };
      count++;
      created++;
      logger.info(`已上傳 ${emojiName}`);
    } catch (e: any) {
      logger.error(`上傳 ${emojiName} 失敗：${e?.message ?? e}`);
    }
  }

  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  resetElementEmojiCache();
  return created;
}
