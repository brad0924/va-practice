# 05 — 錯誤改成帶 key 的物件，不再帶文字

Status: ready-for-agent
Type: enhancement
Blocked by: 03

決策背景見 `../spec.md` 決定四，以及 `docs/adr/0013-interface-localization.md`。

## 要做什麼

```ts
// 現在
throw new Error('至少要選一本單字本');

// 改成
throw new AppError('books.scopeEmpty');
```

錯誤物件本身**不再帶任何語言的文字**，畫面層拿到 key 才查表。測試斷言 key。

## 為什麼要做到這一步

票 03 已經讓錯誤訊息走翻譯檔了（`throw new Error(t('books.scopeEmpty'))`），看起來夠用。但那樣**語言在錯誤產生的那一刻就被凍住**——錯誤可能在使用者切換語言之後才被顯示，那時候那串文字已經是舊語言的了。

帶 key 的物件從頭到尾與語言無關，顯示的那一刻才決定用哪一種語言。

## 好消息：接住點只有一個

原本以為要改「每一個接住錯誤的畫面層」，實際查過之後**只有 `toMessage()` 一個漏斗**（`storage.ts:367`）。畫面層七處全部走它：

| 位置 | 用法 |
| --- | --- |
| `books-section.ts:59` | `匯入失敗：${toMessage(error)}` |
| `books-section.ts:212` | `error.textContent = toMessage(reason)` |
| `data-view.ts:125` | 同上 |
| `data-view.ts:172` | 同上 |
| `data-view.ts:349` | `匯入失敗：${toMessage(error)}` |
| `data-view.ts:370` | `匯出失敗：${toMessage(error)}` |
| `editor-view.ts:305` | `error.textContent = toMessage(reason)` |

**所以主要工作是改 `toMessage()` 一支函式**，畫面那七處大多只需要跟著改名（若決定改名的話）。

## 決定

### `AppError` 放哪

`src/lib/app-error.ts`，獨立一支。**不放進 `storage.ts`**——雲端備份、Gemini、複習佇列、讀音編輯器都會用到它，塞進 storage 會讓它變成所有人都要 import 的雜物櫃。

### `toMessage()` 改成查表，但保留 fallback

```ts
export function toMessage(error: unknown): string {
  if (error instanceof AppError) return t(error.key, error.params);
  return error instanceof Error ? error.message : String(error);
}
```

**fallback 不能拿掉。** 有些錯誤不是我們丟的：`JSON.parse` 的 `SyntaxError`、`fetch` 的網路錯誤、瀏覽器 API 的例外。那些沒有 key，只能照原樣顯示。

要不要把 `toMessage` 改名（例如 `toDisplayMessage`）由實作者決定，改的話七處一起改。

### 25 處要改的清單

**`storage.ts`（13 處）**

`:66`、`:92`、`:123`、`:167`、`:172`、`:221`、`:248`、`:258`、`:260`、`:334`、`:337`、`:344`、`:347`

**`cloud-backup.ts`（6 處）**：讀取／寫入雲端失敗、雲端沒有回覆時間戳、暱稱與密碼都要填、新密碼要填、尚未登入無法換密碼

**`gemini-reading.ts`（4 處）**：Gemini 回了 N、讀不懂回覆、沒有回覆內容、回的不是 JSON

**`review.ts`（1 處）**：複習佇列已清空

**`reading-editor.ts`（1 處）**：AI 給的讀音對不上這個詞條

### 兩處巢狀的要特別處理

`storage.ts:66` 與 `:92` 是把**另一個錯誤的訊息包進自己的訊息裡**：

```ts
throw new Error(`這不是有效的 JSON 檔：${toMessage(error)}`);
```

裡面那個 `error` 通常是瀏覽器丟的 `SyntaxError`，沒有 key。做法是把它當成參數帶進去：

```ts
throw new AppError('storage.invalidJson', { reason: toMessage(error) });
```

翻譯檔那一條寫成 `這不是有效的 JSON 檔：{reason}`。**內層那段文字仍會是瀏覽器給的語言**，這是無法消除的——記在這裡，不要當成 bug。

### `cloud-backup.ts` 既有的兩個錯誤類別

`RejectedByCloud`（`:52`）與 `TooLarge`（`:56`）已經是自訂類別，訊息取自 `WRONG_PASSWORD`、`TOO_LARGE` 兩個常數。**改成繼承 `AppError` 或改帶 key，兩種都可以**，挑一個跟其餘 25 處一致的寫法。

注意 `CLOUD_PAYLOAD_LIMIT` 那條有一個既有約束：`cloud-backup.test.ts` 釘著「這個數字要與雲端安全規則一致」。**那條測試與本票無關，不要動它。**

### 測試改成斷言 key

```ts
expect(() => setScope(...)).toThrow(
  expect.objectContaining({ key: 'books.scopeEmpty' }),
);
```

那 22 處 `toThrow` 在票 03 已經改成從翻譯檔取值，這張票改成斷言 key。改完之後**測試檔裡不該再有任何介面文字**。

## 這張票不做的事

- **不碰 `cloud-backup.test.ts` 釘住 `CLOUD_PAYLOAD_LIMIT` 的那條測試**
- **不改任何錯誤訊息的文案**
- **不順手統一錯誤的分類或層級**（不要發明 `ValidationError`、`NetworkError` 之類的階層，`AppError` 一種就夠）
- **不處理外部錯誤的語言**（瀏覽器丟的 `SyntaxError` 仍是它自己的語言）

## 驗收

- [ ] `src/lib/app-error.ts` 存在，`AppError` 帶 `key` 與選用的 `params`
- [ ] 25 處全部改完，非測試的 `.ts` 檔裡沒有剩下的 `throw new Error('中文...')`
- [ ] `toMessage()` 認得 `AppError` 走查表，其餘走原本的 fallback
- [ ] 丟一個 `JSON.parse` 的 `SyntaxError` 進 `toMessage()` → 仍然顯示得出東西，不是 `undefined`
- [ ] 那 22 處 `toThrow` 改成斷言 key，**測試檔裡沒有任何介面文字**
- [ ] 手動驗一條完整的路：單字本取重複的名字 → 畫面顯示正確的錯誤訊息
- [ ] `npm run test` 與 `npm run typecheck` 全綠
