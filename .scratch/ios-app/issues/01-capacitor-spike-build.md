# 01 — 探路 build：把現有網頁用 Capacitor 包上真機

Status: ready-for-human
Type: enhancement
Blocked by: 無，可立即開始

決策背景見 `../spec.md`，本票對應決定二、三、四、二十九。

## 要做什麼

把**現在這份網頁原封不動**包成一支能裝進 iPhone 的 app，然後從頭到尾操作一遍，回報什麼壞了。

**一項功能都不加。** 沒有推播、沒有原生語音、沒有觸覺、沒有保險副本。這張票唯一的產出是「地基」加上「一份誠實的災情回報」。

它是 tracer bullet 不是丟棄品——`ios/` 目錄與 build 流程會留在專案裡，後續每一張 iOS 票都站在它上面。

## 決定

### 同一份 web 程式碼，兩個 build 產物

網頁版的 `base` 維持 `/va-practice/`（GitHub Pages 子路徑），iOS build 改用 `/`。以 build 參數切換，**不複製第二份設定檔**。

### iOS build 關掉 service worker

資源本來就打包在 app 內，service worker 在此情境不提供任何離線能力，只多一層快取與更新時機的不確定性。網頁版的 PWA 設定完全不動。

### 內容打包進 app，不載入遠端網址

Capacitor 支援讓 WebView 直接指向線上網址（等於免送審熱更新），但那會使離線完全失效，且是 App Store 準則 4.2 最典型的退件理由。

### 網頁版必須零變化

改完之後 `npm run build` 產出的網頁版，行為與現在一字不差。

## 要回報的災情

這張票的價值有一半在這份回報。逐項實測並寫進 `## Comments`：

- **朗讀**：Web Speech 在 WKWebView 裡找不找得到日文語音？按鈕是否默默消失了？
- **雲端備份**：`fetch` 打 Firebase RTDB 是否成功？自訂 scheme 的來源有沒有被擋？
- **讀音預填**：`fetch` 打 Gemini API 是否成功？（需自備金鑰才測得到）
- **鍵盤**：編輯畫面輸入時，鍵盤彈出有沒有把版面頂壞、遮住必填格？
- **安全區域**：瀏海與底部橫條有沒有蓋住任何東西？（既有的 `safe-area-bottom-gap` 處理在殼裡還成不成立）
- **捲動**：卡片列表、時間桶展開收合的手感有沒有明顯異常
- **離線**：飛航模式下能不能正常啟動與複習
- **資料**：localStorage 在殼裡讀寫是否正常，關掉 app 再開資料還在不在

## 這張票不做的事

- 不修任何照出來的問題——照出來就記下來，修理由後續的票負責（或視情況新開票）
- ~~不做 iOS 的 CI，build 在 Mac 上人工執行~~ — 訂正：維護者沒有 Mac，此項前提不成立。改為 CI 上手動觸發 build，詳見 spec 決定三十三與下方 Comments
- 不申請 Apple Developer Program（維護者自理，見 spec「不在範圍內」）。app 名稱與 Bundle ID 原本也在此列，但走 TestFlight 就必須先在 App Store Connect 建立 app 記錄，Bundle ID 因此提前定案，見下方 Comments

## 驗收

- [x] `ios/` 原生專案目錄存在，`npx cap sync` 可正常執行
- [x] 一道 build 指令產出網頁版（`base` 為 `/va-practice/`、含 service worker）
- [x] 另一道 build 指令產出 iOS 版（`base` 為 `/`、不含 service worker）
- [x] 兩者共用同一份 `src/`，沒有複製出第二份設定檔
- [ ] app 能安裝到實體 iPhone 並啟動，進入複習畫面
- [ ] 能新增一張卡、複習它、關掉 app 再開，資料還在
- [ ] 飛航模式下能啟動並完成一次複習
- [x] 既有測試全數通過（`npm test`），且一個測試檔都沒被修改
- [x] 網頁版 build 出來的行為與這張票之前一字不差
- [ ] 上述八項災情逐項實測，結果寫進本檔 `## Comments`

## Comments

