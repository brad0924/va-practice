// @vitest-environment jsdom

/**
 * 問答的答題畫面（票 02，spec 測試決定「接縫三」）。
 *
 * 值得上 jsdom 的理由與拼字答題頁相同：碼表跟著時鐘跑、點了之後其他選項還按不按得動、
 * 停留 1 秒之後有沒有換題、最後一題結算完有沒有交棒出去，這些離開 DOM 就不成立
 * （`ADR-0014`）。對錯與幾分住在 `core/lib/quiz.ts`，由 `quiz.test.ts` 釘住，這裡不重測。
 *
 * 刻意不測的：
 * - **顏色**。正解轉綠、點錯轉紅、碼表轉黃轉紅、答完那一行的三種顏色（票 07），全是版面，
 *   `ADR-0014` 明文不斷言。靠實機驗收。那一行的字與顏色查同一張表（`OUTCOMES`），
 *   字對了顏色就不會挑錯，與拼字答題頁同一個立場。
 * - **選項直排、佔滿整行、長釋義換行**。jsdom 沒有排版。
 * - **一輪怎麼開的**。洗牌與抽干擾在 `quiz.ts`，這一頁只吃洗好的那一份。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { App } from '../app';
import { quizView, SETTLE_PAUSE_MS } from './quiz-view';
import type { Question, Round } from '@core/lib/quiz';
import type { Card } from '@core/lib/types';
import zhHant from '@core/i18n/zh-Hant';

function card(id: string, text: string, meaning: string): Card {
  return { id, bookId: 'b1', text, meaning, interval: null, ease: 2.5, due: null };
}

/**
 * 手捏一題，形狀與 `startRound()` 吐出來的一模一樣。選項順序寫死，
 * 「點第幾個」才講得出「點的是哪個釋義」，斷言不必先反查一次洗牌結果。
 */
function question(text: string, options: string[], answerIndex: number): Question {
  return { card: card(text, text, options[answerIndex]!), options, answerIndex };
}

function roundOf(...questions: Question[]): Round {
  return { questions, index: 0, results: [] };
}

/** 正解是第 1 個（「燒焦」）。詞條帶讀音，答完才標得出來。 */
const KOGASU = question('焦[こ]がす', ['山頂', '燒焦', '雨', '吃'], 1);
/** 正解是第 0 個（「山頂」）。四個選項與上一題同一批字，只換了順序。 */
const TOUGE = question('峠[とうげ]', ['山頂', '雨', '燒焦', '吃'], 0);

/** 交給 onDone 的那幾份：這一輪收工時（出完，或按了「結束」）報一次。 */
let finished: Round[] = [];
/** 交給 onSettled 的那幾份：每結算一題報一次，中途跳走時的封存靠它。 */
let settledAt: Round[] = [];

function mount(round: Round): HTMLElement {
  finished = [];
  settledAt = [];
  const app = {
    data: { version: 3, books: [], cards: [], scopes: { review: [], list: [], stats: [] }, updatedAt: 0 },
    now: () => new Date(),
    keyHandler: (() => {}) as App['keyHandler'],
  } as unknown as App;

  const screen = quizView(
    app,
    round,
    (progress) => settledAt.push(progress),
    (done) => finished.push(done),
  );
  document.body.replaceChildren(screen);
  return screen;
}

/** 四個選項。認人靠釋義的字，不靠 class 名。 */
function options(screen: HTMLElement): HTMLButtonElement[] {
  const all = [...screen.querySelectorAll('button')];
  return all.filter((node) => KOGASU.options.includes(node.textContent ?? ''));
}

function option(screen: HTMLElement, meaning: string): HTMLButtonElement {
  const found = options(screen).find((node) => node.textContent === meaning);
  if (found === undefined) throw new Error(`畫面上找不到選項「${meaning}」`);
  return found;
}

/** 上方詞條那一格的字。答完之後讀音會標上去，`rt` 的字也算在裡面。 */
const term = (screen: HTMLElement) => screen.querySelector('main')!.textContent ?? '';

function press(screen: HTMLElement, label: string): void {
  const found = [...screen.querySelectorAll('button')].find((node) => node.textContent === label);
  if (found === undefined) throw new Error(`畫面上找不到「${label}」`);
  found.click();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T09:00:00Z'));
});

