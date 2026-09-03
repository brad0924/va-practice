import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
// 這一支自己就是設定檔，`@core/` 要等它跑完才生效，因此只有這裡走相對路徑。
import { APP_NAME } from './core/lib/app-name';

/**
 * index.html 不是 TypeScript，吃不到常數，只能走佔位符替換（見 ADR-0012）。
 * 佔位符刻意不寫成 `%APP_NAME%`：那跟 Vite 內建的 env 變數替換長得一模一樣，
 * 會讓人以為值來自 .env。
 */
function appNamePlugin(): Plugin {
  return {
    name: 'app-name',
    transformIndexHtml(html) {
      return html
        .replaceAll('{{APP_NAME_FULL}}', APP_NAME.full)
        .replaceAll('{{APP_NAME_SHORT}}', APP_NAME.short);
    },
  };
}

// 網頁版掛在 GitHub Pages 的這個子路徑下，base 與 PWA 的 start_url／scope 必須一致。
const webBase = '/va-practice/';

export default defineConfig(() => {
  return {
    base: webBase,
    // 共用邏輯的別名，跟 tsconfig.json 的 paths 是同一件事的另一半：
    // 那邊管型別檢查看不看得懂，這邊管打包與測試找不找得到檔。
    // core/ 換位置時要一起改的四個地方列在 tsconfig.json 的 paths 上方。
    resolve: {
      alias: { '@core': fileURLToPath(new URL('./core', import.meta.url)) },
    },
    plugins: [
      appNamePlugin(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icon-192.png', 'icon-512.png'],
        manifest: {
          name: APP_NAME.full,
          short_name: APP_NAME.short,
          description: `${APP_NAME.full}. Build your own vocabulary books, review at spaced intervals, works offline`,
          lang: 'en',
          start_url: webBase,
          scope: webBase,
          display: 'standalone',
          background_color: '#141821',
          theme_color: '#141821',
          icons: [
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
      }),
    ],
    test: {
      environment: 'node',
      // `scripts/` 那支是隱私權政策的兩道提醒 hook（見 .scratch/i18n/issues/11）。它跑在打包流程外、
      // 不進 tsconfig 的 include，寫成 .mjs；測試跟著它放同一個目錄，所以這裡要多收一種副檔名。
      include: ['core/**/*.test.ts', 'src/**/*.test.ts', 'scripts/**/*.test.mjs'],
      // 介面語言在每支測試開跑前接上繁體中文，理由見 core/test-setup.ts。
      setupFiles: ['./core/test-setup.ts'],
    },
  };
});
