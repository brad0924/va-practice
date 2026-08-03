# 內建牌組退場：刪除 cards.json、單向合併與 knownBuiltinIds

Status: done
Type: enhancement

決策背景見 `.scratch/vocabulary-books/spec.md`。依賴 `01-book-model-and-migration.md`。

## 需求

卡片不再有「隨程式發佈」這個來源。第一次打開 app 是零本，卡片全部來自使用者新增或匯入單字。

## 決定

1. **刪除 `src/data/cards.json`** 與它的相關測試（`src/data/cards.test.ts`）。

2. **刪除單向合併**：資料存取模組載入時不再比對內建卡、不再補入任何卡片。

3. **刪除 `knownBuiltinIds`**（型別、解析、寫入三處）。舊格式資料裡若有這個欄位，讀進來時直接忽略，不報錯。

4. **資料存取模組不再需要「內建牌組」建構參數。** `createStore(storage, builtin)` 變成只吃 storage。

5. **首次初始化寫入的是零本零卡的資料**，不是一份含內建卡的資料。

6. **`src/lib/storage.test.ts` 裡與單向合併相關的測試整批刪除**——該行為已不存在，不是改寫而是移除。`fakeStorage()` 這個測試輔助保留。

7. **`toPlainText` 在單向合併裡的用途消失，但該函式本身不動**——它在別處（搜尋、詞條全域唯一比對）仍在用。

## 驗收

- `npm test` 全綠，且不存在任何 import `src/data/cards.json` 的程式碼。
- 全新裝置（空的 localStorage）載入後 `books` 與 `cards` 皆為空陣列。
- 使用者刪掉一張卡、重新載入，那張卡不會被補回來（因為根本沒有補入這件事）。
- 讀入含 `knownBuiltinIds` 的舊資料不丟例外，且存回去之後該欄位不再出現。
- 打包產物不再包含那 132 張卡的內容。

## Comments

- 決定 2、3、4、5、6 在 issue 01 就已一併完成（`createStore` 只吃 storage、`knownBuiltinIds` 移除、零本零卡初始化、單向合併測試整批刪除）。本票實際只剩刪 `cards.json` 與 `cards.test.ts`。
- `src/lib/reading.test.ts` 也 import 了 `cards.json`，用在「132 張卡 toMarkup(toDraft) 往返不變形」。票面未提及但驗收條件要求不得留下任何 import。實際統計後那 132 張只有 10 種標記形狀，其中 8 種已有手寫案例，且「未標音的漢字串」真實資料一張都沒有；改為內嵌 15 個字串，並補上 `KKK`、`K.KK` 兩種原本沒被往返驗到的形狀。
- 驗收條件「刪掉的卡不會被補回來」原本沒有測試守著（單向合併的測試在 01 已刪光），補了一支到 `storage.test.ts`。
- **遺留給 issue 07**：`docs/spec.md` 尚有多處提到 132 張內建牌組，其中第 162 行「另驗證讀音格與方括號字串的雙向轉換，含 132 張內建卡的往返一致」已與程式碼不符。issue 07 的決定 8 只點名「資料存取」那一條 Testing Decisions，未涵蓋「讀音標記」這一條。
