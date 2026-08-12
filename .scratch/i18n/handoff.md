# 介面多語言（i18n）— 需求交接

這份文件是給**新對話**看的，不依賴任何前一段對話的脈絡。讀完就能接手。

**目前狀態：需求已確定，規格未釘，一行 code 都還沒寫。**

## 需求

**把整個介面變成可以調整語言。** 支援四種語言加一個自動選項：

| 選項 | 行為 |
| --- | --- |
| 中文（繁體） | 現況 |
| 英文 | |
| 日文 | |
| 韓文 | |
| 系統預設 | 跟著裝置語言走；**裝置語言不在上面四種之內時，套英文** |

## 這不是什麼

**這是介面語言（app 用什麼語言跟使用者說話），不是學習內容的語言。**

先前討論中提過「之後想支援英文、韓文的單字卡」，那是另一件事——那會動到領域模型的根（`CONTEXT.md:22` 現在定義卡片是「一個**日文**詞條與其中文釋義的配對」，而振假名是日文獨有的）。**兩件事不要混在同一張票裡。**

## 下一步（已決定）

**先釘規格，不寫 code。** 把下面「四個難點」釘出答案，寫成 spec 與必要的 ADR，然後才開實作票。

理由：這些難點全部是決定而不是實作，而且**就算之後真的把 app 重寫成原生，這些決定一樣用得到**（翻譯檔可以跨平台共用，程式碼不行）。

建議用 `/grilling` 逐題釘。

## 規模（已量測）

- **約 204 條介面字串**，散在 29 個非測試檔案（統計方式：非註解行上含中文字串字面值的行數；含少量內部錯誤訊息，不全是使用者看得到的）
- 分佈最重的幾個：`src/ui/data-view.ts`、`src/lib/gemini-reading.ts`、`src/lib/storage.ts`、`src/ui/editor-view.ts`、`src/ui/list-view.ts`、`src/ui/review-view.ts`、`src/lib/cloud-backup.ts`、`src/lib/daily-reminder.ts`
- **目前沒有任何 i18n 機制**，字串全是寫死的字面值

## 四個難點

### 1. 領域詞彙的四語對照，這是 domain-modeling 不是翻譯

`CONTEXT.md` 定義了一整套 ubiquitous language，每條還附 `_Avoid_` 清單。**中文那邊小心避開的詞，換成英文很容易踩回去**——例如「單字本」若翻成 `Deck`，正好是 `CONTEXT.md:11` 明文要避免的「牌組」（那副已依 `ADR-0008` 退場的內建卡片）；「詞條」若翻成 `Word`，也踩到 `:27` 避免「單字」的理由（詞條可能是文法句型，如「ざるを得ない」）。

**好消息：英文對照已經有九個**，寫在 `CONTEXT.md` 的詞條標題裡：

`單字本（Vocabulary Book）` `:9`、`卡片（Card）` `:21`、`到期（Due）` `:59`、`逾期（Overdue）` `:63`、`間隔（Interval）` `:67`、`成長倍數（Ease）` `:71`、`評分（Rating）` `:75`、`抖動（Fuzz）` `:91`、`備份（Backup）` `:105`

**其餘沒有英文對照**，需要一一決定：詞條、釋義、讀音、讀音標記、讀音格、必填格、讀音預填、讀音編輯器、複習範圍／列表範圍／統計範圍、複習佇列、新卡、複習卡、到期排序、時間桶、雲端備份、匯入單字、暱稱、密碼、指紋。

日文與韓文則是**一個都還沒有**。

### 2. 日文介面會跟日文學習內容打架

這個 app 教的是日文。介面也變成日文之後，畫面上哪些字是「app 在跟你說話」、哪些是「你要背的卡片」會混在一起。

**這不是翻譯能解決的，是版面設計問題**（字體、顏色、位置的區隔）。釘規格時要決定要不要處理，還是接受它。

### 3. 測試

UI 測試目前直接斷言中文字串，會受影響的至少有：`src/ui/list-view.test.ts`、`editor-view.test.ts`、`required-fields.test.ts`、`book-filter.test.ts`、`stats-view.test.ts`。

449 個測試不會全爆，但這批幾乎確定要動——要決定改成鎖 key 還是鎖定某個語言跑。

### 4. 語言選擇存在哪，要不要跟著雲端備份走

`CONTEXT.md:18` 說三組範圍選擇「都隨資料備份到雲端」。語言選擇要不要比照？

- **要** → 備份格式得改版（`src/lib/storage.ts`、`cloud-backup.ts`）
- **不要** → 換裝置要重選

這是真決定，不是實作細節。

## 兩個較小但必須答的問題

**`public/privacy.html` 要不要翻。** 它是整頁中文的靜態頁，不參與打包（原封複製進 `dist`），而且有守門測試 `src/lib/app-name.test.ts` 釘著裡面四處的 app 名稱。翻的話那支測試的比對規則要一起想。

**簡體中文（`zh-CN`）算不算「符合」。** 「系統預設不符合就套英文」這條規則下，裝置語言是簡體中文時要給繁中還是給英文。

## 已經定下、與本需求相關的事

**App 顯示名稱已改成拉丁字母**，正是為了這個需求：

```ts
// src/lib/app-name.ts
export const APP_NAME = {
  short: 'VocabCard',
  full: 'Vocabulary Card Practice',
};
```

理由記在 `.scratch/app-name/issues/02-rename.md` 的 `## Comments`：`app-name.ts` 只存一份字串、沒有按語言切換的機制，中文名字會讓英文使用者的主畫面出現看不懂的字。**但這也代表 `APP_NAME` 本身尚未支援多語言**——介面真的多語言化時，要決定顯示名稱跟不跟著切。

**同一份 Comments 裡記了一個遺留缺口**：多語言這個方向在 repo 裡沒有 ADR，`CONTEXT.md` 的領域定義至今仍是日文專用。依 `docs/agents/domain.md`「與既有決策牴觸要明確點出來，不要默默覆蓋」，這件事已點出但未處理。**釘 i18n 規格時應該一併補上這份 ADR。**

**`vite.config.ts` 的 PWA manifest 目前寫死中文**：`:48` 的 `description` 是 `'自建單字本，間隔複習，離線可用'`，`:49` 的 `lang` 是 `'zh-Hant'`。這兩個也要一起處理。

## 與 SwiftUI spike 的關係

`.scratch/swiftui-spike/issues/01-review-screen-spike.md` 是一張未執行的票：用一個週末做 SwiftUI 複習畫面原型，盲測判定要不要把整個 app 重寫成原生。

**兩件事不衝突**，理由是本文件「下一步」那節寫的：釘規格不寫 code，決定本身跨平台通用。但如果 spike 通過、真的走上重寫，**i18n 的實作順序要重新考慮**（實作 code 會白做一次，翻譯檔不會）。

## 相關檔案

| 路徑 | 為什麼相關 |
| --- | --- |
| `CONTEXT.md` | 領域詞彙表與 `_Avoid_` 清單，四語對照的來源 |
| `docs/agents/domain.md` | 領域文件的維護規矩 |
| `docs/agents/issue-tracker.md` | issue 檔案格式慣例 |
| `src/lib/app-name.ts` | 顯示名稱的單一來源，尚未多語言化 |
| `docs/adr/0012-display-name-single-source.md` | 顯示名稱怎麼抵達各使用位置 |
| `.scratch/app-name/issues/02-rename.md` | 改英文名的決策紀錄與遺留缺口 |
| `.scratch/swiftui-spike/issues/01-review-screen-spike.md` | 可能影響 i18n 實作順序的未決事項 |
