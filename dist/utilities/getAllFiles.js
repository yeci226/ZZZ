"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = getAllFiles;
const promises_1 = require("fs/promises");
const path_1 = require("path");
/**
 * @description 獲取指定目錄下的所有 .js 文件
 * @param {string} dir - 目錄路徑
 * @param {string[]} exts - 可接受的文件擴展名
 * @returns {Promise<string[]>} 所有 .js 文件的路徑
 */
async function getAllFiles(dir, exts) {
    let files = [];
    const entries = await (0, promises_1.readdir)(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = (0, path_1.join)(dir, entry.name);
        if (entry.isDirectory()) {
            files = files.concat(await getAllFiles(fullPath, exts));
        }
        else if (exts.includes((0, path_1.extname)(entry.name))) {
            files.push(fullPath);
        }
    }
    return files;
}
