import en from '@/languages/en.js';
import tw from '@/languages/tw.js';
import cn from '@/languages/cn.js';
import vi from '@/languages/vi.js';
import jp from '@/languages/jp.js';
import kr from '@/languages/kr.js';
import fr from '@/languages/fr.js';

import { LanguageEnum } from '@yeci226/hoyoapi';

const langs: { [key in LanguageEnum]: Record<string, string> } = {
  [LanguageEnum.ENGLISH]: en,
  [LanguageEnum.TRADIIONAL_CHINESE]: tw,
  [LanguageEnum.SIMPLIFIED_CHINESE]: cn,
  [LanguageEnum.VIETNAMESE]: vi,
  [LanguageEnum.JAPANESE]: jp,
  [LanguageEnum.KOREAN]: kr,
  [LanguageEnum.FRENCH]: fr,
  [LanguageEnum.GERMAN]: {},
  [LanguageEnum.SPANISH]: {},
  [LanguageEnum.INDONESIAN]: {},
  [LanguageEnum.ITALIAN]: {},
  [LanguageEnum.PORTUGUESE]: {},
  [LanguageEnum.RUSSIAN]: {},
  [LanguageEnum.THAI]: {},
  [LanguageEnum.TURKISH]: {},
};

/**
 * @description 創建翻譯器
 * @param lang - 語言
 * @returns 翻譯器
 */
export function createTranslator(lang: LanguageEnum) {
  if (!Object.keys(langs).includes(lang)) {
    throw new Error('No lang specified found!');
  }

  return function i18n(string: string, options?: Record<string, string>, ...args: any[]): string {
    let str = langs[lang][string] ?? langs['en-us'][string];
    if (!str) return string;
    if (options) for (let [key, value] of Object.entries(options)) str = str.replace(`<${key}>`, `${value}`);
    if (args) for (let [index, value] of Object.entries(args)) str = str.replace(`%${index}%`, `${value}`);
    return str;
  };
}
