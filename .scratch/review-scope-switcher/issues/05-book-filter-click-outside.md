# 05 — 單字本開關點外面自動關閉

Status: ready-for-agent
Type: enhancement

## 現況

`bookFilter`（`src/ui/book-filter.ts`）現在收得起來的方法有兩個：再點一次 toggle（`:51`）、按 Esc（`:66`，票 `02` 做的）。勾選某一本不收——那是刻意的，連續勾好幾本時選單要留著。

**沒有「點外面自動關閉」。** 票 `02` 明文否決過，理由是：

> 沒被要求，而且做起來要掛 `document` 的 click 監聽器，撞上同一個「沒有拆卸時機」的問題。

### 那個理由不成立

`app.ts:231` 早就解過同一個問題，而且解法就在同一個層級：

```ts
function mount(build: () => HTMLElement): void {
  app.keyHandler = null;          // 換畫面時把插槽清空
  root.replaceChildren(build());
}

document.addEventListener('keydown', (event) => {   // 全 app 只註冊這一次
  if (isTyping(event.target)) return;
  app.keyHandler?.(event);
});
```

一個常駐監聽器加一個可替換的插槽，數量永遠是 1。`review-view.ts:71` 與 `stats-view.ts:186` 都靠它吃鍵盤。

所以「掛 `document` 就會累積」只對**註冊了永不解除**的天真做法成立。`02` 寫否決理由時沒把這個模式算進去，只看到 `book-filter.ts:61` 那段自己寫的註解就下了結論。

**但本票不沿用 `keyHandler` 那一套**，理由見〈被放棄的替代方案〉。

## 決定

### 觸發是 `pointerdown`，不是 `focusout`

「點到外面」看的是指標按在哪裡，不看焦點在誰手上。另一條路是在 `node` 上聽 `focusout`、比對 `relatedTarget` 是否還在節點內（`editor-view.ts:221` 就是這樣判落點），零 `document` 監聽器——但 iOS Safari 點到不可聚焦的空白處時，按鈕不一定會失焦，手機上會收不起來。這個 app 主要在 iPhone 上用，所以走指標事件。

用 `pointerdown` 而不是 `click`，順便避開 iOS Safari「點非互動元素時 `click` 不冒泡到 `document`」那個老問題。

### 選單開才註冊，關就解除，另加自癒

監聽器只在選單開著的那段時間存在——關起來時 `document` 上一個都沒有：

```ts
function onOutside(event: PointerEvent): void {
  // 節點已經脫離文件：畫面在選單開著時被換掉了，沒有人叫這個監聽器下班。
  if (!node.isConnected) {
    document.removeEventListener('pointerdown', onOutside);
    return;
  }
  if (node.contains(event.target as Node)) return;
  // 這一下只用來收選單，不讓它變成後續的 mousedown／click。
  event.preventDefault();
  open = false;
  refresh();
  document.removeEventListener('pointerdown', onOutside);
  onOpenChange?.(false);
}
```

`isConnected` 那三行堵的是唯一的破口：**選單開著的時候畫面自己換掉了**。`mount()` 用 `root.replaceChildren()`，舊節點整棵被丟掉而沒有人呼叫關閉，監聽器就會留下來握著一棵看不見的樹。這條路真的走得到——`app.ts:242` 的 `initSpeech(() => render())` 在語音清單載入完成時會重畫，雲端拉下新資料時也會。

不加這三行的話，`02` 擔心的累積仍然成立，只是變慢很多。

### 點外面那一下不算數

`preventDefault()` 讓後續的 `mousedown`／`click` 不發生（Pointer Events 規格：`pointerdown` 被取消時不派送相容性滑鼠事件）。選單開著時，外面整片按不動；第一下純粹用來收選單。

擋的是**不可逆的意外**：票 `03` 之後這顆會出現在複習畫面，那裡最大的按鈕是「顯示答案」，掀開就收不回去，這張卡接下來的評分就不誠實了。跟 `02` 當初要擋的（按空白鍵意外掀開答案）是同一類。

### 一律吃掉，輸入框不例外

`list-view.ts:44` 有搜尋框，所以卡片列表上會變成：選單開著時點搜尋框，第一下只收選單、游標不會進去，要再點一次才能打字。

**已知代價，接受。** 規則只有一條，三頁行為一致；換到的是複習頁不會被意外掀開答案。要純粹只收選單，Esc 仍然在。

### 焦點不動

`02` 的 Esc 會把焦點送回 toggle，本票**不做這件事**。`preventDefault()` 已經擋掉焦點轉移，焦點自然留在 toggle 上，沒有東西要救。

### 一樣回報 `onOpenChange`

第三個觸發點，與點 toggle、按 Esc 一致。收起時回報一次 `false`。

