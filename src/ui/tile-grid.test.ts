/**
 * 磚的格線（票 08 決定 3）。
 *
 * 這一支沒有檔頭的 jsdom 宣告，跑在 node 環境——它本來就不碰 DOM，場地多大是呼叫端量好
 * 遞進來的。`ADR-0014` 說 jsdom 量不出版面，因此「橫向時磚該怎麼排」唯一測得動的形狀
 * 就是把算法擠成一支純函式，在這裡釘住。
 *
 * 刻意不測的：磚真的擺在哪、有沒有疊到、有沒有出界。那要有排版才問得出來，是實機的事。
 */

import { describe, it, expect } from 'vitest';
import { tileGrid } from './tile-grid';

describe('十二塊磚', () => {
  it('寬場地排成四欄三列', () => {
    // iPhone 直握 375×667 時量到的場地（票 03）。
    expect(tileGrid(12, 351, 379)).toEqual({ cols: 4, rows: 3 });
  });

  it('窄高場地排成三欄四列', () => {
    // 同一支手機橫握切成兩欄之後，右半邊那塊場地。
    expect(tileGrid(12, 222, 307)).toEqual({ cols: 3, rows: 4 });
  });

  it('越窄越高欄數越少，不會反過來', () => {
    const wide = tileGrid(12, 400, 200).cols;
    const square = tileGrid(12, 300, 300).cols;
    const tall = tileGrid(12, 150, 400).cols;
    expect(wide).toBeGreaterThan(square);
    expect(square).toBeGreaterThan(tall);
  });
});

describe('正方形場地', () => {
  /**
   * 這一條是**防止直握被改到**的那道鎖。原本的算法是 `Math.ceil(Math.sqrt(n))`，
   * 新的式子只是把場地長寬比乘進去；長寬比等於 1 時兩條必須完全重合，
   * 否則現有的每一種題目都會在直握時換一個排法。
   */
  it('跟原本那條 ceil(sqrt(n)) 算出來的一模一樣', () => {
    for (let count = 1; count <= 24; count += 1) {
      const cols = Math.ceil(Math.sqrt(count));
      expect(tileGrid(count, 300, 300)).toEqual({ cols, rows: Math.ceil(count / cols) });
    }
  });
});

describe('量不到場地', () => {
  /**
   * 呼叫端在畫面還沒排版時就量，兩個邊會是 0。除下去會變成 Infinity 或 NaN，
   * 那個值一路灌進 CSS 變數就滿頁空白。退回正方形的算法，畫面照樣看得到磚。
   */
  it('寬或高是 0 時退回正方形的算法', () => {
    expect(tileGrid(12, 0, 0)).toEqual({ cols: 4, rows: 3 });
    expect(tileGrid(12, 351, 0)).toEqual({ cols: 4, rows: 3 });
    expect(tileGrid(12, 0, 379)).toEqual({ cols: 4, rows: 3 });
  });

  it('一塊磚都沒有時吐得出一個排得下去的格線', () => {
    expect(tileGrid(0, 351, 379)).toEqual({ cols: 1, rows: 1 });
  });
});

describe('極端的長寬比', () => {
  it('欄數不超過磚數，最後一列不會是空的', () => {
    const { cols, rows } = tileGrid(3, 2000, 20);
    expect(cols).toBe(3);
    expect(rows).toBe(1);
  });

  it('再怎麼窄也至少有一欄', () => {
    expect(tileGrid(5, 10, 2000)).toEqual({ cols: 1, rows: 5 });
  });
});
