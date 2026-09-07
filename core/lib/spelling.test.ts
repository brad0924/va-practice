import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
  clearSlot,
  filledSlots,
  currentQuestion,
  isRoundOver,
  place,
  points,
  settle,
  startRound,
  summary,
  FULL_POINTS_RATIO,
  MAX_POINTS,
  SECONDS_PER_KANA,
  type Round,
} from './spelling';
import type { Card } from './types';

function card(id: string, text: string, meaning: string): Card {
  return { id, bookId: 'book', text, meaning, interval: null, ease: 2.5, due: null };
}

/** 固定亂數來源，讓洗牌完全可預測。 */
function fixedRandom(...values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)]!;
}

const KOGASU = card('kogasu', '焦[こ]がす', '燒焦、烤焦');
const KUSHAMI = card('kushami', 'くしゃみ', '噴嚏');
/** 有漢字卻沒標讀音：拿不出正解，不出題。 */
const BARE = card('bare', '焦がす', '燒焦、烤焦');
/** 六個假名：たべものです。 */
const TABEMONO = card('tabemono', '食[た]べ物[もの]です', '是食物');

/** 開一輪只有這張卡的題目，省去洗牌的不確定。 */
function roundOf(target: Card): Round {
  return startRound([target], fixedRandom(0));
}

/** 找出寫著這個假名的那塊磚。 */
function tileOf(round: Round, kana: string): number {
  return currentQuestion(round)!.tiles.indexOf(kana);
}

/** 照指定的假名順序一塊一塊放進去。 */
function placeAll(round: Round, ...kana: string[]): Round {
  return kana.reduce((current, one) => place(current, tileOf(current, one)), round);
}

describe('正解', () => {
  it('漢字換成標注的讀音，逐格一個假名', () => {
    expect(currentQuestion(roundOf(KOGASU))!.answer).toEqual(['こ', 'が', 'す']);
  });

  it('純假名詞條的正解就是它自己', () => {
    expect(currentQuestion(roundOf(KUSHAMI))!.answer).toEqual(['く', 'し', 'ゃ', 'み']);
  });
});

describe('出題資格', () => {
  it('有漢字卻沒標讀音的卡不出題', () => {
    const round = startRound([BARE], fixedRandom(0));
    expect(round.questions).toHaveLength(0);
    expect(isRoundOver(round)).toBe(true);
  });

  it('一批卡裡只濾掉拿不出正解的那幾張', () => {
    const round = startRound([KOGASU, BARE, KUSHAMI], fixedRandom(0));
    expect(round.questions.map((question) => question.card.id).sort()).toEqual(['kogasu', 'kushami']);
  });
});

describe('時限', () => {
  it('三個假名九秒', () => {
    expect(currentQuestion(roundOf(KOGASU))!.limit).toBe(9);
  });

  it('六個假名十八秒', () => {
    expect(currentQuestion(roundOf(TABEMONO))!.limit).toBe(18);
    expect(currentQuestion(roundOf(TABEMONO))!.answer).toHaveLength(6);
  });

  it('時限就是假名數乘上每個假名的秒數', () => {
    expect(currentQuestion(roundOf(KUSHAMI))!.limit).toBe(4 * SECONDS_PER_KANA);
  });
});

describe('計分', () => {
  const LIMIT = 10;

  it('時限的前三成之內拼完給滿分', () => {
    expect(points(0, LIMIT)).toBe(MAX_POINTS);
    expect(points(FULL_POINTS_RATIO * LIMIT, LIMIT)).toBe(MAX_POINTS);
  });

  it('拖到最後一秒才拼完剛好一分', () => {
    expect(points(LIMIT, LIMIT)).toBe(1);
  });

  it('三成之後線性遞減', () => {
    const half = points(LIMIT * 0.65, LIMIT); // 三成與時限的正中間
    expect(half).toBeGreaterThan(1);
    expect(half).toBeLessThan(MAX_POINTS);
    expect(points(LIMIT * 0.5, LIMIT)).toBeGreaterThan(half);
  });

  it('逾時零分', () => {
    expect(points(LIMIT + 0.1, LIMIT)).toBe(0);
  });
});

