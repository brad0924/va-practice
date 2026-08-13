/**
 * English. 型別釘住要跟 `zh-Hant.ts` 一致——少一條、多一條都編譯錯，
 * 而 `build` 與 `typecheck` 都會跑 `tsc --noEmit`，因此漏譯在建置時就擋下來。
 *
 * 目前只有示範用的兩條，實際的翻譯內容是票 06 的事。
 */
import type zhHant from './zh-Hant';

// 領域概念照 `docs/glossary.md` 的英文欄：單字本是 Vocabulary Book，不是 Book。
const en: typeof zhHant = {
  'books.addButton': '+ Add vocabulary book',
  'books.nameTaken': 'A vocabulary book named "{name}" already exists',
};

export default en;
