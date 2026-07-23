import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/va-practice/',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'JLPT 單字複習',
        short_name: 'JLPT 單字',
        description: 'JLPT N2 日文單字閃卡，離線可用',
        lang: 'zh-Hant',
        start_url: '/va-practice/',
        scope: '/va-practice/',
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
});
