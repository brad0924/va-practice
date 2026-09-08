// @vitest-environment jsdom

/**
 * 拼字成績頁（票 05）。
 *
 * 拼字不動排程（`ADR-0021`），所以這一頁是這個玩法唯一留下來的東西：它得回答「我哪幾個字
 * 沒記熟，錯在哪一格」。測的就是這句話拆出來的幾件事——三格數字對不對、該列的列了沒、
 * 不該列的有沒有溜進來、兩顆鈕接去哪裡。
 *
 * 真正的算術（平均除的是全部題數而不是拼對的題數）住在 `core/lib/spelling.ts` 的
 * `summary()`，由 `spelling.test.ts` 釘住；這裡驗的是「畫面有沒有照著印」。
 *
 * 刻意不測的：
 * - **顏色**。拼錯那一格是紅的、對應的正解是綠的，全是版面，`ADR-0014` 明文不斷言，
 *   jsdom 也沒有真的算色。改成測 `toneOf()`——那條規則離開 DOM 照樣成立，
 *   斷言得下去；顏色本身靠眼睛。
 * - **兩排上下對齊**。對齊是 `.missed` 那條兩欄格線的事，jsdom 量不出來。
 *   這裡只驗兩排的格數相同，那是對齊的前提。
 * - **錯十張時整塊可以捲**。同上，那是高度。
 */

import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { App } from '../app';
import { spellingSummaryView, toneOf } from './spelling-summary';
import type { Result, Round } from '@core/lib/spelling';
import type { Card } from '@core/lib/types';

function card(id: string, meaning: string): Card {
  return { id, bookId: 'b1', text: id, meaning, interval: null, ease: 2.5, due: null };
}

/**
 * 手捏一題的結果。`filled` 短於 `answer` 時代表逾時沒拼完，補成空字串——
 * `settle()` 吐出來的就是這個形狀。
 */
function result(meaning: string, answer: string, filled: string, points: number): Result {
  const cells = [...answer];
  return {
    card: card(meaning, meaning),
    answer: cells,
    filled: cells.map((_, i) => [...filled][i] ?? ''),
    correct: filled === answer,
    points,
  };
}

function roundOf(...results: Result[]): Round {
  return { questions: [], index: 0, slots: [], results };
}

/**
 * 票上那個例子：12 題、拼對 9 題、總分 76、平均 6.3。
 *
 * 分數刻意不是整除的（8 題 9 分加 1 題 4 分），這樣「76 ÷ 12 = 6.3」與「76 ÷ 9 = 8.4」
 * 才分得出來——平均除錯分母時，這一組會直接看得見。
 */
function twelveQuestions(): Round {
  const correct = [
    ...Array.from({ length: 8 }, (_, i) => result(`對${i}`, 'こが', 'こが', 9)),
    result('對8', 'こが', 'こが', 4),
  ];
  return roundOf(
    ...correct,
    // 濁音干擾：が 拼成 か。
    result('燒焦、烤焦', 'こがす', 'こかす', 0),
    result('山頂', 'とうげ', 'どうげ', 0),
    // 逾時：後面四格沒填到。
    result('是食物', 'たべものです', 'たべ', 0),
  );
}

let again = 0;
let pickBooks = 0;

function mount(round: Round): HTMLElement {
  again = 0;
  pickBooks = 0;
  const app = {
    data: { version: 3, books: [], cards: [], scopes: { review: [], list: [], stats: [] }, updatedAt: 0 },
    now: () => new Date(),
    keyHandler: (() => {}) as App['keyHandler'],
  } as unknown as App;

  const screen = spellingSummaryView(
    app,
    round,
    () => {
      again += 1;
    },
    () => {
      pickBooks += 1;
    },
  );
  document.body.replaceChildren(screen);
  return screen;
}

const tileNums = (screen: HTMLElement) =>
  [...screen.querySelectorAll('.tile-num')].map((node) => node.textContent);
const tileLabels = (screen: HTMLElement) =>
  [...screen.querySelectorAll('.tile-label')].map((node) => node.textContent);
const blocks = (screen: HTMLElement) => [...screen.querySelectorAll<HTMLElement>('.missed')];
const rows = (block: HTMLElement) =>
  [...block.querySelectorAll<HTMLElement>('.slots')].map((row) =>
    [...row.querySelectorAll('.slot')].map((cell) => cell.textContent),
  );

