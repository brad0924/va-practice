# 01 — 探路 build：把現有網頁用 Capacitor 包上真機

Status: ready-for-agent
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
- 不做 iOS 的 CI，build 在 Mac 上人工執行
- 不申請 Apple Developer Program、不決定 app 名稱與 Bundle ID（維護者自理，見 spec「不在範圍內」）

## 驗收

- [ ] `ios/` 原生專案目錄存在，`npx cap sync` 可正常執行
- [ ] 一道 build 指令產出網頁版（`base` 為 `/va-practice/`、含 service worker）
- [ ] 另一道 build 指令產出 iOS 版（`base` 為 `/`、不含 service worker）
- [ ] 兩者共用同一份 `src/`，沒有複製出第二份設定檔
- [ ] app 能安裝到實體 iPhone 並啟動，進入複習畫面
- [ ] 能新增一張卡、複習它、關掉 app 再開，資料還在
- [ ] 飛航模式下能啟動並完成一次複習
- [ ] 既有測試全數通過（`npm test`），且一個測試檔都沒被修改
- [ ] 網頁版 build 出來的行為與這張票之前一字不差
- [ ] 上述八項災情逐項實測，結果寫進本檔 `## Comments`
