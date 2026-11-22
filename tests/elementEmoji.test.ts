import fs from "fs";
import os from "os";
import path from "path";
import {
  elementEmoji,
  resetElementEmojiCache,
  setElementEmojiApplication,
  syncElementEmojis,
} from "../src/utilities/zzz/elementEmoji.js";

const tempFile = () =>
  path.join(fs.mkdtempSync(path.join(os.tmpdir(), "emoji-")), "m.json");

function fakeClient(existing: Array<{ id: string; name: string }> = []) {
  const created: string[] = [];
  return {
    created,
    client: {
      application: {
        id: "app1",
        emojis: {
          fetch: async () => new Map(existing.map((e) => [e.id, e])),
          create: async ({ name }: { attachment: Buffer; name: string }) => {
            created.push(name);
            return { id: `id_${name}`, name };
          },
        },
      },
    },
  };
}

describe("屬性表情符號", () => {
  afterEach(() => {
    resetElementEmojiCache();
    setElementEmojiApplication(undefined);
  });

  it("既有伺服器表情符號優先，未上傳的新屬性退回基本屬性", () => {
    const file = tempFile();
    expect(elementEmoji(202, 1091, 1, file)).toBe(
      "<:special_ice:1532995912119615639>",
    );
    expect(elementEmoji(201, 9999, 5, file)).toBe(
      "<:fire:1261920584930037762>",
    );
  });

  it("只上傳 emoji.ts 沒有的屬性，之後查詢會用到", async () => {
    const file = tempFile();
    const { client, created } = fakeClient();
    expect(await syncElementEmojis(client, file)).toBe(1);
    expect(created).toEqual(["zzz_elem_flare"]);

    setElementEmojiApplication("app1");
    expect(elementEmoji(201, 9999, 5, file)).toBe(
      "<:zzz_elem_flare:id_zzz_elem_flare>",
    );
    setElementEmojiApplication("other-app");
    resetElementEmojiCache();
    expect(elementEmoji(201, 9999, 5, file)).toBe(
      "<:fire:1261920584930037762>",
    );
  });

  it("應用程式已有同名表情符號時沿用，不重複上傳", async () => {
    const file = tempFile();
    const { client, created } = fakeClient([
      { id: "999", name: "zzz_elem_flare" },
    ]);
    expect(await syncElementEmojis(client, file)).toBe(0);
    expect(created).toEqual([]);
    expect(JSON.parse(fs.readFileSync(file, "utf8")).app1.flare).toEqual({
      id: "999",
      name: "zzz_elem_flare",
    });
  });
});
