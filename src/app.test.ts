// @vitest-environment jsdom

/**
 * 從 `start()` 演起的兩件事。各畫面自己的行為都有各自的測試，不必從開機演；
 * 收在這裡的是**跨了好幾段、中間任何一段斷掉都只有真的走一遍才看得出來**的那些：
 *
 * - 換語言之後畫面立刻變（票 04 驗收），也是 `app.setLang()` 唯一的覆蓋——
 *   那條接線是票 02 拉的，當時還沒有呼叫者（見票 02 的 Comments）。
 * - 跨過午夜之後佇列會重建（`.scratch/date-rollover/issues/01`）。那條路從
 *   「訊號進來」到「畫面上的數字變了」跨了訊號、檢查、重建、重畫四段。
 *
 * 這裡不碰網路：沒登入的雲端備份一個請求都不發（`cloud.begin()` 在未登入時什麼都不做）。
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { start } from './app';
import type { StorageLike } from '@core/lib/storage';
import zhHant from '@core/i18n/zh-Hant';
import en from '@core/i18n/en';
import ja from '@core/i18n/ja';

/**
 * 這台「裝置」的本機儲存。`start()` 直接碰全域的 `localStorage`，而這個環境裡沒有
 * 真的那一個（Node 的實驗性 `localStorage` 蓋掉了 jsdom 的，兩邊都是 undefined），
 * 因此換一份記在 Map 裡的假貨進去。每支測試一份新的，等同一台剛拿到手的裝置。
 */
let cells = new Map<string, string>();

