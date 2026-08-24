# mobile — React Native 版 iOS app

iOS 版改寫成 React Native 的專案本體。決策背景見 `.scratch/rn-rewrite/spec.md` 與
`docs/adr/0017-react-native-rewrite-for-liquid-glass.md`，這一份只寫「怎麼跑、怎麼出包」。

**現在裡面只有骨架票（`.scratch/rn-rewrite/issues/03`）的探針畫面**：一塊 `GlassView`
墊在斜條紋背景上，底下一行字報告可用性檢查的結果。複習畫面是票 `06`，那時整支
`App.tsx` 會被換掉。

## 這個目錄與 repo 其他部分的關係

- **自己一份 `package.json` 與 `node_modules`**，不走 npm workspaces。網頁版在 repo 根，
  兩邊的相依套件完全不重疊，混在一起只會互相拖累。
- **共用邏輯在 repo 根的 `core/`**（票 `02`）。這張骨架票**還沒接**——`@core/` 的別名要等
  票 `04`（MMKV 頂替 `localStorage`）才會架起來。
- **app 圖示不要手動放進 `assets/`。** 它由 repo 根的 `npm run icons` 從 `scripts/icon.svg`
  寫出來，跟 Capacitor 版與網頁版是同一份母檔。`scripts/generate-icons.test.mjs` 會逐像素比對。

## 在 Windows 上開發

```
cd mobile
npm install
npm start
```

`npm start` 起的是 Metro（簡單說就是一台把程式碼即時送進手機的小伺服器）。手機上要先裝好
下面那個 **development 版**，開起來就會連上這一台，改完檔案手機上直接刷新。

手機與電腦要在同一個網路。用 iPhone 開熱點、電腦連上去最省事。

**不要用 Expo Go 開這支 app。** Expo Go 裡沒有 `expo-glass-effect` 的原生模組，
`App.tsx` 一載入就會丟例外。這一點刻意不用 try/catch 包起來——原生模組不在的時候整支
app 本來就是壞的，把錯誤吞掉只會讓人花更久才查出是包沒編對。

## 出包裝進真機（這一段要人做）

需要：Expo 帳號（EAS（Expo Application Services，Expo 的雲端建置服務）Build 有免費額度）、
已設定的 Apple 開發者帳號、一支 iPhone。

> ### 裝之前先備份
>
> 這支 app 的識別碼與 Capacitor 版是**同一組**（`io.github.brad0924.vapractice`），
> 所以 iPhone 會把它當成同一支 app **覆蓋掉**——現在天天在用的那支連同裡面的卡片會一起消失。
>
> **裝之前先在 Capacitor 版做一次雲端備份**，或用資料頁匯出一份檔案。
> 這是拍板時知情接受的代價，不是意外。

```
npm install -g eas-cli
eas login
eas init            # 在 Expo 後台建專案，會把 projectId 寫進 app.json
eas build --profile development --platform ios
```

`eas build` 第一次會問 Apple 帳號，然後自己去產憑證與 provisioning profile。跑完給一個
網址與 QR code（Quick Response code，方形的黑白掃描碼），用 iPhone 相機掃就裝得起來。

`eas.json` 裡有兩個 profile：

| profile | 用途 |
| --- | --- |
| `development` | 連 Metro 的開發版。改完程式碼手機上立刻看得到，日常開發用這個。 |
| `preview` | 不連 Metro 的獨立版。裝在**不跟電腦同一個網路的機器**上時只能用它——例如翻出一支舊 iPhone 來看 iOS 26 以下的退回長什麼樣。 |

兩個都是**內部發佈**（`distribution: internal`），不經過 App Store。

## 設定值為什麼長這樣

**`ios.bundleIdentifier`** — 沿用 Capacitor 版那一組，維護者拍板的選擇。代價見上面那格。

**`ios.deploymentTarget: "16.4"`** — 不是自己挑的，是 Expo 給的下限：`expo-modules-core`
的 podspec 寫死 iOS 16.4，SDK（Software Development Kit，軟體開發套件）57 底下沒有更低的
走法。spec 與 `ADR-0017` 原本寫「最低支援仍是 iOS 15」，已一併訂正。實際排除掉的是
iPhone 7 與更舊的機器。

**`userInterfaceStyle: "dark"`** — 網頁版只有深色一套配色（`src/styles.css` 的
`--bg: #141821`），沒有淺色版可跟。跟著系統走的話，使用者切到淺色模式時 `GlassView`
會變成淺色玻璃，配深色背景就髒了。

**`platforms: ["ios"]`** — 不做 Android，連帶把 Android 與網頁版的範本素材都刪掉了。

**啟動畫面** — app 圖示置中，底色 `#141821`。Capacitor 版那張是 `cap add ios` 留下的
Capacitor 商標配白底，從來沒換過，沒有東西可以沿用。