### 2026-08-07 — 地基完成，真機實測待維護者執行

**這張票只完成了一半，而且是可以完成的那一半。** 檔案工程全數落地並驗證過；八項災情一項都沒測，因為那需要把 app 裝進實體 iPhone。以下是誠實的分界。

#### 已完成並驗證

| 項目 | 怎麼驗的 |
| --- | --- |
| `ios/` 原生專案 | `npx cap add ios` 與 `npx cap sync` 在 **Windows 上直接跑通**，exit 0 |
| 網頁版零變化 | 改動前後各 build 一次，`dist/` 全部 9 個檔案 **SHA256 逐位元相同** |
| iOS 版產物正確 | `base` 為 `/`，且 `sw.js`／`workbox-*.js`／`manifest.webmanifest`／`registerSW.js` 全部不產出 |
| 共用同一份 `src/` | 兩個產物的 JS／CSS 檔名 hash 完全相同（`index-BKXznSCu.js`、`index-Cru2dnTM.css`） |
| 沒有第二份設定檔 | 單一 `vite.config.ts`，以 `--mode ios` 分支 |
| 測試 | 349 個測試全過（13 檔），`git status` 確認**零個測試檔被修改或新增** |
| typecheck | `tsc --noEmit` 乾淨，`capacitor.config.ts` 也納入 `tsconfig.json` 的 `include` |

#### 意料之外的好消息：Windows 就能生 `ios/`

原本預期 `cap add ios` 需要 macOS。**Capacitor 8 改用 Swift Package Manager 取代 CocoaPods**，因此沒有 `pod install` 這道 Mac-only 關卡，整個 `ios/` 骨架與 `cap sync` 在 Windows 上就能完成。只有 `xcodebuild` 那一步非 macOS 不可。

#### 一併修掉的一個坑

`index.html` 裡兩個 icon 的 `href` 原本硬編碼成 `/va-practice/icon-192.png`，不會隨 `base` 改變，iOS build 下會 404。改成 `/icon-192.png` 交由 Vite 套 `base`——網頁版產出的字串與改動前完全相同（已由上述 SHA256 比對證實）。

#### 新增 `npm run sync:ios` 的理由

若先跑 `npm run build`（網頁版）再 `npx cap sync`，會把 `base=/va-practice/` 的產物包進 app，開起來是白畫面。`sync:ios` 把 `build:ios && cap sync ios` 綁成一道指令，讓正確用法只有一條路。

#### 定案：Bundle ID `io.github.brad0924.vapractice`

原訂「Bundle ID 由維護者自理、不在本票範圍」。但走 TestFlight 就必須先在 App Store Connect 建立 app 記錄，而**建立時指定的 Bundle ID 之後無法變更**，因此提前定案。顯示名稱 `JLPT 單字`，與 PWA manifest 的 `short_name` 及 `apple-mobile-web-app-title` 一致。

#### 訂正：spec 決定三十三（不做 iOS CI）

原決定的前提是「有 Mac 可人工 build」。維護者的開發機是 Windows 且無 Mac，前提不成立。已改掉決定本身而非加例外，理由與新做法見 `spec.md` 決定三十三。

#### 維護者待辦（只有你做得到）

1. **在 App Store Connect 建立 app 記錄**，Bundle ID 填 `io.github.brad0924.vapractice`。
2. **產一組 App Store Connect API Key**（Users and Access → Integrations → App Store Connect API，角色需 App Manager 以上），下載 `.p8`（**只能下載一次**）。
3. **在 repo 設四個 Actions secrets**：
   - `APP_STORE_CONNECT_KEY_ID`
   - `APP_STORE_CONNECT_ISSUER_ID`
   - `APP_STORE_CONNECT_PRIVATE_KEY`（`.p8` 的完整內容，含 BEGIN／END 兩行）
   - `APPLE_TEAM_ID`（Membership 頁面的 Team ID）
4. **手動觸發 `Build iOS and upload to TestFlight`**（Actions 頁面 → Run workflow）。
5. 處理完成後，iPhone 裝 TestFlight app 即可安裝。Internal Testing 不經任何審查。

