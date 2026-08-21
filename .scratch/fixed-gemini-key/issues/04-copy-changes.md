# 04 — 額度用完時的訊息換成一句不解釋的話

Status: done
Type: enhancement
Blocked by: 02

決策背景見 `../spec.md`，本票對應決定十三。

## 這張票縮小過一次

原本有兩件事，現在只剩一件。動工前重讀程式碼，發現另一件事的前提是錯的。

**拿掉的那件**：原本要加強編輯畫面那行「請確認」提示。理由是它「沒說要確認什麼」。

但那句批評打的是 `ADR-0005` 裡的簡稱，不是程式裡的字串。真正的字串是：

```
'editor.noteFilled': '讀音由 AI 填入，請確認',
```

它有講是 AI 填的。維護者看過真正的字串後決定不改（spec 決定十二，已推翻原文）。**這行字本票一個字都不碰。**

**方向反轉的那件**：429 原本要「講清楚不是他做錯什麼、明天會恢復」。維護者選擇不對使用者解釋共用額度，改成什麼都不解釋。

## 要做什麼

### 一、新增一條 429 專用的訊息

`src/lib/ai-logic-error.ts` 現在把所有帶狀態碼的失敗都塞進同一條 key：

```ts
if (typeof status === 'number') {
  const why = typeof seen.message === 'string' ? reasonIn(seen.message) : null;
  return why === null
    ? new AppError('gemini.httpErrorNoReason', { status })
    : new AppError('gemini.httpError', { status, reason: why });
}
```

429 要在這裡分出去，走一條新的 key `gemini.quotaExhausted`。

**key 的名字照「發生了什麼事」命名，不照顯示的文字命名。** 這是本專案既有的慣例（`gemini.offline`、`gemini.timeout` 都是成因）。程式裡誠實記錄它是額度用完，畫面上刻意不講——兩件事分開。

三種介面語言都要補，`src/i18n/smoke.test.ts` 會抓漏。措辭要滿足兩個條件：

1. **不提額度、不提狀態碼、不提「大家」。** 使用者不必知道背景。
2. **接得上前面那截。** 這條訊息是被代進 `editor.noteFailed`（「自動填讀音失敗：{reason}」）的 `{reason}`，不是獨立一行。畫面最終長這樣：

```
自動填讀音失敗：暫時無法使用，稍後再試
```

### 二、`ai-logic-error.test.ts` 補一個案例

429 進去，`gemini.quotaExhausted` 出來。這支測試檔存在的全部理由就是守住「各種失敗變成一條說得出原因的 key」（spec 測試決定）。

## 不要做的事

- **不碰 `editor.noteFilled`。** 見上面「這張票縮小過一次」。
- **不新增防線。** `ADR-0005` 的三道防線維持三道，本票一道都不加強。
- **不動網頁版。** `ai-logic-error.ts` 只有 iOS build 會載入，因此這條分支天生碰不到網頁版；`gemini-reading.ts` 那條路的 429 仍然顯示 `gemini.httpError`，那句話對自備金鑰的人仍然成立。
- **不動 `gemini.*` 其他訊息**，包含 `gemini.httpError` 與 `gemini.httpErrorNoReason` 本身。
- **不改成完全靜默。** 決定十一那種一個字都不出的作法只用在 App Check 失敗。額度用完時使用者已經看過讀音自己填好，這次沒填要給一句交代。

## 驗收

- 三種語言都有 `gemini.quotaExhausted`，`npm test` 全綠（`src/i18n/smoke.test.ts` 是守門的那支）。
- `ai-logic-error.test.ts` 有一個 429 的案例並通過。
- iOS build 上人為觸發 429，確認畫面顯示的是新訊息，且**看不到「429」這三個字**。
- ~~網頁版用一把過期金鑰觸發錯誤，確認顯示的仍是原本那條。~~ **這樣寫驗不到 429**——過期金鑰回的是 400 或 403，只證明「網頁版還會顯示錯誤」，沒證明「網頁版的 429 沒被換掉」。改法見下方 Comments。
- 三種語言下那一行都不會撐破版面（`ADR-0013` 的介面在地化前提）。

## 驗收進度

程式碼已完成（commit `adf201a`）。桌機驗得到的兩條過了，剩下的要真機。

- [x] 三種語言都有 `gemini.quotaExhausted`，`npm test` 全綠（567 tests / 31 files）。`npm run typecheck` 也過。
- [x] `ai-logic-error.test.ts` 的 429 案例改成斷言 `gemini.quotaExhausted`，並額外釘住 `params` 是空的。
- [x] iOS build 上人為觸發 429。
- [x] 網頁版用過期金鑰觸發錯誤，確認仍是 `gemini.httpError`。
- [x] 三種語言下版面沒撐破。

