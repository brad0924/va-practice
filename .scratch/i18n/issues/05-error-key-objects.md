# 05 — 錯誤改成帶 key 的物件，不再帶文字

Status: done
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

- [x] `src/lib/app-error.ts` 存在，`AppError` 帶 `key` 與選用的 `params`
- [x] 25 處全部改完（**實際 26 處**，見下方 Comments），非測試的 `.ts` 檔裡沒有剩下的 `throw new Error('中文...')`——唯一的例外是 `i18n/index.ts` 那條「i18n 還沒啟動」，理由寫在該處註解
- [x] `toMessage()` 認得 `AppError` 走查表，其餘走原本的 fallback
- [x] 丟一個 `JSON.parse` 的 `SyntaxError` 進 `toMessage()` → 仍然顯示得出東西，不是 `undefined`
- [x] 那 22 處 `toThrow` 改成斷言 key，**測試檔裡沒有任何介面文字**——唯一的例外是釘住「本機的卡片與進度完全不受影響」那條文案守門，見下方 Comments
- [x] 手動驗一條完整的路：單字本取重複的名字 → 畫面顯示正確的錯誤訊息
- [x] `npm run test` 與 `npm run typecheck` 全綠

## Comments

**實際是 26 處不是 25 處。** 票面 `gemini-reading.ts` 那一列寫 4 處，漏數了逾時／連不上
那一個 `throw`（它是一個 throw 帶兩條訊息，用三元判斷式選）。其餘四列的數字都對：
`storage.ts` 13、`cloud-backup.ts` 6、`review.ts` 1、`reading-editor.ts` 1。

**`toMessage()` 跟著 `AppError` 一起搬到 `src/lib/app-error.ts`。** 票面只指定了 `AppError`
的落點，但那條「不要讓 storage 變成所有人都要 import 的雜物櫃」的理由對 `toMessage()`
一樣成立——它改完之後做的事就是「認得 `AppError` 就查表」，那是錯誤這個概念的一部分，
不是資料存取的。三支畫面檔因此只改 import 來源，一個呼叫都沒動。**沒有改名**（`toDisplayMessage`
之類）：七處要跟著改，換不到任何東西。`ADR-0013` 的 Consequences 那行舊路徑一併修正。

**票面漏掉一個顯示點：`reading-editor.ts` 的 `catch`。** 票面「接住點只有一個」那張表列的
是七處 `toMessage()`，但 `reading-editor.ts:216` 原本自己寫了一份 `reason instanceof Error
? reason.message : ...`——那也是顯示點，不改的話 AI 填讀音失敗會在畫面上印出一條 key。
已改成走 `toMessage()`；外層那層 `instanceof Error` 保留，因為連 `Error` 都不是的東西
`toMessage()` 會吐 `String(error)`，那不是一句話。

**`cloud-backup.ts` 的兩個既有類別改成繼承 `AppError`**（票面給的兩個選項之一）。連帶
把 `wrongPassword()`／`tooLarge()` 兩支轉手函式砍掉：`RejectedByCloud`／`TooLarge` 現在
自己就帶著同兩條 key，再留一張「哪個類別配哪句話」的對應表就是第二條漏斗，改 key 得改
兩處。`statusFor()` 改成走 `toMessage()`。那兩支函式的註解（為什麼不必分辨密碼錯與暱稱
被佔、為什麼超限那句話三句缺一不可）搬到 `zh-Hant.ts` 對應的 key 上，沒有弄丟。測試改
讀翻譯檔的常數，與既有的 `OFFLINE_NOTE` 同一種寫法。

**`gemini.noReason` 拆成第二條 key。** code review 抓到的：非 2xx 但挖不到原因時，原本是
把 `t('gemini.noReason')` 查好表當參數塞進 `gemini.httpError`——那是**我們自己的字**，在
丟出錯誤的當下就被凍住，正是這張票要消滅的東西。票面第 84–90 行的巢狀豁免只給「不是我們
丟的」外部錯誤。改成 `gemini.httpErrorNoReason` 一條完整的句子，`{reason}` 那條只留給
Google 回的英文。**文案一個字都沒變**（「Gemini 回了 404：沒有附原因」）。

### 已知殘留，本票不修

**`storage.corrupted` 的內層可能是我們自己的錯，那一刻語言仍會被凍住。** 票面第 84–90 行
設想的內層是瀏覽器的 `SyntaxError`，`parseJson()` 確實只有那一種。但 `read()` 包的是
`parseAppData()`，它丟的是我們自己的 `AppError`（`storage.noCards`、`storage.cardMissingField`
…），`toMessage(error)` 在丟出的當下就把它查成文字了。要真正解掉得讓 `AppError` 能包住
另一個 `AppError`、由 `toMessage()` 在顯示時遞迴查表——那是設計改動，超出這張票。實際影響
很小（那句話只在本機資料毀損時出現，而且畫面一重畫就沒了），**尚未開票**。

**`cloud-backup.test.ts` 仍有一句中文字面值**：`expect(TOO_LARGE).toContain('本機的卡片與
進度完全不受影響')`。它與票面明文保護的 `CLOUD_PAYLOAD_LIMIT` 那條是同一種東西——釘的是
文案內容本身（「這句是使用者唯一的線索」），不是錯誤物件，拿掉就等於刪掉那層保護。留著。

**`failure()` 這支斷言 helper 在兩支測試檔各有一份。** 沒有抽成共用檔：三行，而且這個 repo
已經有前例——`fakeStorage()` 在 `storage.test.ts` 與 `cloud-backup.test.ts` 各寫一份，後者
的註解就寫著「沿用 storage.test.ts 的寫法」。

**`src/lib/app-error.ts` 沒有登記進 `docs/spec.md` 的「模組與接縫」。** 那一段列的是五個
測試接縫，這支是一個類別加一支函式的共用詞彙，不是接縫；硬列進去反而會讓那份清單失去意義。
它自己有 `app-error.test.ts`（票面沒要求，但新模組該有）。

### 手動驗過的

Chrome 上走了票面那條路：資料畫面 → ＋新增單字本 → 打 `JLPT N2`（已存在）→ 送出，畫面出現
紅字 `A vocabulary book named "JLPT N2" already exists`，單字本沒有被建立。這條路順帶多驗到
一件事：那台裝置的 `navigator.language` 是英文，介面因此走 `en` 表，而 `books.nameTaken` 正好
是票 03 留下的兩條真英文譯文之一——**同一個錯誤物件，查表查到的是當下語言的那一句**，這正是
這張票的理由。
