# 03 — 約 193 條介面字串搬進 zh-Hant.ts，畫面全部改查表

Status: done
Type: enhancement
Blocked by: 02

決策背景見 `../spec.md` 決定二、三。

## 要做什麼

把散在 29 個檔案裡的中文字面值全部搬進 `src/i18n/zh-Hant.ts`，畫面改成 `t('key')`。

**做完之後畫面應該一個字都沒變。** 這張票是純搬遷，不是改文案。

## 規模與分佈

| 檔案 | 條數 |
| --- | --- |
| `src/ui/data-view.ts` | 43 |
| `src/ui/editor-view.ts` | 25 |
| `src/ui/stats-view.ts` | 19 |
| `src/ui/review-view.ts` | 19 |
| `src/ui/list-view.ts` | 18 |
| `src/ui/books-section.ts` | 18 |
| `src/lib/gemini-reading.ts` | 17 |
| `src/lib/storage.ts` | 15 |
| `src/lib/cloud-backup.ts` | 9 |
| `src/ui/book-filter.ts` | 6 |
| 其餘（`toast.ts`、`reading-editor.ts`、`reading.ts`、`daily-reminder.ts`、`review.ts`） | 9 |

扣掉下面那批不能翻的之後，約 193 條、約 3900 個中文字。**其中 25 條是 `throw new Error` 的訊息**——這張票照樣把它們搬進翻譯檔並改成查表，但**錯誤機制本身不動**（`throw new Error(t('...'))`）。改成帶 key 的物件是票 05。

### `gemini-reading.ts` 的 `INSTRUCTIONS` 絕對不能碰

`gemini-reading.ts:67` 的 `INSTRUCTIONS` 是**送給 Gemini 的作業指示**，不是介面文字：

```ts
const INSTRUCTIONS = [
  '你是日語讀音標注助手。使用者給一個日文詞條，請標出其中每一串連續漢字的讀音。',
  '規則：',
  '1. 讀音一律用平假名。',
  '2. 每一串先判斷 splittable：逐字檢查…',
  ...
].join('\n');
```

**約 11 條、3727 個字元，佔了原始量測「204 條」的一半。**

它是給模型讀的。翻了會直接改變 Gemini 的行為，而 `ADR-0005` 選 Gemini 的唯一理由就是日文能力，那段指示是為此調出來的。**整段留在原地，一個字都不要動，也不要搬進 `zh-Hant.ts`。**

同一支檔案裡其餘的字串（「讀不懂 Gemini 的回覆」「Gemini 沒有回覆內容」那類錯誤訊息）**仍然要搬**——那些是使用者看得到的。判準是「這句話是給誰看的」。

## 決定

### 領域概念一律照 `docs/glossary.md` 的中文欄

搬的過程會遇到同一個概念在不同畫面用了不同的字。**照 `glossary.md` 統一**，不要照原樣搬。這是這張票唯一允許改動文案的情況，而且要在 commit 訊息裡列出改了哪幾處。

### 帶變數的字串用參數，不要用字串拼接

```ts
// 原本
throw new Error(`已經有一本叫「${taken.name}」了`);

// 改成
throw new Error(t('books.nameTaken', { name: taken.name }));
```

**不要**把它拆成 `t('books.nameTakenPrefix') + name + t('books.nameTakenSuffix')`——那在其他語言的語序下會拼出不通的句子。

### 這幾種中文不要動

- **註解**
- **測試資料**（單字本名字、卡片內容如 `焦[こ]がす`）
- **`HOME_BOOK_NAME`**（`storage.ts:23` 的 `'我的單字'`）——它是寫進使用者資料的字串。它要改成「產生當下用當下的介面語言」，做法是在**產生它的那一刻**呼叫 `t()`，而不是把它變成一個永遠跟著語言變的常數。見 `../spec.md` 決定十二
- **`gemini-reading.ts:67` 的 `INSTRUCTIONS`**——見上一節，那是給 Gemini 讀的
- **`list-view.ts:183` 的 `BUCKETS` 的 `key`**（`'new'`、`'now'` 那些）——只有 `label` 要改成查表

