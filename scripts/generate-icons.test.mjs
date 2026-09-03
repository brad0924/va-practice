import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

/**
 * 這支測試守三件會安靜壞掉的事：
 *
 * 一、母檔裡若留著 `<text>`，換一台沒裝 Noto 的電腦跑出來就是別的字型，本機看不出來。
 * 二、iOS 的 app 圖示不接受帶 alpha 通道的 PNG。sharp 預設輸出帶 alpha，
 *     這個錯誤要等上傳 App Store Connect 被退件才知道。
 * 三、四張 PNG 是同一份母檔畫出來的（網頁版三個尺寸，React Native 版一張 1024）。
 *     有人只重跑一半、或手動換掉其中一張，這裡會變紅。
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SVG = join(ROOT, 'scripts/icon.svg');
/** 裝進手機、出現在主畫面的那張。由 `npm run icons` 從同一份母檔寫出去。 */
const NATIVE_ICON = join(ROOT, 'mobile/assets/icon.png');
const WEB_ICONS = {
  1024: join(ROOT, 'public/icon-1024.png'),
  512: join(ROOT, 'public/icon-512.png'),
  192: join(ROOT, 'public/icon-192.png'),
};

/**
 * 直接讀 IHDR 那幾個位元組，不走 sharp 的 metadata。要驗的就是磁碟上那個檔宣告的
 * 色彩類型——App Store Connect 看的是這個，不是任何函式庫怎麼解讀它。
 * IHDR 永遠是第一個區塊，位置固定。
 */
function readHeader(file) {
  const png = readFileSync(file);
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
    bitDepth: png[24],
    colorType: png[25],
  };
}

/** 解出 RGB 像素。縮到 size 可以吸收不同解析度之間的抗鋸齒差異。 */
async function readPixels(file, size) {
  const image = sharp(file).removeAlpha();
  const scaled = size ? image.resize(size, size, { fit: 'fill' }) : image;
  return scaled.raw().toBuffer();
}

describe('母檔 scripts/icon.svg', () => {
  const svg = readFileSync(SVG, 'utf8');
  // 註解裡會提到 <text> 這個元素名稱，先拿掉才不會誤判。
  const markup = svg.replace(/<!--[\s\S]*?-->/g, '');

  it('沒有任何 <text> 元素，字都轉成 <path> 了', () => {
    expect(markup).not.toMatch(/<text[\s>]/);
    expect(markup).not.toMatch(/font-family/);
  });

  it('畫布是 1024 見方', () => {
    expect(svg).toContain('viewBox="0 0 1024 1024"');
  });
});

describe('已 commit 的 app 圖示', () => {
  it('是 1024×1024 的 RGB，不帶 alpha 通道', () => {
    const png = readHeader(NATIVE_ICON);

    expect([png.width, png.height]).toEqual([1024, 1024]);
    expect(png.colorType).toBe(2);
    expect(png.bitDepth).toBe(8);
  });

  it('圖案與網頁版的 icon-1024.png 逐像素相同', async () => {
    const [native, web] = await Promise.all([
      readPixels(NATIVE_ICON),
      readPixels(WEB_ICONS[1024]),
    ]);

    let differing = 0;
    for (let i = 0; i < native.length; i += 1) {
      if (native[i] !== web[i]) differing += 1;
    }
    expect(differing, '兩張圖對不起來的通道數').toBe(0);
  });
});

describe('已 commit 的網頁版圖示', () => {
  for (const [size, file] of Object.entries(WEB_ICONS)) {
    it(`icon-${size}.png 是 ${size}×${size}`, () => {
      const png = readHeader(file);

      expect([png.width, png.height]).toEqual([Number(size), Number(size)]);
    });
  }

  /**
   * 不同解析度不可能逐像素相同——1024 那張是原生畫出來的，抗鋸齒本來就不一樣。
   * 所以兩張都縮到 64 見方再比：形狀一樣的話差不到哪裡去，換了圖案就會爆開。
   */
  for (const size of [512, 192]) {
    it(`icon-${size}.png 跟 icon-1024.png 是同一個圖案`, async () => {
      const [small, large] = await Promise.all([
        readPixels(WEB_ICONS[size], 64),
        readPixels(WEB_ICONS[1024], 64),
      ]);

      let total = 0;
      for (let i = 0; i < small.length; i += 1) total += Math.abs(small[i] - large[i]);
      expect(total / small.length, '每個通道的平均差異').toBeLessThan(4);
    });
  }
});
