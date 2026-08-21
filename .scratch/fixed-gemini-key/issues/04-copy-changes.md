# 04 — 額度用完時的訊息換成一句不解釋的話

Status: ready-for-human
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
- 網頁版用一把過期金鑰觸發錯誤，確認顯示的仍是原本那條。
- 三種語言下那一行都不會撐破版面（`ADR-0013` 的介面在地化前提）。

## 驗收進度

程式碼已完成（commit `adf201a`）。桌機驗得到的兩條過了，剩下的要真機。

- [x] 三種語言都有 `gemini.quotaExhausted`，`npm test` 全綠（567 tests / 31 files）。`npm run typecheck` 也過。
- [x] `ai-logic-error.test.ts` 的 429 案例改成斷言 `gemini.quotaExhausted`，並額外釘住 `params` 是空的。
- [ ] iOS build 上人為觸發 429。
- [ ] 網頁版用過期金鑰觸發錯誤，確認仍是 `gemini.httpError`。
- [ ] 三種語言下版面沒撐破。

**環境備忘**：這台機器目前的 node 是 16.20.2，`npm test` 與 `.git/hooks/commit-msg`
在它底下都跑不起來（前者缺 `crypto.getRandomValues`，後者是 ESM 載不動無副檔名的檔）。
本票的測試與 commit 都是把 `nvm` 裡的 26.3.1 暫時放到 PATH 最前面跑的，沒有動全域設定。
