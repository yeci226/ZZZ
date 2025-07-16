"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = autoDownloadIcons;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const node_fetch_1 = __importDefault(require("node-fetch"));
const equipmentURL = 'https://api.hakush.in/zzz/data/equipment.json';
const iconDir = path_1.default.resolve('src/assets/images/icons/diskdrives');
const downloadImage = async (url, filepath) => {
    const res = await (0, node_fetch_1.default)(url);
    if (!res.ok)
        return false;
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const dir = path_1.default.dirname(filepath);
    if (!fs_1.default.existsSync(dir)) {
        fs_1.default.mkdirSync(dir, { recursive: true });
    }
    fs_1.default.writeFileSync(filepath, buffer);
    return true;
};
async function autoDownloadIcons() {
    console.log('[autoDownloadIcons] 開始偵測缺漏圖片...');
    const response = await (0, node_fetch_1.default)(equipmentURL);
    const data = (await response.json());
    for (const key in data) {
        const id = key.substring(0, 3);
        const iconPath = data[key].icon; // e.g., UI/Sprite/A1DynamicLoad/IconSuit/UnPacker/SuitProtoPunk.png
        const baseName = path_1.default.basename(iconPath, '.png');
        const suffixes = ['S', 'A', 'B'];
        for (const suffix of suffixes) {
            const fileName = `${id}_${suffix}.webp`;
            const filePath = path_1.default.join(iconDir, fileName);
            if (!fs_1.default.existsSync(filePath)) {
                const url = `https://api.hakush.in/zzz/UI/Item${baseName}_${suffix}.webp`;
                console.log(`[autoDownloadIcons] 下載中：${url} -> ${fileName}`);
                try {
                    const success = await downloadImage(url, filePath);
                    if (success) {
                        console.log(`[✓] 成功下載 ${fileName}`);
                    }
                    else {
                        console.warn(`[!] 無法下載 ${url}`);
                    }
                }
                catch (err) {
                    console.error(`[錯誤] ${fileName}：`, err.message);
                }
            }
        }
    }
    console.log('[autoDownloadIcons] 檢查完成。');
}
