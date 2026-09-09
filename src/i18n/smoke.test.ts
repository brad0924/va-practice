// @vitest-environment jsdom

/**
 * 三語冒煙測試（票 07）：三種語言各開一次 app，走過每一個畫面，只檢查兩件事——
 * 沒有拋出例外、畫面上沒有漏出原始 key。
 *
 * 拼字算三個畫面，不是一個：挑單字本、答題、成績各自查自己那一批字，
 * 漏走一個狀態就等於漏掉一整頁（票 `spelling-practice/07` 決定 5——與開頭那個「票 07」
 * 不是同一張，那是 `i18n/07`）。
 *
 * 它抓的是**「程式某處拿顯示文字去做判斷」**：那種寫法在中文下會過，切到英文靜默失效，
 * TypeScript 型別擋不到，其餘測試也碰不到（它們固定跑繁體中文，見 `test-setup.ts`）。
 * 前提是那個判斷會爆掉或把 key 印到畫面上——純粹靜靜走錯分支的，這兩項檢查看不到。
 *
 * 刻意不做的：
 * - **不驗漏譯**。三支翻譯檔的 key 由型別釘住，`tsc --noEmit` 在建置時就擋掉了（票 02）。
 * - **不驗版面**。jsdom 沒有真實排版與字型，英文太長把按鈕撐爆這裡看不到，那要靠票 08 的實機驗證。
 * - **不驗翻得對不對**。機器判斷不了。
 * - **不把其餘測試改成跑三遍**。收益只剩上面那一項，成本卻是測試時間 ×3（spec 決定十一）。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { start } from '../app';
import { STORAGE_KEY } from '@core/lib/storage';
import type { StorageLike } from '@core/lib/storage';
import type { AppData } from '@core/lib/types';
import type { Lang } from '@core/i18n';
import zhHant from '@core/i18n/zh-Hant';
import en from '@core/i18n/en';
import ja from '@core/i18n/ja';

/**
 * 自己造的一份資料，刻意讓每一個字都不像 key——單字本名、詞條、釋義全是日文與中文，
 * 不可能長成 `區塊.名稱` 那種帶點的英數字串，底下的判斷式因此不必為誤判多寫任何一行。
 *
 * 兩張卡而不是一張：一張沒複習過（`interval` 為 null），一張早就到期，
 * 卡片列表與統計畫面的分桶才不會整片都是空的。
 */
const SEED = {
  version: 3,
  books: [{ id: 'b1', name: '日本語テスト' }],
  cards: [
    { id: 'c1', bookId: 'b1', text: '焦[こ]がす', meaning: '烤焦', interval: null, ease: 2.5, due: null },
    { id: 'c2', bookId: 'b1', text: '峠[とうげ]', meaning: '山頂', interval: 4, ease: 2.5, due: '2020-01-01' },
  ],
  scopes: { review: ['b1'], list: ['b1'], stats: ['b1'] },
  updatedAt: 0,
} satisfies AppData;

/** key 的長相：`區塊.名稱`，帶點的英數字串（票 02 定案）。 */
const KEY_SHAPED = /^[a-z]+\.[a-zA-Z]+$/;

beforeEach(() => {
  // 為了拼字答題頁那兩支計時器（碼表、收尾之後停留一下）。三種語言各真的等一次
  // 一秒半太貴，而等待本身跟這支要看的事無關。整支檔案一起凍住，其餘畫面不在乎。
  // 與 `app.test.ts` 的〈導覽〉同一個作法。
  vi.useFakeTimers();
  const cells = new Map<string, string>();
  const fake: StorageLike = {
    getItem: (key) => cells.get(key) ?? null,
    setItem: (key, value) => {
      cells.set(key, value);
    },
    removeItem: (key) => {
      cells.delete(key);
    },
  };
  vi.stubGlobal('localStorage', fake);
  document.body.replaceChildren();
});

afterEach(() => {
  // 先把畫面拆掉再收假時鐘：答題頁的碼表靠 `isConnected` 自癒，脫離文件的那一下才停。
  document.body.replaceChildren();
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

/** 用這種語言開一次 app，回傳它畫進去的那一格。 */
function boot(lang: Lang): HTMLElement {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED));
  localStorage.setItem('va-practice:lang', lang);
  const root = document.createElement('div');
  document.body.append(root);
  start(root);
  return root;
}

