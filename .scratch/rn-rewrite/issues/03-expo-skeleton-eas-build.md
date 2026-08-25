# 03 — Expo 專案骨架，EAS Build 通到真機

Status: ready-for-human
Type: enhancement
Blocked by: 無，可立即開始

決策背景見 `../spec.md` 的〈路線〉。

> ## 這張票需要人
>
> 要 Expo 帳號（EAS Build 免費額度）、已設定的 Apple 開發者帳號（`ios-app 17` 那批簽章憑證即是）、一支能裝開發版的 iPhone。**agent 做得完程式碼的部分，裝到手機那一段要人。**
>
> 整條路在 Windows 上走得完，`../../rn-spike/issues/01` 已經實際走過一次——那張票的 `eas.json` 與流程可以參考。

## 為什麼有這張票

在寫任何畫面之前，要先確定這條路是通的：Windows 上開發、EAS Build 雲端編譯、裝進真機、Liquid Glass 真的長出來。

**特別要當場驗 `GlassView`。** 它只在 iOS 26 以上存在，而且某些 iOS 26 beta 版本沒有這個 API，直接用會閃退——套件文件要求執行前先做可用性檢查。這件事要在骨架階段就確認，不要等畫面做一半才踩到。

## 要做什麼

建立 Expo 專案骨架，出一個 EAS Build 裝到真機，畫面上只放兩樣東西：

1. **一塊 `GlassView`**，底下墊一張有顏色、有紋理的背景，看得出玻璃有沒有折射。
2. **一行字**，顯示 `GlassView` 的可用性檢查結果（這台裝置支不支援）。

app 名稱、圖示、啟動畫面沿用 Capacitor 版那一份，不要另外設計。

## 這張票不做的事

- **不做任何實際畫面。** 複習畫面是票 `06`。
- **不接儲存、不接雲端、不接邏輯層。** 那是票 `04`、`05`。
- **不做 Android 設定。**
- **不送 App Store。** 這是開發版，內部發佈。

## 驗收

- [x] Windows 上跑得起 Expo 開發流程 — development 版裝進 iPhone，接上電腦上的 Metro
- [x] EAS Build 出得了包，裝進真機
- [x] 真機上看得到 `GlassView` 的玻璃效果，底下背景會透出來 — 條紋穿過卡片時會**彎**，不是只有糊掉
- [x] 可用性檢查那行字顯示正確，而且在不支援時不會閃退 — iOS 26.6 上兩個檢查都回 true，與機器相符
- [ ] 把在 iOS 26 以下裝置（或模擬器）的退回行為記在本檔 `## Comments` — **還沒做，要一支舊 iPhone**

## Comments

### 2026-08-25 — 真機上通了，五條過四條

development 版用 EAS Build 出包、裝進 iPhone、接上 Windows 上的 Metro，畫面出來了。

**折射看得到，不是只有糊掉。** 條紋穿進玻璃卡片之後會彎，底部還拱出一道弧；毛玻璃只會
把線糊掉、角度不變。這一項正是 WebView 到不了的地方（`backdrop-filter` 吃不到
`<feDisplacementMap>`），也是整條路線的目的。

**那行字顯示 `GlassView API 可用 · Liquid Glass 開著 · iOS 26.6`**，與機器版本相符。

`expo-dev-client` 會在右上角疊一顆「Tools」齒輪，那是 development 版才有的開發選單，
`preview` 版與將來的正式版都不會出現。

#### 第 5 條還沒做，卡在沒有舊機器

要看 iOS 26 以下的退回長什麼樣（`fallbackCard`，一塊有邊框的半透明區塊），需要一支
iOS 16.4 到 25 的 iPhone，用 `preview` 版裝。模擬器那條路走不通——iOS 模擬器只跑在
macOS 上，見下面那節。

**維護者要求：往後 `rn-rewrite` 每收掉一張票，都要提醒這一條還開著。**

### 2026-08-24 — 骨架寫好了，剩下三步要人

程式碼的部分做完了，專案在 `mobile/`，怎麼跑、怎麼出包全寫在 `mobile/README.md`。
`Status` 維持 `ready-for-human`：剩下的三步（出包、裝機、目測）只有人做得到。

#### 動工前四題拍板

| 題目 | 決定 |
| --- | --- |
| app 識別碼 | **沿用 Capacitor 版那組** `io.github.brad0924.vapractice` |
| 最低支援的 iOS | **Expo SDK 57，下限 16.4**，spec 與 ADR-0017 一併訂正 |
| 啟動畫面 | **app 圖示配 `#141821` 深色底** |
| React Native 的測試環境 | **這張票不架**，留給票 `05` 一次決定 |

**識別碼沿用的代價是知情接受的**，而且出包當天又長大了一截，所以問了第二次、答案沒變：

