import { describe, it, expect } from 'vitest';
import { scopeLabel } from './book-filter';
import type { Book } from '../lib/types';

const BOOKS: Book[] = [
  { id: 'a', name: 'JLPT N2' },
  { id: 'b', name: '工作用日文' },
  { id: 'c', name: '文法句型' },
];

/** 收合後那顆鈕上只有一行字，三種情況要說得清楚：全選、單選、其餘。 */
describe('scopeLabel', () => {
  it('全部勾滿時顯示「全部」', () => {
    expect(scopeLabel(BOOKS, ['a', 'b', 'c'])).toBe('全部');
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
