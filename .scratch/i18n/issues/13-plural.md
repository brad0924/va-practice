# 13 — 查表學會單複數，英文才寫得出「1 個」跟「2 個」

Status: needs-triage
Type: enhancement

## 問題

英文的名詞分單數複數：1 張卡是 `1 card`，2 張是 `2 cards`。而 `t()`（`core/i18n/index.ts`）只做一件事——把 `{count}` 換成數字，不會順手改後面那個字。

票 `06` 當時的處理是**閃過去**：英文那份帶數量的字串一律改寫成「名詞在前、數字在後」，寫 `Cards: 12` 而不是 `12 cards`，單數複數就永遠不會被看見。那條規矩寫在 `core/i18n/en.ts` 檔頭第 24 行，決定在票 `06` 第 98 行。

規矩守得很徹底，代價是**英文讀起來不像句子，像儀表板的欄位名**。中文與日文沒有這個問題，所以只有英文那一份被扭成這樣。

## 這條規矩現在管著哪幾條

英文那份帶數量的全部（`core/i18n/en.ts`）：

| key | 現在寫的 | 拿掉規矩之後想寫的 |
| --- | --- | --- |
| `books.cardCount` | `Cards: {count}` | `{count} cards` |
| `books.imported` | `Imported: {count}` | `Imported {count} entries` |
| `books.skippedHeading` | `...were skipped ({count}):` | `{count} entries ... were skipped:` |
| `books.deleteConfirm` | `The cards it holds ({count})` | `the {count} cards it holds` |
| `list.countAll` | `Cards: {total}` | `{total} cards` |
| `list.countMatched` | `Cards: {matched} of {total}` | `{matched} of {total} cards` |
| `stats.modalTitle` | `{title} ({count})` | `{title}, {count} cards` |
| `reminder.body` | `Due today: {count}` | `{count} cards due today` |
| `spelling.settled*` | `Correct · Points: {points}` | `Correct · {points} points` |

三條不受影響，列出來免得被誤稽核：

- `filter.bookCount`（`{count} selected`）與 `review.remaining`（`{count} left`）數字已經在前面了，後面接的不是名詞，本來就沒有單複數問題。
- `gemini.timeout`（`No reply after waiting more than {seconds} seconds`）是全檔唯一「數字＋複數名詞」的寫法。它不是破例：`TIMEOUT_MS` 是寫死的 `10_000`，那個數字永遠是 10，`1 seconds` 不可能發生。

## 已定的方向

維護者選定：**讓翻譯檔支援單複數**，而不是繼續閃。

觸發的場合是拼字票 `spelling-practice/07`。那三條 `spelling.settled*` 一度被改成 `Correct · {points} points`，提交後才發現違反上面那條規矩——一題的分數是 0 到 10 而 `points()` 的下限就是 1 分，`1 points` 是真的會出現，不是理論上的。已經退回 `Correct · Points: {points}`，等這張票做完再一起改。

**方向定了，機制沒定。** 底下是待決，不是提案通過。

## 待決

1. **機制長什麼樣。** 至少三條路，成本與長相差很多：
   - 每條 key 拆成 `one` / `other` 兩欄（`zh-Hant.ts` 是唯一來源，型別要跟著長出這個形狀）。
   - 借瀏覽器內建的 `Intl.PluralRules`（不必自己判斷，但要決定 key 的形狀怎麼配合，而且 `ADR-0013` 定的「三份檔案型別一致」要重新想）。
   - 只在 `t()` 裡認一種簡寫語法（例如 `{count} card(s)` 或 `{count} [card|cards]`），三份檔案的形狀不動。

2. **中文與日文怎麼辦。** 兩種語言沒有單複數，硬要跟著長出 `one` / `other` 兩欄等於每條都抄兩份一樣的字。要不要讓它們維持一欄？那會不會破掉「`en.ts` 與 `ja.ts` 是 `const en: typeof zhHant`」那道漏譯守門（`ADR-0013`）？**這一條最擋路**：守門失效的話這整張票就不划算。

3. **英文那九條要不要順手改回自然語序。** 機制做好只是「可以改」，不改的話畫面一個字都不會變。改的話那是九條使用者看得到的文案，要不要逐條端出來看。

4. **零的形式。** 英文的 0 走 `other`（`0 cards`），但有些句子零的時候根本該換句話說（`No cards due today`）。要不要一併支援 `zero`。

## 驗收

待決 1 到 4 有結論之後再補。

## Comments

由 `spelling-practice/07` 收工時衍生，見那張票的〈翻譯校對：改了兩條，留了兩條〉一節。
