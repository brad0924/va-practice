// @vitest-environment jsdom

/**
 * 三語冒煙測試（票 07）：三種語言各開一次 app，走過五個主要畫面，只檢查兩件事——
 * 沒有拋出例外、畫面上沒有漏出原始 key。
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

import { describe, it, expect, beforeEach, vi } from 'vitest';
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

/** 用這種語言開一次 app，回傳它畫進去的那一格。 */
function boot(lang: Lang): HTMLElement {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED));
  localStorage.setItem('va-practice:lang', lang);
  const root = document.createElement('div');
  document.body.append(root);
  // 雲端備份記暱稱密碼的地方。網頁版遞的就是 localStorage（見 main.ts）；沒登入就一個請求都不發。
  start(root, localStorage);
  return root;
}

/** 照使用者的走法按過去：畫面上找得到那顆鈕才按得下去。 */
function click(root: HTMLElement, label: string): void {
  const found = [...root.querySelectorAll('button')].find((button) => button.textContent === label);
  if (found === undefined) throw new Error(`畫面上找不到「${label}」`);
  found.click();
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
  it('五個主要畫面都畫得出來，畫面上沒有原始 key', () => {
    const root = boot(lang);
    expect(leakedKeys(root)).toEqual([]); // 複習：未掀答案

    // 掀開答案才長得出那四顆評分鈕，而 `review-view.ts` 的 `RATING_BUTTONS` 正是
    // 「label 存 key、渲染時才查表」那種寫法——這張票要保護的就是它，不能不畫到。
    click(root, table['review.showAnswer']);
    expect(leakedKeys(root)).toEqual([]); // 複習：已掀答案

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
