/**
 * 單字本範圍那顆開關鈕上的那一行字。**這裡不碰 DOM，也不碰 React。**
 *
 * 原本住在網頁版的 `src/ui/book-filter.ts`，而 `mobile/ui/book-scope-sheet.tsx` 曾經
 * 抄過同樣的三行。搬進來之後兩邊取同一份，抄的那一份刪掉——票 `02` 那條
 * 「邏輯層不准分岔」畫的就是這條線。
 */
import { t } from '../i18n';
import type { Book } from './types';

/** 收合後鈕上的那行字：全勾是「全部」，只勾一本是那本的名字，其餘報本數。 */
export function scopeLabel(books: readonly Book[], selected: readonly string[]): string {
  if (selected.length === books.length) return t('filter.all');
  if (selected.length === 1) {
    return books.find((book) => book.id === selected[0])?.name ?? t('filter.bookCount', { count: 1 });
  }
  return t('filter.bookCount', { count: selected.length });
}