**環境備忘**：本票開工時這台機器的 node 停在 16.20.2，`npm test` 與 `.git/hooks/commit-msg`
在它底下都跑不起來（前者缺 `crypto.getRandomValues`，後者是 ESM 載不動無副檔名的檔）。
前兩個 commit 是把 `nvm` 裡的 26.3.1 暫時放到 PATH 最前面跑的。中途已 `nvm use 26.3.1`
切回去，之後照常。

## Comments

### 2026-08-21 — 真機驗收全過，票收掉

五條全過。程式碼在 `adf201a`。

| 驗收 | 結果 |
| --- | --- |
| 三種語言都有 `gemini.quotaExhausted`，`npm test` 全綠 | 過（567 條 / 31 檔） |
| `ai-logic-error.test.ts` 有 429 案例 | 過（順便釘住 `params` 是空的） |
| iOS build 上觸發 429 → 顯示新訊息、看不到「429」 | 過（真機） |
| 網頁版的 429 仍是 `gemini.httpError` | 過（真機，做法見下） |
| 三種語言下版面沒撐破 | 過（真機） |

#### 怎麼在 iOS 上人為觸發 429：一條死路，一條活路

**死路——從電腦端打爆專案的 Gemini 額度。不通。**

做法是在同一個 Google Cloud 專案下開一把 AI Studio 金鑰，用電腦直接敲
`generativelanguage.googleapis.com`，把 `gemini-3.5-flash-lite`（Remote Config 上那個）
與 `gemini-3.6-flash`（程式碼裡的後備）兩個模型同時壓到 100% 回 429。

**壓住的期間，手機照樣成功填出讀音。** 而且 Firebase 主控台的 AI Monitoring 只看得到
手機那些請求，完全看不到電腦打的。

推論錯在哪：Gemini 的文件寫「Rate limits are applied per project, **not per API key**」，
我把它延伸到「服務帳戶那條路也算同一本帳」。**那一步沒有文件支持。** 2026 年年中起
Firebase AI Logic 改用一個 Google 代管的服務帳戶（P4SA，`Firebase AI Logic Service Agent`）
去認證，它跟 API 金鑰那條路各算各的。

**活路——直接把 Firebase AI Logic 那層配額調低。可行，立即生效。**

1. Google Cloud 主控台 → `Firebase AI Logic API`（`firebasevertexai.googleapis.com`）
2. **Quotas & System Limits** 分頁 → 找 `Generate content requests`
3. 勾起來 → **Edit quota** → 填一個很小的數字（預設是每使用者每分鐘 100）
4. 手機上打一張卡，當場 429
5. **驗完把值改回 100**

文件只寫怎麼調「高」，但實測**調低是填得下去、而且立刻生效**的。這條路不必比時間、
不必打爆任何東西，也不動任何程式碼，是日後要重驗 429 的首選做法。

**進 GCP 主控台的小陷阱**：Firebase 專案就是 GCP 專案，但它不會出現在「最近」清單裡。
用帶專案的網址直接進：`...?project=va-practice`。專案 ID 在
`ios/App/App/GoogleService-Info.plist` 裡查得到。

#### 網頁版那條驗收改怎麼跑

原文寫「用一把過期金鑰」，但過期金鑰回 400 或 403，驗不到 429。實際做法：

1. 把那把 AI Studio 金鑰貼進網頁版的資料畫面。
2. 電腦端壓住 **`gemini-3.6-flash`**——網頁版的模型寫死在 `gemini-reading.ts:32`，
   沒有 Remote Config 那條路。
3. 網頁版打詞條，顯示 `自動填讀音失敗：Gemini 回了 429：You exceeded your current quota...`

**這是刻意的，不是漏改。** 網頁版使用者的金鑰是自己申請的，狀態碼對他是可用的線索：
他去得了 AI Studio 看用量、換得了金鑰。維護者在真的看過那句話長什麼樣之後再確認一次
維持原案。

#### 另外用打包產物證了一次「網頁版碰不到新訊息」

`npm run build` 之後在 `dist/assets/*.js` 裡搜：

| 找什麼 | 次數 | 意思 |
| --- | --- | --- |
| `customErrorData` | 0 | `ai-logic-error.ts` 整支沒進網頁版產物 |
| `GoogleAIBackend` | 0 | firebase 的 AI 套件沒進去 |
| `quotaExhausted` | 3 | 三個語言檔裡那條翻譯，是死字串 |

新訊息只有 `ai-logic-error.ts` 丟得出來，而那支不在產物裡。網頁版沒有任何一條路走得到它。
