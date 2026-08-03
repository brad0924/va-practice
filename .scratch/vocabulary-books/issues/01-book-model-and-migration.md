# 單字本的資料模型、版本 3 與舊格式遷移

Status: ready-for-agent
Type: enhancement

決策背景見 `.scratch/vocabulary-books/spec.md`。本票只做資料模型與相容，不碰任何畫面。

## 需求

`AppData` 長出單字本，每張卡指向一本，三組範圍選擇跟著資料一起存。舊格式的資料（本機、備份檔、雲端三條路）讀進來時自動收成一本，進度完整保留。

## 決定

1. **型別變化**（實作可微調，但必須表達得出以下語意）：

   ```ts
   /** 卡片的容器。名字可改，識別碼建立後不變。 */
   export interface Book {
     id: string;
     name: string;
   }

   /** 三個畫面各自的單字本範圍。每組至少一個 id；零本時三組皆為空。 */
   export interface BookScopes {
     review: string[];
     list: string[];
     stats: string[];
   }

   export interface Card {
     id: string;
     bookId: string;   // 新增
     text: string;
     meaning: string;
     interval: number | null;
     ease: number;
     due: string | null;
   }

   export interface AppData {
     version: number;
     books: Book[];        // 新增，順序即畫面顯示順序
     cards: Card[];
     scopes: BookScopes;   // 新增
     updatedAt: number;
     // knownBuiltinIds 移除
   }
   ```

2. **`DATA_VERSION` 升到 `3`。**

3. **新單字本的識別碼用 `crypto.randomUUID()`**，與新卡同一套做法。

4. **相容處理發生在既有的解析入口**（目前的 `parseAppData`），不散在三處。本機 localStorage、`importJson()`、雲端拉下來的那份走的是同一條路，因此改一處三條路都涵蓋到。

5. **遷移規則**：解析後若沒有 `books`（或 `books` 為空但有卡），建立一本名為「**我的單字**」的單字本，所有卡的 `bookId` 指向它，三組範圍設為含該本。`interval`／`ease`／`due` 一律原封不動。

6. **`bookId` 指向不存在的單字本時，比照遷移處理**：那些卡收進「我的單字」，該本不存在就順便建立。這一條同時擋住手改過的檔案與部分損壞的資料。

7. **已是新格式的資料不得被重複遷移**——不能每次載入都多長一本「我的單字」。

8. **`scopes` 的正規化**：解析時剔除指向不存在單字本的 id；剔除後任一組為空且 `books` 不為空時，該組補成全選。`books` 為空時三組皆為空陣列。

9. **零本是合法狀態。** 全新裝置第一次載入得到 `books: []`、`cards: []`、三組範圍皆空，不再自動塞任何卡。

## 驗收

- `npm test` 全綠。
- 舊格式（`version: 2`、無 `books`、無 `bookId`）讀進來後：卡片張數不變、每張卡的 `interval`／`ease`／`due` 一字不差、全部指向同一本「我的單字」、三組範圍含該本。
- 同一份新格式資料連續載入兩次，`books` 長度不變（不重複遷移）。
- `bookId` 指向不存在的本時，該卡被收進「我的單字」。
- `scopes` 含不存在的 id 時被剔除；剔除後為空則補成全選。
- 全新裝置首次載入得到零本零卡，且不丟例外。
- 匯入舊格式的備份檔（`importJson`）與載入舊格式的本機資料，走的是同一套遷移，結果一致。
