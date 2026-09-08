// @vitest-environment jsdom

/**
 * 拼字的入口與島內接線（票 05）。
 *
 * 這一支釘的是**一輪什麼時候封存、什麼時候被放掉**，以及進拼字時該落在哪一頁。三頁各自
 * 的行為由 `spelling-books.test.ts`、`spelling-view.test.ts`、`spelling-summary.test.ts`
 * 顧，這裡只看它們接起來對不對。
 *
 * 上 jsdom 的理由是換頁的手法本身就是 DOM 的事：每一頁把自己原地換掉（`replaceWith`），
 * 而不是包一層容器。離開 DOM 這件事不成立（`ADR-0014`）。
 *
 * 刻意不測的：
 * - **從複習畫面按「拼字」進得來**。那顆鈕與 `app.ts` 的接線是票 06 的，還不存在。
 * - **重整頁面之後成績消失**。那是「不寫 localStorage」的另一種說法，由底下那條
 *   守門測試釘住；真的重整一次要整台瀏覽器，jsdom 演不出來。
 */

import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { App } from '../app';
import { spellingHome } from './spelling-home';
import type { Book, Card } from '@core/lib/types';

const BOOKS: Book[] = [
  { id: 'b1', name: 'N2 動詞' },
  { id: 'b2', name: '工作用日文' },
];

function card(id: string, text: string, meaning: string, bookId: string): Card {
  return { id, bookId, text, meaning, interval: null, ease: 2.5, due: null };
}

/** 兩本各一張，都是純假名，因此兩張都出得了題。 */
const CARDS: Card[] = [
  card('c1', 'こがす', '燒焦、烤焦', 'b1'),
  card('c2', 'とうげ', '山頂', 'b2'),
];

/**
 * 一個夠拼字用的 app。亂數寫死成 0，一輪的卡序與磚序因此每次都一樣——
 * 「點第幾塊磚」才講得出「點的是哪個假名」。
 */
function makeApp(cards: readonly Card[] = CARDS): App {
  return {
    data: { version: 3, books: BOOKS, cards: [...cards], scopes: { review: [], list: [], stats: [] }, updatedAt: 0 },
    spellingBooks: {
      read: () => BOOKS.map((book) => book.id),
      write: () => {},
    },
    spellingRound: null,
    now: () => new Date(),
    random: () => 0,
    keyHandler: null,
  } as unknown as App;
}

/** 把入口掛上文件。掛上去才換得動頁——`replaceWith()` 對沒有父節點的元素什麼都不做。 */
function mount(app: App): HTMLElement {
  const root = document.createElement('div');
  root.append(spellingHome(app));
  document.body.replaceChildren(root);
  return root;
}

/** 目前停在哪一頁。三頁各有一樣只有自己有的東西，拿它當認人的記號。 */
function page(root: HTMLElement): 'books' | 'answer' | 'summary' {
  if (root.querySelector('.kana-field')) return 'answer';
  if (root.querySelector('.tiles')) return 'summary';
  return 'books';
}

function press(root: HTMLElement, label: string): void {
  const found = [...root.querySelectorAll('button')].find((node) => node.textContent === label);
  if (found === undefined) throw new Error(`畫面上找不到「${label}」`);
  found.click();
}

/** 把手上這一題拼完，不管拼得對不對：照順序把磚點滿為止。 */
function fillSlots(root: HTMLElement): void {
  const tiles = [...root.querySelectorAll<HTMLButtonElement>('.kana-tile')];
  for (const tile of tiles) {
    if (root.querySelectorAll('.slot:empty').length === 0) break;
    if (!tile.disabled) tile.click();
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T09:00:00Z'));
});