## 這張票不做的事

- **一個字的文件都不寫。** `CONTEXT.md`、`docs/spec.md`、ADR 全部交給 `04` 一次收完，包含替「元件層的全域監聽器」寫的 **ADR-0011**。
- **不改 `02` 那張票的檔案。** 依 `04` 已立的規矩（舊 `.scratch` 檔案不回頭改，訂正的落點放在 ADR），`02` 那句寫錯的否決理由保持原樣，錯在哪由 ADR-0011 說明。
- **不改 `BookFilterOptions` 介面、不改回傳型別**，仍然是 `HTMLElement`，仍然只吃純資料、不認識 `app`。
- **不動 `list-view.ts`、`stats-view.ts`**，也不動現有的 11 條測試。
- **不處理視窗失焦**（切到別的分頁、iOS 上滑走）。沒被要求，回來時選單還開著也沒有傷害。
- **不動 `scopeLabel`、勾選邏輯、「全部」項目、「只剩一本不可取消」、Esc、CSS。**

## 被放棄的替代方案

- **沿用 `app.keyHandler` 那一套（`document` 常駐分派器 + `App` 介面多一個插槽，`mount()` 清空）**：與現有模式最一致。否決的原因是 `bookFilter` 目前是「只吃資料、不認識 `app`」的獨立零件，要拿插槽就得收 `app`，三個呼叫端與 11 條測試全要跟著改；而且插槽是畫面層的東西，讓元件去搶它是分層上的倒錯。兩套做法各有適用場合——畫面有 `mount()` 這個天然的解除時機，元件沒有——這正是 ADR-0011 要寫下來的東西。
- **改聽 `focusout` 判 `relatedTarget`**：零 `document` 監聽器，拆卸問題整個蒸發，與 Esc 掛在同一個地方。否決的原因是 iOS Safari 點空白處不一定失焦，手機上會收不起來。
- **`focusout` 與 `pointerdown` 兩條都做**：覆蓋最完整。否決的原因是兩條會互相觸發（點外面同時造成失焦），得多寫一層擋重複收合與重複回報，程式碼與測試大約翻倍。
- **只註冊不解除，不加 `isConnected` 自癒**：省三行。否決的原因是那正是 `02` 擔心的累積，只是變慢。
- **點外面那一下照樣穿透**：摩擦最小，也是網頁上多數下拉選單的做法。否決的原因是複習頁隨手一點可能把答案掀開，而那不可逆。
- **吃掉，但點到 `input`／`textarea` 時例外**：搜尋框與複習頁兩邊好處都拿。否決的原因是規則從一條變兩條，以後每多一種元素都要再問一次「這個算不算例外」。
- **不做，維持 `02` 的否決**：零程式。否決的原因是原本的理由查證後不成立，該重新判斷。

## 驗收

`npm test` 全綠、`npm run typecheck` 過。

**`src/ui/book-filter.test.ts`**（`02` 已經把整個檔案掛上 `// @vitest-environment jsdom`，jsdom 支援 `PointerEvent` 與 `pointerdown` 派送，已實測）

新增：

- 展開後在 `document.body` 上派送 `pointerdown` → 選單收起（`menu.hidden` 為真、`aria-expanded` 為 `"false"`）且 `onOpenChange(false)` 被呼叫一次
- 展開後點 toggle 本身或選單內的勾選框 → **不收**（`node.contains()` 擋掉）
- **收起狀態**下點外面 → `onOpenChange` 完全沒被呼叫
- 收起之後再點外面 → 沒有任何反應，可佐證監聽器真的被移除（例如斷言 `onOpenChange` 呼叫次數沒有再增加）
- 節點被移出文件後（模擬畫面被換掉）再點外面 → 不丟例外，且監聽器自我拆除
- 點外面時 `event.defaultPrevented` 為真
- 不傳 `onOpenChange` 時點外面不丟例外

既有的 4 條 `scopeLabel` 與 `02` 的 7 條開合測試行為不變。

**手動驗收**

- 卡片列表、統計頁：點開膠囊 → 點畫面上任一處空白 → 收起來
- 卡片列表：選單開著時點搜尋框，第一下只收選單、游標不進去（**已知代價，確認它就是這樣**）
- 點 toggle 自己仍然是開關，連續勾好幾本選單不會自己收
- **iPhone 實機**：選單開著時用手指捲動頁面，確認捲動沒有被 `preventDefault()` 擋住。規格上捲動由 `touch-action` 管、不歸 `preventDefault()`，但 Safari 的實際行為只能靠實機確認——**這是本票唯一沒有把握的地方**，若真的擋住捲動，改用 `pointerup` 或退回穿透都要重新談
