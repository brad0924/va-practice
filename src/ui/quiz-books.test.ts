// @vitest-environment jsdom

/**
 * 問答的挑書頁（票 04）。形狀照抄 `spelling-books.test.ts`。
 *
 * 與拼字那一頁差在一件事：**這一頁不開一輪**。問答開一輪時可能要等 Gemini 補選項（票 06），
 * 那段接線住在 `quiz-home.ts`，由 `quiz-home.test.ts` 顧。這一頁只管挑了哪幾本、存回本機，
 * 以及開不成時那一句紅字——那一句的原因由呼叫端遞進來，改選之後就收起來。
 *
 * 刻意不測的：
 * - **版面**。理由同拼字那一頁。
 * - **「一本都沒挑」那條路**。`bookFilter` 會把最後一本鎖住，勾不掉，因此走不到。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { App } from '../app';
import type { Key } from '@core/i18n';
import { quizBooksView } from './quiz-books';
import { createBookPicks, QUIZ_BOOKS_KEY, SPELLING_BOOKS_KEY } from '@core/lib/spelling-books';
import { STORAGE_KEY, type StorageLike } from '@core/lib/storage';
import type { AppData, Book } from '@core/lib/types';
import zhHant from '@core/i18n/zh-Hant';

const BOOKS: Book[] = [
  { id: 'a', name: 'JLPT N2' },
  { id: 'b', name: '工作用日文' },
];

/** 一格記憶體假儲存，內容看得見也改得動。 */
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

function appData(books: Book[]): AppData {
  return { version: 3, books, cards: [], scopes: { review: ['a'], list: ['a'], stats: ['a'] }, updatedAt: 0 };
}

interface Harness {
  screen: HTMLElement;
  app: App;
  storage: ReturnType<typeof fakeStorage>;
  started: string[][];
  showData: ReturnType<typeof vi.fn>;
}

function mount(
  options: { books?: Book[]; storage?: ReturnType<typeof fakeStorage>; reason?: Key | null } = {},
): Harness {
  const storage = options.storage ?? fakeStorage();
  const started: string[][] = [];
  const showData = vi.fn();
  const app = {
    data: appData(options.books ?? BOOKS),
    quizBooks: createBookPicks(storage, QUIZ_BOOKS_KEY),
    showData,
    keyHandler: (() => {}) as App['keyHandler'],
  } as unknown as App;

  const screen = quizBooksView(app, options.reason ?? null, (ids) => started.push([...ids]));
  document.body.replaceChildren(screen);
  return { screen, app, storage, started, showData };
}

/** 第 0 顆是「全部」，單字本從第 1 顆起，順序照 `app.data.books`。 */
const checks = (screen: HTMLElement) => [...screen.querySelectorAll<HTMLInputElement>('.book-filter-check')];

function toggleBook(screen: HTMLElement, index: number): void {
  checks(screen)[index + 1]!.dispatchEvent(new Event('change', { bubbles: true }));
}

const startButton = (screen: HTMLElement) => screen.querySelector<HTMLButtonElement>('footer button')!;

const noticeText = (screen: HTMLElement) => screen.querySelector('.error')?.textContent ?? '';

beforeEach(() => {
  document.body.replaceChildren();
});

describe('第一次進來', () => {
  it('每一本都是勾起來的，「開始」按得動', () => {
    const { screen } = mount();

    expect(checks(screen).map((check) => check.checked)).toEqual([true, true, true]);
    expect(startButton(screen).textContent).toBe(zhHant['quiz.start']);
    expect(startButton(screen).disabled).toBe(false);
  });

  it('沒有那一句紅字', () => {
    expect(noticeText(mount().screen)).toBe('');
  });
});

describe('挑到的那幾本', () => {
  it('按「開始」把挑到的那幾本交給呼叫端', () => {
    const { screen, started } = mount();
    toggleBook(screen, 1); // 取消「工作用日文」

    startButton(screen).click();

    expect(started).toEqual([['a']]);
  });

  it('離開再回來，上次挑的那幾本仍然勾著', () => {
    const first = mount();
    toggleBook(first.screen, 0); // 取消 JLPT N2

    const again = mount({ storage: first.storage });

    expect(checks(again.screen).map((check) => check.checked)).toEqual([false, false, true]);
  });
});

describe('與拼字挑的分開記', () => {
  it('在拼字挑了 N2，問答這一頁看到的仍是自己上次挑的', () => {
    const storage = fakeStorage({ [QUIZ_BOOKS_KEY]: '["b"]', [SPELLING_BOOKS_KEY]: '["a"]' });

    const { screen } = mount({ storage });

    expect(checks(screen).map((check) => check.checked)).toEqual([false, false, true]);
  });

  it('在這一頁改選，拼字那一格一個字都沒動', () => {
    const storage = fakeStorage({ [SPELLING_BOOKS_KEY]: '["a"]' });
    const { screen } = mount({ storage });

    toggleBook(screen, 0);

    expect(storage.cells.get(QUIZ_BOOKS_KEY)).toBe('["b"]');
    expect(storage.cells.get(SPELLING_BOOKS_KEY)).toBe('["a"]');
  });
});

describe('本機存的那組壞掉時', () => {
  it('整組都指不到時不當機，退回全選', () => {
    const { screen } = mount({ storage: fakeStorage({ [QUIZ_BOOKS_KEY]: '["gone"]' }) });

    expect(checks(screen).map((check) => check.checked)).toEqual([true, true, true]);
  });

  it('存的內容讀壞了也一樣退回全選', () => {
    const { screen } = mount({ storage: fakeStorage({ [QUIZ_BOOKS_KEY]: '{壞掉的' }) });

    expect(checks(screen).map((check) => check.checked)).toEqual([true, true, true]);
  });
});

describe('上一次開不成時的那一句紅字', () => {
  it('呼叫端遞進來的那一句印在頁面上，人留在這一頁', () => {
    const { screen } = mount({ reason: 'quiz.noCardsNote' });

    expect(noticeText(screen)).toBe(zhHant['quiz.noCardsNote']);
    expect(checks(screen)).not.toHaveLength(0);
  });

  it('改選之後就收起來：那一句講的是上一次的挑法', () => {
    const { screen } = mount({ reason: 'quiz.noKeyNote' });

    toggleBook(screen, 1);

    expect(noticeText(screen)).toBe('');
  });
});

describe('一本單字本都沒有', () => {
  it('比照拼字的零本版本：指路去資料頁建立', () => {
    const { screen, showData } = mount({ books: [] });

    expect(checks(screen)).toHaveLength(0);
    expect(screen.textContent).toContain(zhHant['quiz.noBooksTitle']);
    startButton(screen).click();

    expect(showData).toHaveBeenCalledTimes(1);
  });
});

describe('不碰跟著備份走的那份資料', () => {
  it('勾選只寫本機自己那一格，`AppData` 一個字都沒動', () => {
    const { screen, app, storage } = mount({ storage: fakeStorage({ [STORAGE_KEY]: 'the-real-data' }) });
    const before = JSON.stringify(app.data);

    toggleBook(screen, 0);

    expect(JSON.stringify(app.data)).toBe(before);
    expect(storage.cells.get(STORAGE_KEY)).toBe('the-real-data');
  });
});

describe('鍵盤', () => {
  it('這一頁與零本那一頁都沒有快捷鍵，明寫成 null', () => {
    expect(mount().app.keyHandler).toBeNull();
    expect(mount({ books: [] }).app.keyHandler).toBeNull();
  });
});
