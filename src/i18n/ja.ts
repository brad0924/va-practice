/**
 * 日本語。型別釘住要跟 `zh-Hant.ts` 一致——少一條、多一條都編譯錯，
 * 而 `build` 與 `typecheck` 都會跑 `tsc --noEmit`，因此漏譯在建置時就擋下來。
 *
 * 目前只有示範用的兩條，實際的翻譯內容是票 06 的事。
 */
import type zhHant from './zh-Hant';

const ja: typeof zhHant = {
  'books.addButton': '＋ 単語帳を追加',
  'books.nameTaken': '「{name}」という単語帳がすでにあります',
};

export default ja;
