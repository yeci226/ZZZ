import { LanguageEnum, ZenlessZoneZero } from "@yeci226/hoyoapi";

type ZzzClientConstructor<T> = new (options: any) => T;

export function createZzzClient<T = ZenlessZoneZero>(
  options: ConstructorParameters<typeof ZenlessZoneZero>[0],
  ClientConstructor: ZzzClientConstructor<T> = ZenlessZoneZero as unknown as ZzzClientConstructor<T>,
): T {
  return new ClientConstructor(options);
}

export function getZzzClientLanguage(locale?: string): LanguageEnum {
  const normalized = String(locale ?? "").toLowerCase();
  if (["tw", "zh-tw", "zh-hant"].includes(normalized)) {
    return LanguageEnum.TRADIIONAL_CHINESE;
  }
  if (["cn", "zh-cn", "zh-hans"].includes(normalized)) {
    return LanguageEnum.SIMPLIFIED_CHINESE;
  }
  if (["vi", "vi-vn"].includes(normalized)) return LanguageEnum.VIETNAMESE;
  if (["jp", "ja", "ja-jp"].includes(normalized)) return LanguageEnum.JAPANESE;
  if (["kr", "ko", "ko-kr"].includes(normalized)) return LanguageEnum.KOREAN;
  if (["fr", "fr-fr"].includes(normalized)) return LanguageEnum.FRENCH;
  return LanguageEnum.ENGLISH;
}
