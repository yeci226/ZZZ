"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const chalk_1 = __importDefault(require("chalk"));
class Logger {
    origin;
    constructor(origin) {
        this.origin = origin;
    }
    /**
     * @description 輸出資訊
     * @param {string} message - 訊息
     */
    info(message) {
        console.log(`${chalk_1.default.gray(new Date().toLocaleString())} ${chalk_1.default.cyan(`[${this.origin}]`)} ${message}`);
    }
    /**
     * @description 輸出指令
     * @param {string} message - 訊息
     */
    command(message) {
        console.log(`${chalk_1.default.gray(new Date().toLocaleString())} ${chalk_1.default.hex('#F3CCF3')(`[${this.origin}]`)} ${message}`);
    }
    /**
     * @description 輸出成功
     * @param {string} message - 訊息
     */
    success(message) {
        console.log(`${chalk_1.default.gray(new Date().toLocaleString())} ${chalk_1.default.green(`[${this.origin}]`)} ${message}`);
    }
    /**
     * @description 輸出警告
     * @param {string} message - 訊息
     */
    warn(message) {
        console.warn(`${chalk_1.default.gray(new Date().toLocaleString())} ${chalk_1.default.yellow(`[${this.origin}]`)} ${message}`);
    }
    /**
     * @description 輸出錯誤
     * @param {string} message - 訊息
     */
    error(message) {
        console.error(`${chalk_1.default.gray(new Date().toLocaleString())} ${chalk_1.default.red(`[${this.origin}]`)} ${message}`);
    }
}
exports.default = Logger;
