"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTranslator = createTranslator;
exports.toI18nLang = toI18nLang;
const en_js_1 = __importDefault(require("@/assets/languages/en.js"));
const tw_js_1 = __importDefault(require("@/assets/languages/tw.js"));
const cn_js_1 = __importDefault(require("@/assets/languages/cn.js"));
const vi_js_1 = __importDefault(require("@/assets/languages/vi.js"));
const jp_js_1 = __importDefault(require("@/assets/languages/jp.js"));
const kr_js_1 = __importDefault(require("@/assets/languages/kr.js"));
const fr_js_1 = __importDefault(require("@/assets/languages/fr.js"));
const langs = {
    'en-us': en_js_1.default,
    'zh-tw': tw_js_1.default,
    'zh-cn': cn_js_1.default,
    'vi-vn': vi_js_1.default,
    'ja-jp': jp_js_1.default,
    'ko-kr': kr_js_1.default,
    'fr-fr': fr_js_1.default,
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
function createTranslator(lang) {
    if (!Object.keys(langs).includes(lang)) {
        throw new Error('No lang specified found!');
    }
    return function i18n(string, options, ...args) {
        let str = langs[lang][string] ?? langs['en-us'][string];
        if (str == undefined)
            return str;
        else {
            if (options)
                for (let [key, value] of Object.entries(options))
                    str = str.replace(`<${key}>`, `${value}`);
            if (args)
                for (let [index, value] of Object.entries(args))
                    str = str.replace(`%${index}%`, `${value}`);
        }
        return str;
    };
}
function toI18nLang(str) {
    if (str.startsWith('zh'))
        return 'zh-tw';
    if (str.startsWith('vi'))
        return 'vi-vn';
    if (str.startsWith('fr'))
        return 'fr-fr';
    if (str.startsWith('ja'))
        return 'ja-jp';
    if (str.startsWith('ko'))
        return 'ko-kr';
    return 'en-us';
}
