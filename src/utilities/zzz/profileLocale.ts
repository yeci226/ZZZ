const FONT_FAMILIES = {
  tw: "TW",
  cn: "CN",
  vi: "VI",
  jp: "JP",
  kr: "KR",
  fr: "FR",
  default: "EN",
} as const;

export function resolveProfileFont(locale: string): string {
  const normalized = locale.trim().toLowerCase().replaceAll("_", "-");
  if (
    normalized === "tw" ||
    normalized === "zh-tw" ||
    normalized.startsWith("zh-hant")
  )
    return FONT_FAMILIES.tw;
  if (
    normalized === "cn" ||
    normalized === "zh-cn" ||
    normalized.startsWith("zh-hans")
  )
    return FONT_FAMILIES.cn;
  if (normalized === "vi" || normalized.startsWith("vi-"))
    return FONT_FAMILIES.vi;
  if (
    normalized === "jp" ||
    normalized === "ja" ||
    normalized.startsWith("ja-")
  )
    return FONT_FAMILIES.jp;
  if (
    normalized === "kr" ||
    normalized === "ko" ||
    normalized.startsWith("ko-")
  )
    return FONT_FAMILIES.kr;
  if (normalized === "fr" || normalized.startsWith("fr-"))
    return FONT_FAMILIES.fr;
  return FONT_FAMILIES.default;
}
