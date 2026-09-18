// @vitest-environment jsdom

/**
 * 問答的入口與頁間接線（票 02）。
 *
 * 這一支釘的是**一輪什麼時候封存**，以及進問答時該落在哪一頁。答題頁自己的行為由
 * `quiz-view.test.ts` 顧，這裡只看它與成績頁、出不了題那一頁接起來對不對。
 * 形狀照抄 `spelling-home.test.ts`。
 *
 * 刻意不測的：
 * - **挑單字本**。這張票點進來直接拿全部單字本出題，挑書頁是票 04 的事。
 * - **重整頁面之後成績消失**。那是「不寫 localStorage」的另一種說法，由
 *   `spelling-home.test.ts` 那一道守門一起釘住（問答那幾支也在它的名單上）。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { App } from '../app';
import { quizHome } from './quiz-home';
import { SETTLE_PAUSE_MS } from './quiz-view';
import type { Book, Card } from '@core/lib/types';
import zhHant from '@core/i18n/zh-Hant';

const BOOKS: Book[] = [
  { id: 'b1', name: 'N2 動詞' },
  { id: 'b2', name: '工作用日文' },
];

function card(id: string, text: string, meaning: string, bookId: string): Card {
  return { id, bookId, text, meaning, interval: null, ease: 2.5, due: null };
}

/** 四張卡、四個不同的釋義，分在兩本裡——剛好湊得出一題的四個選項。 */
const CARDS: Card[] = [
  card('c1', 'こがす', '燒焦', 'b1'),
  card('c2', 'とうげ', '山頂', 'b1'),
  card('c3', 'あめ', '雨', 'b2'),
  card('c4', 'たべる', '吃', 'b2'),
];

/**
 * 一個夠問答用的 app。亂數寫死成 0，卡序與選項順序因此每次都一樣。
 *
 * 金鑰預設是 null：沒有金鑰時問答根本不會向 Gemini 發請求，測試不可能外送任何東西。
 * 要測假釋義那一條路（票 06）才給金鑰，同時用 `vi.stubGlobal('fetch', …)` 攔下請求。
 */
function makeApp(cards: readonly Card[] = CARDS, geminiKey: string | null = null): App {
  return {
    gemini: { read: () => geminiKey },
    data: { version: 3, books: BOOKS, cards: [...cards], scopes: { review: [], list: [], stats: [] }, updatedAt: 0 },
    quizRound: null,
    spellingRound: null,
    now: () => new Date(),
    random: () => 0,
    keyHandler: null,
  } as unknown as App;
}

/** 把入口掛上文件。掛上去才換得動頁——`replaceWith()` 對沒有父節點的元素什麼都不做。 */
function mount(app: App): HTMLElement {
  const root = document.createElement('div');
  root.append(quizHome(app));
  document.body.replaceChildren(root);
  return root;
}

function labels(root: HTMLElement): (string | null)[] {
  return [...root.querySelectorAll('button')].map((node) => node.textContent);
}

/**
 * 目前停在哪一頁。認人靠畫面上的字，不靠 class 名：答題頁有「結束」、成績頁有「再一輪」、
 * 出不了題那一頁有那一行標題。
 */
function page(root: HTMLElement): 'answer' | 'summary' | 'empty' | 'preparing' {
  if (labels(root).includes(zhHant['quiz.quit'])) return 'answer';
  if (labels(root).includes(zhHant['quiz.again'])) return 'summary';
  if (root.textContent?.includes(zhHant['quiz.noCardsTitle'])) return 'empty';
  if (root.textContent?.includes(zhHant['quiz.preparing'])) return 'preparing';
  throw new Error('認不出這一頁');
}

function press(root: HTMLElement, label: string): void {
  const found = [...root.querySelectorAll('button')].find((node) => node.textContent === label);
  if (found === undefined) throw new Error(`畫面上找不到「${label}」`);
  found.click();
}

/** 點第一個選項，不管點得對不對，再把停留那 1 秒快轉掉。 */
function answerOnce(root: HTMLElement): void {
  const first = [...root.querySelectorAll('footer button')][0] as HTMLButtonElement;
  first.click();
  vi.advanceTimersByTime(SETTLE_PAUSE_MS);
}

/** 成績頁頂上第一格的數字，例如 `0 / 1`。與 `spelling-home.test.ts` 一樣靠 `.tile-num` 找。 */
const ratio = (root: HTMLElement) => root.querySelector('.tile-num')!.textContent;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T09:00:00Z'));
});

