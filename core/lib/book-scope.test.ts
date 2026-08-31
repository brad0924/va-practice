import { describe, it, expect } from 'vitest';
import { scopeLabel } from './book-scope';
import type { Book } from './types';
import zhHant from '../i18n/zh-Hant';

const BOOKS: Book[] = [
  { id: 'a', name: 'JLPT N2' },
  { id: 'b', name: '工作用日文' },
  { id: 'c', name: '文法句型' },
];

/**
 * 收合後那顆鈕上只有一行字，三種情況要說得清楚：全選、單選、其餘。
 *
 * 這四條原本在 `src/ui/book-filter.test.ts` 裡，隨 `scopeLabel()` 一起搬進 `core/`
 * （票 `15`）。那支檔案留下的是選單開合那一段，它要碰真的 DOM。
 */
describe('scopeLabel', () => {
  it('全部勾滿時顯示「全部」', () => {
    expect(scopeLabel(BOOKS, ['a', 'b', 'c'])).toBe(zhHant['filter.all']);
  });

  it('只勾一本時顯示那本的名字', () => {
    expect(scopeLabel(BOOKS, ['b'])).toBe('工作用日文');
  });

  it('勾了兩本以上但沒勾滿時報本數', () => {
    expect(scopeLabel(BOOKS, ['a', 'c'])).toBe('2 本');
  });

  it('勾的那本已經不在時退回報本數，不顯示空字串', () => {
    expect(scopeLabel(BOOKS, ['gone'])).toBe('1 本');
  });
});
