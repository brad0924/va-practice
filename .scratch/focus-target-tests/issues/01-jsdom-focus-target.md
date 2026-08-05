# 焦點落點分類補上測試：只為這兩條裝 jsdom

Status: done
Type: enhancement

## 現況

`required-fields` 那兩張票做完之後，`editor-view.ts` 手上還沒被測到的邏輯只剩四個 `if`：

| | 位置 | 這條在擋什麼 |
|---|---|---|
| `if (cancelling)` | `editor-view.ts:217` | iPhone 鍵盤開著時點「取消」，blur 先於 touchend |
| `next instanceof HTMLInputElement` | `editor-view.ts:222` | 焦點自己落到另一個輸入框就不搶 |
| `readingRegion.contains(next)` | `editor-view.ts:223` | 落到讀音區裡的任何東西（格子、拆／合的縫）就不搶 |
| `if (event.isComposing)` | `editor-view.ts:240` | 組字中的 Enter 是輸入法在確定候選字 |

會算錯的那半（該往哪跳、避讓、退讓、繞回頭）已經在 `required-fields.test.ts` 的 20 個單元裡。這四個 `if` 全是「這個情況就別動」。

### 為什麼翻 `01-required-fields-module.md` 的案

那張票寫明「這張票不做的事：**不裝 jsdom**」，並把「裝 jsdom，直接測 `editor-view`，一行 production code 不動」列為被放棄的替代方案，理由是：

> 否決的原因是它解錯題——測得到三份不同的定義，只是把分歧藏起來，「空」還是三份。

**那個理由已經被那張票自己消滅了。** 判空現在只剩 `required-fields.ts:49` 一句，裝 jsdom 不再有任何分歧可以藏。現在要補的不是規則，是規則以外剩下的那兩條 DOM 落點分類——它們在那張票的「前提歸屬」表裡被明確判給畫面（`relatedTarget` 純 DOM 事件），所以是刻意留下的，不是漏搬的。

### spike：jsdom 能給什麼、不能給什麼

jsdom 30.0.1，探針全文見下方 Comments。

| 探針 | 結果 |
|---|---|
| `focus()` 造成的 blur，`relatedTarget` 指向下一個 input | ✅ 正確 |
| 落點是讀音區裡的 input | ✅ 正確 |
| 落點是讀音區裡的 button | ✅ 正確 |
| `blur()` 掉回 body | `relatedTarget` 為 `null`，與瀏覽器一致 |
| `KeyboardEvent` 的 `isComposing` | 傳得進去，但值是測試自己塞的，jsdom 不模擬輸入法 |
| `window.PointerEvent` | 存在 |
| **`cancel.focus()` 引發的事件序列** | **`["blur"]`——不會自己發 pointerdown** |

最後一行決定了這張票的範圍。jsdom 不模擬「手指按下去」，pointerdown 與 blur 的先後完全由測試自己 dispatch 的順序決定；`cancelling` 旗子存在的理由（iPhone 上 blur 先於 touchend）在 jsdom 裡演不出來。`isComposing` 同理，值是自己塞的。

**這兩條寫成測試等於把那行 `if` 用另一種語法再抄一遍，因此本票不寫。**

中間那兩條不一樣。`focus()` 會自然產生正確的 `relatedTarget`，測試不必手工偽造事件物件，寫出來的是完整的使用者情境——正是 `editor-view.ts:219` 那句註解在講的：

> 少了這條功能會壞掉：新增卡片時釋義必定是空的，一碰讀音區就會被彈走，讀音永遠改不成。

這是功能性的壞，而且不是眼睛盯著 code 看得出來的那種。

## 決定

### 怎麼開 jsdom：檔頭 docblock，`vite.config.ts` 一個字不動

```ts
// @vitest-environment jsdom
```

寫在 `src/ui/editor-view.test.ts` 第一行。

`vite.config.ts:29` 的 `environment: 'node'` **維持不變**，繼續當預設值。這比使用者原本設想的 glob 更輕：不必新增設定、不必發明 `*.dom.test.ts` 的命名約定，而且「這個檔案要 jsdom」寫在檔案自己頭上，讀 code 的人一眼看得到，不必翻設定檔對照。

