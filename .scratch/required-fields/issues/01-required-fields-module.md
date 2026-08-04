# 必填格收成一個模組：換欄與儲存共用同一句「還空著」

Status: done
Type: enhancement

## 現況

「必填」這條規則沒有家。目前散在 3 個檔案 6 處：

| 規則 | 住在哪 |
|---|---|
| 詞條必填（儲存版） | `reading-editor.ts:191` → `Commit.empty-term` |
| 詞條必填（輪詢版） | `editor-view.ts:180` 的 `isEmpty` |
| 讀音必填（序號版） | `reading.ts:296` `firstEmptyReading` |
| 讀音必填（訊息版） | `reading.ts:314-318`——**畫面永遠走不到**，只活在三個測試裡 |
| 讀音必填（輪詢版） | `editor-view.ts:180` 套在 `readingInputs()` 上 |
| 釋義必填 | 只在 `editor-view.ts:303, 308`；`reading-editor` 不知道有釋義這個東西 |

散開的直接後果是一個現行的行為分歧。`editor-view.ts:180` 判空有 `trim`、`reading.ts:300` 沒有，所以**讀音格填一個空白**時：

```
按 ↵      → editor-view 說「這格空的」→ 游標送進去
按儲存    → commit() 說「這格填了」→ 落到 reading.ts:320 的假名檢查
          → 紅字「◯ 的讀音要填假名」，游標不動
```

同一格，換欄鍵說沒填、儲存說填錯。ADR-0009 整篇在講「沒填」與「填錯」是兩回事、處理方式不同，而這一格同時是兩者。

另一件事是這些規則全住在會碰 DOM 的 `editor-view.ts`（409 行），而 `vite.config.ts` 的測試環境是 `node`、沒有 jsdom，所以這 409 行一條測試都跑不了。最近三個 commit 有兩個主戰場在這裡，其中修 ↵ 死鍵的 `6cfd71c` 只動 `editor-view.ts` 37 行、**零測試**。

**這張票要解的是「規則沒有家」。測得動是副產品，不是目的。**

## 決定

### 新模組：必填格

`src/ui/required-fields.ts`——與同樣不碰 DOM 的 `reading-editor.ts` 並排。不順手改「不碰 DOM 的都該在 `lib/`」那條分層，那是另一張票的事。

```ts
type FieldRef =
  | { kind: 'term' }
  | { kind: 'reading'; index: number }   // 讀音格攤平後的序號，與畫面由左到右一致
  | { kind: 'meaning' };

type Jump =
  | { kind: 'move'; to: FieldRef }   // 送過去
  | { kind: 'stay' }                 // 前提一沒過：不跳、也不送出
  | { kind: 'done' };                // 全部有值：放行

createRequiredFields({
  term:       () => string,
  readings:   () => string[],
  meaning:    () => string,
  prefilling: () => boolean,         // AI 避讓用，來自 editor.prefilling
})
  nextEmpty(from: FieldRef): Jump      // 輪詢順：詞條 → 讀音格（左到右）→ 釋義
  firstBlocking(): FieldRef | null     // 儲存順：詞條 → 釋義 → 讀音格
```

兩條順序不同是刻意的，使用者明確選過（ADR-0006／0009）：換欄走畫面的由上而下，儲存把讀音排最後。**兩條順序都住在這個模組裡**——這是選語意模型（模組認得三種身分）而不是位置模型（模組只看到一串匿名的值）的唯一理由：位置模型講不出「讀音排最後」，那條規則會被推回畫面去排，等於白搬。

避讓與退讓照 ADR-0006 原樣搬進來，一個字不改：

```
nextEmpty 遇到 from 是詞條且 prefilling 為真
  → 這一輪候選只有 [詞條, 釋義]，讀音格整段跳過
  → 這一圈找不到空格 → 退讓，改用完整的一圈 [詞條, 讀音格…, 釋義] 再找一次
```

