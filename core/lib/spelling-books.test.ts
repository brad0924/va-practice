import { describe, it, expect } from 'vitest';
import { createSpellingBooks, SPELLING_BOOKS_KEY } from './spelling-books';
import { createBookPicks, QUIZ_BOOKS_KEY } from './spelling-books';
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

/**
 * 問答票 04：同一支存放收「存在哪一格」當參數，問答傳自己那一格。
 * 上面那幾條是拼字原有的測試，一行都沒改——它們照樣綠，就是「拼字那一格行為沒變」。
 */
describe('問答那一格', () => {
  it('拼字那一格的名字沒有變：使用者已經存著的選擇讀得回來', () => {
    const storage = fakeStorage({ 'va-practice:spelling-books': '["b"]' });

    expect(createSpellingBooks(storage).read(BOOKS)).toEqual(['b']);
  });

  it('在拼字挑了，問答讀到的仍是自己上次挑的', () => {
    const storage = fakeStorage();
    const quiz = createBookPicks(storage, QUIZ_BOOKS_KEY);
    quiz.write(['c']);

    createSpellingBooks(storage).write(['a']);

    expect(quiz.read(BOOKS)).toEqual(['c']);
  });

  it('在問答挑了，拼字讀到的仍是自己上次挑的', () => {
    const storage = fakeStorage();
    const spelling = createSpellingBooks(storage);
    spelling.write(['a']);

    createBookPicks(storage, QUIZ_BOOKS_KEY).write(['b', 'c']);

    expect(spelling.read(BOOKS)).toEqual(['a']);
  });

  it('問答沒挑過時預設全選，不借拼字挑的那幾本', () => {
    const storage = fakeStorage({ [SPELLING_BOOKS_KEY]: '["a"]' });

    expect(createBookPicks(storage, QUIZ_BOOKS_KEY).read(BOOKS)).toEqual(['a', 'b', 'c']);
  });

  it('問答那一格讀壞了也不當機，退回全選', () => {
    const storage = fakeStorage({ [QUIZ_BOOKS_KEY]: '{壞掉的' });

    expect(createBookPicks(storage, QUIZ_BOOKS_KEY).read(BOOKS)).toEqual(['a', 'b', 'c']);
  });

  it('三格的名字各不相同：資料、拼字、問答', () => {
    expect(new Set([STORAGE_KEY, SPELLING_BOOKS_KEY, QUIZ_BOOKS_KEY]).size).toBe(3);
  });
});
