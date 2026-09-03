/**
 * 產生主畫面圖示。讀 `scripts/icon.svg`，用 sharp 轉成四張 PNG。
 *
 * 網頁版與 iOS 版的圖示都從這裡出來。圖案的唯一來源是那份 SVG 母檔，
 * 多一個來源就多一個會漂移的地方，所以不要手動把圖片複製進 `mobile/`。
 *
 * sharp 只跑在本機——`.github/workflows/` 裡沒有任何一支工作流程叫這支腳本，
 * PNG 是跑完直接 commit 進 repo 的。
 *
 * 用法：npm run icons
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'scripts/icon.svg');
const OUT_DIR = join(ROOT, 'public');
// 192／512 給 PWA 的主畫面圖示，1024 是 App Store Connect 的必填素材。
const SIZES = [192, 512, 1024];
// 裝進手機、出現在主畫面的那張。切各尺寸交給 Expo，它從 `mobile/assets/icon.png`
// 自己切（`mobile/app.json` 的 `icon` 指的就是這個檔）。
const NATIVE_ICON = join(ROOT, 'mobile/assets/icon.png');
const NATIVE_ICON_SIZE = 1024;
// 母檔的畫布邊長。SVG 的預設解析度是 72 dpi，按比例放大才會是原生尺寸。
const SOURCE_SIZE = 1024;
const BASE_DENSITY = 72;

/**
 * 以目標尺寸原生重畫，不是把 1024 那張縮小——縮小會讓 192 的字糊掉一圈。
 * 最後那道 resize 只為了保證邊長剛好，rsvg 換算 dpi 時偶爾會差一個像素。
 */
function render(size) {
  return sharp(SOURCE, { density: (BASE_DENSITY * size) / SOURCE_SIZE }).resize(size, size);
}

/**
 * iOS 的 app 圖示不接受帶 alpha 通道的 PNG。sharp 預設輸出 RGBA，
 * 要明確拿掉 alpha 才會是 colorType 2，而少了這一步在本機完全沒有徵兆
 * ——要等上傳 App Store Connect 被退件才知道。
 */
async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const size of SIZES) {
    writeFileSync(join(OUT_DIR, `icon-${size}.png`), await render(size).png().toBuffer());
    console.log(`icon-${size}.png`);

    if (size === NATIVE_ICON_SIZE) {
      writeFileSync(NATIVE_ICON, await render(size).removeAlpha().png().toBuffer());
      console.log(relative(ROOT, NATIVE_ICON));
    }
  }
}

await main();