### 「還空著」只剩一句

三種格一律 `value.trim() === ''`。

儲存的值本身**不動**——`' こ '`（前後有空白的假名）仍然被 `reading.ts:320` 的 `KANA` 擋成「要填假名」。那是既有行為，這張票不碰。

### 值從 DOM 來

模組拿到的一律是畫面上的字：

```ts
term:     () => termInput.value
readings: () => readingInputs().map((input) => input.value)
meaning:  () => meaningInput.value
```

被放棄的是「讀音改向 `reading-editor` 的 `runs` 拿」。兩者理論上永遠相等（每次 `input` 事件都會 `editor.setReading()` 寫進 `runs`），選 DOM 的代價是讀音仍然有兩份值，因此下一節那道守門是**必要的**，不是防禦性程式碼。

### `reading-editor.commit()` 瘦身，但留一道守門

```ts
type Commit =
  | { ok: true;  text: string }
  | { ok: false; errors: string[] }
```

- `empty-term` 與 `empty-reading` 兩支退場——必填全歸新模組。
- `reading.ts` 的 `firstEmptyReading` 失去唯一呼叫端 → **刪掉**，連同它的測試。
- `reading.ts:314-318`（`validateDraft` 的空格那段）**留著**，性質從「死路」變成「不該發生的守門」。理由：`validateDraft` 對空字串有 guard（`cell.reading !== ''` 才檢查假名），少了這段，萬一 DOM 與 `runs` 漂移，一個空的讀音格會靜默通過 `toMarkup` 存成一張沒讀音的卡——正是 ADR-0009 要擋的東西。那三個既有測試留著，但註解要改：它們測的不再是使用者看得到的錯，而是這道防線。

### 前提歸屬

| 前提 | 去哪 | 理由 |
|---|---|---|
| 一：離開的那一格必須有值 | **進模組** | 它是判空。留在外面，「空」就又有兩份 |
| 二：焦點落到別的輸入框或讀音區就不搶 | 留畫面 | `relatedTarget`，純 DOM 事件 |
| `isComposing`、`cancelling` 旗子 | 留畫面 | 按鍵與手勢，純 DOM |

前提一進模組是 `Jump` 要有三態的原因：`jumpOnEnter` 現在靠「`isEmpty(from)` 就 `preventDefault` 不送出」與「`nextEmpty` 回 `null` 就放行送出」區分兩種情況，兩者都會讓模組回 `null`，畫面分不出來。ADR-0006 特別交代過從空格出發按 ↵ 要「什麼都不發生」，不能變成送出表單吃一行紅字。

改完的畫面端：

```ts
const jumpOnEnter = (event: KeyboardEvent, from: HTMLInputElement) => {
  if (event.key !== 'Enter' || event.isComposing) return;
  const jump = fields.nextEmpty(refOf(from));
  if (jump.kind === 'done') return;              // 放行送出
  event.preventDefault();
  if (jump.kind === 'move') nodeOf(jump.to).focus();
};

const jumpToEmpty = (event: FocusEvent, from: HTMLInputElement) => {
  if (cancelling) return;
  const next = event.relatedTarget;
  if (next instanceof HTMLInputElement) return;
  if (next instanceof HTMLElement && readingRegion.contains(next)) return;
  const jump = fields.nextEmpty(refOf(from));
  if (jump.kind === 'move') nodeOf(jump.to).focus();   // stay 與 done 都不做事
};

const saveCard = (): string | null => {
  const blocking = fields.firstBlocking();
  if (blocking !== null) return rejectBlank(nodeOf(blocking));
  const result = editor.commit();
  if (!result.ok) {
    error.textContent = result.errors.join('；');
    return null;
  }
  // …assertTermAvailable、upsert 照舊
};
```

`editor-view.ts` 裡再也沒有 `isEmpty()`、`avoidReading()`、`nextEmpty()`。留下來的是 DOM 建構、事件掛點，以及 `refOf` / `nodeOf` 那張 `FieldRef ↔ HTMLInputElement` 的對照表。

