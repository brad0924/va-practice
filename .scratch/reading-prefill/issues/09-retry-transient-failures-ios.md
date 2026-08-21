# 09 — iOS 那條路也要對 5xx 重試

Status: needs-triage
Type: enhancement

## 為什麼獨立成一張票

票 07 決定「5xx 自動重試」，但範圍只收網頁版。iOS 被切出來的理由是**測不到**：

重試得寫在 `src/lib/gemini-reading-native.ts` 裡，而那支檔案 import 了 Capacitor 外掛與 firebase 執行期程式碼，**node 底下根本載不起來**。`ai-logic-error.ts` 當初獨立成一支檔案就是為了繞開這件事——它一行執行期 firebase 都不 import，所以測得動。

沒有自動測試守得住，驗收只能上 TestFlight 真機。票 07 若把 iOS 混進來，整張票的狀態就會從 `ready-for-agent` 掉成 `ready-for-human`。

## SDK 不會幫你重試，已查證

`node_modules/@firebase/ai/dist/index.node.mjs:1402` 的 `makeRequest()` 從頭到尾只 `fetch` 一次，非 2xx 直接組 `AIError` 丟出。整份 bundle 唯一的 `retry` 字樣在 1456 行，是一句英文錯誤訊息裡的「then retry」，不是程式邏輯。

## 一個跟網頁版不一樣的地方：碼表的規矩不同

票 07 選了「重試共用同一份 10 秒預算」。**iOS 照抄不會自動成立。**

- **網頁版**：一顆 `setTimeout` 包住整支 `askReading()`，重試自然共用同一份。
- **iOS**：`TIMEOUT_MS` 是交給 SDK 的 `RequestOptions.timeout`（`gemini-reading-native.ts:251`），而 SDK 在**每次** `generateContent()` 裡自己開一顆新計時器。多呼叫一次就是多一份 10 秒。

所以 iOS 要做成「共用一份預算」得自己在外面包一層碼表，**那是額外的工**，不是照抄。也可以決定 iOS 就讓它各給一份——但那樣兩條路的行為會分家，要明講。

## 要決定的事

1. iOS 要不要跟網頁版一樣共用一份預算？還是接受各給一份（最壞等 20 秒以上）？
2. `toReadingError()` 已經把 5xx 收斂成 `gemini.httpError`（`ai-logic-error.ts`），重試的判斷要放在翻譯之前還是之後？放之後就得從 `AppError` 的參數把 status 挖回來。
3. 票 07 的「顯示第幾次」要不要一起在 iOS 上做？畫面那一層是共用的（`editor-view.ts`），所以多半是免費的，但要確認。
4. 沒有自動測試的情況下，驗收怎麼設計才算數。

## 先做票 07

票 07 定下的行為是本票的樣板。它沒定案之前不要動這張。
