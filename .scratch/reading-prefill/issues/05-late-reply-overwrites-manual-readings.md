# 05 — 遲來的預填回覆會蓋掉使用者手打的讀音

Status: ready-for-agent
Type: bug

**這是 `.scratch/fixed-gemini-key/issues/02` 的前置條件。** 那張票會把 iOS 的等待窗口從 10 秒拉到 180 秒，本票不先做完，票 02 上線就會把一個現在幾乎踩不到的邊緣狀況變成日常災情。

## 要做什麼

`src/ui/reading-editor.ts` 的 `settle()` 在套用 AI 回覆之前，多檢查一次**讀音格現在是不是已經有字了**。有的話就不要套用。

## 病灶

`settle()` 拿到回覆後只檢查一件事——詞條有沒有被改過：

```ts
const filled = acceptPrefill(asked, await reply);
if (term !== asked) return NOTHING;
if (filled === null) throw new AppError('reading.prefillMismatch');
runs = filled;              // ← 這裡不問「這幾格是不是已經有人填了」
```

「已經填過就不要動」那道守門叫 `anyFilled()`，但它掛在 `willAsk()` 裡——那是**發問之前**的檢查，不是**回覆進來時**的檢查。

踩到的路徑：

| 時間 | 發生什麼 |
| --- | --- |
| 0 秒 | 詞條欄位失焦，背景去問 AI |
| 0–N 秒 | 請求還在路上。讀音格是空的，使用者可以自己點進去打字 |
| 第 8 秒 | 使用者等不下去，自己把讀音打好了 |
| 第 12 秒 | 回覆到了，`runs = filled` 把他打的字整組換掉 |

## 為什麼現在幾乎踩不到

三道防線一起擋著：

1. 請求最多活 10 秒（`gemini-reading.ts` 的 `AbortController`），窗口很窄。
2. 等待期間 `prefilling` 為 true，**換欄鍵不會把游標送進讀音格**，使用者不會被引導過去打字。
3. 逾時之後請求已經被 abort，這時才動手填，沒有東西會回來蓋。

`willAsk()` 上方那段註解就是在講這件事：「漂移的下場是換欄鍵把游標送進讀音格、AI 的回覆再把使用者正在打的字蓋掉」。**寫的人知道這個風險，用第 2 點擋住了。**

## 為什麼票 02 之後會變常見

`fixed-gemini-key` 票 02 把 iOS 改走 Firebase AI Logic 的 SDK。那個 SDK 的 `RequestOptions.timeout` **不設就是 180 秒**（已查證 `@firebase/ai` 的型別定義）。

上面三道防線垮兩道：

- 窗口從 10 秒變成 3 分鐘。
- `fixed-gemini-key/spec.md` 決定十一規定 **iOS 上失敗要完全靜默**，讀音格留空、不出任何提示。使用者因此不知道背景還有請求在跑，等十幾秒沒動靜就自己填了。

第 2 點（換欄鍵不進讀音格）還在，但它只擋換欄鍵，擋不住使用者直接點那一格。

**災情長相是「使用者打的字莫名其妙變了」**，而且 iOS 上沒有任何提示可以循線追查。

## 不做取消

技術上做得到：`generateContent()` 的第二個參數吃 `SingleRequestOptions`，裡面有 `signal?: AbortSignal`。

**但維護者決定不做**，兩個理由：

- **省不到額度。** Firebase 文件在那個欄位底下明寫「this will not cancel the request in the backend, so any applicable billing charges will still be applied despite cancellation」。那口共用的水已經喝掉了（`fixed-gemini-key/spec.md` 決定八）。
- **不能取代本票。** abort 送出去的當下，回覆可能已經在路上，競態仍然存在。本票這道檢查無論如何都要加。

## 這張票不做的事

- **不改逾時秒數**，那是票 06。
- **不改 iOS 的秒數**，那歸 `fixed-gemini-key` 票 02（它要寫那一段）。
- 不動 `willAsk()` 的五條守門。發問前的判斷是對的，缺的是回覆進來時的那一道。

## 驗收

- 讀音格已經有內容時，遲到的預填回覆**不會**覆蓋它。
- 讀音格全空時，回覆照常填進去，行為與現在一字不差。
- 「請確認」那行提示的生死不受影響——AI 填的假名還活著時它絕不能消失（`reading-editor.ts` 既有註解，那是擋讀音幻覺的唯一一道）。
- 詞條中途被改掉的情況照舊不套用，那條檢查留著。
- `reading-editor.test.ts` 新增涵蓋「等待期間手動填入」的案例。
- `npm test` 全綠。
