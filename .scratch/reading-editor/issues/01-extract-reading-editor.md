# 01 — 抽出讀音編輯器，編輯畫面改成照單辦事

Status: done
Type: enhancement

**Blocked by:** 無，可立刻開始。

決策紀錄見 `../spec.md`，動工前整份讀完——這張票只寫要做什麼，**為什麼這樣做**全在 spec 裡。

## 要做什麼

把讀音格的協調邏輯從編輯畫面搬進一個不碰畫面的**讀音編輯器**，讓它進得了 node 測試環境。

**這次行為零變化。** 使用者看到的畫面、文字、錯誤訊息、操作順序一字不改。沒有新功能，沒有 bug 修正。搬動過程若發現既有行為有瑕疵（例如預填失敗後同一串不會重試），記成新 issue，不在這次順手改。

搬進去的判斷有五類，目前完全沒有測試保護：

1. 預填回覆等待期間使用者改了詞條 → 這份回覆對的是舊的漢字串，整份丟掉
2. 詞條改動後漢字排列有沒有變 → 沒變就不准重建讀音格的畫面（會失焦、打斷日文輸入法）
3. 提示字的生死 → 只要預填的假名還活著，「請確認」那行絕不能消失（ADR-0005 的唯一防線）
4. 預填的五條守門 → 沒金鑰、詞條空白、沒有漢字、已填過、同一串問過了，任一成立就完全靜默
5. 讀音格的變動與「問過哪一串」的記錄

## 模組介面

```ts
createReadingEditor(options: {
  markup?: string;                                     // 舊卡的標記字串；新卡不傳
  ask: ((term: string) => Promise<unknown>) | null;    // null 代表沒金鑰，全程靜默
})
```

六支指令、一個唯讀的查看窗口（`term`、`runs`、`note`）。

```ts
interface Change {
  term: boolean;   // 詞條框要改寫（只有貼上帶標記字串時為 true）
  runs: boolean;   // 讀音格要重畫
  note: boolean;   // 提示字要換
}

type Note =
  | { kind: 'asking' }
  | { kind: 'filled' }
  | { kind: 'failed'; reason: string };   // null 代表沒話講
```

| 指令 | 回傳 |
|---|---|
| `setTerm(raw)` | `Change` |
| `setReading(ri, ci, value)` | `Change`（恆為空單） |
| `mergeAt(ri, seam)` | `Change` |
| `splitAt(ri, ci, at)` | `Change` |
| `prefill()` | `{ now: Change; later: Promise<Change> }` |
| `commit()` | `{ ok: true; text } \| { ok: false; reason: 'empty-term' } \| { ok: false; reason: 'invalid'; errors }` |

`prefill` **不宣告成 `async`**：先同步跑完守門與掛提示字，再把要等的那件事包成 Promise 交出去。

## 驗收條件

**模組行為**

- [ ] 預填等待期間改了詞條 → 回覆整份丟掉，讀音格不動
- [ ] `ask` 為 `null` → 全程靜默，兩張單子都是空的、提示字始終沒出現過
- [ ] 已有格子填了讀音 → 不問（開舊卡的情境）
- [ ] 同一串詞條問第二次 → 不問
- [ ] 詞條沒有漢字 → 不問
- [ ] 詞條 `trim` 後為空 → 不問
- [ ] 回覆過不了 `acceptPrefill` → 掛 `failed`，讀音格保持原狀留空
- [ ] `ask` 拋錯（連不上、逾時）→ 掛 `failed` 並帶原訊息
- [ ] 考え込む → 考え込んだ（改詞尾）：`runs` 為 `false`
- [ ] 考え込む → 考え直す（換漢字）：`runs` 為 `true`
- [ ] `setReading`：恆為空單
- [ ] `mergeAt` / `splitAt`：`runs` 為 `true`
- [ ] 預填完成後改詞條、讀音還在 → 提示字**必須**留著
- [ ] 清空所有讀音後改詞條 → 提示字消失
- [ ] 貼上 `焦[こ]がす` → 攤回讀音格，且回報詞條框要改寫
- [ ] `commit` 詞條空白 → `empty-term`
- [ ] `commit` 同串混填混空 → `invalid` 加錯誤清單
- [ ] `commit` 正常 → 組出標記字串，且**模組狀態未被改動**

**測試寫法**

- [ ] 新測試放在模組旁邊，依賴注入的假物件手寫，不引進任何 mock 工具（照 `storage.test.ts`、`gemini-key.test.ts` 的 `fakeStorage` 寫法）
- [ ] 假的 `ask` 能控制何時兌現、兌現什麼，演得出搶答與各種失敗
- [ ] 測試名稱沿用讀音領域既有風格（直接寫日文例子）
- [ ] 跑測試不會發出任何真實網路請求

**編輯畫面**

- [ ] 只剩畫格子、接事件、照單辦事；`shape()`、`askedTerm`、搶答檢查、守門條件都不再出現在畫面檔案裡
- [ ] 提示字的四種中文與樣式（`hint` / `error`）留在畫面，用一張對照表把狀態代號翻過去
- [ ] 「詞條與釋義都要填。」這句話與觸發順序一字不改——畫面把模組回的 `empty-term` 與「釋義空白」在自己家裡合成同一句
- [ ] 每次呼叫指令後一律刷新預覽，預覽不進變更單

**不動的東西**

- [ ] `src/lib/reading.ts` 一行未改，`reading.test.ts` 全部 522 行原封不動留在原地
- [ ] `src/lib/gemini-reading.ts` 一行未改，維持沒有測試
- [ ] 沒有引進 jsdom 或任何瀏覽器環境；編輯畫面本身仍然不寫測試

**整體**

- [ ] `npm test` 全綠、`npm run typecheck` 過
- [ ] **手動走一遍新增卡片流程**：用日文輸入法打詞條時讀音格不會失焦、預填完成後改詞條「請確認」那行還在、預覽即時跟著變。行為零變化是硬性條件，自動化測試驗不到「使用者看到的東西沒變」
