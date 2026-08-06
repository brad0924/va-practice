# 02 — 單字本開關自己吃 Esc，並向外回報開合

Status: done
Type: enhancement

## 現況

`bookFilter`（`src/ui/book-filter.ts`）對外只有一條線：`onChange`。開合狀態 `open` 是模組內的區域變數，外面看不到，也關不掉。

收起來的唯一辦法是再點一次 toggle 或點某一本（`choose()` 會走 `refresh()`，但 `open` 不變，其實仍然開著）。**沒有 Esc、也沒有點外面自動關閉。**

現在兩個呼叫端都在工具列裡，開著不關頂多礙眼。`03` 要把它放進複習畫面，那裡的空白鍵與 `1`–`4` 掛在 `document` 上（`app.ts:234`），情況就變了：

- `isTyping()`（`app.ts:255`）只讓 `HTMLInputElement` / `HTMLTextAreaElement` 過。勾選框是 `HTMLInputElement`，所以焦點在勾選框時按空白是安全的。
- **但 toggle 是 `<button>`，不算輸入框。** 用滑鼠點開下拉之後焦點就停在那顆按鈕上——照按鈕的慣例再按空白應該是收起來，實際會走到 `reveal()`：答案被掀開、整頁重畫、選單消失。答案掀開後按 `1`–`4` 同理會直接送出評分。

另外 `book-filter.ts:11` 那句：

> 這兩組範圍只有從這個元件才改得動，離開畫面再回來時整個元件會重建，因此副本不會與 AppData 那份走散。

前半句本來就不精確（複習範圍從 `books-section.ts:105` 也改得動），`03` 之後更明顯。真正成立的保證是**「這顆在場的時候，沒有別人會改這一組」**——理由（離開畫面元件會重建）本身沒變。

## 決定

### Esc 由零件自己吃掉

「按 Esc 收起來」是這顆自己的事——它才是持有 `open` 的人。監聽器掛在**它自己的節點**上，不碰 `document`：

```ts
node.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || !open) return;
  event.preventDefault();
  open = false;
  refresh();
  toggle.focus();
});
```

掛在自己節點上而不是 `document` 的理由：`mount()`（`app.ts:229`）用 `root.replaceChildren()` 換畫面，元件**沒有拆卸的時機**可以解除監聽器。掛 `document` 會每重畫一次就多留一個，愈積愈多。掛自己身上則隨節點一起被丟掉。

代價是「焦點跑到元件外面時 Esc 收不起來」。可以接受：點開 toggle 之後焦點就在 toggle 上，勾選框也在節點內，正常操作全程都在範圍裡。

收起來之後把焦點送回 toggle——本來就在那裡，這行是為了「焦點在某個勾選框上按 Esc」那條路，不然焦點會落在一個剛被藏起來的元素上。

### 多一支可選的開合回報

```ts
export interface BookFilterOptions {
  // …既有的 books / selected / variant / onChange 不動
  /** 選單開了或關了。給需要在展開期間讓路的呼叫端用（複習畫面的快捷鍵）。 */
  onOpenChange?(open: boolean): void;
}
```

只在 `open` 真的變動時呼叫，`refresh()` 內部的重畫不觸發。三個觸發點：點 toggle、按 Esc，如此而已（勾選某一本不改變 `open`）。

**回傳型別不變，仍然是 `HTMLElement`。** 因此 `list-view.ts:115` 與 `stats-view.ts:95` 兩個呼叫端**一行都不用改**，還順便免費拿到 Esc，三頁行為一致。

### 註解訂正

`book-filter.ts:11` 改寫成正確的保證：這顆在場時沒有別人會改這一組，離開畫面元件重建，因此副本不會與 `AppData` 那份走散。不要再宣稱「只有從這個元件才改得動」。

同一段開頭「複習範圍不走這裡——它是資料頁單字本區每一列的勾選框（見票 05），複習畫面上不放任何開關」整段已被推翻，一併改掉：三組範圍現在都用這顆，複習範圍另有資料頁那個入口。

## 這張票不做的事

- **不加「點外面自動關閉」。** 沒被要求，而且做起來要掛 `document` 的 click 監聽器，撞上同一個「沒有拆卸時機」的問題。
- **不改回傳型別**，不對外開放 `close()` 或 `isOpen()`。
- **不動 `list-view.ts` 與 `stats-view.ts`**（`onOpenChange` 是可選的，不傳就沒事）。
- **不動 `scopeLabel`、勾選邏輯、「全部」項目、「只剩一本不可取消」**——這張票只加開合行為。
- **不動 CSS。**

## 被放棄的替代方案

- **回傳 `{ node, isOpen, close }`，Esc 交給複習畫面處理**：控制權最大。否決的原因是三個呼叫端都得跟著改接法，而 Esc 的邏輯只會寫在複習頁，卡片列表與統計頁還是關不掉——同一顆零件三種行為。
- **複習畫面直接讀 DOM（`menu.hidden`）判斷開合**：零介面改動。否決的原因是把元件的內部狀態變成外面的隱性依賴，`bookFilter` 之後改用別的方式藏選單就會靜默壞掉。
- **Esc 掛在 `document` 上**：焦點在哪都收得起來。否決的原因見上——沒有拆卸時機，監聽器會隨每次重畫累積。
- **不處理，快捷鍵照舊**：零程式。否決的原因是「點開下拉、按空白想收起來、結果答案被掀開」是桌機上碰得到的意外。

## 驗收

`npm test` 全綠、`npm run typecheck` 過。

**`src/ui/book-filter.test.ts`**

檔頂加上 `// @vitest-environment jsdom`（沿用 `editor-view.test.ts:1` 的做法；專案預設環境仍是 `node`）。既有的 `scopeLabel` 測試留在同一個檔，行為不變。順帶把 `editor-view.test.ts:8` 那句「這一個檔案（也只有這一個）要 jsdom」訂正掉。

新增：

- 點 toggle 展開 → `onOpenChange(true)` 被呼叫一次
- 再點 toggle 收起 → `onOpenChange(false)` 被呼叫一次
- 展開狀態下按 Esc → 選單收起（`menu.hidden` 為真、`aria-expanded` 為 `"false"`）且 `onOpenChange(false)` 被呼叫
- **收起狀態**下按 Esc → `onOpenChange` 完全沒被呼叫（不重複回報）
- 展開狀態下勾某一本 → `onChange` 被呼叫，但 `onOpenChange` **沒有**被呼叫（勾選不改變開合）
- 焦點在某個勾選框上按 Esc → 收起，且焦點回到 toggle
- 不傳 `onOpenChange` 時，展開／收起／按 Esc 都不丟例外

**手動驗收**

- 卡片列表：點開單字本膠囊 → 按 Esc → 收起來（新行為）
- 統計頁：同上
- 兩頁的既有行為沒壞：連續勾好幾本、選單不會自己收、「全部」與「只剩一本不可取消」照舊
