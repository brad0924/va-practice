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

> **先認清「Name」有五個。** 這條路上有一堆長得像名字的欄位，實際跑一遍時在這裡卡了一輪，先列清楚：
>
> | 在哪個畫面 | 欄位 | 是什麼 | 公開？ | 能改？ |
> | --- | --- | --- | --- | --- |
> | Apple Developer → 註冊 App ID | Description | App ID 的內部標籤 | 否 | 能 |
> | Apple Developer → API Key | Name | 金鑰的標籤 | 否 | 否 |
> | App Store Connect → New App | **Name** | **App Store 商品頁上的名稱** | **是** | 能 |
> | App Store Connect → New App | SKU | 內部編號 | 否 | **不能** |
> | `capacitor.config.ts` | `appName` | 主畫面 icon 下那行字 | **是** | 能 |
>
> 只有標粗的兩個使用者看得到，其餘純內部，隨便填都不影響任何東西。

1. **在 Apple Developer 註冊 App ID**（Certificates, Identifiers & Profiles → Identifiers → App IDs），填 `io.github.brad0924.vapractice`。兩個容易選錯的地方：
   - **類型選 Explicit，不要 Wildcard。** Wildcard App ID 不能上架 App Store 或 TestFlight，也支援不了 App Groups、Push Notifications 這類 capability——選了等於現在就把票 05 的保險副本堵死。
   - **Capabilities 整片留空，一個都不勾。** 這張票不加任何功能。清單裡幾個最容易誤勾的：每日提醒（票 09）是本機排程的 Local Notification，**不需要 Push Notifications**；Keychain 存密碼與 iCloud 鑰匙圈同步（票 06）都不需要 entitlement，**不要勾 iCloud 或 Keychain Sharing**；原生語音（07）與觸覺（08）也都不需要。整個工程從頭到尾只會多勾一個 `App Groups`，那是票 05 的事。Capabilities 隨時可回頭改，且 CI 走 `-allowProvisioningUpdates` 自動簽章，多半會由 Xcode 依 entitlements 自動開啟。
2. **在 App Store Connect 建立 app 記錄**（My Apps → 左上角 ＋ → New App）。**這一步一定要在跑 workflow 之前做完**——漏了的話 build 會一路簽章、匯出都成功，最後倒在上傳，錯誤訊息是 `Cannot determine the Apple ID from Bundle ID ...`（那個「Apple ID」指的是 App Store Connect 上那支 app 的數字 ID，不是登入帳號）。實測踩過這一顆。

   | 欄位 | 填什麼 |
   | --- | --- |
   | Platforms | iOS |
   | Name | App Store 商品名稱，**全球唯一**、30 字元，隨時可改。關鍵字放底下獨立的 Subtitle 欄位，不要塞進 Name（準則 2.3.7 禁止堆關鍵字） |
   | Primary Language | Chinese (Traditional) |
   | Bundle ID | 下拉選第 1 步註冊的 `io.github.brad0924.vapractice`。**選下去 Bundle ID 就綁死了** |
   | SKU | `va-practice`。內部編號、不公開、**建立後不能改** |
   | User Access | Full Access |

   截圖、描述、隱私權政策那些**不用填**——那是送審才要的（票 04、11），TestFlight 不需要。
3. **產一組 App Store Connect API Key**（Users and Access → Integrations → App Store Connect API）。三個選項別選錯：
   - **選 Team Keys，不要 Individual Keys。** Individual Key 綁在產生它的那個帳號上，權限跟著那個人的角色跑，人離開團隊金鑰就失效；Team Key 屬於團隊、權限是釘死的指定角色，也是 Apple 文件與各家 CI 教學的預設路線。現在雖然是一人團隊，兩者實質差不多，但沒有理由選一個以後會綁手的。
   - **Access 選 Admin。沒有更低的選項可用。** Certificates, Identifiers & Profiles 在 API 上是一塊獨立的權限區，**只開放給 Admin**。App Manager 能管 app 記錄與上傳 build，卻拿不到 cloud-managed distribution 憑證——而 CI 走 `-allowProvisioningUpdates` 自動簽章，第一件事就是去建立 distribution 憑證。實測用 App Manager 跑，`xcodebuild archive` 會成功，倒在 `exportArchive`：
     ```
     error: exportArchive Cloud signing permission error
     error: exportArchive No signing certificate "iOS Distribution" found
     error: exportArchive No profiles for 'io.github.brad0924.vapractice' were found
     ```
     這裡沒有「剛好夠用」的中間值，最小權限原則在此撞到 Apple 的權限模型。改角色時先看金鑰那一列能不能 Edit：能改就直接改，Key ID 與 `.p8` 都不用換，GitHub secrets 一個都不用動。
   - **Name 填 `GitHub Actions - va-practice`**（28 字元，上限 30）。這個欄位純粹是給人看的標籤，Apple 不拿它做任何事，目的只有一個：日後要撤銷時一眼認得出是誰在用，別撤錯。

   按下 Generate 之後這一頁有**三樣**東西要拿，別只顧著下載檔案：

   | 要拿什麼 | 在哪 | 對應的 secret |
   | --- | --- | --- |
   | `.p8` 檔 | 清單列的 Download 連結，**只能下載一次**，關掉頁面就拿不回來 | `APP_STORE_CONNECT_PRIVATE_KEY` |
   | Key ID | 清單列上，長得像 `A1B2C3D4E5` | `APP_STORE_CONNECT_KEY_ID` |
   | Issuer ID | **頁面最上方**，UUID 格式 | `APP_STORE_CONNECT_ISSUER_ID` |

   Issuer ID 最容易漏——它不在金鑰那一列，而是整頁最上面、所有金鑰共用的那一個。