（附帶一提，`environmentMatchGlobs` 在 vitest 3 的狀態不確定，docblock 沒有這個疑慮。）

### 新增一條 devDependency

`jsdom`。vitest 不內建它。

### `App` 替身

`editorView(app, card, back)` 全檔只碰四處：

| | 用途 |
|---|---|
| `app.gemini` (`:30`) | `read()`——**測試一律回 `null`** |
| `app.data.books` (`:45,53`) | 填單字本下拉選單 |
| `app.upsert` (`:313`) | 儲存 |
| `app.remove` (`:367`) | 刪除 |

`App` 是 interface，測試裡手搓一個替身即可。`gemini.read()` 回 `null` 是**必要的**，不是圖方便：`editor-view.ts:35` 只在金鑰非 `null` 時才建出那支帶 `fetch.bind(window)` 的 `ask`，回 `null` 等於整條網路路徑根本不存在，測試不可能外送任何請求。

這張票只測焦點跳動，`upsert` / `remove` 給空函式即可。替身用 `as unknown as App` 或補齊全部成員由實作者判斷，選前者的話註解寫清楚「只有這四支會被碰到」。

模組載入期沒有副作用要處理：`dom.ts` 與 `toast.ts` 的 `document` 都在函式體內，vitest 的 jsdom environment 會把 `document`、`HTMLInputElement`、`HTMLElement` 掛上 `globalThis`，`editor-view.ts:222-223` 的兩個 `instanceof` 因此照常運作。（裸 `new JSDOM()` 不會掛，spike 裡 `globalThis.HTMLInputElement` 是 `undefined`——這是走 vitest 而不是自己 `new JSDOM()` 的理由。）

測試需要把 `editorView()` 回傳的節點掛進 `document.body`，否則 `focus()` 不生效。

## 這張票不做的事

- **不寫 `cancelling` 與 `isComposing` 的測試**，理由見上。它們繼續靠既有的註解與 iPhone 實機。
- **不碰 `app.ts`（231 行）、`data-view.ts`（214 行）、`books-section.ts`（208 行）**。這張票只開 `editor-view.ts` 一個檔案的一小塊。剩下那 793 行要不要測是另一張票的事，本票不預設立場。
- **不測 Tab 順序。** jsdom 不實作 Tab 鍵移動焦點，`editor-view.ts:220` 那句「桌機按 Tab 也走這條」測不到。實機驗收清單裡那一條留著。
- **不測 DOM 結構**——不斷言 class 名、不斷言文字內容、不做快照。這是 jsdom 進來之後最容易寫、也最脆的一種測試，本票明確劃掉。
- **不改 `docs/spec.md:105`。** 那句管的是「模組不得 import DOM」，而 `editor-view.ts` 是畫面不是模組，畫面本來就碰 DOM。預設環境仍是 `node`，模組一旦 import DOM 測試照樣爆，那條紀律的牙齒沒掉。
- **一行 production code 都不動。**

## 被放棄的替代方案

- **完全不裝 jsdom**（推薦過，未採用）：省一條 devDependency，四個 `if` 全靠註解與真機。否決的原因是那兩條落點分類 jsdom 真的抓得住，而且抓的是使用者看得到的行為（改讀音時被彈走），不是實作細節。
- **整個專案換成 `environment: 'jsdom'`**：寫測試時不必想檔頭。否決的原因是 `docs/spec.md:105` 的執法會從「測試會爆」降成「要記得」。
- **`vite.config.ts` 加 glob + `*.dom.test.ts` 命名**（使用者原本選的形狀）：達成同樣的隔離。改用 docblock 的理由見上——同樣的效果，少一份設定與一條命名約定。
- **把落點分類搬進 `required-fields`**（更早就否決過）：搬走的是不會錯的那半，「把焦點物件翻成落點分類」那句非碰 DOM 不可。
- **測 `cancelling` 的旗子行為**（dispatch pointerdown 再 dispatch blur，斷言沒跳）：測得到。否決的原因是那個順序是測試自己排的，而順序正是這條 `if` 唯一要驗證的東西。

## 驗收

`npm test` 全綠、`npm run typecheck` 過。

**新檔案 `src/ui/editor-view.test.ts`**（檔頭 `// @vitest-environment jsdom`）

