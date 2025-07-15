import en from '@/assets/languages/en.js';
import tw from '@/assets/languages/tw.js';
import cn from '@/assets/languages/cn.js';
import vi from '@/assets/languages/vi.js';
import jp from '@/assets/languages/jp.js';
import kr from '@/assets/languages/kr.js';
import fr from '@/assets/languages/fr.js';

import { LanguageEnum } from '@yeci226/hoyoapi';

const langs: { [key in LanguageEnum]: Record<string, string> } = {
  'en-us': en,
  'zh-tw': tw,
  'zh-cn': cn,
  'vi-vn': vi,
  'ja-jp': jp,
  'ko-kr': kr,
  'fr-fr': fr,
  'de-de': {},
  'es-es': {},
  'id-id': {},
  'it-it': {},
  'pt-pt': {},
  'ru-ru': {},
  'th-th': {},
  'tr-tr': {},
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
    if (str == undefined) return str;
    else {
      if (options) for (let [key, value] of Object.entries(options)) str = str.replace(`<${key}>`, `${value}`);
      if (args) for (let [index, value] of Object.entries(args)) str = str.replace(`%${index}%`, `${value}`);
    }
    return str;
  };
}

export function toI18nLang(str: string) {
  if (str.startsWith('zh')) return 'zh-tw';
  if (str.startsWith('vi')) return 'vi-vn';
  if (str.startsWith('fr')) return 'fr-fr';
  if (str.startsWith('ja')) return 'ja-jp';
  if (str.startsWith('ko')) return 'ko-kr';
  return 'en-us';
}