afterEach(() => {
  // 先把畫面拆掉再收假時鐘：答題頁的碼表靠 `isConnected` 自癒，脫離文件的那一下才停。
  document.body.replaceChildren();
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe('進拼字時落在哪一頁', () => {
  it('沒有上一輪時看到挑單字本那一頁', () => {
    const root = mount(makeApp());

    expect(page(root)).toBe('books');
  });

  it('上一輪還封存著時直接看到成績頁', () => {
    const app = makeApp();
    // 練到一半跳去卡片畫面，那一輪照樣封存（spec 決定 12）。回來看到的就是它。
    const first = mount(app);
    press(first, '開始');
    press(first, '結束');
    expect(page(first)).toBe('summary');

    // 整個畫面被丟掉，再進來一次——這就是跳去別的畫面又回來。
    const again = mount(app);

    expect(page(again)).toBe('summary');
  });

  it('練到一半直接跳走，那一輪照樣封存，回來看得到已經拼完的那幾題', () => {
    const app = makeApp();
    const first = mount(app);
    press(first, '開始');

    // 拼完第一題就跳去別的畫面——不按「結束」，整棵樹被丟掉，沒有人通知這一頁。
    fillSlots(first);
    vi.advanceTimersByTime(2000);
    document.body.replaceChildren();

    const back = mount(app);

    expect(page(back)).toBe('summary');
    // 分母的 1 是重點：拼完的那一題在裡面。只在收工時封存的話這裡會是 0 / 0，
    // 中途跳走等於白練。分子是 0 因為 `fillSlots()` 照磚的順序硬填，拼出來的是錯的。
    expect(back.querySelector('.tile-num')!.textContent).toBe('0 / 1');
  });

  it('一題都還沒拼完就跳走，不會拿上一輪的成績冒充這一輪', () => {
    const app = makeApp();
    const first = mount(app);
    press(first, '開始');
    press(first, '結束');
    press(first, '再一輪');

    // 新的一輪還沒有任何一題結算過，這時跳走就是白練一場。
    document.body.replaceChildren();

    expect(page(mount(app))).toBe('books');
  });

  it('按「換單字本」回挑書頁之後，那一輪就放掉了', () => {
    const app = makeApp();
    const root = mount(app);
    press(root, '開始');
    press(root, '結束');

    press(root, '換單字本');
    expect(page(root)).toBe('books');

    // 人已經在挑下一批要練什麼了，上一輪的成績再擺著只會擋路。
    expect(page(mount(app))).toBe('books');
  });
});

describe('一輪怎麼跑完', () => {
  it('挑好按「開始」進答題頁，每一張卡都出過一次之後自動跳出成績', () => {
    const root = mount(makeApp());

    press(root, '開始');
    expect(page(root)).toBe('answer');

    // 兩張卡各一題。收尾之後會停留一下再進下一題，因此每一題都要把那段快轉掉。
    fillSlots(root);
    vi.advanceTimersByTime(2000);
    expect(page(root)).toBe('answer');

    fillSlots(root);
    vi.advanceTimersByTime(2000);

    expect(page(root)).toBe('summary');
  });

  it('中途按「結束」也跳出成績，正在拼的那一題不算進去', () => {
    const root = mount(makeApp());
    press(root, '開始');

    press(root, '結束');

    expect(page(root)).toBe('summary');
    // 一題都還沒結算，因此是 0 / 0——正在拼的那一題沒被拼錯，只是還沒發生。
    expect(root.querySelector('.tile-num')!.textContent).toBe('0 / 0');
  });
});

describe('成績頁底下那兩顆', () => {
  it('「再一輪」直接回答題頁，不會先跑去挑書那頁', () => {
    const root = mount(makeApp());
    press(root, '開始');
    press(root, '結束');

    press(root, '再一輪');

    expect(page(root)).toBe('answer');
  });

  it('「再一輪」開的是同一批單字本，不是上一輪那幾張卡的複本', () => {
    const app = makeApp();
    const root = mount(app);
    press(root, '開始');
    press(root, '結束');

    // 中途去卡片頁加的卡，下一輪就該吃得到——所以是重新讀一次那幾本，不是把舊的再洗一次。
    app.data.cards.push(card('c3', 'あめ', '雨', 'b1'));
    press(root, '再一輪');
    fillSlots(root);
    vi.advanceTimersByTime(2000);
    fillSlots(root);
    vi.advanceTimersByTime(2000);
    expect(page(root)).toBe('answer');

    fillSlots(root);
    vi.advanceTimersByTime(2000);

    // 三張卡三題，第三題結算完才跳成績。只洗舊的兩張的話，上一步就已經到成績頁了。
    expect(page(root)).toBe('summary');
  });

  it('「再一輪」時那幾本已經一張卡都拿不出來，就退回挑書頁，不停在空的答題頁', () => {
    const app = makeApp();
    const root = mount(app);
    press(root, '開始');
    press(root, '結束');

    app.data.cards.length = 0;
    press(root, '再一輪');

    expect(page(root)).toBe('books');
  });

  it('「換單字本」回挑書頁，上次挑的那幾本仍然勾著', () => {
    const app = makeApp();
    const root = mount(app);
    press(root, '開始');
    press(root, '結束');

    press(root, '換單字本');

    // 選單第一列是「全部」，本名從第二列起算，因此照本名挑出來對，不數列數。
    const ticked = [...root.querySelectorAll<HTMLElement>('.book-filter-item')]
      .filter((item) => item.querySelector<HTMLInputElement>('input')!.checked)
      .map((item) => item.querySelector('.book-filter-name')!.textContent);

    for (const book of BOOKS) expect(ticked).toContain(book.name);
  });
});

describe('這一條線碰不到的東西', () => {
  const source = readFileSync('src/ui/spelling-home.ts', 'utf8');

  it('成績不落地：入口自己不 import storage.ts，接進來的三頁也沒有', () => {
    // spec 決定 26 與 `ADR-0021`。三頁互相認得，只要有一頁破例，整條線就等於碰了排程。
    expect(source).not.toMatch(/from '@core\/lib\/storage'/);

    const imports = [...source.matchAll(/from '\.\/([a-z-]+)'/g)].map((hit) => hit[1]!);
    const reached = imports.map((name) => readFileSync(`src/ui/${name}.ts`, 'utf8'));
    expect(imports).not.toContain('review-view');
    for (const neighbour of reached) {
      expect(neighbour).not.toMatch(/from '@core\/lib\/storage'/);
    }
  });

  it('那一輪不寫進本機任何一格，重整之後就沒了', () => {
    // spec 決定 26。拼字這條線只有「挑了哪幾本」那一格會落地，而那一格走注入的
    // `app.spellingBooks`（票 04）；畫面自己一行都不該直接碰瀏覽器的儲存空間。
    for (const name of ['spelling-home', 'spelling-summary', 'spelling-view']) {
      expect(readFileSync(`src/ui/${name}.ts`, 'utf8')).not.toMatch(/localStorage|sessionStorage/);
    }
  });
});
