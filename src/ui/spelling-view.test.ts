// @vitest-environment jsdom

/**
 * 拼字畫面（票 03）。
 *
 * 這一頁值得上 jsdom 的理由是它整個都是接線：碼表跟著時鐘跑、點磚會不會走到 `place()`、
 * 收尾之後那一格還按不按得動、最後一題結算完有沒有交棒出去。這些離開 DOM 就不成立
 * （`ADR-0014`）。真正的規則——補到哪一格、算幾分、對不對——住在 `core/lib/spelling.ts`，
 * 由 `spelling.test.ts` 釘住，這裡不重測一遍。
 *
 * 刻意不測的：
 * - **顏色**。剩 5 秒轉黃、剩 3 秒轉紅、拼錯那一格是紅的，全是版面，`ADR-0014` 明文不斷言。
 *   jsdom 也沒有真的算色。這幾條靠眼睛驗收。
 * - **磚不重疊、不溢出**。jsdom 沒有排版，量不出兩塊磚有沒有疊在一起，也量不出 375px
 *   裝不裝得下十二塊。那是實機的事。
 * - **畫面不上下抽動**。同上，那是高度，jsdom 一律回 0。
 * - **一輪怎麼開的**。洗牌與挑干擾在 `spelling.ts`，這一頁只吃洗好的那一份。
 */

import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { App } from '../app';
import { spellingView } from './spelling-view';
import type { Question, Round } from '@core/lib/spelling';
import type { Book, Card } from '@core/lib/types';

const BOOKS: Book[] = [{ id: 'b1', name: 'N2 動詞' }];

function card(id: string, text: string, meaning: string, bookId = 'b1'): Card {
  return { id, bookId, text, meaning, interval: null, ease: 2.5, due: null };
}

/**
 * 手捏一題，形狀與 `startRound()` 吐出來的一模一樣。
 *
 * 手捏而不是真的開一輪，是因為這一頁的接縫就是「一輪端進來」：磚的順序寫死之後，
 * 「點第幾塊」才講得出「點的是哪個假名」，斷言不必先反查一次洗牌結果。
 */
function question(text: string, meaning: string, answer: string[], tiles: string[]): Question {
  return { card: card(text, text, meaning), answer, tiles, limit: answer.length * 3 };
}

function roundOf(...questions: Question[]): Round {
  return {
    questions,
    index: 0,
    slots: questions[0]?.answer.map(() => null) ?? [],
    results: [],
  };
}

/** 三個假名、九塊磚。`こ` `が` `す` 分別是第 0、2、5 塊。 */
const KOGASU = question('焦[こ]がす', '燒焦、烤焦', ['こ', 'が', 'す'], [
  'こ', 'か', 'が', 'ご', 'ぎ', 'す', 'ず', 'さ', 'そ',
]);

/**
 * 詞條、讀音、釋義三者一個字都不重疊的一題。
 * 「畫面上看不到詞條」這條要拿它來驗——`焦[こ]がす` 的釋義本身就含「焦」，驗不動。
 */
const TOUGE = question('峠[とうげ]', '山頂', ['と', 'う', 'げ'], [
  'と', 'う', 'げ', 'ど', 'こ', 'け', 'そ', 'あ', 'い',
]);

/** 六個假名，時限 18 秒。 */
const TABEMONO = question('食[た]べ物[もの]です', '是食物', ['た', 'べ', 'も', 'の', 'で', 'す'], [
  'た', 'べ', 'も', 'の', 'で', 'す', 'だ', 'ぺ', 'ま', 'ぬ', 'て', 'ず',
]);

/** 交給 onDone 的那幾份：這一輪收工時（出完，或按了「結束」）報一次。 */
let finished: Round[] = [];
/** 交給 onSettled 的那幾份：每結算一題報一次，中途跳走時的封存靠它。 */
let settledAt: Round[] = [];

function mount(round: Round, books: Book[] = BOOKS): { screen: HTMLElement; app: App } {
  finished = [];
  settledAt = [];
  const app = {
    data: { version: 3, books, cards: [], scopes: { review: [], list: [], stats: [] }, updatedAt: 0 },
    now: () => new Date(),
    keyHandler: (() => {}) as App['keyHandler'],
  } as unknown as App;

  const screen = spellingView(
    app,
    round,
    (progress) => settledAt.push(progress),
    (done) => finished.push(done),
  );
  document.body.replaceChildren(screen);
  return { screen, app };
}