### 這張票不做的事

- **不裝 jsdom**，測試環境維持 `node`。
- **不縮 `editor-view.ts` 的行數**當目標。搬走的是判斷、留下的是 DOM，409 行大概掉到 330 上下。收穫是那 330 行裡不再有規則，不是行數。
- **不動 `' こ '` 被 `KANA` 擋掉**的既有行為。
- **不動 `reading.ts` 其他匯出**（`toDraft`／`rebuildRuns`／`mergeSeam`／… 的收窄是另一張票）。
- **不改任何 ADR 的決定**。輪詢順序、避讓退讓、儲存順序、必填全部照舊，只是搬家。文件的訂正在 `02`。

## 被放棄的替代方案

- **裝 jsdom，直接測 `editor-view`，一行 production code 不動**：最便宜，`editor-view` 明天就測得到。否決的原因是它解錯題——測得到三份不同的定義，只是把分歧館藏起來，「空」還是三份。
- **只搬換欄輪詢，不碰 `commit()`**：改動最小、不動 `reading-editor`。否決的原因是 trim 分歧原封不動地活著，只是換個地方分歧——輪詢在新模組判空、儲存在 `commit()` 判空，還是兩份。
- **位置模型**（模組只收一串匿名的值、回序號）：介面最窄、模組完全不認識這張表單。否決的原因見上：儲存順序與避讓都得由呼叫端提供，規則流回 `editor-view`。
- **讀音改向 `runs` 拿**（推薦過，未採用）：值只有一份，模組在測試裡完全不需要假的輸入框。使用者選 DOM，代價由 `commit()` 的守門吸收。
- **`commit()` 瘦到底**（連空格守門也刪）：程式最少。否決的原因是搭配 DOM 取值，DOM 與 `runs` 漂移時空讀音會靜默存進去。
- **`empty-term` 留在 `commit()`**（它本來就持有 `term`）：詞條判空又變回兩份，正是這張票要消掉的東西。
- **整個編輯表單收成一個模組**（連單字本選擇、詞條全域唯一、`upsert` 一起）：從根上解決。否決的原因是那等於重寫整支 `editor-view`，超出這張票。

## 驗收

`npm test` 全綠、`npm run typecheck` 過。

**新模組單元（`src/ui/required-fields.test.ts`）**

輪詢三態：
- 從詞條（有值）出發，讀音格有空的 → `move` 到 `reading[0]`
- 從詞條（**空**）出發 → `stay`
- 三種格全部有值 → `done`
- 從 `reading[1]`（有值）出發、`reading[2]` 空 → `move` 到 `reading[2]`
- 從釋義（有值）出發、詞條空 → `move` 到 `term`（到底繞回頭）
- 從 `reading[0]`（有值）出發、後面都有值但詞條空 → 繞回 `term`
- 純假名詞條（`readings` 為空陣列）、詞條有值、釋義空 → `move` 到 `meaning`

避讓與退讓：
- `prefilling` 為真、從詞條（有值）出發、釋義空 → `move` 到 `meaning`（讀音格整段跳過）
- `prefilling` 為真、從詞條（有值）出發、**釋義已有值**、讀音空 → `move` 到 `reading[0]`（退讓；這是 `6cfd71c` 那個死鍵的回歸測試）
- `prefilling` 為假、從詞條（有值）出發、讀音空 → `move` 到 `reading[0]`
- `prefilling` 為真、但從**讀音格**出發 → 避讓不適用，照一般規則走

判空（trim）：
- 讀音格的值是單一空白 `' '` → 視為空：`nextEmpty` 會送進去、`firstBlocking` 會回它（這是本票修掉的分歧）
- 詞條是 `' '` → 視為空
- 釋義是 `' '` → 視為空

