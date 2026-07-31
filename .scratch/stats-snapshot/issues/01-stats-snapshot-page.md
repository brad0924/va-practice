# 新增「統計」畫面：卡片現況的快照統計

Status: done
Type: enhancement

## 問題

使用者想看學習狀況的統計數字，但一開始只有模糊的想法。用 `/grill-with-docs` 訪談後確認了第一個分岔：`Card`（`src/lib/types.ts`）只存**目前狀態**（`interval`、`ease`、`due`），沒有任何複習時間點或次數的紀錄，因此統計只能做「現在這一刻」的快照，做不出「這星期複習幾次」「正確率有沒有進步」這種歷史趨勢——那需要另外新增複習紀錄的資料結構，是另一個決定，本次不做。

快照方向確定後，用真實匯出資料（206 張卡）做了三版可互動原型（儀表板總覽／單焦點卡片／弱點優先），使用者選定**儀表板總覽**這一版當作方向，並在原型上又談出兩個調整：拿掉常駐的「待加強」清單，改成長條圖可以點開查看內容；到期分佈的長條圖原本顏色沒對到，一併修正。

## 決定

1. **快照，不做歷史趨勢。** 只用 `Card[]` 目前的欄位算數字，不新增任何資料結構、不改 `AppData` 格式。歷史趨勢是否要做、要新增什麼資料結構，留給以後另開 issue 決定。

2. **新畫面「統計」，入口放在「資料」頁 header 右側。** 「資料」頁目前是 `[卡片] [資料]` 兩格，右側是空的；比起卡片頁（已經有 `[複習] [卡片] [資料] [新增]` 四格，手機窄螢幕已經偏擠），資料頁還有餘裕。改成 `[卡片] [資料] [統計]`。
   使用者提到現有導覽按鈕之後想整個重構，那是另一個決定，本次不碰，只依現況加這一顆。

3. **返回按鈕寫「資料」。** 沿用 `backup-screen` issue 定下的慣例（非表單畫面的按鈕寫目的地）。`showStats()` 不必像 `showEditor()` 那樣傳 `back` callback，固定 `showData()` 即可，比照 `showData()` 自身的寫法。

4. **總覽三個數字磚：卡片總數、已複習過、平均間隔（天）。**
   - 「已複習過」＝ `interval !== null` 的卡數；「新卡」＝反之，這裡不必另外顯示新卡數，卡片總數減已複習過即可推得。
   - 「平均間隔」＝已複習過的卡的 `interval` 加總 ÷ 已複習過的卡數，四捨五入到小數一位。**分母不含新卡**——新卡沒有 `interval`，若當成 0 硬算平均會把數字往下拉，失真。

5. **到期分佈重用 `list-view.ts` 既有的六個時間桶，不重新發明。** 呼叫既有的 `groupByBucket(cards, now, 'asc')`（`src/ui/list-view.ts`）取六桶，每桶一條橫向長條，顏色沿用 `styles.css` 現有的 `.bucket-head.<key>` 同一組 token（新＝紫 `--new`、現在＝紅 `--danger`、`<24小時`＝橘 `--hard`、明天＝黃 `--soon`、`<1週`＝藍 `--easy`、未來＝綠 `--good`）。原型第一版曾把顏色對錯（`` var(--${key}) `` 對到不存在的 CSS 變數，長條變透明），這裡明訂要用同一份對照表，不要重蹈覆轍。

6. **熟練度分佈是新的六個成長倍數區間，本次新增。** `成長倍數`（`ease`）沒有現成的分桶邏輯，訂出六段：

   | 區間 | 條件 | 顏色 |
   | --- | --- | --- |
   | 下限 | `ease <= 1.31` | `--danger` |
   | 1.31–1.7 | `1.31 < ease < 1.7` | `--hard` |
   | 1.7–2.1 | `1.7 <= ease < 2.1` | `--soon` |
   | 2.1–2.5 | `2.1 <= ease < 2.49` | `--muted` |
   | 2.5 附近 | `2.49 <= ease <= 2.51` | `--easy` |
   | 2.5 以上 | `ease > 2.51` | `--good` |

   「下限」用 `<= 1.31` 而不是 `=== 1.3`：`MIN_EASE` 是 1.3，但這個值是從 2.5 反覆扣 0.2／0.15 算出來的，理論上會精準卡在 1.3，用一個小容差避免萬一的浮點誤差漏判。「2.5 附近」單獨一段，是因為「好」這個評分完全不改變成長倍數（見 `review.ts` 的 `RATINGS`），大量從未答錯／答簡單過的卡會精準停在初始值 2.5——獨立一段能看出「這些卡从来没被調整過」，跟兩側「曾經上升／下降過」的卡分開看。
   這六段的邊界是這次的判斷，不是使用者逐一核可的決定，之後想調整屬於低成本的顯示層改動。