- 第一次講的代價是「卡片會沒了，雲端備份救得回來」。
- 漏講的是**這個骨架版沒有複習畫面**——裝上去之後，到票 `06` 之前手機上都沒有能複習的
  東西。要把 Capacitor 版裝回來得手動觸發 `ios-testflight.yml`、等 Apple 處理、從
  TestFlight 裝，而且它會反過來蓋掉 React Native 版。識別碼只有一組，手機上永遠只有一支。
- 補問之後維護者仍選沿用，理由是**過渡期改用網頁版複習**。這一句把最痛的一段拿掉了：
  兩邊共用同一份雲端備份，推上去之後網頁版輸入同一組暱稱與密碼就接得回同一批卡片。

所以「裝之前先做一次雲端備份」這一步的意義不只是保險，它是**交接給網頁版的橋**。
`mobile/README.md` 用一個引言方塊把它擋在出包指令前面，理由也照這樣寫。

#### 兩個「票上寫的跟現況對不起來」的地方

**一、iOS 15 這個下限，Expo 給不了。** `expo-modules-core` 的 podspec 把門檻寫死在
iOS 16.4（SDK 54 是 15.1，也不是 15.0）。React Native 0.86 自己只要 15.1，抬上去的是 Expo。
spec 的〈外觀與舊版裝置〉與 `ADR-0017` 的 Consequences 都已訂正，兩處都寫明**實際排除掉的
是 iPhone 7 與更舊的機器**——那批機器 Capacitor 版原本裝得了。使用者故事四因此縮水一截。

**二、啟動畫面沒有東西可以「沿用」。** `ios/App/App/Assets.xcassets/Splash.imageset/`
裡面是 `cap add ios` 留下的 Capacitor 商標配白底，從來沒換過（票 `ios-app 21` 修的是
app 圖示，沒碰這張）。所以改成 app 圖示置中、底色取網頁版的 `--bg: #141821`。

#### 專案長什麼樣

Expo SDK 57 / React Native 0.86.2，`mobile/` 自己一份 `package.json` 與 `node_modules`，
不走 npm workspaces。**共用的 `core/` 這張票還沒接**——`@core/` 的別名等票 `04` 再架。

`App.tsx` 是一支探針畫面，不是任何一頁正式介面：斜條紋背景（六個評分色，顏色取自
`src/styles.css`）加兩顆圓形色塊，中間一塊 `GlassView`，底下一行字報告檢查結果。
**條紋要細、對比要強**，因為玻璃的重點是折射；底下若是一片素色，毛玻璃與 Liquid Glass
長得一模一樣，這張票就白驗了。

**可用性檢查是兩個，不是一個**，套件把它們分開了：

- `isGlassEffectAPIAvailable()` — 這台機器叫得動這個 API 嗎。**這就是防閃退那一道**，
  票上寫的「某些 iOS 26 beta 沒有這個 API」指的是它。畫 `GlassView` 之前先問它，
  回 `false` 就改畫一塊看得出邊界的半透明區塊。
- `isLiquidGlassAvailable()` — 這支 app 現在正以 Liquid Glass 的樣子在跑嗎。

那行字把兩個結果加上 `Platform.Version` 一起顯示，例如
`GlassView API 可用 · Liquid Glass 開著 · iOS 26.0`。放版本號是為了讓「顯示正確」這條
驗收判得出來——不知道機器是幾版，就不知道該期待哪個答案。

`eas.json` 有兩個 profile，都走內部發佈：`development`（連 Metro，日常開發用）與
`preview`（獨立版，裝在不跟電腦同網路的機器上時用），理由見下面那節。

#### 圖示走既有的產生器，沒有手動複製

`scripts/generate-icons.mjs` 那句「不要手動把圖片複製進 `ios/`」是規則不是提醒，所以
`mobile/assets/icon.png` 也接進同一支腳本，從 `scripts/icon.svg` 同一份母檔寫出來。
`scripts/generate-icons.test.mjs` 原本逐像素比對 Capacitor 版那張，現在改成 `describe.each`
兩張一起比。`npm run icons` 重跑過，`public/` 與 `ios/` 底下那四張位元不變。

app 名稱同理：`mobile/app.json` 的 `expo.name` 在打包流程外拿不到 `APP_NAME`，只能寫
字面值，所以照 ADR-0012 的老辦法把它加進 `core/lib/app-name.test.ts` 守門。

#### Windows 上驗到哪裡

- `npm run typecheck`（根）與 `mobile/` 的 `tsc --noEmit` 都過
- `npm test` 617 條全過（原本 613，新增 4 條：圖示 2 條、app 名稱 2 條）
- `npm run build` 出得了網頁版產物
- `npx expo config` 解得開，`ios.deploymentTarget` 吃到 `16.4`
- `npx expo export --platform ios` 打包成功，587 個模組
- `npx expo-doctor` 21 項全過（第一輪有兩個套件差一個修補版號，`npx expo install --fix` 補掉了）

**`npx expo prebuild` 在 Windows 上跑不了**（它要 macOS 或 Linux 才生得出 iOS 專案），
所以 `project.pbxproj` 裡的 `IPHONEOS_DEPLOYMENT_TARGET` 本機驗不到。EAS Build 在雲端
自己做這一步，那才是真正的驗證點。