function press(screen: HTMLElement, label: string): void {
  const found = [...screen.querySelectorAll('button')].find((node) => node.textContent === label);
  if (found === undefined) throw new Error(`畫面上找不到「${label}」`);
  found.click();
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('頂上三格', () => {
  it('分別是拼對題數、總分、平均分，每格都有自己的標籤', () => {
    const screen = mount(twelveQuestions());

    expect(tileNums(screen)).toEqual(['9 / 12', '76', '6.3']);
    // 三個數字擺在一起時，沒有標籤就得猜「6.3」是分還是秒。
    expect(tileLabels(screen)).toEqual(['拼對', '總分', '平均']);
  });

  it('平均是總分除以全部題數，不是除以拼對的題數', () => {
    const screen = mount(twelveQuestions());

    // 76 ÷ 12 = 6.3。除錯分母的話會印 76 ÷ 9 = 8.4（spec 決定 23）。
    expect(tileNums(screen)[2]).toBe('6.3');
  });

  it('一題都沒結算就跳出來時三格都是 0，不當機也不印 NaN', () => {
    const screen = mount(roundOf());

    expect(tileNums(screen)).toEqual(['0 / 0', '0', '0.0']);
  });
});

describe('逐格對照', () => {
  it('每一張沒拼對的卡都列出來，拼對的一張都不列', () => {
    const screen = mount(twelveQuestions());

    const meanings = blocks(screen).map(
      (block) => block.querySelector('.missed-meaning')!.textContent,
    );
    expect(meanings).toEqual(['燒焦、烤焦', '山頂', '是食物']);
  });

  it('每一塊都有「你拼的」與「正解」兩排，兩排格數相同', () => {
    const screen = mount(twelveQuestions());

    // 格數相同是上下對齊的前提；對齊本身是 `.missed` 那條兩欄格線的事，jsdom 量不出來。
    for (const block of blocks(screen)) {
      const [typed, answer] = rows(block);
      expect(typed).toHaveLength(answer!.length);
    }
  });

  it('「你拼的」那一排印使用者當時填的，「正解」那一排印正解', () => {
    const screen = mount(twelveQuestions());

    // 拼成 こかす，正解是 こがす——濁音干擾要一眼看得到，兩排就得各印各的。
    expect(rows(blocks(screen)[0]!)).toEqual([
      ['こ', 'か', 'す'],
      ['こ', 'が', 'す'],
    ]);
  });

  it('逾時沒填到的位置是空格子，不補問號也不整排消失', () => {
    const screen = mount(twelveQuestions());

    const [typed, answer] = rows(blocks(screen)[2]!);
    // 使用者看得出自己拼到哪裡就停了（票 05 決定 5）。虛線是空 `.slot` 本來就有的樣子。
    expect(typed).toEqual(['た', 'べ', '', '', '', '']);
    expect(answer).toEqual(['た', 'べ', 'も', 'の', 'で', 'す']);
  });

  it('一張都沒拼錯時主體是一句話，不是一塊空白', () => {
    const screen = mount(roundOf(result('對', 'こが', 'こが', 10)));

    expect(blocks(screen)).toHaveLength(0);
    expect(screen.querySelector('.missed-none')!.textContent).toContain('全部拼對');
  });
});

describe('哪一格該標起來', () => {
  // 顏色是版面，`ADR-0014` 不准斷言；規則離開 DOM 照樣成立，因此拉出來直接測。
  const kogasu = result('燒焦、烤焦', 'こがす', 'こかす', 0);

  it('填錯的那一格算 wrong，同一格的正解算 right', () => {
    expect(toneOf(kogasu, 1, 'filled')).toBe('wrong');
    expect(toneOf(kogasu, 1, 'answer')).toBe('right');
  });

  it('填對的那幾格兩排都中性，不與錯的那一格搶注意', () => {
    expect(toneOf(kogasu, 0, 'filled')).toBe('plain');
    expect(toneOf(kogasu, 0, 'answer')).toBe('plain');
  });

  it('逾時沒填到的那一格兩排都中性，不當成拼錯', () => {
    const tabemono = result('是食物', 'たべものです', 'たべ', 0);

    // 決定 4 只點名「錯的那一格」與它對應的正解，其餘一律中性；沒填到的不是拼錯的。
    // 答題畫面收尾時對同一種情況也是中性（票 03 的 `.slot.done.missed`）。
    expect(toneOf(tabemono, 2, 'filled')).toBe('plain');
    expect(toneOf(tabemono, 2, 'answer')).toBe('plain');
  });
});

describe('底下兩顆鈕', () => {
  it('「再一輪」與「換單字本」各自呼叫自己那一支，不互相串線', () => {
    const screen = mount(twelveQuestions());

    press(screen, '再一輪');
    expect([again, pickBooks]).toEqual([1, 0]);

    press(screen, '換單字本');
    expect([again, pickBooks]).toEqual([1, 1]);
  });
});

describe('這一頁碰不到的東西', () => {
  // 走專案根目錄的相對路徑，不走 `import.meta.url`：jsdom 底下那個值不是 file: 開頭。
  const source = readFileSync('src/ui/spelling-summary.ts', 'utf8');

  it('鍵盤按任何鍵都沒有反應', () => {
    const app = {
      data: { version: 3, books: [], cards: [], scopes: { review: [], list: [], stats: [] }, updatedAt: 0 },
      keyHandler: (() => {}) as App['keyHandler'],
    } as unknown as App;
    spellingSummaryView(app, roundOf(), () => {}, () => {});

    // 拼字整條線都不做鍵盤操作（spec 決定 25）。明寫成 null 而不是留白——
    // 留白會讓上一個畫面的處理器活到這一頁來。
    expect(app.keyHandler).toBeNull();
  });

  it('成績不落地：沒有 import storage.ts，也沒有呼叫 applyData()', () => {
    // spec 決定 26。釘的是 import 而不是 `storage` 那個字：這支 repo 的註解很愛提檔名。
    expect(source).not.toMatch(/from '@core\/lib\/storage'/);
    expect(source).not.toMatch(/applyData\(/);
  });

  it('也不從別的畫面繞路 import 到 storage.ts', () => {
    // 擋的是「自己這支很乾淨，但 import 進來的那支不乾淨」，與 `spelling-view.test.ts`
    // 那一條同一個立場（`ADR-0021`）。
    const imports = [...source.matchAll(/from '\.\/([a-z-]+)'/g)].map((hit) => hit[1]!);
    const reached = imports.map((name) => readFileSync(`src/ui/${name}.ts`, 'utf8'));

    expect(imports).not.toContain('review-view');
    for (const neighbour of reached) {
      expect(neighbour).not.toMatch(/from '@core\/lib\/storage'/);
    }
  });
});

beforeEach(() => {
  document.body.replaceChildren();
});