afterEach(() => {
  document.body.replaceChildren();
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('進問答時落在哪一頁', () => {
  it('沒有上一輪時直接用全部單字本開一輪', () => {
    const root = mount(makeApp());

    expect(page(root)).toBe('answer');
  });

  it('上一輪還封存著時直接看到成績頁', () => {
    const app = makeApp();
    const first = mount(app);
    press(first, zhHant['quiz.quit']);
    expect(page(first)).toBe('summary');

    // 整個畫面被丟掉，再進來一次——這就是跳去別的畫面又回來。
    expect(page(mount(app))).toBe('summary');
  });

  it('答題途中跳走，回來看到的是那一輪的成績頁，答完的那一題在裡面', () => {
    const app = makeApp();
    const first = mount(app);
    answerOnce(first);
    expect(page(first)).toBe('answer');

    // 不按「結束」，整棵樹被丟掉，沒有人通知這一頁。
    document.body.replaceChildren();
    const back = mount(app);

    expect(page(back)).toBe('summary');
    // 分母的 1 是重點：答完的那一題在裡面。只在收工時封存的話這裡會是 0 / 0。
    expect(ratio(back)).toMatch(/\/ 1$/);
  });

  it('不碰拼字那一格：兩邊的上一輪各自都還在', () => {
    const app = makeApp();
    const spelling = { questions: [], index: 0, slots: [], results: [] };
    app.spellingRound = spelling;

    const root = mount(app);
    press(root, zhHant['quiz.quit']);

    expect(app.spellingRound).toBe(spelling);
    expect(app.quizRound).not.toBeNull();
  });
});

describe('出不了題', () => {
  it('一張卡都沒有時，給出不了題的那一頁', () => {
    expect(page(mount(makeApp([])))).toBe('empty');
  });

  it('整個 app 湊不出四個不同的釋義、又沒設 Gemini 金鑰時，同一頁，說明改講「可以去設金鑰」', () => {
    // 三張卡，其中兩張釋義相同：只有兩個不同的釋義。
    const few = [card('c1', 'こがす', '燒焦', 'b1'), card('c2', 'やく', '燒焦', 'b1'), card('c3', 'あめ', '雨', 'b2')];
    const doFetch = vi.fn();
    vi.stubGlobal('fetch', doFetch);

    const root = mount(makeApp(few));

    expect(page(root)).toBe('empty');
    expect(root.textContent).toContain(zhHant['quiz.noKeyNote']);
    expect(doFetch).not.toHaveBeenCalled();
  });

  it('出不了題那一頁不封存任何東西，加了卡再進來就開得了一輪', () => {
    const app = makeApp([]);
    mount(app);
    expect(app.quizRound).toBeNull();

    app.data.cards.push(...CARDS);

    expect(page(mount(app))).toBe('answer');
  });
});

describe('釋義湊不到四個時，請 Gemini 補假釋義（票 06）', () => {
  /** 只有一張卡：整個 app 只有一個釋義，差三個。這張票的起點就是這個環境。 */
  const ONE = [card('c1', 'こがす', '燒焦', 'b1')];

  /** Gemini 成功時的回覆外殼，裡面那份是模型照 `FAKES_SCHEMA` 回的東西。 */
  function geminiReply(value: unknown): Response {
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }] }));
  }

  /** 攔下 fetch，回一份替 `ONE` 那張卡編好的假釋義。回傳的 mock 數得出被叫了幾次。 */
  function geminiAnswers() {
    const doFetch = vi.fn(async () => geminiReply({ cards: [{ term: 'こがす', fakes: ['洗乾淨', '曬乾', '冷凍'] }] }));
    vi.stubGlobal('fetch', doFetch);
    return doFetch;
  }

  /** 等 Gemini 那一趟回來：把排在後面的 promise 全部跑完。 */
  const settleGemini = () => vi.advanceTimersByTimeAsync(0);

  /** 答題頁上四個選項的字。 */
  const options = (root: HTMLElement) => [...root.querySelectorAll('footer button')].map((node) => node.textContent);

  it('有金鑰、Gemini 回得來：開得出一輪，四個選項是正解加三個假釋義', async () => {
    geminiAnswers();
    const root = mount(makeApp(ONE, 'key'));
    await settleGemini();

    expect(page(root)).toBe('answer');
    expect(options(root).sort()).toEqual(['冷凍', '曬乾', '洗乾淨', '燒焦'].sort());
  });

  it('整個 app 有四個以上不同的釋義時，即使有金鑰也一個請求都不發', () => {
    const doFetch = geminiAnswers();

    expect(page(mount(makeApp(CARDS, 'key')))).toBe('answer');
    expect(doFetch).not.toHaveBeenCalled();
  });

  it('等 Gemini 的期間給「正在準備」那一頁，答題頁（連同碼表）還沒出現', () => {
    // 一個永遠不回的 fetch：停在等待的那一刻。
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));

    const root = mount(makeApp(ONE, 'key'));

    expect(page(root)).toBe('preparing');
  });

  it.each([
    ['連不上', async () => Promise.reject(new TypeError('Failed to fetch'))],
    ['金鑰不對', async () => new Response(JSON.stringify({ error: { message: 'API key not valid' } }), { status: 400 })],
    ['回覆的形狀不對', async () => geminiReply({ cards: [] })],
  ])('%s：給出不了題那一頁，說明講「這次沒補成」，不封存任何東西', async (_, respond) => {
    vi.stubGlobal('fetch', vi.fn(respond));
    const app = makeApp(ONE, 'key');

    const root = mount(app);
    await settleGemini();

    expect(page(root)).toBe('empty');
    expect(root.textContent).toContain(zhHant['quiz.fakesFailedNote']);
    expect(app.quizRound).toBeNull();
  });

  it('等到一半跳去別的畫面：回覆晚到也不換頁、不搶鍵盤', async () => {
    let answer: (response: Response) => void = () => {};
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => (answer = resolve))));
    const app = makeApp(ONE, 'key');
    mount(app);

    // 整棵樹被丟掉，沒有人通知這一頁——這就是跳去別的畫面。那個畫面接手了鍵盤。
    document.body.replaceChildren();
    const otherScreen = () => {};
    app.keyHandler = otherScreen;
    answer(geminiReply({ cards: [{ term: 'こがす', fakes: ['洗乾淨', '曬乾', '冷凍'] }] }));
    await settleGemini();

    // 晚到的回覆若照樣建出答題頁，答題頁一出生就會把鍵盤清成 null。
    expect(app.keyHandler).toBe(otherScreen);
    expect(app.quizRound).toBeNull();
  });
});