4. **在 repo 設四個 Actions secrets。** 位置：`https://github.com/brad0924/va-practice/settings/secrets/actions`（等同 repo → Settings → Secrets and variables → Actions）。按 **New repository secret**，填 Name 與 Secret，Add secret，重複四次。

   | Name（大小寫需完全一致） | 填什麼 | 長相 |
   | --- | --- | --- |
   | `APP_STORE_CONNECT_KEY_ID` | 金鑰清單那一列的 Key ID | 10 碼英數，如 `A1B2C3D4E5` |
   | `APP_STORE_CONNECT_ISSUER_ID` | 頁面最上方、所有金鑰共用的那個 | UUID，如 `69a6de70-xxxx-…` |
   | `APP_STORE_CONNECT_PRIVATE_KEY` | `.p8` 檔的**完整內容** | 多行，見下 |
   | `APPLE_TEAM_ID` | Apple Developer → 右上角帳號 → Membership details | 10 碼英數，如 `ABCDE12345` |

   `.p8` 最容易搞砸。用純文字編輯器（記事本即可）打開 `AuthKey_XXXXX.p8`，全選複製貼上。**`-----BEGIN PRIVATE KEY-----` 與 `-----END PRIVATE KEY-----` 那兩行要一起貼**，不是只貼中間那串；不要自己加引號，GitHub 的欄位支援多行；不要用 Word 這類會自動改標點的編輯器開。

   兩個之後會咬人的地方：**Name 打錯不會有明顯報錯**——GitHub 對不存在的 secret 只回空字串，workflow 會在很後面才用奇怪的方式失敗（通常是 `xcodebuild` 說找不到 team），所以名稱建議複製不要手打。**存進去就讀不回來了**，GitHub 只允許覆寫，因此 `.p8` 檔案自己要另外留一份。

   > **public repo 的安全性**：外人看不到這些。值本身連你自己都讀不回；Settings 頁面需要 write 權限才進得去，訪客連 secret 名稱都看不到；log 中若意外出現會自動遮成 `***`。public repo 最經典的攻擊是「fork 後改 workflow 印出 secrets 再開 PR」，但**來自 fork 的 pull request 拿不到任何 secrets**，而且這支 workflow 是 `workflow_dispatch`，只能由有 write 權限的人手動觸發，外人按不到那個按鈕。唯一要記得的是 **public repo 的 Actions log 全世界可讀**——目前 workflow 不 echo 任何秘密，`.p8` 是直接寫進檔案。萬一金鑰真的外洩，到 App Store Connect 把它 Revoke 再產一把即可，攻擊者最多能上傳 build 到你的 TestFlight，拿不到 Apple ID 密碼、也送不了審。
5. **手動觸發 `Build iOS and upload to TestFlight`**（Actions 頁面 → Run workflow）。`workflow_dispatch` 的按鈕**只有在 workflow 檔存在於 `main` 時才會出現**，這是 GitHub 的硬性行為；但按下去之後可在下拉選單挑任意分支，且會用那個分支上的 yml 與程式碼執行——因此 workflow 檔只需進 `main` 一次，之後要調整可以在 feature 分支上迭代。
6. 處理完成後，iPhone 裝 TestFlight app 即可安裝。Internal Testing 不經任何審查。

> **`.github/workflows/ios-testflight.yml` 已於 2026-08-07 實跑通過**，從 build 到上傳 App Store Connect 全綠。寫的當下無法驗證（開發機是 Windows，也沒有維護者的憑證），實跑共踩兩顆釘子，都不是 workflow 本身的問題，而是 Apple 端的前置設定——已分別寫進上面第 3 步（API Key 角色必須是 Admin）與第 2 步（app 記錄必須先建）。workflow 檔本身一行未改。

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
