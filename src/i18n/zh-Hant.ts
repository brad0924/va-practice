/**
 * 繁體中文。**這一份是唯一的來源**，`en.ts` 與 `ja.ts` 照它的型別走，
 * 少一條就編譯錯（見 ADR-0013）。
 *
 * key 用語意命名（`books.addButton`），不用中文原文——中文改字時不必動 code，
 * 而且同一句中文在不同語境可以翻成不同的字。
 *
 * 目前只有兩條示範用的：搬那 193 條是票 03 的事，這張票只蓋機制。
 *
 * 刻意不加 `as const`：加了之後值也會變成字面型別，`en.ts` 那句
 * `const en: typeof zhHant` 就會要求填一模一樣的中文，守門反而失效。
 * key 本身在物件字面值上本來就是字面型別，`Key` 不受影響。
 */
export default {
  'books.addButton': '＋ 新增單字本',
  'books.nameTaken': '已經有一本叫「{name}」了',
};