### 測試的 label 斷言跟著改

`list-view.test.ts:63` 那類斷言中文 label 的地方，改成從 `zh-Hant.ts` 取值來比對，或直接刪掉（因為同一個測試 `:54` 已經在斷言 `key`，那才是真正該釘的東西）。

`toThrow('中文')` 那 22 處**這張票先改成從翻譯檔取值**，票 05 再改成斷言 key。

## 這張票不做的事

- **不改文案**，除了「統一領域概念用詞」那一種，而且要在 commit 訊息列出來
- **不改錯誤機制**（票 05）
- **不寫英日翻譯**（票 06）
- **不做語言選單**（票 04）
- **不順手重構任何畫面**

## 驗收

- [x] `grep` 非測試的 `.ts` 檔，除了註解、`INSTRUCTIONS`、`HOME_BOOK_NAME` 與 `BUCKETS` 的 `key`，沒有剩下的中文字面值
- [x] `gemini-reading.ts` 的 `INSTRUCTIONS` **一個字都沒動**，也沒有被搬進 `zh-Hant.ts`
- [ ] 讀音預填實測仍然正常（確認 `INSTRUCTIONS` 真的沒被波及）——**待實機／瀏覽器手動驗**
- [x] `zh-Hant.ts` 的條數與搬走的條數對得上（164 條，見下方 Comments）
- [x] **畫面逐頁比對，一個字都沒變**（五個畫面的 `textContent` 與改動前逐字相同，見下方 Comments）
- [x] 帶變數的字串走參數，沒有任何字串拼接
- [x] commit 訊息列出所有「為了統一領域用詞而改掉的文案」
- [x] `npm run test` 與 `npm run typecheck` 全綠

## Comments

**條數是 164 不是 193。** 票面的 193 是量測估計；實際搬完是 164 條。差額主要來自
同一句話在多處重複只留一條：四個畫面的導覽鈕與標題併成 `nav.*` 五條（「複習」
「卡片」「資料」「統計」「新增」），「去建立單字本」在三個畫面共用一條 `books.goCreate`。

**`en.ts` 與 `ja.ts` 這輪填的是暫置值，內容全是繁體中文。** 票面說「不寫英日翻譯
（票 06）」，但同時要求 `npm run typecheck` 全綠，而 `const en: typeof zhHant` 少一條
就編譯錯——兩條同時成立的唯一走法就是先填暫置值。刻意**不用** `{ ...zhHant, ... }`
展開：那樣票 06 漏填一條會靜靜掉回中文，型別守門就失效了。兩支檔案的檔頭都寫明了
這件事。

**畫面逐字比對的做法**：在 `HEAD` 開一個 worktree，兩邊各跑同一支拋棄式的 jsdom
測試，把五個畫面的 `textContent` 各寫成一行再 diff——完全相同。那支測試已刪除，
真正的冒煙測試是票 07。**沒有涵蓋到的是需要互動才畫得出來的狀態**（已登入的雲端
區、提醒區、展開的單字本維護鈕、彈窗、各種錯誤訊息），那些只有「字串逐條對得上
翻譯檔」這一層守著。

**讀音預填仍待手動驗。** `INSTRUCTIONS` 與 `詞條：${term}` 那一行都一個字沒動
（`git diff` 可證），但真的送一次請求還沒做——那需要 Gemini 金鑰。

### 為了統一領域用詞而改掉的文案：一處

`books-section.ts` 單字本維護鈕的「匯入」→「**匯入單字**」。`CONTEXT.md` 那一則的
`_Avoid_` 直接點名「匯入（會與備份的匯入混淆）」，而資料畫面底下正好有一顆
「匯入備份」，兩顆並存就是那條 `_Avoid_` 在講的情況。

