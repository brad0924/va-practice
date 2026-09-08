import { describe, it, expect } from 'vitest';
import { createSpellingBooks, SPELLING_BOOKS_KEY } from './spelling-books';
import { STORAGE_KEY } from './storage';
import type { StorageLike } from './storage';
import type { Book } from './types';

const BOOKS: Book[] = [
  { id: 'a', name: 'JLPT N2' },
  { id: 'b', name: '工作用日文' },
  { id: 'c', name: '文法句型' },
];

/** 一格記憶體假儲存，順便看得到誰被寫了。 */
function fakeStorage(initial: Record<string, string> = {}): StorageLike & { cells: Map<string, string> } {
  const cells = new Map(Object.entries(initial));
  return {
    cells,
    getItem: (key) => cells.get(key) ?? null,
    setItem: (key, value) => {
      cells.set(key, value);
    },
    removeItem: (key) => {
      cells.delete(key);
    },
  };
}

describe('讀出挑到的那幾本', () => {
  it('沒挑過時預設全選', () => {
    const books = createSpellingBooks(fakeStorage());

    expect(books.read(BOOKS)).toEqual(['a', 'b', 'c']);
  });

  it('挑過的那幾本讀得回來', () => {
    const books = createSpellingBooks(fakeStorage({ [SPELLING_BOOKS_KEY]: '["c","a"]' }));

    expect(books.read(BOOKS)).toEqual(['a', 'c']);
  });

  it('順序照現有單字本的順序，不照存下來的先後', () => {
    const books = createSpellingBooks(fakeStorage({ [SPELLING_BOOKS_KEY]: '["c","b"]' }));

    expect(books.read(BOOKS)).toEqual(['b', 'c']);
  });

  it('指不到任何一本的 id 濾掉，剩下的留著', () => {
    const books = createSpellingBooks(fakeStorage({ [SPELLING_BOOKS_KEY]: '["b","gone"]' }));

    expect(books.read(BOOKS)).toEqual(['b']);
  });

  it('存的那組全部指不到時退回全選', () => {
    const books = createSpellingBooks(fakeStorage({ [SPELLING_BOOKS_KEY]: '["gone","also-gone"]' }));

    expect(books.read(BOOKS)).toEqual(['a', 'b', 'c']);
  });

  it('存的內容不是 JSON 時不當機，退回全選', () => {
    const books = createSpellingBooks(fakeStorage({ [SPELLING_BOOKS_KEY]: '{壞掉的' }));

    expect(books.read(BOOKS)).toEqual(['a', 'b', 'c']);
  });

  it('存的內容不是一串字串時不當機，退回全選', () => {
    const books = createSpellingBooks(fakeStorage({ [SPELLING_BOOKS_KEY]: '{"a":true}' }));

    expect(books.read(BOOKS)).toEqual(['a', 'b', 'c']);
  });

  it('一本單字本都沒有時回傳空的，不硬湊', () => {
    const books = createSpellingBooks(fakeStorage({ [SPELLING_BOOKS_KEY]: '["a"]' }));

    expect(books.read([])).toEqual([]);
  });
});

describe('存回去', () => {
  it('寫進自己那一格，不碰資料那一格', () => {
    const storage = fakeStorage({ [STORAGE_KEY]: 'the-real-data' });
    createSpellingBooks(storage).write(['b']);

    expect(createSpellingBooks(storage).read(BOOKS)).toEqual(['b']);
    expect(storage.cells.get(STORAGE_KEY)).toBe('the-real-data');
  });

  it('用的 key 與資料那一格不同', () => {
    expect(SPELLING_BOOKS_KEY).not.toBe(STORAGE_KEY);
  });
});