describe('放磚', () => {
  it('補到最前面的空格', () => {
    const round = placeAll(roundOf(KOGASU), 'こ');
    expect(filledSlots(round)).toEqual(['こ', '', '']);
  });

  it('整排填滿之後再放，原樣回傳', () => {
    const full = placeAll(roundOf(KOGASU), 'こ', 'が', 'す');
    expect(place(full, 0)).toBe(full);
  });

  it('同一塊磚不會同時填進兩格', () => {
    const round = roundOf(KOGASU);
    const tile = tileOf(round, 'こ');
    expect(place(place(round, tile), tile)).toEqual(place(round, tile));
  });

  it('連放三塊錯磚，前兩步都不判對錯，第三步才判', () => {
    // 正解是 こがす，這裡故意倒著放。
    const one = placeAll(roundOf(KOGASU), 'す');
    expect(one.results).toEqual([]);
    const two = place(one, tileOf(one, 'が'));
    expect(two.results).toEqual([]);
    const three = place(two, tileOf(two, 'こ'));
    expect(three.results).toEqual([]);

    // 判定只發生在 settle()。
    expect(settle(three, 1).result.correct).toBe(false);
  });
});

describe('清格', () => {
  it('只清那一格，前後兩格不動', () => {
    const full = placeAll(roundOf(KOGASU), 'こ', 'が', 'す');
    expect(filledSlots(clearSlot(full, 1))).toEqual(['こ', '', 'す']);
  });

  it('下一次放磚補進被清掉的那一格，不是接到最後面', () => {
    const full = placeAll(roundOf(KOGASU), 'こ', 'す', 'が');
    const cleared = clearSlot(full, 1);
    expect(filledSlots(cleared)).toEqual(['こ', '', 'が']);
    expect(filledSlots(placeAll(cleared, 'す'))).toEqual(['こ', 'す', 'が']);
  });

  it('那塊磚清掉之後回到可點的狀態', () => {
    const round = placeAll(roundOf(KOGASU), 'こ');
    expect(clearSlot(round, 0).slots).toEqual([null, null, null]);
  });

  it('清一個本來就空的格子，原樣回傳', () => {
    const round = roundOf(KOGASU);
    expect(clearSlot(round, 0)).toBe(round);
  });
});

describe('結算', () => {
  it('拼對照時間給分', () => {
    const full = placeAll(roundOf(KOGASU), 'こ', 'が', 'す');
    const { result } = settle(full, 1);
    expect(result.correct).toBe(true);
    expect(result.points).toBe(MAX_POINTS);
  });

  it('拼錯零分', () => {
    const full = placeAll(roundOf(KOGASU), 'す', 'が', 'こ');
    const { result } = settle(full, 1);
    expect(result.correct).toBe(false);
    expect(result.points).toBe(0);
  });

  it('逾時沒填完，零分，沒填到的格子是空的', () => {
    const partial = placeAll(roundOf(KOGASU), 'こ');
    const { result } = settle(partial, 99);
    expect(result.correct).toBe(false);
    expect(result.points).toBe(0);
    expect(result.filled).toEqual(['こ', '', '']);
    expect(result.answer).toEqual(['こ', 'が', 'す']);
  });

  it('逾時就不算拼對，即使最後一塊剛好放對', () => {
    const full = placeAll(roundOf(KOGASU), 'こ', 'が', 'す');
    const limit = currentQuestion(full)!.limit;
    expect(filledSlots(full)).toEqual(['こ', 'が', 'す']); // 內容是對的
    const { result } = settle(full, limit + 0.1);
    expect(result.correct).toBe(false);
    expect(result.points).toBe(0);

    // 剛好壓在時限上還算拼對，一分。
    expect(settle(full, limit).result).toMatchObject({ correct: true, points: 1 });
  });

  it('推進到下一題，格子換成下一題的長度且全空', () => {
    const round = startRound([KOGASU, TABEMONO], fixedRandom(0));
    const first = currentQuestion(round)!;
    const { round: next } = settle(round, 1);
    expect(next.index).toBe(1);
    expect(currentQuestion(next)!.card.id).not.toBe(first.card.id);
    expect(next.slots).toEqual(currentQuestion(next)!.answer.map(() => null));
  });

  it('不就地改：原本那一輪不受影響', () => {
    const full = placeAll(roundOf(KOGASU), 'こ', 'が', 'す');
    settle(full, 1);
    expect(full.index).toBe(0);
    expect(full.results).toEqual([]);
  });

  it('一輪結束之後再結算會丟錯', () => {
    const { round: done } = settle(roundOf(KOGASU), 99);
    expect(isRoundOver(done)).toBe(true);
    expect(() => settle(done, 1)).toThrow();
  });
});

