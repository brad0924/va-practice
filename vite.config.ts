import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { APP_NAME } from './src/lib/app-name';

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

// iOS build（`vite build --mode ios`）與網頁版共用這一份設定，只差兩件事：
//   base：WebView 從自訂 scheme 的根路徑載入，網頁版則掛在 GitHub Pages 子路徑下。
//   PWA：資源本來就打包進 app 內，service worker 不提供任何離線能力，
//        只多一層快取與更新時機的不確定性，因此 iOS build 不掛這個 plugin。
// 其餘所有模式（含 vitest 的 'test'）一律走網頁版路徑。
// 網頁版掛在 GitHub Pages 的這個子路徑下，base 與 PWA 的 start_url／scope 必須一致。
const webBase = '/va-practice/';

export default defineConfig(({ mode }) => {
  const isIOS = mode === 'ios';

  return {
    base: isIOS ? '/' : webBase,
    // app-name plugin 掛在三元判斷式外面：iOS build 的 index.html 一樣要替換佔位符，
    // 塞進 VitePWA 旁邊的話 `--mode ios` 產出的分頁標題與主畫面名字會留著佔位符。
    plugins: [
      appNamePlugin(),
      ...(isIOS
        ? []
        : [
            VitePWA({
              registerType: 'autoUpdate',
              includeAssets: ['icon-192.png', 'icon-512.png'],
              manifest: {
                name: APP_NAME.full,
                short_name: APP_NAME.short,
                description: 'JLPT N2 日文單字閃卡，離線可用',
                lang: 'zh-Hant',
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
          ]),
    ],
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  };
});