/** 照使用者的走法按過去：畫面上找得到那顆鈕才按得下去。 */
function click(root: HTMLElement, label: string): void {
  const found = [...root.querySelectorAll('button')].find((button) => button.textContent === label);
  if (found === undefined) throw new Error(`畫面上找不到「${label}」`);
  found.click();
}

/**
 * 這一頁上每一顆鈕的字。拿它認人用——走錯頁時底下的 `fillSlots()` 會靜靜地什麼都不做，
 * 畫面上當然也就抓不到 key，整段等於白走一趟卻照樣是綠的。
 */
function buttonLabels(root: HTMLElement): (string | null)[] {
  return [...root.querySelectorAll('button')].map((button) => button.textContent);
}

/**
 * 把答題頁上這一題填滿：照磚的順序硬點下去。**拼得對不對不重要**——
 * 這裡要的只是讓收尾那一行字長出來。它走的是 `spelling-view.ts` 的 `OUTCOMES`，
 * 與 `RATING_BUTTONS` 同一種「label 存 key、渲染時才查表」的寫法，正是這支要保護的東西。
 *
 * 與 `app.test.ts`、`spelling-home.test.ts` 同一支。三份都黏著 `.kana-tile` 與 `.slot`
 * 這兩個 class，那兩個名字改了要三處一起動。
 */
function fillSlots(root: HTMLElement): void {
  for (const tile of root.querySelectorAll<HTMLButtonElement>('.kana-tile')) {
    if (root.querySelectorAll('.slot:empty').length === 0) break;
    if (!tile.disabled) tile.click();
  }
}

/**
 * 這個畫面上有沒有漏出原始 key。
 *
 * 逐個文字節點看而不是整片 `root.textContent`：後者會把相鄰元素的字黏成一串
 * （「共 2 張」＋「順序」→「共 2 張順序」），真的漏出來的 key 兩頭被黏住就不再是獨立字串了。
 */
function leakedKeys(root: HTMLElement): string[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const found: string[] = [];
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    found.push(...(node.textContent ?? '').split(/\s+/).filter((word) => KEY_SHAPED.test(word)));
  }
  return found;
}

/** 三種語言各配一份翻譯檔：導覽要按的那幾顆鈕，各語言上的字都不一樣。 */
const LANGUAGES: [Lang, typeof zhHant][] = [
  ['zh-Hant', zhHant],
  ['en', en],
  ['ja', ja],
];

describe.each(LANGUAGES)('%s', (lang, table) => {
  it('每一個畫面都畫得出來，畫面上沒有原始 key', () => {
    const root = boot(lang);
    expect(leakedKeys(root)).toEqual([]); // 複習：未掀答案

    // 掀開答案才長得出那四顆評分鈕，而 `review-view.ts` 的 `RATING_BUTTONS` 正是
    // 「label 存 key、渲染時才查表」那種寫法——這張票要保護的就是它，不能不畫到。
    click(root, table['review.showAnswer']);
    expect(leakedKeys(root)).toEqual([]); // 複習：已掀答案

    click(root, table['nav.spelling']);
    expect(leakedKeys(root)).toEqual([]); // 拼字：挑單字本

    click(root, table['spelling.start']);
    expect(buttonLabels(root)).toContain(table['spelling.quit']);
    expect(leakedKeys(root)).toEqual([]); // 拼字：答題

    // 兩張卡都出得了題，因此題數就是卡數；最後一題收完自動跳成績。
    for (let asked = 0; asked < SEED.cards.length; asked += 1) {
      fillSlots(root);
      expect(leakedKeys(root)).toEqual([]); // 拼字：答題（已收尾）
      // 收尾的那一下碼表就停了，此時待辦的只剩「停留一下再進下一題」那一支，
      // 跑掉它就等於快轉那一段。時間長度不寫死在這裡，改了那個常數這支不必跟著改。
      vi.runOnlyPendingTimers();
    }
    expect(buttonLabels(root)).toContain(table['spelling.again']);
    expect(leakedKeys(root)).toEqual([]); // 拼字：成績

    click(root, table['nav.cards']);
    expect(leakedKeys(root)).toEqual([]); // 卡片列表

    click(root, table['nav.add']);
    expect(leakedKeys(root)).toEqual([]); // 編輯

    click(root, table['editor.cancel']);
    click(root, table['nav.data']);
    expect(leakedKeys(root)).toEqual([]); // 資料

    click(root, table['nav.stats']);
    expect(leakedKeys(root)).toEqual([]); // 統計
  });
});