beforeEach(() => {
  cells = new Map();
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

/** 開一次 app，回傳它畫進去的那一格。 */
function boot(): HTMLElement {
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

function langSelect(root: HTMLElement): HTMLSelectElement {
  const select = root.querySelector('select');
  if (select === null) throw new Error('資料畫面上找不到語言選單');
  return select;
}

/** 單字本那一區的新增鈕。三種語言各自不同，是這輪唯一分辨得出語言的字（票 03）。 */
function addBookLabel(root: HTMLElement): string | null {
  return root.querySelector('.book-add')?.textContent ?? null;
}

describe('換介面語言', () => {
  it('選了日文之後當前畫面立刻變，不用重開', () => {
    localStorage.setItem('va-practice:lang', 'zh-Hant');
    const root = boot();
    click(root, zhHant['nav.cards']);
    click(root, zhHant['nav.data']);
    expect(addBookLabel(root)).toBe(zhHant['books.addButton']);

    const select = langSelect(root);
    select.value = 'ja';
    select.dispatchEvent(new Event('change'));

    expect(addBookLabel(root)).toBe(ja['books.addButton']);
    // 還停在資料畫面上，選單也記得剛選的那一個——重畫不是跳回開頭。
    expect(langSelect(root).value).toBe('ja');
  });

  it('選擇記在這台裝置上，重開之後還在', () => {
    localStorage.setItem('va-practice:lang', 'zh-Hant');
    const first = boot();
    click(first, zhHant['nav.cards']);
    click(first, zhHant['nav.data']);
    const select = langSelect(first);
    select.value = 'ja';
    select.dispatchEvent(new Event('change'));
    expect(localStorage.getItem('va-practice:lang')).toBe('ja');

    // 重開一次：同一份 localStorage，全新的畫面。
    document.body.replaceChildren();
    const second = boot();
    click(second, ja['nav.cards']);
    click(second, ja['nav.data']);

    expect(addBookLabel(second)).toBe(ja['books.addButton']);
    expect(langSelect(second).value).toBe('ja');
  });

  it('選「系統預設」時那一格存的是 system，介面跟著裝置語言走', () => {
    localStorage.setItem('va-practice:lang', 'ja');
    const root = boot();
    click(root, ja['nav.cards']);
    click(root, ja['nav.data']);

    const select = langSelect(root);
    select.value = 'system';
    select.dispatchEvent(new Event('change'));

    expect(localStorage.getItem('va-practice:lang')).toBe('system');
    // jsdom 這台「裝置」的語言是 en-US，主碼 en，因此落到英文那一份。
    expect(addBookLabel(root)).toBe(en['books.addButton']);
  });
});

// ── 跨過午夜 ──────────────────────────────────────────────────

const BOOK = { id: 'book-1', name: '單字本' };

/**
 * 把一批卡寫進這台裝置，一個到期日一張。`null` 是新卡。
 * 詞條與釋義只要彼此分得出來就夠，這一輪的重點不在字上。
 */
function seed(dues: (string | null)[]): void {
  const cards = dues.map((due, index) => ({
    id: `card-${index + 1}`,
    bookId: BOOK.id,
    text: `語${index + 1}`,
    meaning: `意思${index + 1}`,
    interval: due === null ? null : 1,
    ease: 2.5,
    due,
  }));
  localStorage.setItem(
    'va-practice:data',
    JSON.stringify({
      version: 3,
      books: [BOOK],
      cards,
      scopes: { review: [BOOK.id], list: [BOOK.id], stats: [BOOK.id] },
      updatedAt: 0,
    }),
  );
}

/** 演一次「分頁切回來」。 */
function foreground(): void {
  document.dispatchEvent(new Event('visibilitychange'));
}

/** 按下四個評分之一。評分鈕的文字後面還跟著一格快捷鍵提示，因此照 class 找。 */
function rate(root: HTMLElement, rating: string): void {
  const found = root.querySelector<HTMLButtonElement>(`.rating-${rating}`);
  if (found === null) throw new Error(`畫面上找不到「${rating}」那顆評分鈕`);
  found.click();
}

/**
 * 盯著洗牌用的亂數。洗牌是建佇列唯一會用到亂數的地方，因此「一次都沒抽」
 * 就等於「一次都沒重建」——從畫面上分辨不出來，重建會保住手上那張，
 * 隊首在重建與沒重建兩種情況下都一樣。
 *
 * **必須在 `boot()` 之前接上。** `start()` 在開機的那一刻就把 `Math.random`
 * 抓進手裡（`const random = Math.random`），晚一步換掉的話 app 內的洗牌根本
 * 不經過這個 spy，`not.toHaveBeenCalled()` 就成了一句恆真的空話。
 */
function watchShuffle() {
  return vi.spyOn(Math, 'random');
}

/** 複習畫面標題列上的剩餘張數。 */
function remaining(root: HTMLElement): number {
  const text = root.querySelector('.remaining')?.textContent ?? '';
  return Number(/\d+/.exec(text)?.[0]);
}

/** 目前這張卡的詞條，今日份完成時為 null。 */
function currentTerm(root: HTMLElement): string | null {
  return root.querySelector('.term')?.textContent ?? null;
}

/** 卡片列表上某一桶的張數。 */
function bucketCount(root: HTMLElement, key: string): number {
  return Number(root.querySelector(`.bucket-head.${key} .bucket-count`)?.textContent);
}

/** 統計畫面到期分佈裡某一桶的張數。 */
function statsCount(root: HTMLElement, key: string): number {
  return Number(root.querySelector(`.bar-row.${key} .bar-row-count`)?.textContent);
}

describe('跨過午夜', () => {
  beforeEach(() => {
    // 只換掉 Date，setTimeout 那些維持真的——這一輪要動的是「今天是幾號」，
    // 把計時器一起換掉會連累雲端與吐司那些沒關係的東西。
    vi.useFakeTimers({ toFake: ['Date'] });
    localStorage.setItem('va-practice:lang', 'zh-Hant');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('跨過午夜後回到前景，當日新到期的卡出現在佇列裡', () => {
    vi.setSystemTime(new Date(2026, 7, 17, 23, 50));
    seed(['2026-08-17', '2026-08-18', '2026-08-18', '2026-08-18']);
    const root = boot();
    expect(remaining(root)).toBe(1);

    // 把 8/17 那份做完，畫面顯示今日份完成。
    click(root, zhHant['review.showAnswer']);
    rate(root, 'good');
    expect(remaining(root)).toBe(0);

    vi.setSystemTime(new Date(2026, 7, 18, 0, 5));
    foreground();

    expect(remaining(root)).toBe(3);
    expect(currentTerm(root)).not.toBeNull();
  });

  it('跨過午夜後不切走 app、直接評分，評的是當日的佇列', () => {
    vi.setSystemTime(new Date(2026, 7, 17, 23, 50));
    seed(['2026-08-17', '2026-08-18', '2026-08-18']);
    const root = boot();
    click(root, zhHant['review.showAnswer']);
    const inHand = currentTerm(root);

    vi.setSystemTime(new Date(2026, 7, 18, 0, 5));
    rate(root, 'good');

    // 評掉的是手上那張（8/17 那張），8/18 那兩張補進來。
    expect(remaining(root)).toBe(2);
    expect(currentTerm(root)).not.toBe(inHand);
  });

  it('日期沒變時回到前景不重建佇列，順序不被重洗', () => {
    vi.setSystemTime(new Date(2026, 7, 17, 9, 0));
    seed(['2026-08-17', '2026-08-17', '2026-08-17', '2026-08-17', '2026-08-17']);
    const shuffle = watchShuffle();
    const root = boot();
    click(root, zhHant['review.showAnswer']);
    const inHand = currentTerm(root);

    shuffle.mockClear();
    foreground();
    foreground();

    expect(shuffle).not.toHaveBeenCalled();
    expect(remaining(root)).toBe(5);
    expect(currentTerm(root)).toBe(inHand);
    // 答案還掀著。
    expect(root.querySelector('.meaning')).not.toBeNull();
  });

  it('日期沒變時評分不重建佇列', () => {
    vi.setSystemTime(new Date(2026, 7, 17, 9, 0));
    seed(['2026-08-17', '2026-08-17', '2026-08-17', '2026-08-17', '2026-08-17']);
    const shuffle = watchShuffle();
    const root = boot();
    click(root, zhHant['review.showAnswer']);

    shuffle.mockClear();
    // 「好」加上短間隔既不抖動也不重排，因此評分本身一次亂數都不抽
    // （見 review.ts 的 applyFuzz 與 reinsert）——抽到了就表示佇列被重建過。
    rate(root, 'good');

    expect(shuffle).not.toHaveBeenCalled();
    expect(remaining(root)).toBe(4);
  });

  it('跨日重建時手上那張卡留在最前面，答案維持掀開，不跳提示', () => {
    vi.setSystemTime(new Date(2026, 7, 17, 23, 50));
    seed(['2026-08-17', '2026-08-18', '2026-08-18']);
    const root = boot();
    click(root, zhHant['review.showAnswer']);
    const inHand = currentTerm(root);

    vi.setSystemTime(new Date(2026, 7, 18, 0, 5));
    foreground();

    expect(currentTerm(root)).toBe(inHand);
    expect(root.querySelector('.meaning')).not.toBeNull();
    expect(remaining(root)).toBe(3);
    // 沒有吐司、沒有彈窗——重建這件事使用者不必知道，只會看到張數變多。
    expect(document.querySelector('.toast')).toBeNull();
    expect(document.querySelector('.modal-overlay:not([hidden])')).toBeNull();
  });

  it('兩條訊號都到，結果與只到一條相同', () => {
    vi.setSystemTime(new Date(2026, 7, 17, 23, 50));
    seed(['2026-08-17', '2026-08-18', '2026-08-18']);
    const shuffle = watchShuffle();
    const root = boot();

    vi.setSystemTime(new Date(2026, 7, 18, 0, 5));
    foreground();
    const afterFirst = remaining(root);
    const inHand = currentTerm(root);

    // 第二條訊號（原生那一條）緊接著到：日期已經對上了，這一下什麼都不做。
    shuffle.mockClear();
    foreground();

    expect(shuffle).not.toHaveBeenCalled();
    expect(remaining(root)).toBe(afterFirst);
    expect(currentTerm(root)).toBe(inHand);
  });

  it('停在卡片列表跨過午夜，時間桶反映新的日期', () => {
    vi.setSystemTime(new Date(2026, 7, 17, 23, 50));
    seed(['2026-08-18']);
    const root = boot();
    click(root, zhHant['nav.cards']);
    expect(bucketCount(root, 'tomorrow')).toBe(1);
    expect(bucketCount(root, 'today')).toBe(0);

    vi.setSystemTime(new Date(2026, 7, 18, 0, 5));
    foreground();

    expect(bucketCount(root, 'today')).toBe(1);
    expect(bucketCount(root, 'tomorrow')).toBe(0);
  });

  it('停在統計畫面跨過午夜，統計數字反映新的日期', () => {
    vi.setSystemTime(new Date(2026, 7, 17, 23, 50));
    seed(['2026-08-18']);
    const root = boot();
    click(root, zhHant['nav.cards']);
    click(root, zhHant['nav.data']);
    click(root, zhHant['nav.stats']);
    expect(statsCount(root, 'tomorrow')).toBe(1);
    expect(statsCount(root, 'today')).toBe(0);

    vi.setSystemTime(new Date(2026, 7, 18, 0, 5));
    foreground();

    expect(statsCount(root, 'today')).toBe(1);
    expect(statsCount(root, 'tomorrow')).toBe(0);
  });
});
