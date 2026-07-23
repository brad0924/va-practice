/**
 * 產生 PWA 主畫面圖示。以純 Node 繪製並自行編碼 PNG，不引入影像套件。
 * 圖案為一疊閃卡，內容留在中央 80% 的安全區內，套上圓形遮罩也不會被切到。
 *
 * 用法：npm run icons
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const SIZES = [192, 512];
const SAMPLES = 4; // 每個像素邊長取樣數，用來做邊緣平滑

const BACKGROUND = [76, 110, 245];
const CARD = [255, 255, 255];

/** 以正規化座標（0–1）描述的圖形，依序由下往上疊。 */
const SHAPES = [
  { x0: 0.3, y0: 0.16, x1: 0.86, y1: 0.68, r: 0.06, color: CARD, alpha: 0.42 },
  { x0: 0.14, y0: 0.32, x1: 0.7, y1: 0.84, r: 0.06, color: CARD, alpha: 1 },
  { x0: 0.22, y0: 0.46, x1: 0.62, y1: 0.53, r: 0.035, color: BACKGROUND, alpha: 1 },
  { x0: 0.22, y0: 0.62, x1: 0.5, y1: 0.68, r: 0.03, color: BACKGROUND, alpha: 0.55 },
];

function draw(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const step = 1 / (size * SAMPLES);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let [r, g, b] = [0, 0, 0];
      for (let sy = 0; sy < SAMPLES; sy += 1) {
        for (let sx = 0; sx < SAMPLES; sx += 1) {
          const px = (x * SAMPLES + sx + 0.5) * step;
          const py = (y * SAMPLES + sy + 0.5) * step;
          const sample = shade(px, py);
          r += sample[0];
          g += sample[1];
          b += sample[2];
        }
      }
      const total = SAMPLES * SAMPLES;
      const offset = (y * size + x) * 4;
      pixels[offset] = Math.round(r / total);
      pixels[offset + 1] = Math.round(g / total);
      pixels[offset + 2] = Math.round(b / total);
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
}

function shade(px, py) {
  let colour = [...BACKGROUND];
  for (const shape of SHAPES) {
    if (!inside(px, py, shape)) continue;
    colour = colour.map((channel, i) => channel * (1 - shape.alpha) + shape.color[i] * shape.alpha);
  }
  return colour;
}

/** 圓角矩形的帶符號距離場，小於等於 0 即為形狀內部。 */
function inside(px, py, { x0, y0, x1, y1, r }) {
  const halfWidth = (x1 - x0) / 2;
  const halfHeight = (y1 - y0) / 2;
  const dx = Math.abs(px - (x0 + halfWidth)) - (halfWidth - r);
  const dy = Math.abs(py - (y0 + halfHeight)) - (halfHeight - r);
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  return outside + Math.min(Math.max(dx, dy), 0) - r <= 0;
}

// ---------- 最小的 PNG 編碼器 ----------

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // 每列的過濾器類型：None
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // 每通道位元數
  header[9] = 6; // 色彩類型：RGBA
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, checksum]);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

mkdirSync(OUT_DIR, { recursive: true });
for (const size of SIZES) {
  writeFileSync(join(OUT_DIR, `icon-${size}.png`), encodePng(size, size, draw(size)));
  console.log(`icon-${size}.png`);
}
