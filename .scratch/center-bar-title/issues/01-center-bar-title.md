# 頂部列標題左右按鈕不對稱時沒有真正置中

Status: done
Type: bug

## 問題

`.bar-title`（`src/styles.css`）用 `flex: 1; text-align: center;` 置中，這個寫法只在左右兩側按鈕寬度剛好一樣時才會看起來準（例如 data-view）。左右按鈕數量或寬度不對稱時，標題會偏向按鈕少的那一側：

- list-view：左1顆（複習）、右2顆（資料、新增）→ 明顯偏左
- stats-view：左1顆（資料）、右0顆 → 明顯偏右
- editor-view：左1顆（取消）、右0顆 → 明顯偏右
- data-view：左右各1顆、文字剛好等長 → 目前看起來是準的，但只是巧合

review-view（複習中／完成兩畫面）中間本來就沒有標題文字，只有「剩餘 N 張」與一顆按鈕，不在本次範圍內。

## 決定

1. **只修 4 個已有標題文字的畫面**：list-view、data-view、stats-view、editor-view。review-view 維持現狀，不加標題。
2. **改成左右兩欄寬度永遠相等的版面**，讓標題無論左右按鈕數量、文字長短都精準置中在整條頂部列的正中間，而不是只置中在「按鈕之間剩下的空間」。
3. **list-view 右側的「資料」「新增」兩顆按鈕要包進同一個容器**，湊成一個欄位，才能跟左側「複習」單顆按鈕的欄位寬度對齊。其餘三個畫面左右按鈕數量本來就是 0～1 顆，不需要額外包裝。
4. **純視覺調整**，不動任何按鈕的事件綁定或行為，也不影響鍵盤快捷鍵。

## 驗收

- list-view：「卡片」標題在整條頂部列水平置中。
- data-view：「資料」標題置中。
- stats-view：「統計」標題置中，不再偏右。
- editor-view：新增卡片顯示「新增卡片」、編輯卡片顯示「編輯卡片」，皆置中，不再偏右。
- review-view（複習中／完成）畫面不受影響，維持現狀。
- `npm test` 全綠。

## Comments

- 實作用 `.bar:has(.bar-title) { display: grid; grid-template-columns: 1fr auto 1fr; }`，只對「有標題」的頂部列生效；review-view 的 `.bar` 沒有 `.bar-title`，選不到這條規則，維持原本 `display: flex; justify-content: space-between;`，不用改 `review-view.ts` 也不受影響。
- data-view、stats-view、editor-view 的左右按鈕本來就是 0～1 顆，DOM 順序天生就是「左、標題、（右）」，靠 grid 自動排版就夠，沒有另外包 wrapper。
- 只有 list-view 改了 `list-view.ts`：把右側「資料」「新增」兩顆按鈕包進新的 `.bar-side` 容器（`justify-self: end`），湊成一個欄位跟左側「複習」對齊。
- `npm test`（211 個測試全過，含 `list-view.test.ts`）與 `npx tsc --noEmit` 皆過；並起 dev server 用瀏覽器實測 4 個畫面標題皆置中、review-view 完成畫面未受影響。
- **實測後回報的殘留 bug**：`justify-items: start` 只顧到左欄靠左，忘了右欄（data-view 裸的「統計」按鈕，沒包 `.bar-side`）也會被同一條規則設成靠左，結果卡在欄位中間偏左，沒貼齊最右邊。修法是加一條 `.bar > *:last-child:not(.bar-title) { justify-self: end; }`，讓最右欄的內容（不管是單顆按鈕還是 `.bar-side` 容器）一律靠右；原本掛在 `.bar-side` 上的 `justify-self: end` 因此變成多餘，一併移除。