共同前提：新增卡片（`card` 為 `null`）、`gemini.read()` 回 `null`、至少一本單字本、節點掛進 `document.body`。

不搶（`relatedTarget` 有人接）：
- 詞條填「大丈夫」、釋義**留空**，焦點從詞條移到第一個讀音格 → 焦點停在讀音格，**沒有**被彈到釋義（`editor-view.ts:219` 那句註解的回歸測試）
- 承上，焦點從詞條移到讀音區裡的按鈕（拆／合的縫）→ 焦點停在那顆按鈕
- 詞條有值、釋義留空，焦點從詞條直接移到釋義 → 焦點停在釋義，不被搬到讀音格

搶（`relatedTarget` 為 `null`）：
- 詞條填「大丈夫」、讀音格空，對詞條呼叫 `blur()` → 焦點落到第一個空的讀音格
- 詞條**留空**，對詞條呼叫 `blur()` → 焦點不動（前提一沒過，`stay`）
- 三種格全部有值，對釋義呼叫 `blur()` → 焦點不動（`done`）

純假名詞條（一個讀音格都沒有）：
- 詞條填「ひらがな」、釋義空，對詞條呼叫 `blur()` → 焦點落到釋義

**既有測試**：一個都不該改。這張票不動 production code。

**實機（不在本票範圍，列此備忘）**：iPhone 鍵盤開著時點「取消」、桌機 Tab 順序——這兩條 jsdom 給不了，仍然只能真機驗。

## Comments

### spike 全文（2026-08-05）

在 scratchpad 的獨立小專案裡跑，未觸碰本 repo 的 `package.json`。jsdom 30.0.1。

```
1a focus()→input,  blur.relatedTarget         │ meaning ✅
1b focus()→讀音格, blur.relatedTarget          │ readingInput ✅
1c focus()→讀音區 button, blur.relatedTarget   │ split ✅
1d blur() 掉回 body, blur.relatedTarget        │ null
1e globalThis.HTMLInputElement 存在            │ undefined
1e meaning instanceof window.HTMLInputElement │ true
2  KeyboardEvent isComposing:true 傳得進去      │ true ✅
3a window.PointerEvent 存在                    │ function
3b dispatch Event("pointerdown") 收得到         │ true ✅
4  focus(cancel) 引發的事件序列                  │ ["blur"]
```

探針 4 是自己對 `cancel` 呼叫 `focus()`，觀察 jsdom 會不會連帶發出 pointerdown——不會，只有 blur。

### 實作時補的一條：`activeElement` 看不出「有沒有被搶」（2026-08-05）

驗收條件原本寫成「焦點停在讀音格」，照字面用 `document.activeElement` 斷言。實作後把
`editor-view.ts:222-223` 兩個 `if` 都拔掉重跑，七條**全部照樣綠**——那三條「不搶」是空的。

原因是 `focus()` 的順序：先發 blur、等處理器跑完，才把新目標設成 `activeElement`。
失焦處理器中途 `focus()` 搶走的那一下會被後面這步蓋回去，終點永遠是使用者點的那一個。
事件序列看得到（探針，兩個 `if` 都拔掉時）：

```
term→讀音格   ["f:term","b:term","f:r0","f:r0"]     ← r0 被搶著聚焦了一次，然後又聚焦一次
term→縫       ["f:term","b:term","f:r0","f:seam"]   ← 多出來的 f:r0 就是被搶的那一下
term→釋義     ["f:term","b:term","f:r0","f:meaning"]
```

因此改成斷言「這一趟裡拿到 `focus` 事件的元素依序有誰」（`focusTrail`，捕獲階段接，
`focus` 不冒泡）。拔掉驗證過：只拔第一個 `if` → 第三條紅；只拔第二個 → 第二條紅；
兩個都拔 → 三條全紅。production code 最終一行未動。

### 這張票看漏了 spec 的另外三句（2026-08-05）

「這張票不做的事」只處理了 `docs/spec.md:105`，但真正被翻案的是 `:206`／`:208`／`:227`
那三句「畫面本身不撰寫自動化測試」——`:208` 還點名了 jsdom。code review 才抓到。
文件另開 `02-docs-for-jsdom-focus-target.md` 處理，本票的程式範圍不受影響。