7. **拿掉常駐的「待加強」清單，改成長條可以點開查看。** 原本 A 版把成長倍數卡在下限的卡列成固定清單；使用者要求移除，改成到期分佈與熟練度分佈的**每一根長條都能點**，點下去從畫面底部彈出一個清單（bottom sheet），列出該桶／該區間目前有哪些卡（詞條含振假名、釋義，右側標一個標籤：到期分佈顯示到期日或「新卡」，熟練度分佈顯示成長倍數）。
   - 卡數為 0 的長條不可點（不長成按鈕，游標維持正常）。
   - 清單可用右上角 ✕、點擊清單外的背景、或按 Escape 關閉。
   - 這是這個 app 第一個彈窗元件。這次只在「統計」畫面內部實作一個小型 helper，不獨立成 `src/ui/` 底下的共用模組——目前只有這一個畫面用得到，共用元件等第二個使用情境出現再抽。

8. **詞條渲染沿用 `renderTerm()`（`src/ui/reading-html.ts`），振假名照常標在漢字上方。** 清單裡的卡不是在測驗讀音，所以 `showReading` 傳 `true`，跟卡片頁列表（`list-view.ts` 的 `row()`）一致。

9. **不寫 ADR。** 這個決定可逆、不影響資料格式、也沒有真正對立的替代方案，不符合開 ADR 的門檻。

10. **不新增詞彙表詞條。** 「成長倍數」「到期」「時間桶」全部沿用 `CONTEXT.md` 既有定義；「熟練度分佈」「到期分佈」是這個畫面裡的顯示概念，不是可能被別處重用的領域詞，不進詞彙表。

## 實作筆記

- 邏輯與畫面比照 `list-view.ts` 的既有作法同檔案：純函式（算總覽數字、算熟練度六段）與畫面函式放在同一支新檔 `src/ui/stats-view.ts`，純函式外部可 import 供測試，比照 `list-view.test.ts` 對 `bucketOf`／`groupByBucket` 的測法寫 `src/ui/stats-view.test.ts`。
- `app.ts` 新增 `showStats()`，模式與 `showData()` 完全一致（`render = () => mount(() => statsView(app)); render();`）。
- `App` 介面（`src/app.ts`）補上 `showStats(): void` 的方法簽名與註解。
- `dataView()`（`src/ui/data-view.ts`）header 補上第三顆 `bar-action`「統計」，呼叫 `app.showStats()`。

### 畫面骨架（已用可互動原型驗證過，直接照抄結構）

沿用既有樣式，不重畫：`.section`／`.section-title`／`.hint`（`data-view.ts` 已在用）、`.row`／`.row-term`／`.row-meaning`（`list-view.ts` 已在用，含 `.row-term ruby rt` 振假名樣式）。

本次要新增到 `styles.css` 的類別，比照下列結構（數值皆已在原型跑過，可直接沿用；顏色一律用既有 CSS 變數，不新增變數）：

```
.tiles                 三欄 grid（gap 0.5rem），裝三個總覽磚
  .tile                 background: var(--surface); border-radius 0.9rem; 置中
    .tile-num           1.5rem / 700 / tabular-nums
    .tile-label         var(--muted) / 0.72rem

.barlist                縱向排列，gap 0.55rem，到期分佈／熟練度分佈都用這個容器
  .barrow               grid: 4.2rem 1fr 2.2rem（標籤／長條／張數）
    .barrow-label       依桶或區間上色（決定 5、6 的對照表）
    .barrow-track       height 0.6rem，背景 var(--surface-2)，圓角
      .barrow-fill      實際比例的填色，寬度 = 張數/最大值，最少 4%（避免 0 以外的桶看不見）
    .barrow-count       靠右，var(--muted)，tabular-nums
  .barrow-btn           張數 > 0 時，.barrow 換成 <button>，加這個 class 重置按鈕預設樣式、
                        :active 時背景 var(--surface-2) 當按壓回饋

.row-tag                modal 清單裡右側的標籤（到期日或成長倍數），比照現有 .row-due 的
                        中性灰字樣式（var(--muted)、0.75rem、tabular-nums），*不要*用原型
                        草稿裡熟練度用過的紅色警示 pill——那是原型專屬「待加強」語境的顏色，
                        這裡是中性瀏覽用途，兩種標籤都用同一種樣式，不特別標紅

.modal-overlay          position: fixed; inset: 0; 半透明黑底；flex 置底置中；z-index 蓋過畫面
  .modal-panel          寬度打滿、max-width 28rem、max-height 75vh、上緣圓角、從底部滑出的
                        面板感（background: var(--bg)，border-top 用 var(--line)）
    .modal-header       flex space-between：左邊標題＋張數，右邊 .modal-close 圓形 ✕ 鈕
    .modal-rows         overflow-y: auto，裡面塞 .row 清單
```

