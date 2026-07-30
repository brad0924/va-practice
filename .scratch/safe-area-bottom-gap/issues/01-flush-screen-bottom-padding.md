# 畫面底部留白改成固定 18px（不再用 safe-area 公式）

Status: done
Type: bug

## 需求

使用者回報手機版（已安裝的 standalone PWA）畫面最下面有一段空白：複習頁最後一張卡（截圖是「晒す」）被下緣裁掉一部分，底下留一條純背景色的空白帶。

空白來源是所有畫面共用的 `.screen`（`src/styles.css:49`）：

```css
padding: env(safe-area-inset-top) 0.75rem calc(env(safe-area-inset-bottom) + 0.75rem);
```

底部 padding 是「裝置的 safe-area-inset-bottom」加上固定 0.75rem(12px)疊出來的。四個畫面底部結構不同：

- 卡片頁／編輯頁／資料頁：`screen = header + main.panel`，`.panel` 是唯一的捲動區（`overflow-y: auto`，自己另有 `padding-bottom: 1rem`，`src/styles.css:248`，這段不受本票影響）
- 複習頁：`screen = header + main.card + footer.actions`，是唯一有貼死底部按鍵列的畫面

## 決定

以下都是先用 `/prototype` 在真機（iPhone，standalone PWA）上直接切換不同版本比較出來的，不是先算安全區數字再推公式——`/prototype` 過程細節見「Comments」。真機實測 `safe-area-inset-bottom` = 34px、`safe-area-inset-top` = 50px（僅供理解落差用，新做法本身不再依賴這兩個數字）。

1. **`.screen` 底部 padding 改成固定 `18px`**，取代 `calc(env(safe-area-inset-bottom) + 0.75rem)`。套用在共用的 `.screen` class（`src/styles.css:49`），複習頁、卡片頁、編輯頁、資料頁一併生效——不做「只有可捲動清單貼底、複習頁保留留白」這種分畫面的折衷（曾經考慮過複習頁 18px／卡片頁 0px 的組合，使用者在真機上重新比較後放棄，改回四個畫面統一處理）。
2. **左右留白維持 `0.75rem`(12px) 不動**，不追求四邊對稱。現有 CSS 本來上下左右就沒對齊過（top 用 `env(safe-area-inset-top)`、原本 bottom 在使用者這台裝置上是 34+12=46px），這次 18 對 12 只差 6px，比原本的落差還小；上下留白要閃 safe-area、左右純粹是呼吸空間，兩者職責本來就不同，不對稱可以接受。
3. **`.sync-status`（`src/styles.css:621`）的位置公式要一起改**，否則會跟評分鍵錯位：

   ```css
   bottom: calc(env(safe-area-inset-bottom) + var(--tap) + 1.25rem);
   ```

   這行原本靠 safe-area 算出「貼在評分鍵上緣、再往上約 8px」的位置（`env(safe-area-inset-bottom) + 12px[screen 原本的 padding-bottom] + 52px[--tap] = 評分鍵上緣`，`+72px` 的公式比評分鍵上緣多 8px）。`.screen` 底部改固定 18px 後，評分鍵上緣距裝置底部 = `18px + var(--tap)`，不再含 safe-area 項；`.sync-status` 的公式要跟著拿掉 `env(safe-area-inset-bottom)`，只用新的固定 18px 去算，維持同樣「評分鍵上緣往上約 8px」的間距，換算後新公式約為 `bottom: calc(var(--tap) + 18px + 0.5rem)`（52+18+8=78px；實作時照這個關係精算，不要照抄這裡的數字沒驗證）。不改的話，safe-area 愈大的裝置這顆提示會離評分鍵愈遠，safe-area=0 的裝置又會幾乎貼上去。
4. **`.toast`（`src/styles.css:647`）用 `top` 定位，不受影響，不用改。**
5. **先前 grilling 拍板「複習頁評分鍵貼到 0px，home indicator 白橫線會壓在困難／好字附近」這個代價說法作廢**，不要帶進實作或文件——在 18px 這個數字下，使用者已在真機上確認白橫線不會壓到按鈕文字。
6. **一開始截圖目測「空白約 80px」跟 CSS 算出約 46px 的落差，不追查、直接結案。** 新做法是固定值，不再靠公式推算安全區，這段落差跟新方案是否正確無關。

## 驗收

畫面層不寫自動化測試（`docs/spec.md`），驗收靠瀏覽器 / 真機實測：

- 真機（iPhone，從主畫面圖示啟動的 standalone PWA）複習頁：掀開答案後，四顆評分鍵完整可見，鍵下緣距螢幕底部有固定留白，home indicator 白橫線不壓在按鈕文字上。
- 卡片頁捲到最底：最後一張卡下緣留白跟複習頁視覺份量一致，不再有一大段純背景色空白。
- 編輯頁、資料頁底部留白同步更新（共用 `.screen`，不用逐頁核對數字，抽查一頁即可）。
- `.sync-status` 顯示時（處於未登入雲端同步或推送失敗狀態）仍穩穩浮在評分鍵上方，不貼著也不留一大截空隙。
- 桌機 Chrome、手機 Safari 分頁（非 standalone，safe-area 恆為 0）打開時底部留白同樣是 18px，不會變成 0（這是固定值 vs 公式值的差異，特別要核對這點，因為舊寫法在這兩種情境下留白會不一樣）。

## Comments

- 原型：`/prototype` 建了 `src/prototype-safe-area-bottom.ts`，掛載在 `main.ts`（僅 `import.meta.env.DEV` 時，網址帶 `?proto=safe-area`），用真正的 production class 重現複習頁評分列、卡片頁捲到底兩種畫面，各配 0px／18px 兩版，畫面上直接印出真機量到的 `safe-area-inset-top` / `safe-area-inset-bottom` 與 standalone 狀態，供使用者在真機上直接比較挑選。**這個原型檔案（`src/prototype-safe-area-bottom.ts`）跟 `main.ts` 裡對應的掛載那幾行，實作這張票時要一併刪掉**，決定過程封存到丟棄分支，不留在 main。
- 交接筆記（本機暫存檔，不在版控內，僅供追溯這次討論脈絡）：`C:\Users\P10394584\AppData\Local\Temp\handoff-safe-area-bottom-gap.md`。