> **`.github/workflows/ios-testflight.yml` 尚未實跑驗證過。** 沒有 Mac 也沒有你的憑證，我無法在此驗證它。第一次觸發很可能需要調整（最可能出問題的是自動簽章與 `xcrun altool` 的參數）。失敗時 workflow 會把 `.ipa` 留成 artifact，可退回手動用 Transporter 上傳。

#### 待實測：八項災情

裝上真機後逐項填寫。**照出問題不要在這張票修**——記下來，另開票。

| # | 項目 | 要看什麼 | 結果 |
| --- | --- | --- | --- |
| 1 | 朗讀 | Web Speech 在 WKWebView 裡找不找得到日文語音？按鈕是否默默消失 | 待測 |
| 2 | 雲端備份 | `fetch` 打 Firebase RTDB 是否成功？自訂 scheme 的來源有沒有被擋 | 待測 |
| 3 | 讀音預填 | `fetch` 打 Gemini API 是否成功（需自備金鑰） | 待測 |
| 4 | 鍵盤 | 編輯畫面輸入時，鍵盤有沒有把版面頂壞、遮住必填格 | 待測 |
| 5 | 安全區域 | 瀏海與底部橫條有沒有蓋住東西？既有的 `safe-area-bottom-gap` 在殼裡還成不成立 | 待測 |
| 6 | 捲動 | 卡片列表、時間桶展開收合的手感有無明顯異常 | 待測 |
| 7 | 離線 | 飛航模式下能否正常啟動與複習 | 待測 |
| 8 | 資料 | localStorage 讀寫是否正常，關掉 app 再開資料還在不在 | 待測 |

**注意第 1 項**：`capacitor.config.ts` 刻意維持 `ios.contentInset` 等所有預設值，不預先修補任何東西——這張票的價值就在於讓問題原形畢露。

### 2026-08-07 — code-review 後的修正

雙軸審查（Standards／Spec）抓到四個真問題，都已修掉：

1. **`ios/` 缺 shared scheme（會直接讓 CI 掛掉）。** `cap add ios` 沒有產出 `.xcscheme`，Xcode 平常是第一次開啟專案時才生成到 `xcuserdata`（而那個目錄被 `.gitignore` 擋掉）。CI 上 `xcodebuild -scheme App` 會報 `does not contain a scheme named "App"`。已補上 `ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme` 並納入版控。
2. **`xcrun agvtool new-version` 對這個專案無效。** `project.pbxproj` 沒有設 `VERSIONING_SYSTEM = "apple-generic"`，agvtool 改不動 build number，結果會一直是 `1`，第二次上傳就被 TestFlight 拒收。已刪掉該步驟，改成直接把 `CURRENT_PROJECT_VERSION=${{ github.run_number }}` 傳給 `xcodebuild`。
3. **`.ipa` 檔名寫死。** 上傳步驟用 `App.ipa`、artifact 步驟用 `*.ipa`，兩種假設必有一個是猜的。改成 `find` 出實際檔名，找不到就明確失敗。
4. **秘密處理不一致。** `DEVELOPMENT_TEAM` 是唯一一個直接內插進 shell 的 secret，且未加引號；`.p8` 寫入沒有限制權限。已統一走 `env:` 加引號展開，並加上 `umask 077`。

**駁回一項**：Standards 軸建議本票開 ADR-0012。不採納——`10-adr-and-context-vocabulary.md` 就是 ADR-0012 的專責票，且它明白寫著「擋在 01 後面的理由：探路 build 若照出致命問題，ADR-0012 的內容就得改寫。在探路之前寫等於賭」。這裡不寫才是照著計畫走。

**一併補上的文件一致性**：`spec.md` 的「不在範圍內」與票 11 都還抱著舊的決定三十三與「Bundle ID 未定」，已同步訂正。

順帶把 `vite.config.ts` 裡三處重複的 `'/va-practice/'` 收成一個 `webBase` 常數（`base`、`start_url`、`scope` 本來就必須一致）。改完重新比對，網頁版產物仍與基準線逐位元相同。
