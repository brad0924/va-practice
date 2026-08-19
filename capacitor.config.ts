import type { CapacitorConfig } from '@capacitor/cli';
import { APP_NAME } from './src/lib/app-name';

// appId 一旦在 App Store Connect 建立 app 記錄就無法變更。
// appName 只在 `cap add` 那一次生效——它會被寫進 ios/App/App/Info.plist 的
// CFBundleDisplayName，之後 `cap sync`／`copy`／`update` 都不再碰那個檔。
// 也就是說改這行不會改變 iPhone 上的名字，真正在用的是 Info.plist。
// 留著是因為 `cap add` 缺 appName 會直接失敗，重建原生專案時還需要它（見 ADR-0012）。
const config: CapacitorConfig = {
  appId: 'io.github.brad0924.vapractice',
  appName: APP_NAME.short,
  webDir: 'dist',
  // 刻意不設 server.url：內容一律打包進 app，不讓 WebView 指向線上網址。
  // 那會使離線完全失效，也是 App Store 準則 4.2 最典型的退件理由（spec 決定四）。
  //
  // 兩支 @capacitor-firebase 外掛各自帶一份 firebase-ios-sdk 的 SPM 相依，
  // 照預設方式掛上去會撞成 SwiftPM 的 package identity collision（同一個套件名被宣告兩次）。
  // 兩支外掛的 README 指定同一個解法：改用 symlink 掛載。
  // 這個選項需要 Capacitor CLI 8.4.0 以上，本專案是 8.5（見 .scratch/fixed-gemini-key/issues/01）。
  experimental: {
    ios: {
      spm: {
        packageOptions: {
          '@capacitor-firebase/app': { symlink: true },
          '@capacitor-firebase/app-check': { symlink: true },
        },
      },
    },
  },
};

export default config;
