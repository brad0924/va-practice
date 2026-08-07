import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

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
    plugins: isIOS
      ? []
      : [
          VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['icon-192.png', 'icon-512.png'],
            manifest: {
              name: 'JLPT 單字複習',
              short_name: 'JLPT 單字',
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
        ],
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  };
});
