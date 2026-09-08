// @vitest-environment jsdom

/**
 * 拼字的首頁：挑單字本（票 04）。
 *
 * 這一頁值得上 jsdom 的理由與票 03 同一條：它整個都是接線——勾選會不會存回本機、
 * 存的那組指不到東西時畫面怎麼開、按「開始」端出去的那一輪裝了誰的卡。離開 DOM 就不成立
 * （`ADR-0014`）。真正的規則住在 `core/lib/spelling-books.ts` 與 `core/lib/spelling.ts`，
 * 各自有自己的測試，這裡不重測一遍。
 *
 * 刻意不測的：
 * - **版面**。`block` 版的開關撐不撐得滿一列、那一句話擠不擠得下，jsdom 一概量不出來。
 * - **洗牌洗成什麼樣**。那是 `startRound()` 的事。這裡只看那一輪裝了哪幾張卡。
 * - **「一本都沒挑」那條路**。`bookFilter` 會把最後一本鎖住，勾不掉，因此走不到；
 *   底下有一條測那道鎖。「開始」自己那道 `disabled` 是第二層，摸不到的那一層不寫測試。
 */

import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { App } from '../app';
import { spellingBooksView } from './spelling-books';
import { createSpellingBooks, SPELLING_BOOKS_KEY } from '@core/lib/spelling-books';
import { STORAGE_KEY, type StorageLike } from '@core/lib/storage';
import type { Round } from '@core/lib/spelling';
import type { AppData, Book, Card } from '@core/lib/types';

const BOOKS: Book[] = [
  { id: 'a', name: 'JLPT N2' },
  { id: 'b', name: '工作用日文' },
];

function card(id: string, bookId: string, text: string, meaning: string): Card {
  return { id, bookId, text, meaning, interval: null, ease: 2.5, due: null };
}

