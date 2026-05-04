import en from "../../assets/languages/en.js";
import tw from "../../assets/languages/tw.js";
import cn from "../../assets/languages/cn.js";
import vi from "../../assets/languages/vi.js";
import jp from "../../assets/languages/jp.js";
import kr from "../../assets/languages/kr.js";
import fr from "../../assets/languages/fr.js";

const langs: Record<string, any> = { en, tw, cn, vi, jp, kr, fr };

export function createTranslator(lang: string) {
  if (!Object.keys(langs).includes(lang))
    throw new Error("No lang specified found!");
  return function i18n(string: string, options?: any, ...args: any[]) {
    let str = langs[lang][string] ?? langs["en"][string];
    if (str == undefined) return void 0;
    if (typeof str == "function") return str(options, ...args);
    else if (typeof str != "string") return str;
    else {
      if (options && isObj(options))
        for (let [key, value] of Object.entries(options))
          str = str.replace(`<${key}>`, `${value}`);
      if (typeof options == "string") args.push(options);
      if (args) {
        for (let [index, value] of Object.entries(args))
          str = str
            .replace("%s", `${value}`)
            .replaceAll(`%${index}%`, `${value}`);
      }
    }
    return str;
  };
}
export function toI18nLang(str: string) {
  if (str.startsWith("zh")) return "tw";
}
function isObj(k: any) {
  return Object.prototype.toString.call(k) === "[object Object]";
}
