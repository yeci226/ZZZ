import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';

import Logger from '@/utilities/core/logger';

const equipmentURL = 'https://api.hakush.in/zzz/data/equipment.json';
const iconDir = path.resolve('src/assets/images/icons/diskdrives');

const downloadImage = async (url: string, filepath: string) => {
  const res = await fetch(url);
  if (!res.ok) return false;

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const dir = path.dirname(filepath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(filepath, buffer);
  return true;
};

export default async function autoDownloadIcons() {
  new Logger('自動下載').info('開始偵測缺漏圖片...');

  const response = await fetch(equipmentURL);
  const data = (await response.json()) as Record<string, any>;

  for (const key in data) {
    const id = key.substring(0, 3);
    const iconPath = data[key].icon; // e.g., UI/Sprite/A1DynamicLoad/IconSuit/UnPacker/SuitProtoPunk.png
    const baseName = path.basename(iconPath, '.png');

    const suffixes = ['S', 'A', 'B'];
    for (const suffix of suffixes) {
      const fileName = `${id}_${suffix}.webp`;
      const filePath = path.join(iconDir, fileName);
      if (!fs.existsSync(filePath)) {
        const url = `https://api.hakush.in/zzz/UI/Item${baseName}_${suffix}.webp`;
        new Logger('自動下載').info(`下載中：${url} -> ${fileName}`);

        try {
          const success = await downloadImage(url, filePath);
          if (success) {
            new Logger('自動下載').info(`成功下載 ${fileName}`);
          } else {
            new Logger('自動下載').warn(`無法下載 ${url}`);
          }
        } catch (err: any) {
          new Logger('自動下載').error(`自動下載 ${fileName} 失敗: ${err.message}`);
        }
      }
    }
  }

  new Logger('自動下載').info('檢查完成。');
}