**沒有改的兩個候選**：「熟練度分佈」與彈窗標籤的「倍數 X」看起來是同一個概念
（成長倍數）用了兩種說法，但 `.scratch/stats-snapshot/issues/01` 決定 10 已經明文
裁決過——那兩個是「這個畫面裡的顯示概念」，刻意不進詞彙表。照舊。

### 實作上的三個決定

**`HOME_BOOK_NAME` 一分為二。** 常數留著（中文字面值仍在，驗收也明文放行），但
**只拿來認舊資料**——那些裝置上已經存著「我的單字」這個名字。新長出來的那本改用
`t('books.homeName')`，符合 spec 決定十二的「產生當下用當下的介面語言」。

**`cloud-backup.ts` 的兩個匯出常數改成函式**：`WRONG_PASSWORD` → `wrongPassword()`、
`TOO_LARGE` → `tooLarge()`。查表要等 `initI18n()` 接上這台裝置，而常數在模組載入的
那一刻就算完了。同一個理由改掉的還有 `list-view.ts` 的 `BUCKETS`（拆成
`BUCKET_KEYS` 與 `BUCKET_LABELS`）、`stats-view.ts` 的 `EASE_BINS`（`label` 存 key）、
`review-view.ts` 的 `RATING_BUTTONS`（`label` 改成函式），以及 `data-view.ts` 那六段
提示常數（全部改成渲染時才查表）與 `daily-reminder.ts` 的 `REMINDER_TITLE`。

**新增 `src/test-setup.ts`**，掛在 `vite.config.ts` 的 `test.setupFiles`：每支測試開跑
前把介面語言接上繁體中文。搬完之後幾乎每個模組都會查表，少了這一步大半的測試會
爆在「i18n 還沒啟動」而不是它要測的東西上。`index.test.ts` 在測試內自己再
`initI18n()` 一次，蓋掉這個預設值，因此語言決定那組測試不受影響。

### code review 後的修正

**漏掉一處字串拼接（真的違反票面）。** `book-filter.ts` 自成一列那顆鈕原本是
`` `${prefix}${scopeLabel(...)}` `` —— 「單字本：」與範圍兩段拼起來，正是票面明文
禁止的形狀。改成一整條 `filter.blockLabel`（`'單字本：{scope}'`）走參數。

**三個常數表統一成同一種寫法。** review 指出「常數不能在模組載入時查表」這同一個
問題被五個檔案各解一次、形狀都不同。已把 `list-view.ts` 的 `BUCKETS` 與
`review-view.ts` 的 `RATING_BUTTONS` 都改成與 `stats-view.ts` 的 `EASE_BINS` 一致的
「`label` 存 key、渲染時 `t()`」。`list-view.ts` 因此也不再拆成兩份結構，`BUCKETS`
這個名字回來了，`key` 仍原樣留著（驗收明文放行的那個）。

`cloud-backup.ts` 的 `wrongPassword()`／`tooLarge()` 沒跟著統一：它們要在 `Error`
的 constructor 裡當值用，還要被測試 import，跟前三者不是同一種東西。

**`en.ts` 的檔頭被產生器洗掉的兩處已還原**：指向 `docs/glossary.md` 的那行註解
（票 06 正要照它翻），以及 `English.` 被改成 `English。` 的標點。

**沒有採納的兩條**：

- *測試層有五處各自手抄 `t()` 的參數代入*。屬實，但那五處全部是票 05 要刪掉的
  （那張票會改成斷言 key），現在抽共用 helper 等於為一個即將消失的東西建新結構。
- *`stats.easeLow`～`easeMidHigh` 四條純數字區間不該進翻譯檔*。六段的 `label` 型別
  是 `Key`，混著 key 與字面值編不過；而且分成兩種來源之後，日後想在區間標籤上加字
  （例如加單位）會踩到「有些能翻有些不能」。

**review 另外點出 ADR-0013 第三條（錯誤帶 key、不帶文字）目前是被否決的形態**
（`throw new Error(t('...'))`）。那正是票 05，票 03 明文寫著「錯誤機制本身不動」。
commit 訊息已註明這是過渡狀態。
