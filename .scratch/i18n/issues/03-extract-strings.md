# 03 — 約 193 條介面字串搬進 zh-Hant.ts，畫面全部改查表

Status: ready-for-agent
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

- [ ] `grep` 非測試的 `.ts` 檔，除了註解、`INSTRUCTIONS`、`HOME_BOOK_NAME` 與 `BUCKETS` 的 `key`，沒有剩下的中文字面值
- [ ] `gemini-reading.ts` 的 `INSTRUCTIONS` **一個字都沒動**，也沒有被搬進 `zh-Hant.ts`
- [ ] 讀音預填實測仍然正常（確認 `INSTRUCTIONS` 真的沒被波及）
- [ ] `zh-Hant.ts` 的條數與搬走的條數對得上
- [ ] **畫面逐頁比對，一個字都沒變**（複習、卡片列表、編輯、統計、資料五個畫面）
- [ ] 帶變數的字串走參數，沒有任何字串拼接
- [ ] commit 訊息列出所有「為了統一領域用詞而改掉的文案」
- [ ] `npm run test` 與 `npm run typecheck` 全綠