#### 剩下要人做的三步

照 `mobile/README.md` 走：

1. **先在 Capacitor 版做一次雲端備份或匯出。** 不做這步會掉資料。
2. `eas login` → `eas init` → `eas build --profile development --platform ios`，
   掃 QR code 裝進 iPhone。
3. 開起來看：玻璃底下的條紋有沒有被折彎（不是只有糊掉），那行字對不對得上機器版本。
   結果與 iOS 26 以下的退回行為寫回本節。

#### 三個超出「沿用 Capacitor 版」授權的決定

Code review 把這三處點出來是對的——票只授權沿用名稱、圖示、啟動畫面，這三項都不在裡面。
理由寫在這裡，要推翻很容易。

**一、`userInterfaceStyle: "dark"`。** Capacitor 版的 `Info.plist` 沒設
`UIUserInterfaceStyle`，跟著系統走。但網頁版只有深色一套配色，沒有淺色版可跟——手機切到
淺色模式時 `GlassView` 會照系統畫成淺色玻璃，配深色背景就髒了，這張票要目測的東西反而
看不準。淺色版是整支 app 的事，不是這張票的事。

**二、`eas.json` 多一個 `preview` profile。** 票只要一個包。留第二個是為了驗收第 5 條——
`development` 版要跟電腦在同一個網路才開得起來，翻出一支舊 iPhone 來看退回長什麼樣時
通常不會是那個狀況。

**三、`.github/workflows/deploy.yml` 的 `paths-ignore` 多一行 `mobile/**`。** 不加的話
每一次 React Native 的改動都會重新部署一次網頁版。理由與旁邊那行 `ios/**` 一模一樣。

#### 驗收第 5 條的「或模擬器」那條路走不通

票寫「iOS 26 以下裝置（**或模擬器**）」。**模擬器那條在這台電腦上不存在**——iOS 模擬器
只跑在 macOS 上，而這條路線選 React Native 的整個理由就是不必開 Mac。

所以 `fallbackCard` 那條分支只有兩種驗法：手上剛好有一支 iOS 16.4 到 25 的機器（用
`preview` 版裝），或是把 `App.tsx` 的 `canRenderGlass` 暫時改成 `false` 跑一次看畫面。
後者驗得到畫面、驗不到「不支援時不會閃退」。

#### 「不會閃退」這道防線本身沒有防線，是刻意的

`isGlassEffectAPIAvailable()` 底下是 `requireNativeModule('ExpoGlassEffect')`，原生模組
不在時（例如用 Expo Go 開）這一行在模組載入當場就丟例外，沒有被 try/catch 接住。

**這是選擇，不是漏掉。** 票要防的閃退是「iOS 26 beta 少了這個 API」，那一種確實防住了。
而原生模組整個不在的時候，這支 app 本來就是壞的——把錯誤吞掉只會讓人多花幾小時才查出是
包沒編對。`mobile/README.md` 改成明寫「不要用 Expo Go 開」。

#### 記下來但這張票不改的

- **啟動畫面上的圖示是直角方塊。** app 圖示母檔畫的是滿版矩形，主畫面上由 iOS 切圓角，
  啟動畫面沒有那道遮罩。不好看的話要另外產一張圓角版，留給票 `06` 一起看。
- **`mobile/` 的改動不再觸發網頁版部署。** `.github/workflows/deploy.yml` 的
  `paths-ignore` 多加了一行 `mobile/**`，理由與旁邊那行 `ios/**` 完全一樣。
- **`mobile/AGENTS.md`、`mobile/CLAUDE.md`、`mobile/.claude/settings.json` 是
  `create-expo-app` 產的**，內容是「動手前先讀 SDK 57 的版本化文件」與啟用 Expo 的
  官方外掛，有用所以留著，不是我寫的。同樣是它產的 `index.ts` 則改寫成繁中了——
  那支是我們的進入點，會一直被讀到，留著英文的 what 註解說不過去。
- **Android 與網頁版的範本素材都刪了**，`app.json` 也寫死 `platforms: ["ios"]`。
- **`core/lib/app-name.test.ts` 現在也 import `mobile/app.json`。** 票 `02` 的 Comments
  已經把這支測試列為「綁著網頁版工具鏈、要跟 React Native 的測試設定一起想」的兩支之一，
  這次是往那條已知的線上再加一個檔，不是新開一條。真正要解的時候三個來源一起搬。
- **這支探針畫面全靜態、捲不動。** Liquid Glass 與毛玻璃的另一半差異是動態高光（傾斜、
  捲動時玻璃邊緣的光會跟著跑），這張票量不到。要等票 `06` 有真的列表才看得出來。
- **兩張原生圖示的路徑在產生器與測試裡各寫一份。** 這是原本就有的形狀，測試刻意不從
  產生器 import 路徑——它要驗的是「磁碟上 commit 進去的那個檔」，共用常數的話兩邊會一起錯。
