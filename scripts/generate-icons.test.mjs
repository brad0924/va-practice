import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng } from './generate-icons.mjs';

/**
 * 這支測試守的是一件會安靜壞掉的事：iOS 的 app 圖示不接受帶 alpha 通道的 PNG，
 * 而 alpha 加回去不會有任何本地錯誤——要等上傳 App Store Connect 被退件才知道。
 * 所以除了 `encodePng()` 的兩種輸出，已 commit 的那張圖本身也在這裡被檢查。
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const IOS_ICON = join(ROOT, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png');
const WEB_ICON = join(ROOT, 'public/icon-1024.png');

function collectIdat(png) {
  const parts = [];
  let offset = 8; // 跳過 PNG 檔案簽章
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') {
      parts.push(png.subarray(offset + 8, offset + 8 + length));
    }
    offset += length + 12; // 長度 4 ＋ 類型 4 ＋ 內容 ＋ CRC 4
  }
  return Buffer.concat(parts);
}

/** 解出 IHDR 與去掉每列過濾器位元組後的像素。只認得過濾器類型 None，那正是這支編碼器寫的。 */
function readPng(png) {
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const bitDepth = png[24];
  const colorType = png[25];
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = inflateSync(collectIdat(png));
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const start = y * (stride + 1);
    expect(raw[start], `第 ${y} 列的過濾器類型應為 None`).toBe(0);
    raw.copy(pixels, y * stride, start + 1, start + 1 + stride);
  }
  return { width, height, bitDepth, colorType, channels, pixels };
}

/** 兩個像素的 2×2 測試圖，四個角各一個顏色，alpha 刻意不是 255 才看得出有沒有被丟掉。 */
const SWATCH = Buffer.from([
  10, 20, 30, 255,
  40, 50, 60, 128,
  70, 80, 90, 255,
  100, 110, 120, 64,
]);

describe('encodePng', () => {
  it('預設輸出 RGBA，alpha 通道原樣留著', () => {
    const png = readPng(encodePng(2, 2, SWATCH));

    expect(png.colorType).toBe(6);
    expect(png.bitDepth).toBe(8);
    expect([...png.pixels]).toEqual([...SWATCH]);
  });

  it('指定 alpha: false 時輸出 RGB，每個像素只剩三個通道', () => {
    const png = readPng(encodePng(2, 2, SWATCH, { alpha: false }));

    expect(png.colorType).toBe(2);
    expect(png.bitDepth).toBe(8);
    expect([...png.pixels]).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]);
  });

  it('尺寸與長寬不同時也對得上', () => {
    const png = readPng(encodePng(2, 1, SWATCH.subarray(0, 8), { alpha: false }));

    expect([png.width, png.height]).toEqual([2, 1]);
    expect([...png.pixels]).toEqual([10, 20, 30, 40, 50, 60]);
  });
});

describe('已 commit 的 iOS app 圖示', () => {
  it('是 1024×1024 的 RGB，不帶 alpha 通道', () => {
    const png = readPng(readFileSync(IOS_ICON));

    expect([png.width, png.height]).toEqual([1024, 1024]);
    expect(png.colorType).toBe(2);
    expect(png.bitDepth).toBe(8);
  });

  /**
   * 兩張圖是同一次 `draw(1024)` 編碼兩遍的結果，所以 RGB 三個通道應該一個位元組都不差
   * ——不是「差不多像」而已。腳本沒被動過的時候這條必然會過，那正是它的用途：
   * 它守的是磁碟上這兩個檔的關係，會在有人手動換掉 `ios/` 那張、只 commit 其中一張、
   * 或把 RGB 那條路的通道順序寫錯的時候變紅。
   *
   * 它抓不到的是 `draw()` 本身變得不穩定——兩張共用同一份像素，一起錯就一起過。
   */
  it('圖案與網頁版的 icon-1024.png 逐像素相同', () => {
    const ios = readPng(readFileSync(IOS_ICON));
    const web = readPng(readFileSync(WEB_ICON));

    expect([web.width, web.height, web.colorType]).toEqual([1024, 1024, 6]);

    let differing = 0;
    for (let i = 0; i < ios.width * ios.height; i += 1) {
      for (let channel = 0; channel < 3; channel += 1) {
        if (ios.pixels[i * 3 + channel] !== web.pixels[i * 4 + channel]) differing += 1;
      }
    }
    expect(differing, '兩張圖對不起來的通道數').toBe(0);
  });
});
