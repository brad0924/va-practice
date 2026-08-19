# 02 — iOS 讀音預填改走 Firebase AI Logic，移除 iOS 的金鑰設定介面

Status: ready-for-human
Type: enhancement
Blocked by: 01

決策背景見 `../spec.md`，本票對應決定一、二、十一、十六。

## 要做什麼

把 iOS build 的讀音預填從「使用者自備金鑰、直接打 Gemini REST」換成「固定金鑰、走 Firebase AI Logic」，並讓資料畫面上的金鑰設定區塊在 iOS build 消失。

**網頁版一個字都不能變。**

## 現況

- `src/lib/gemini-reading.ts` 的 `askReading(key, term, doFetch)` 直接打 `generativelanguage.googleapis.com`，金鑰走 `x-goog-api-key` 標頭。
- `src/lib/gemini-key.ts` 管 `va-practice:gemini` 那格 localStorage。
- `src/ui/data-view.ts` 的 `geminiSection()` 畫出設定區塊。
- `src/app.ts:152` 用 `createGeminiKey(localStorage)` 把它接上去。

## 決定

### 分岔點放在「請求怎麼送出去」，其餘共用

`INSTRUCTIONS`、`RESPONSE_SCHEMA` 的內容、以及 `acceptPrefill`（`src/lib/reading.ts`）的驗證邏輯**兩條路徑共用**。分岔只在把請求送出去的那一段：一邊是 `fetch` 加金鑰標頭，一邊是 Firebase AI Logic 的 `generateContent()`。

`RESPONSE_SCHEMA` 在 Firebase 那邊要用 `Schema.array(...)` 那種建構式表達，形狀不變（票 01 已驗證形狀表達得出來）。

### 打包時切，不在執行期切

沿用 `vite.config.ts` 既有的 `mode === 'ios'` 慣例。執行期偵測 Capacitor 會讓網頁版也載入 firebase SDK，白白變胖——而網頁版的打包產物體積正是 `ADR-0005` 拿來說服自己的論據之一。

### 錯誤語彙沿用現有那一套

`gemini-reading.test.ts` 守著「各種失敗變成一條說得出原因的 key」。Firebase 那條路徑的失敗也要落回同一組 `AppError` key（`gemini.timeout`、`gemini.offline`、`gemini.httpError` 等），不要新增一套平行的錯誤語彙。

### App Check 拿不到憑證時完全靜默

不出錯誤提示，讀音格單純留空，與現在「沒設金鑰就什麼都不發生」一致（決定十一）。這條錯誤使用者一點辦法都沒有，看了只會焦慮。

### `gemini-key.ts` 整支保留

網頁版還要用。iOS build 只是不渲染 `geminiSection()`，不刪檔案、不刪測試。`keychain.test.ts:159` 用到 `va-practice:gemini`，該測試不受影響。

## 驗收

- **網頁版**：`npm run build` 的產物裡搜不到 `firebase` 相關程式碼；資料畫面的金鑰區塊在、行為與現在一字不差；貼上金鑰後讀音預填照常運作。
- **iOS build**：資料畫面上沒有「Gemini API 金鑰」區塊；全新安裝、不做任何設定，新增卡片打完詞條後讀音格自動填入。
- 真機（TestFlight）驗證上一項，模擬器驗不出來。
- 把 App Check 在 Firebase 主控台暫時改成拒絕，確認 iOS 上讀音格留空且**畫面上沒有任何錯誤字**、儲存不被擋。
- 離線狀態下 iOS 新增卡片，讀音格留空、儲存不被擋。
- `npm test` 全綠。`gemini-reading.test.ts` 不需要為了這張票放寬任何斷言。
- 票 01 留下的探路按鈕與程式碼已清掉。
