import { describe, it, expect } from 'vitest';
import { AppError, toMessage } from './app-error';
import { setLang } from '../i18n';
import zhHant from '../i18n/zh-Hant';
import ja from '../i18n/ja';

describe('AppError', () => {
  it('帶的是 key 與參數，不是某一種語言的文字', () => {
    const error = new AppError('books.nameTaken', { name: 'JLPT N2' });

    expect(error.key).toBe('books.nameTaken');
    expect(error.params).toEqual({ name: 'JLPT N2' });
  });

  it('攔得到的仍然是一個 Error：既有的 try／catch 不必分兩種寫法', () => {
    expect(new AppError('books.scopeEmpty')).toBeInstanceOf(Error);
  });

  it('斷言 key 的寫法認得出來（全 repo 的錯誤測試都靠這一句）', () => {
    expect(() => {
      throw new AppError('books.scopeEmpty');
    }).toThrow(expect.objectContaining({ key: 'books.scopeEmpty' }));
  });
});

describe('把攔到的例外轉成一句話', () => {
  it('AppError 走查表，參數一併代入', () => {
    const message = toMessage(new AppError('books.nameTaken', { name: 'JLPT N2' }));

    expect(message).toBe(zhHant['books.nameTaken'].replace('{name}', 'JLPT N2'));
  });

  it('查表發生在顯示的當下：同一個錯誤物件，換了語言就換一句話', () => {
    // 這一條是整張票的理由。錯誤在切語言之前就丟出來，顯示卻發生在切語言之後。
    // 取 `books.nameTaken` 是因為 `ja.ts` 目前只有兩條是真的日文，其餘還是中文暫置（票 06）。
    const error = new AppError('books.nameTaken', { name: 'JLPT N2' });
    const before = toMessage(error);

    setLang('ja');
    try {
      expect(toMessage(error)).not.toBe(before);
      expect(toMessage(error)).toBe(ja['books.nameTaken'].replace('{name}', 'JLPT N2'));
    } finally {
      setLang('zh-Hant');
    }
  });

  it('不是我們丟的錯沒有 key，照原樣顯示：瀏覽器的 SyntaxError', () => {
    let caught: unknown;
    try {
      JSON.parse('{ 這不是 JSON');
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(SyntaxError);
    expect(toMessage(caught)).toBe((caught as SyntaxError).message);
    expect(toMessage(caught)).not.toBe('');
  });

  it('連 Error 都不是的東西也擠得出一句話', () => {
    expect(toMessage('壞掉了')).toBe('壞掉了');
    expect(toMessage(undefined)).toBe('undefined');
  });
});
