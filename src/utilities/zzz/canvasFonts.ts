import { GlobalFonts } from "@napi-rs/canvas";
import { existsSync } from "node:fs";
import { join } from "node:path";

const PRIMARY_FONTS: Array<[string, string]> = [
  ["en-us.ttf", "EN"],
  ["zh-tw.ttf", "TW"],
  ["zh-cn.ttf", "CN"],
  ["vi-vn.ttf", "VI"],
  ["ja-jp.ttf", "JP"],
  ["ko-kr.ttf", "KR"],
  ["fr-fr.ttf", "FR"],
  ["Nunito-BlackItalic.ttf", "Nunito"],
];

const OFFICIAL_ZZZ_FONTS: Array<[string, string]> = [
  [join("fonts", "zzz-official", "zzz-tw.woff2"), "ZZZInpinOfficial"],
  [join("fonts", "zzz-official", "Impact.woff2"), "ZZZImpactOfficial"],
];

const FALLBACK_FONTS: Array<[string, string]> = [
  ["/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc", "CJKFallback"],
  ["/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc", "CJKFallback"],
  ["/System/Library/Fonts/STHeiti Light.ttc", "CJKFallbackTC"],
  ["/System/Library/Fonts/Hiragino Sans GB.ttc", "CJKFallbackSC"],
  ["/System/Library/Fonts/ヒラギノ角ゴシック W4.ttc", "CJKFallbackJP"],
  ["/System/Library/Fonts/Supplemental/Arial Unicode.ttf", "CJKFallbackUnicode"],
  ["/Library/Fonts/Arial Unicode.ttf", "CJKFallbackUnicode"],
  [join(".", "src", "assets", "fonts", "NotoSansCJKtc-Regular.otf"), "CJKFallback"],
];

const PRIMARY_BY_LOCALE: Record<string, string> = {
  tw: "TW",
  "zh-tw": "TW",
  "zh-hant": "TW",
  cn: "CN",
  "zh-cn": "CN",
  "zh-hans": "CN",
  vi: "VI",
  "vi-vn": "VI",
  jp: "JP",
  ja: "JP",
  "ja-jp": "JP",
  kr: "KR",
  ko: "KR",
  "ko-kr": "KR",
  fr: "FR",
  "fr-fr": "FR",
  en: "EN",
  "en-us": "EN",
};

let initialized = false;
let fallbackFamilies: string[] = [];

export function ensureZzzCanvasFonts(): void {
  if (initialized) return;
  initialized = true;

  for (const [file, family] of OFFICIAL_ZZZ_FONTS) {
    try {
      GlobalFonts.registerFromPath(join(".", "src", "assets", file), family);
    } catch {
      // Keep the existing locale fonts as a safe fallback on platforms whose
      // canvas build cannot parse the official WOFF2 files.
    }
  }

  for (const [file, family] of PRIMARY_FONTS) {
    try {
      GlobalFonts.registerFromPath(join(".", "src", "assets", file), family);
    } catch {
      // A missing optional locale font must not prevent other locales from rendering.
    }
  }

  for (const [file, family] of FALLBACK_FONTS) {
    if (!existsSync(file)) continue;
    try {
      if (GlobalFonts.registerFromPath(file, family)) {
        if (!fallbackFamilies.includes(family)) fallbackFamilies.push(family);
      }
    } catch {
      // Continue with the next platform-specific fallback.
    }
  }

  // Keep a deterministic fallback even when no platform CJK font was available.
  if (fallbackFamilies.length === 0) fallbackFamilies = ["Arial"];
}

export function getZzzOfficialFont(locale: string | undefined): string {
  ensureZzzCanvasFonts();
  return ["ZZZInpinOfficial", getZzzCanvasFont(locale)].join(", ");
}

export function getZzzOfficialNumberFont(locale?: string): string {
  ensureZzzCanvasFonts();
  return ["ZZZImpactOfficial", getZzzOfficialFont(locale)].join(", ");
}

export function getZzzCanvasFont(locale: string | undefined): string {
  ensureZzzCanvasFonts();
  const normalized = String(locale ?? "en").toLowerCase();
  const primary = PRIMARY_BY_LOCALE[normalized] ?? "EN";
  return [primary, ...fallbackFamilies].join(", ");
}

export function normalizeZzzLocale(locale: string | undefined): string {
  const normalized = String(locale ?? "en").toLowerCase();
  if (normalized === "tw" || normalized === "zh-tw" || normalized === "zh-hant") return "tw";
  if (normalized === "cn" || normalized === "zh-cn" || normalized === "zh-hans") return "cn";
  if (normalized === "vi" || normalized === "vi-vn") return "vi";
  if (normalized === "jp" || normalized === "ja" || normalized === "ja-jp") return "jp";
  if (normalized === "kr" || normalized === "ko" || normalized === "ko-kr") return "kr";
  if (normalized === "fr" || normalized === "fr-fr") return "fr";
  return "en";
}
