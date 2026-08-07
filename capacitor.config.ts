import type { CapacitorConfig } from '@capacitor/cli';

// appId 一旦在 App Store Connect 建立 app 記錄就無法變更。
// appName 是主畫面顯示名稱，與 PWA manifest 的 short_name 及
// index.html 的 apple-mobile-web-app-title 保持一致。
const config: CapacitorConfig = {
  appId: 'io.github.brad0924.vapractice',
  appName: 'JLPT 單字',
  webDir: 'dist',
  // 刻意不設 server.url：內容一律打包進 app，不讓 WebView 指向線上網址。
  // 那會使離線完全失效，也是 App Store 準則 4.2 最典型的退件理由（spec 決定四）。
};

export default config;
