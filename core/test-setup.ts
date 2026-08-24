/**
 * 每支測試開跑前把介面語言接上繁體中文。
 *
 * `t()` 沒接上這台裝置就直接丟例外（票 02），而搬完字串之後畫面與資料模組
 * 幾乎都會查表——少了這一步，大半的測試會爆在「i18n 還沒啟動」而不是它要測的東西上。
 *
 * 固定繁體中文，斷言因此仍然比對得到中文原文。真正驗語言決定與切換的是
 * `core/i18n/index.test.ts`，它在測試裡自己再 `initI18n()` 一次，蓋掉這裡的預設值。
 */
import { beforeEach } from 'vitest';
import { initI18n } from './i18n';

beforeEach(() => {
  const cells = new Map<string, string>();
  initI18n(
    {
      getItem: (key) => cells.get(key) ?? null,
      setItem: (key, value) => {
        cells.set(key, value);
      },
      removeItem: (key) => {
        cells.delete(key);
      },
    },
    'zh-TW',
  );
});