儲存順序（`firstBlocking`）：
- 詞條空、釋義空、讀音空 → 回 `term`
- 詞條有值、釋義空、讀音空 → 回 `meaning`（**不是**讀音格）
- 詞條有值、釋義有值、`reading[1]` 空 → 回 `reading[1]`
- 三種格全部有值 → `null`
- 純假名詞條、詞條與釋義有值 → `null`

**既有測試要跟著改**

- `reading-editor.test.ts:289` 起那個 describe：`Commit` union 改形狀，`{ ok: false, reason: 'empty-term' }` 與 `{ ok: false, reason: 'empty-reading', index }` 的斷言會編不過，改成兩支的新形狀。
- `reading.test.ts`：測 `firstEmptyReading` 的案例隨函式一起刪。
- `reading.test.ts:381/395/406`（`validateDraft` 的空格分支）：案例留著，註解改成「這是不該發生的守門，畫面不會顯示這句」。

**畫面（實測）**

前四條是這張票新修掉的行為，一定要跑：

- 讀音格填**一個空白**、詞條與釋義有值 → 按儲存 → 紅字「詞條、讀音與釋義都要填。」＋游標落在那個讀音格（**不是**「要填假名」、游標不動）
- 承上，按 ↵ → 游標落在同一格（兩顆鍵落點一致）
- 有設金鑰、先填釋義再填詞條 → 按 ↵ → 游標進第一個空的讀音格，AI 開始問（`6cfd71c` 的死鍵回歸）
- 從一個空的格子按 ↵ → 什麼都不發生，**不出紅字、不送出表單**

其餘照舊、確認沒壞：

- 詞條「大丈夫」、釋義空、讀音全空 → 按儲存 → 游標落在**釋義**
- 讀音格填 `abc` → 紅字「大 的讀音要填假名」，**游標不動**
- 點讀音區的合併縫 `⊕` 或拆開縫 `·` → 不被彈走
- 桌機按 Tab → 原本的 Tab 順序不變
- iPhone 鍵盤還開著時直接點「取消」→ 正常離開，不被拉回輸入框
- 「儲存並繼續」存完一張 → 清空、游標回詞條、toast 出現

## Comments

### 實作完成（2026-08-05）

`npm test` 320 綠、`npm run typecheck` 過。新模組 20 個單元測試涵蓋驗收清單全部案例，另加一條：讀音格在失焦同一刻被重畫換掉（序號超出範圍）→ `stay`。它是 `refOf` 對已被移除的輸入框回 `index: -1` 的落點，取不到值就當它是空的，前提一自然擋下——舊碼在這種情況會讓 ↵ 直接送出表單。

畫面實測在桌機 Chrome 上跑過（使用者的真實資料，全程沒有存下任何一張卡，卡片數前後都是 236；對 Gemini 的請求在本機攔掉，沒有外送）：

- ✅ 讀音格填一個空白 → 按儲存 → 紅字「詞條、讀音與釋義都要填。」＋游標落在那個讀音格
- ✅ 承上按 ↵ → 停在同一格，不送出表單
- ✅ 有金鑰、先填釋義再填詞條 → 按 ↵ → 游標進第一個空的讀音格，AI 確實開始問（`6cfd71c` 的死鍵回歸）
- ✅ 從空的釋義按 ↵ → 焦點不動、不出紅字、不送出
- ✅ 詞條「大丈夫」、釋義空、讀音全空 → 按儲存 → 游標落在**釋義**
- ✅ 讀音格填 `abc` → 紅字列舉三條「◯ 的讀音要填假名」，游標沒被彈進任何輸入框
- ✅ 點合併縫 `⊕`、點另一個讀音格 → 都不被彈走
- ✅ 桌機按 Tab → 從詞條走到讀音區第一個可聚焦元素，順序沒變

沒跑的兩條：**iPhone 鍵盤開著時點取消**（要實機）、**「儲存並繼續」存完一張**（會寫進使用者的真實資料，沒動）。