describe('一輪', () => {
  const CARDS = [KOGASU, KUSHAMI, TABEMONO];

  it('同一組亂數種子跑兩次，卡序完全一樣', () => {
    const ids = (round: Round) => round.questions.map((question) => question.card.id);
    expect(ids(startRound(CARDS, fixedRandom(0.7, 0.2, 0.9)))).toEqual(
      ids(startRound(CARDS, fixedRandom(0.7, 0.2, 0.9))),
    );
  });

  it('每張卡剛好出現一次', () => {
    const round = startRound(CARDS, fixedRandom(0.4));
    expect(round.questions.map((question) => question.card.id).sort()).toEqual([
      'kogasu',
      'kushami',
      'tabemono',
    ]);
  });

  it('出完就結束', () => {
    let round: Round = startRound(CARDS, fixedRandom(0.4));
    expect(isRoundOver(round)).toBe(false);
    for (let i = 0; i < CARDS.length; i += 1) {
      expect(currentQuestion(round)).toBeDefined();
      round = settle(round, 99).round;
    }
    expect(isRoundOver(round)).toBe(true);
    expect(currentQuestion(round)).toBeUndefined();
  });

  it('每一題的磚正解各一塊', () => {
    const question = currentQuestion(roundOf(KOGASU))!;
    expect([...question.tiles].sort()).toEqual([...question.answer].sort());
  });
});

describe('成績', () => {
  it('吐得出總分、拼對題數、總題數與平均分', () => {
    let round = startRound([KOGASU, KUSHAMI], fixedRandom(0));
    // 第一題拼對拿滿分，第二題逾時零分。
    const first = currentQuestion(round)!;
    round = settle(placeAll(round, ...first.answer), 0).round;
    round = settle(round, 999).round;

    expect(summary(round)).toMatchObject({
      total: 2,
      correct: 1,
      points: MAX_POINTS,
      average: MAX_POINTS / 2,
    });
  });

  it('平均分除的是全部題數，不是拼對的題數', () => {
    let round = startRound([KOGASU, KUSHAMI], fixedRandom(0));
    const first = currentQuestion(round)!;
    round = settle(placeAll(round, ...first.answer), 0).round;
    round = settle(round, 999).round;
    expect(summary(round).average).not.toBe(MAX_POINTS);
  });

  it('中途收工時，分母只算已經出過的題', () => {
    let round = startRound([KOGASU, KUSHAMI, TABEMONO], fixedRandom(0));
    const first = currentQuestion(round)!;
    round = settle(placeAll(round, ...first.answer), 0).round;
    expect(summary(round)).toMatchObject({ total: 1, correct: 1, average: MAX_POINTS });
  });

  it('沒拼對的卡帶著釋義、逐格正解與逐格作答', () => {
    const partial = placeAll(roundOf(KOGASU), 'こ');
    const { round } = settle(partial, 999);
    const missed = summary(round).missed;
    expect(missed).toHaveLength(1);
    expect(missed[0]!.card.meaning).toBe('燒焦、烤焦');
    expect(missed[0]!.answer).toEqual(['こ', 'が', 'す']);
    expect(missed[0]!.filled).toEqual(['こ', '', '']);
  });

  it('拼對的卡不進逐格對照', () => {
    const round = roundOf(KOGASU);
    const done = settle(placeAll(round, ...currentQuestion(round)!.answer), 0).round;
    expect(summary(done).missed).toEqual([]);
  });

  it('一題都還沒結算時，平均分是零而不是 NaN', () => {
    expect(summary(roundOf(KOGASU)).average).toBe(0);
  });
});

describe('不碰排程與儲存', () => {
  const source = readFileSync(new URL('./spelling.ts', import.meta.url), 'utf8');

  // 釘的是 import 而不是 `storage`、`rate(` 這幾個字：這支 repo 的註解很愛提檔名，
  // 比字串會在有人寫下「不碰 storage.ts」時假紅燈。只要那兩支沒被 import 進來，
  // `rate()` 就一行都呼叫不到，排程也寫不到。
  it('不 import storage.ts，也不 import review.ts——rate() 呼叫不到', () => {
    expect(source).not.toMatch(/from '\.\/storage'/);
    expect(source).not.toMatch(/from '\.\/review'/);
  });

  it('不取用全域亂數，也不看時鐘', () => {
    expect(source).not.toContain('Math.random(');
    expect(source).not.toContain('Date.now(');
    expect(source).not.toContain('new Date(');
  });
});