afterEach(() => {
  // 先把畫面拆掉再收假時鐘：碼表靠 `isConnected` 自癒，脫離文件的那一下才停。
  document.body.replaceChildren();
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe('點一個選項', () => {
  it('其他選項全部點不動，手滑連點兩個也只結算一次', () => {
    const screen = mount(roundOf(KOGASU, TOUGE));

    option(screen, '山頂').click();
    option(screen, '燒焦').click();

    for (const node of options(screen)) expect(node.disabled).toBe(true);
    expect(settledAt).toHaveLength(1);
    expect(settledAt[0]!.results[0]!.picked).toBe(0);
  });

  it('詞條一開始不標讀音，點下去之後才標上', () => {
    const screen = mount(roundOf(KOGASU, TOUGE));
    expect(term(screen)).not.toContain('こ');

    option(screen, '燒焦').click();

    expect(term(screen)).toContain('こ');
  });

  it('1 秒之內還停在原題，過了 1 秒換下一題', () => {
    const screen = mount(roundOf(KOGASU, TOUGE));
    option(screen, '燒焦').click();

    vi.advanceTimersByTime(SETTLE_PAUSE_MS - 1);
    expect(term(screen)).toContain('焦');

    vi.advanceTimersByTime(1);
    expect(term(screen)).toContain('峠');
    // 新的一題：讀音收回去，四個選項又點得動了。
    expect(term(screen)).not.toContain('とうげ');
    for (const node of options(screen)) expect(node.disabled).toBe(false);
  });

  it('停留那 1 秒不算進作答時間', () => {
    const screen = mount(roundOf(KOGASU, TOUGE));
    option(screen, '燒焦').click();
    vi.advanceTimersByTime(SETTLE_PAUSE_MS);

    // 第二題出來 2.5 秒才點，還在前三成（3 秒）之內，拿滿分。停留那 1 秒被算進去的話
    // 就是 3.5 秒，過了前三成，會掉到 9 分。
    vi.advanceTimersByTime(2500);
    option(screen, '山頂').click();

    expect(settledAt[1]!.results[1]!.points).toBe(10);
  });
});

describe('逾時', () => {
  it('10 秒到了沒點：記成逾時、0 分，讀音標上，選項全部鎖住', () => {
    const screen = mount(roundOf(KOGASU, TOUGE));

    vi.advanceTimersByTime(10_000);

    expect(settledAt).toHaveLength(1);
    expect(settledAt[0]!.results[0]).toMatchObject({ picked: null, correct: false, points: 0 });
    expect(term(screen)).toContain('こ');
    for (const node of options(screen)) expect(node.disabled).toBe(true);
  });

  it('逾時之後同樣停 1 秒再換下一題', () => {
    const screen = mount(roundOf(KOGASU, TOUGE));
    vi.advanceTimersByTime(10_000);

    vi.advanceTimersByTime(SETTLE_PAUSE_MS);

    expect(term(screen)).toContain('峠');
  });

  it('過了時限、碼表還沒來得及收尾的那一瞬間點下去，照逾時畫：沒有紅的', () => {
    const screen = mount(roundOf(KOGASU, TOUGE));
    // 真的瀏覽器裡碼表那一下常常晚到。只推時鐘、不跑計時器，就是那個空檔。
    vi.setSystemTime(Date.now() + 10_050);

    option(screen, '山頂').click();

    expect(settledAt).toHaveLength(1);
    expect(settledAt[0]!.results[0]).toMatchObject({ picked: null, points: 0 });
  });

  it('快到時限才點，點下去碼表就停，時間到了也不會再結算一次逾時', () => {
    const screen = mount(roundOf(KOGASU, TOUGE));
    vi.advanceTimersByTime(9_500);
    option(screen, '燒焦').click();

    // 跨過 10 秒那一刻，但還在停留的那 1 秒裡。
    vi.advanceTimersByTime(800);

    expect(settledAt).toHaveLength(1);
    expect(settledAt[0]!.results[0]!.picked).toBe(1);
  });
});

describe('答完那一行（票 07）', () => {
  /** 詞條底下那一行。找它靠 class，斷言只看字（`ADR-0014`），與拼字答題頁同一種寫法。 */
  const verdict = (screen: HTMLElement) => screen.querySelector('.verdict')!.textContent;

  it('還沒點的時候是空的', () => {
    const screen = mount(roundOf(KOGASU, TOUGE));

    expect(verdict(screen)).toBe('');
  });

  it('點對：印「答對了」，幾分照這一題結算出來的', () => {
    const screen = mount(roundOf(KOGASU, TOUGE));
    vi.advanceTimersByTime(5_000);

    option(screen, '燒焦').click();

    const points = settledAt[0]!.results[0]!.points;
    expect(points).toBeGreaterThan(0);
    expect(verdict(screen)).toBe(`答對了 · ${points} 分`);
  });

  it('點錯：印「答錯了 · 0 分」', () => {
    const screen = mount(roundOf(KOGASU, TOUGE));

    option(screen, '山頂').click();

    expect(verdict(screen)).toBe('答錯了 · 0 分');
  });

  it('逾時：印「逾時 · 0 分」', () => {
    const screen = mount(roundOf(KOGASU, TOUGE));

    vi.advanceTimersByTime(10_000);

    expect(verdict(screen)).toBe('逾時 · 0 分');
  });

  it('過了時限才點到正解，照逾時印，不會出現「答對了 · 0 分」', () => {
    const screen = mount(roundOf(KOGASU, TOUGE));
    vi.setSystemTime(Date.now() + 10_050);

    option(screen, '燒焦').click();

    expect(verdict(screen)).toBe('逾時 · 0 分');
  });

  it('剛好第 10 秒點到正解：算在時限內拿 1 分，不會印成「答錯了 · 0 分」', () => {
    // 每讀一次時鐘就往前走 1 毫秒：判斷算不算逾時與計分若各讀一次，兩次會落在時限兩邊，
    // 前者說沒逾時、後者給 0 分，畫面就印出「答錯了」。只讀一次的話兩邊看的是同一個 10.000。
    const app = {
      data: {},
      now: () => {
        const at = new Date();
        vi.setSystemTime(at.getTime() + 1);
        return at;
      },
      keyHandler: null,
    } as unknown as App;
    const start = Date.now();
    const screen = quizView(app, roundOf(KOGASU, TOUGE), () => {}, () => {});
    document.body.replaceChildren(screen);
    vi.setSystemTime(start + 10_000);

    option(screen, '燒焦').click();

    expect(verdict(screen)).toBe('答對了 · 1 分');
  });

  it('進下一題時清掉', () => {
    const screen = mount(roundOf(KOGASU, TOUGE));
    option(screen, '燒焦').click();

    vi.advanceTimersByTime(SETTLE_PAUSE_MS);

    expect(term(screen)).toContain('峠');
    expect(verdict(screen)).toBe('');
  });
});

describe('一輪收工', () => {
  it('最後一題停完那 1 秒，整輪交出去', () => {
    const screen = mount(roundOf(KOGASU));
    option(screen, '燒焦').click();
    expect(finished).toHaveLength(0);

    vi.advanceTimersByTime(SETTLE_PAUSE_MS);

    expect(finished).toHaveLength(1);
    expect(finished[0]!.results).toHaveLength(1);
  });

  it('中途按「結束」直接交出去，正在答的那一題不算', () => {
    const screen = mount(roundOf(KOGASU, TOUGE));
    option(screen, '燒焦').click();
    vi.advanceTimersByTime(SETTLE_PAUSE_MS);

    press(screen, zhHant['quiz.quit']);

    expect(finished).toHaveLength(1);
    expect(finished[0]!.results).toHaveLength(1);
  });

  it('按了「結束」之後碼表不再跑，不會補結算一次逾時', () => {
    const screen = mount(roundOf(KOGASU, TOUGE));

    press(screen, zhHant['quiz.quit']);
    vi.advanceTimersByTime(10_000);

    expect(settledAt).toHaveLength(0);
  });
});

describe('這一頁不做的事', () => {
  it('沒有鍵盤操作：清掉上一個畫面的處理器，自己也不掛', () => {
    const app = { data: {}, now: () => new Date(), keyHandler: () => {} } as unknown as App;

    quizView(app, roundOf(KOGASU), () => {}, () => {});

    expect(app.keyHandler).toBeNull();
  });

  it('選項前不印數字', () => {
    const screen = mount(roundOf(KOGASU));

    expect(options(screen).map((node) => node.textContent)).toEqual(KOGASU.options);
  });
});