### 主要函式（原型已驗證的介面，命名可依專案慣例微調）

- `computeSnapshot(cards, now)`：回傳 `{ total, reviewCount, avgInterval, buckets, easeBins }`。`buckets` 直接呼叫既有的 `groupByBucket(cards, now, 'asc')`（`list-view.ts`），不重新實作時間桶邏輯；`easeBins` 是決定 6 那六段，各自過濾出 `Card[]`。
- `barRow(labelClass, label, count, max, color, onClick?)`：`onClick` 有值且 `count > 0` 時才生成 `<button class="barrow barrow-btn">`，否則是純 `<div class="barrow">`。
- `openModal(title, cards, tagFn)` / `closeModal()`：畫面裡一個常駐的 `.modal-overlay` 元素，`openModal` 用 `tagFn(card)` 產生每列右側的 `.row-tag` 文字（到期分佈傳 `card.due ?? '新卡'`，熟練度分佈傳 `` `倍數 ${card.ease.toFixed(2)}` ``），`replaceChildren` 換內容再拿掉 `hidden`；背景點擊、✕、Escape 都呼叫 `closeModal`。
- 清單裡的詞條一律用 `renderTerm(card.text, true)`（`src/ui/reading-html.ts`），振假名照常標在漢字上方，因為這裡不是測驗讀音。

## 驗收

- `npm test`、`npm run typecheck` 全綠；`stats-view.test.ts` 至少涵蓋：空卡片清單、只有新卡、成長倍數剛好落在每段邊界值（1.3、1.31、1.7、2.1、2.49、2.5、2.51）的分桶結果。
- 「資料」頁 header 顯示 `[卡片] [資料] [統計]` 三格，30rem 寬度上限下不擠壓、不換行、不溢出。
- 「統計」頁 header 為 `[資料] [統計]`，按「資料」回到資料頁。
- 總覽磚顯示卡片總數、已複習過張數、平均間隔（天，一位小數），數字與手動核算一致。
- 到期分佈六桶長條，顏色與卡片頁時間桶一致；點擊張數 > 0 的桶會彈出清單，列出的卡與該桶實際內容一致，新卡標「新卡」而非日期。
- 熟練度分佈六段長條，點擊張數 > 0 的區間會彈出清單，列出的卡成長倍數都落在該區間內。
- 兩種長條張數為 0 時不可點擊。
- 清單彈窗可用 ✕、背景點擊、Escape 三種方式關閉。
- 手動在瀏覽器走一遍：320／360／480px 三個寬度下版面不跑版，兩種長條都能正確點開清單。

## 不在範圍內

- 歷史趨勢類統計（複習次數、正確率隨時間變化）——需要新增複習紀錄的資料結構，屬於另一個決定，另開 issue。
- 卡片頁、複習頁不加「統計」入口，只有資料頁一處。
- 現有四顆導覽按鈕（`[複習] [卡片] [資料] [新增]`）的整體重構——使用者提過想做，屬於另一個決定，另開 issue。
- 原型的「單焦點卡片」「弱點優先」兩版不採用，原型檔案本身不進 `main`（依 prototype 慣例留在 throwaway 分支）。

## Comments

- 本張 issue 由 `/grill-with-docs`（`/grilling` + `/domain-modeling`）訪談產出，並用使用者真實匯出的 206 張卡資料做過三版可互動原型驗證方向。
- 訪談過程中發現使用者匯出檔前後兩份的新卡數不同（4 張 → 0 張），純粹是使用者在兩次匯出之間繼續複習所致，不是資料或邏輯問題。
- **原型留底**：三版可互動原型（含拿掉待加強清單、長條可點開清單、振假名渲染的最終版本）整份提交在 throwaway 分支 `prototype/stats-snapshot`（commit `51e3cd7`），檔案路徑 `.scratch/stats-snapshot/prototype.html`，不在 `main` 上。想直接開瀏覽器看的話：
  ```
  git show prototype/stats-snapshot:.scratch/stats-snapshot/prototype.html > /tmp/preview.html
  ```
  或 `git checkout prototype/stats-snapshot -- .scratch/stats-snapshot/prototype.html` 暫時拉到工作目錄看完再 `git checkout main -- .` 復原。上面「畫面骨架」與「主要函式」兩段已經是從這份原型直接摘出的規格，正常實作不必回去翻原型檔案。
- 實作完成後，使用者貼了一張原型舊版「熟練度・下限」清單的截圖（紅色 pill 標籤、兩行式標題），問能否改成那樣。這正是決定 7 明確要求拿掉的紅色警示 pill——已跟使用者確認過，維持目前實作（中性灰字標籤、單行標題），不改。
