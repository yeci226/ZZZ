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
const langs = { en: en_js_1.default, tw: tw_js_1.default, cn: cn_js_1.default, vi: vi_js_1.default, jp: jp_js_1.default, kr: kr_js_1.default, fr: fr_js_1.default };
/**
 * @description 創建翻譯器
 * @param {string} lang - 語言 (en, tw, cn, vi, jp, kr, fr)
 * @returns {function} 翻譯器
 */
function createTranslator(lang) {
    if (!Object.keys(langs).includes(lang)) {
        throw new Error('No lang specified found!');
    }
    return function i18n(string, options, ...args) {
        let str = langs[lang][string] ?? langs['en'][string];
        if (str == undefined)
            return null;
        if (typeof str === 'function')
            return str(options, ...args);
        else if (typeof str !== 'string')
            return str;
        else {
            if (options && isObj(options)) {
                for (let [key, value] of Object.entries(options)) {
                    str = str.replace(`<${key}>`, `${value}`);
                }
            }
            if (typeof options === 'string')
                args.push(options);
            if (args) {
                for (let [index, value] of Object.entries(args))
                    str = str
                        .replace('%s', `${value}`)
                        .replaceAll(`%${index}%`, `${value}`);
            }
        }
        return str;
    };
}
function toI18nLang(str) {
    if (str.startsWith('zh'))
        return 'tw';
}
function isObj(k) {
    return Object.prototype.toString.call(k) === '[object Object]';
}