const CARDS: Card[] = [
  card('c1', 'a', '焦[こ]がす', '燒焦、烤焦'),
  card('c2', 'a', '峠[とうげ]', '山頂'),
  card('c3', 'b', 'ねこ', '貓'),
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

function appData(books: Book[], cards: Card[]): AppData {
  return {
    version: 3,
    books,
    cards,
    scopes: { review: ['a'], list: ['a'], stats: ['a'] },
    updatedAt: 0,
  };
}

interface Harness {
  screen: HTMLElement;
  app: App;
  storage: ReturnType<typeof fakeStorage>;
  started: Round[];
  showData: ReturnType<typeof vi.fn>;
}

function mount(
  options: {
    books?: Book[];
    cards?: Card[];
    storage?: ReturnType<typeof fakeStorage>;
    /** 複習範圍。只有「兩邊互不影響」那一條用得到，其餘測試不必管它。 */
    review?: string[];
  } = {},
): Harness {
  const storage = options.storage ?? fakeStorage();
  const started: Round[] = [];
  const showData = vi.fn();
  const data = appData(options.books ?? BOOKS, options.cards ?? CARDS);
  if (options.review) data.scopes.review = options.review;
  const app = {
    data,
    spellingBooks: createSpellingBooks(storage),
    now: () => new Date(),
    // 固定的亂數，洗出來的順序每次一樣。這一頁不在乎洗成什麼樣，只在乎裝了誰。
    random: () => 0.5,
    showData,
    keyHandler: (() => {}) as App['keyHandler'],
  } as unknown as App;

  const screen = spellingBooksView(app, (round) => started.push(round));
  document.body.replaceChildren(screen);
  return { screen, app, storage, started, showData };
}

/** 第 0 顆是「全部」，單字本從第 1 顆起，順序照 `app.data.books`。 */
const checks = (screen: HTMLElement) =>
  [...screen.querySelectorAll<HTMLInputElement>('.book-filter-check')];

/** 勾或取消第 index 本。`bookFilter` 聽的是 change，自己算要變成哪一組。 */
function toggleBook(screen: HTMLElement, index: number): void {
  checks(screen)[index + 1]!.dispatchEvent(new Event('change', { bubbles: true }));
}

const startButton = (screen: HTMLElement) =>
  [...screen.querySelectorAll<HTMLButtonElement>('footer button')][0]!;

const noticeText = (screen: HTMLElement) => screen.querySelector('.error')?.textContent ?? '';

/** 那一輪出到的每一張卡屬於哪幾本。 */
const booksInRound = (round: Round) => [...new Set(round.questions.map((one) => one.card.bookId))].sort();

beforeEach(() => {
  document.body.replaceChildren();
});

describe('第一次進來', () => {
  it('每一本都是勾起來的', () => {
    const { screen } = mount();

    // 第 0 顆是「全部」，它跟著全勾一起被勾上並鎖住。
    expect(checks(screen).map((check) => check.checked)).toEqual([true, true, true]);
  });

  it('「開始」按得動', () => {
    const { screen } = mount();

    expect(startButton(screen).disabled).toBe(false);
  });
});

describe('挑到的那幾本', () => {
  it('按「開始」端出去的那一輪只裝挑到的那幾本的卡', () => {
    const { screen, started } = mount();
    toggleBook(screen, 1); // 取消「工作用日文」，只剩 JLPT N2

    startButton(screen).click();

    expect(started).toHaveLength(1);
    expect(booksInRound(started[0]!)).toEqual(['a']);
  });

  it('全勾時兩本的卡都出得到', () => {
    const { screen, started } = mount();

    startButton(screen).click();

    expect(booksInRound(started[0]!)).toEqual(['a', 'b']);
  });

  it('離開再回來，上次挑的那幾本仍然勾著', () => {
    const first = mount();
    toggleBook(first.screen, 0); // 取消 JLPT N2

    const again = mount({ storage: first.storage });

    expect(checks(again.screen).map((check) => check.checked)).toEqual([false, false, true]);
  });

  it('取消到只剩一本時，最後那一顆勾不掉', () => {
    const { screen } = mount();
    toggleBook(screen, 0);

    // 「開始」因此永遠有得按——`bookFilter` 擋在前面，走不到「一本都沒挑」。
    expect(checks(screen)[2]!.disabled).toBe(true);
    expect(startButton(screen).disabled).toBe(false);
  });
});

describe('本機存的那組壞掉時', () => {
  it('指不到任何一本的 id 濾掉，剩下的照樣勾著', () => {
    const { screen } = mount({
      storage: fakeStorage({ [SPELLING_BOOKS_KEY]: '["b","gone"]' }),
    });

    expect(checks(screen).map((check) => check.checked)).toEqual([false, false, true]);
  });

  it('整組都指不到時不當機，退回全選', () => {
    const { screen, started } = mount({
      storage: fakeStorage({ [SPELLING_BOOKS_KEY]: '["gone","also-gone"]' }),
    });

    expect(checks(screen).map((check) => check.checked)).toEqual([true, true, true]);

    // 也不會靜默出一輪空題（票 04 決定 6）。
    startButton(screen).click();
    expect(started[0]!.questions.length).toBeGreaterThan(0);
  });
});

describe('挑到的那幾本拿不出卡', () => {
  /** 有漢字卻沒標讀音，拿不出正解，因此出不了題（spec 決定 16）。 */
  const NO_READING = [card('c9', 'a', '漢字', '中文字')];

  it('不開始，改印那一句話', () => {
    const { screen, started } = mount({ cards: NO_READING });

    startButton(screen).click();

    expect(started).toEqual([]);
    expect(noticeText(screen)).not.toBe('');
  });

  it('那一句話一開始不在，按了「開始」才出現', () => {
    const { screen } = mount({ cards: NO_READING });

    expect(noticeText(screen)).toBe('');
  });

  it('本身就是空的單字本走同一句話', () => {
    const { screen, started } = mount({ cards: [] });

    startButton(screen).click();

    expect(started).toEqual([]);
    expect(noticeText(screen)).not.toBe('');
  });

  it('人留在這一頁，改選之後那一句話就收起來', () => {
    const { screen } = mount({ cards: NO_READING });
    startButton(screen).click();

    // 開關還在，勾得動——「回去改選」靠的就是它。
    expect(checks(screen)).not.toHaveLength(0);
    toggleBook(screen, 1);

    expect(noticeText(screen)).toBe('');
  });
});

describe('一本單字本都沒有', () => {
  it('指路去資料頁建立', () => {
    const { screen, showData } = mount({ books: [], cards: [] });

    expect(checks(screen)).toHaveLength(0);
    screen.querySelector('footer button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(showData).toHaveBeenCalledTimes(1);
  });
});

describe('不碰跟著備份走的那份資料', () => {
  it('勾選只寫本機那一格，`AppData` 一個字都沒動', () => {
    const { screen, app, storage } = mount({ storage: fakeStorage({ [STORAGE_KEY]: 'the-real-data' }) });
    const before = JSON.stringify(app.data);

    toggleBook(screen, 0);

    expect(JSON.stringify(app.data)).toBe(before);
    expect(storage.cells.get(STORAGE_KEY)).toBe('the-real-data');
    expect(storage.cells.get(SPELLING_BOOKS_KEY)).toBe('["b"]');
  });

  it('複習範圍怎麼改都不影響這一頁勾了什麼', () => {
    // 反方向由上面那條顧（勾選不動 `AppData`）。兩條合起來才是驗收要的「互不影響」。
    const storage = fakeStorage({ [SPELLING_BOOKS_KEY]: '["b"]' });

    const narrow = mount({ storage, review: ['a'] });
    const wide = mount({ storage, review: ['a', 'b'] });

    expect(checks(narrow.screen).map((check) => check.checked)).toEqual([false, false, true]);
    expect(checks(wide.screen).map((check) => check.checked)).toEqual([false, false, true]);
  });

  it('沒有 import storage.ts，也沒有呼叫 applyData()', () => {
    // 與票 03 同一道守門：拼字這條線一行都不碰 `storage.ts`（`ADR-0021`）。
    // 釘的是 import 而不是 `storage` 那個字——比字串會在有人寫下檔名時假紅燈。
    const source = readFileSync('src/ui/spelling-books.ts', 'utf8');

    expect(source).not.toMatch(/from '@core\/lib\/storage'/);
    expect(source).not.toMatch(/applyData\(/);
    expect(source).not.toMatch(/setScope\(/);
  });

  it('也不從別的畫面繞路 import 到 storage.ts', () => {
    const source = readFileSync('src/ui/spelling-books.ts', 'utf8');
    const imports = [...source.matchAll(/from '\.\/([a-z-]+)'/g)].map((hit) => hit[1]!);

    expect(imports).not.toContain('review-view');
    for (const name of imports) {
      expect(readFileSync(`src/ui/${name}.ts`, 'utf8')).not.toMatch(/from '@core\/lib\/storage'/);
    }
  });
});

describe('鍵盤', () => {
  it('這一頁沒有快捷鍵，明寫成 null', () => {
    const { app } = mount();

    expect(app.keyHandler).toBeNull();
  });

  it('零本那一頁也是', () => {
    const { app } = mount({ books: [], cards: [] });

    expect(app.keyHandler).toBeNull();
  });
});