const tiles = (screen: HTMLElement) => [...screen.querySelectorAll<HTMLButtonElement>('.kana-tile')];
const slots = (screen: HTMLElement) => [...screen.querySelectorAll<HTMLElement>('.slot')];
const slotText = (screen: HTMLElement) => slots(screen).map((node) => node.textContent);
const verdict = (screen: HTMLElement) => screen.querySelector('.verdict')!.textContent;
const clock = (screen: HTMLElement) => screen.querySelector('.clock-num')!.textContent;

/** 點第幾塊磚。磚的順序是題目自己帶的，因此序號直接對得回假名。 */
function tap(screen: HTMLElement, index: number): void {
  tiles(screen)[index]!.click();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T09:00:00Z'));
});

afterEach(() => {
  // 先把畫面拆掉再收假時鐘：碼表靠 `isConnected` 自癒，脫離文件的那一下才會停。
  document.body.replaceChildren();
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe('上半部', () => {
  it('只看得到釋義，詞條與讀音都不出現', () => {
    const { screen } = mount(roundOf(TOUGE));
    const main = screen.querySelector('main')!;

    expect(main.textContent).toContain('山頂');
    expect(main.textContent).not.toContain('峠');
    expect(main.textContent).not.toContain('とうげ');
    // 讀音標記的方括號也不能漏出來。
    expect(main.textContent).not.toContain('[');
  });

  it('左上角印出這張卡的所屬單字本', () => {
    const { screen } = mount(roundOf(KOGASU));

    expect(screen.querySelector('.card-book')!.textContent).toContain('N2 動詞');
  });

  it('找不到那本就不印，也不填佔位字元', () => {
    const { screen } = mount(roundOf(KOGASU), []);

    expect(screen.querySelector('.card-book')).toBeNull();
  });
});

describe('碼表', () => {
  it('在題目出現的那一刻就開始跑，不等使用者動作', () => {
    const { screen } = mount(roundOf(KOGASU));
    expect(clock(screen)).toBe('9.0');

    vi.advanceTimersByTime(2000);

    expect(clock(screen)).toBe('7.0');
  });

  it('三個假名的題目給 9 秒', () => {
    const { screen } = mount(roundOf(KOGASU));

    vi.advanceTimersByTime(8900);
    expect(verdict(screen)).toBe('');

    vi.advanceTimersByTime(200);
    expect(verdict(screen)).toContain('時間到');
  });

  it('六個假名的題目給 18 秒', () => {
    const { screen } = mount(roundOf(TABEMONO));
    expect(clock(screen)).toBe('18.0');

    vi.advanceTimersByTime(17900);
    expect(verdict(screen)).toBe('');

    vi.advanceTimersByTime(200);
    expect(verdict(screen)).toContain('時間到');
  });
});

describe('點磚', () => {
  it('補到最前面的空格，那塊磚變成不可點', () => {
    const { screen } = mount(roundOf(KOGASU));

    tap(screen, 0); // こ

    expect(slotText(screen)).toEqual(['こ', '', '']);
    expect(tiles(screen)[0]!.disabled).toBe(true);
  });

  it('連點三塊錯的磚，前兩下畫面上不出現任何對錯提示', () => {
    const { screen } = mount(roundOf(KOGASU));

    tap(screen, 1); // か
    expect(verdict(screen)).toBe('');

    tap(screen, 3); // ご
    expect(verdict(screen)).toBe('');

    // 整排填滿的那一下才判定（spec 決定 3）。
    tap(screen, 4); // ぎ
    expect(verdict(screen)).toContain('拼錯了');
  });
});

describe('取消一格', () => {
  it('只有那一格變空，前後兩格不動，而且看得出下一塊磚會補進那個洞', () => {
    const { screen } = mount(roundOf(KOGASU));
    tap(screen, 0); // こ
    tap(screen, 2); // が
    expect(slotText(screen)).toEqual(['こ', 'が', '']);

    slots(screen)[1]!.click();

    expect(slotText(screen)).toEqual(['こ', '', '']);
    // 下一塊磚補去哪一格，畫面上指得出來——否則使用者不知道自己在填哪裡。
    // 斷言的是 aria-current 而不是一個 class 名：後者是 `ADR-0014` 禁止的事，
    // 而且 class 名改個字就會無辜變紅。aria-current 是這一格的語意，不是它的長相。
    expect(slots(screen)[1]!.getAttribute('aria-current')).toBe('true');
    expect(slots(screen)[2]!.hasAttribute('aria-current')).toBe(false);
  });

  it('那塊磚回到可點的狀態，下一次點磚補進那個洞', () => {
    const { screen } = mount(roundOf(KOGASU));
    tap(screen, 0);
    tap(screen, 2);
    slots(screen)[1]!.click();
    expect(tiles(screen)[2]!.disabled).toBe(false);

    tap(screen, 1); // か 補進中間那個洞

    expect(slotText(screen)).toEqual(['こ', 'か', '']);
  });
});

describe('收尾', () => {
  it('拼對時翻出正解並印出拿到幾分', () => {
    const { screen } = mount(roundOf(KOGASU, TABEMONO));

    tap(screen, 0); // こ
    tap(screen, 2); // が
    tap(screen, 5); // す

    expect(slotText(screen)).toEqual(['こ', 'が', 'す']);
    expect(verdict(screen)).toContain('拼對了');
    expect(verdict(screen)).toContain('10');
  });

  it('拼錯時翻出正解，停留之後進下一題', () => {
    const { screen } = mount(roundOf(KOGASU, TABEMONO));

    tap(screen, 0); // こ
    tap(screen, 1); // か
    tap(screen, 5); // す

    // 拼的是 こかす，但格子上翻出來的是正解。
    expect(slotText(screen)).toEqual(['こ', 'が', 'す']);
    expect(verdict(screen)).toContain('拼錯了');

    vi.advanceTimersByTime(2000);

    expect(screen.querySelector('main')!.textContent).toContain('是食物');
    expect(verdict(screen)).toBe('');
    // 下一題重新開一排空格。**不驗碼表的讀數**：停留 1600 毫秒之後新題目已經跑了一小段，
    // 對著 18.0 斷言等於要求「停留多久」與「總共快轉多久」剛好相等，改一個常數就假紅燈。
    expect(slotText(screen)).toEqual(['', '', '', '', '', '']);
  });

  it('逾時也翻出正解，沒填到的格子照樣印出正解', () => {
    const { screen } = mount(roundOf(KOGASU, TABEMONO));
    tap(screen, 0); // こ

    vi.advanceTimersByTime(9100);

    expect(slotText(screen)).toEqual(['こ', 'が', 'す']);
    expect(verdict(screen)).toContain('時間到');
  });

  it('逾時停留之後也進下一題，不是停在那裡', () => {
    const { screen } = mount(roundOf(KOGASU, TABEMONO));

    vi.advanceTimersByTime(9100);
    expect(screen.querySelector('main')!.textContent).toContain('燒焦、烤焦');

    vi.advanceTimersByTime(2000);

    expect(screen.querySelector('main')!.textContent).toContain('是食物');
    expect(verdict(screen)).toBe('');
    expect(slotText(screen)).toEqual(['', '', '', '', '', '']);
  });

  it('收尾之後磚點不動了', () => {
    const { screen } = mount(roundOf(KOGASU, TABEMONO));

    vi.advanceTimersByTime(9100);

    expect(tiles(screen).every((tile) => tile.disabled)).toBe(true);
  });

  it('最後一題結算完把整輪交出去，不自己往下走', () => {
    const { screen } = mount(roundOf(KOGASU));

    tap(screen, 0);
    tap(screen, 2);
    tap(screen, 5);
    expect(finished).toHaveLength(0);

    vi.advanceTimersByTime(2000);

    expect(finished).toHaveLength(1);
    expect(finished[0]!.results).toHaveLength(1);
    expect(finished[0]!.results[0]!.correct).toBe(true);
  });
});

describe('每結算一題就往外報一次', () => {
  it('拼完一題當下就報，不等停留那 1.6 秒過完', () => {
    const { screen } = mount(roundOf(KOGASU, TABEMONO));

    tap(screen, 0); // こ
    tap(screen, 2); // が
    tap(screen, 5); // す

    // 這一頁在停留期間照樣可能被換掉，而被換掉時沒有人通知它。晚報的話，
    // 剛剛拼完的那一題會從封存的成績裡消失（spec 決定 12）。
    expect(settledAt).toHaveLength(1);
    expect(settledAt[0]!.results).toHaveLength(1);
    expect(finished).toHaveLength(0);
  });

  it('逾時那一題也報', () => {
    mount(roundOf(KOGASU, TABEMONO));

    vi.advanceTimersByTime(9100);

    expect(settledAt).toHaveLength(1);
    expect(settledAt[0]!.results[0]!.correct).toBe(false);
  });

  it('最後一題兩支都會被呼叫，收工那一支拿到的題數不比進度那一支少', () => {
    const { screen } = mount(roundOf(KOGASU));

    tap(screen, 0);
    tap(screen, 2);
    tap(screen, 5);
    vi.advanceTimersByTime(2000);

    expect(settledAt).toHaveLength(1);
    expect(finished).toHaveLength(1);
    expect(finished[0]!.results).toHaveLength(settledAt[0]!.results.length);
  });
});

describe('中途按「結束」', () => {
  const quit = (screen: HTMLElement) => screen.querySelector<HTMLButtonElement>('.end-round')!;

  it('把整輪交出去，不等剩下那幾題', () => {
    const { screen } = mount(roundOf(KOGASU, TABEMONO));
    tap(screen, 0); // こ

    quit(screen).click();

    expect(finished).toHaveLength(1);
    // 正在拼的那一題不判：它沒被拼錯，只是還沒發生（票 05 決定 1）。
    // 補判一次的話，中途收工的平均分會被一題硬生生的 0 分拉下來。
    expect(finished[0]!.results).toHaveLength(0);
  });

  it('已經拼完的那幾題留著，一題都不掉', () => {
    const { screen } = mount(roundOf(KOGASU, TABEMONO));
    tap(screen, 0); // こ
    tap(screen, 2); // が
    tap(screen, 5); // す
    vi.advanceTimersByTime(2000);

    quit(screen).click();

    expect(finished[0]!.results).toHaveLength(1);
    expect(finished[0]!.results[0]!.correct).toBe(true);
  });

  it('收尾到進下一題那一段按不動', () => {
    const { screen } = mount(roundOf(KOGASU, TABEMONO));

    vi.advanceTimersByTime(9100);

    // 那一段裡剛判好的結果還在 finishQuestion() 手上，交出去會把那一題弄丟。
    expect(quit(screen).disabled).toBe(true);
  });

  it('按下去之後碼表就停了，不會在背景一直跑', () => {
    const { screen } = mount(roundOf(KOGASU, TABEMONO));

    quit(screen).click();
    const stopped = clock(screen);
    vi.advanceTimersByTime(3000);

    expect(clock(screen)).toBe(stopped);
  });
});

describe('這一頁碰不到的東西', () => {
  // 走專案根目錄的相對路徑，不走 `import.meta.url`：jsdom 底下那個值不是 file: 開頭，
  // `readFileSync` 會直接丟「The URL must be of scheme file」。node 環境的
  // `spelling.test.ts` 就沒有這個問題，同一招在這裡抄不得。
  const source = readFileSync('src/ui/spelling-view.ts', 'utf8');

  it('鍵盤按任何鍵都沒有反應', () => {
    const { app } = mount(roundOf(KOGASU));

    // 磚是散落的，沒有自然的鍵盤順序可以對應（spec 決定 25）。
    // 明寫成 null 而不是留白——留白會讓上一個畫面的處理器活到這一頁來。
    expect(app.keyHandler).toBeNull();
  });

  it('沒有 import storage.ts，也沒有呼叫 applyData()', () => {
    // 釘的是 import 而不是 `storage` 那個字：這支 repo 的註解很愛提檔名，
    // 比字串會在有人寫下「不碰 storage.ts」時假紅燈（`ADR-0021`）。
    expect(source).not.toMatch(/from '@core\/lib\/storage'/);
    expect(source).not.toMatch(/applyData\(/);
  });

  it('也不從別的畫面繞路 import 到 storage.ts', () => {
    // 這一條擋的是「自己這支很乾淨，但 import 進來的那支不乾淨」。
    // 借 `bookLabel()` 時最先想到的是 `review-view.ts`，而那支為了改複習範圍
    // import 了 `storage.ts`——一行都不准碰它的規則就這樣繞過去了（`ADR-0021`）。
    // 順帶擋掉票 06 接上導覽之後兩支互相 import 的迴圈。
    const imports = [...source.matchAll(/from '\.\/([a-z-]+)'/g)].map((hit) => hit[1]!);
    const reached = imports.map((name) => readFileSync(`src/ui/${name}.ts`, 'utf8'));

    expect(imports).not.toContain('review-view');
    for (const neighbour of reached) {
      expect(neighbour).not.toMatch(/from '@core\/lib\/storage'/);
    }
  });

  it('離開畫面之後碼表就停了，不會在背景一直跑', () => {
    const { screen } = mount(roundOf(KOGASU));
    const before = clock(screen);

    document.body.replaceChildren();
    vi.advanceTimersByTime(3000);

    expect(clock(screen)).toBe(before);
  });
});