describe('一輪怎麼跑完', () => {
  it('每一張卡都出過一次之後自動跳出成績', () => {
    const root = mount(makeApp());

    for (let asked = 0; asked < CARDS.length - 1; asked += 1) answerOnce(root);
    expect(page(root)).toBe('answer');

    answerOnce(root);

    expect(page(root)).toBe('summary');
    expect(ratio(root)).toMatch(/\/ 4$/);
  });

  it('中途按「結束」也跳出成績，正在答的那一題不算進去', () => {
    const root = mount(makeApp());

    press(root, zhHant['quiz.quit']);

    expect(page(root)).toBe('summary');
    expect(ratio(root)).toBe('0 / 0');
  });
});

describe('成績頁的「再一輪」', () => {
  it('直接回答題頁', () => {
    const root = mount(makeApp());
    press(root, zhHant['quiz.quit']);

    press(root, zhHant['quiz.again']);

    expect(page(root)).toBe('answer');
  });

  it('重新讀一次全部單字本：中途加的卡，下一輪吃得到', () => {
    const app = makeApp();
    const root = mount(app);
    press(root, zhHant['quiz.quit']);

    app.data.cards.push(card('c5', 'みず', '水', 'b1'));
    press(root, zhHant['quiz.again']);
    for (let asked = 0; asked < CARDS.length; asked += 1) answerOnce(root);

    // 五張卡五題，第五題結算完才跳成績。只洗舊的四張的話，這時已經在成績頁了。
    expect(page(root)).toBe('answer');
  });

  it('那時卡已經刪到出不了題，就給出不了題的那一頁', () => {
    const app = makeApp();
    const root = mount(app);
    press(root, zhHant['quiz.quit']);

    app.data.cards.length = 0;
    press(root, zhHant['quiz.again']);

    expect(page(root)).toBe('empty');
  });

  it('按下去之後一題都還沒答就跳走，不會拿上一輪的成績冒充這一輪', () => {
    const app = makeApp();
    const root = mount(app);
    answerOnce(root);
    press(root, zhHant['quiz.quit']);
    press(root, zhHant['quiz.again']);

    document.body.replaceChildren();

    expect(page(mount(app))).toBe('answer');
  });
});
