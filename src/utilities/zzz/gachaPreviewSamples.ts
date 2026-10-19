import path from "node:path";
import type { GachaResultItem } from "./gachaAnimationCache.js";

// Fixed fixtures for reviewing playback. These are not random draws or a banner pool.
const asset = (file: string) => path.resolve("src/assets/images", file);
// The official role detail page uses role_vertical_painting_url (684 x 356).
const portrait = (id: string) => path.resolve(`src/assets/gacha-simulation/ui/characters/${id}.png`);
const crop = (x: number, y: number, width: number, height: number) => [x / 684, y / 356, width / 684, height / 356] as const;
// Nekomata and Anby framing was fitted against the supplied game screenshots.
// These are per-portrait source rectangles, not a shared face-centering heuristic.
const neko: GachaResultItem = { id: "1021", name: "貓又", rank: "S", image: portrait("1021"), crop: crop(150, 37, 332, 220), isNew: true };
export function gachaPreviewItems(mode: "single" | "ten"): GachaResultItem[] {
  const items: GachaResultItem[] = [neko];
  if (mode === "ten") {
    items.push(
      { id: "1011", name: "安比", rank: "A", image: portrait("1011"), crop: crop(171, 49, 282, 187) },
      // No matching Nicole card in the supplied references: use the same face-height band.
      { id: "1031", name: "妮可", rank: "A", image: portrait("1031"), crop: crop(216, 32, 300, 199) },
      ...["「月相」-望", "「月相」-晦", "「月相」-朔", "「殘響」-Ⅰ型", "「殘響」-Ⅱ型", "「殘響」-Ⅲ型", "「湍流」-銃型"].map((name, i) => ({
        id: String(12001 + i), name, rank: "B" as const, image: asset(`icons/gacha/weapon/${12001 + i}.webp`),
      })),
    );
  }
  return items.map(item => ({ ...item }));
}
