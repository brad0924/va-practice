import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
  cardsNeedingFakes,
  currentQuestion,
  isRoundOver,
  settle,
  startRound,
  summary,
  OPTION_COUNT,
  TIME_LIMIT,
  type Round,
} from './quiz';
import { points, MAX_POINTS } from './spelling';
import type { Card } from './types';

function card(id: string, text: string, meaning: string, bookId = 'picked'): Card {
  return { id, bookId, text, meaning, interval: null, ease: 2.5, due: null };
}

/** 固定亂數來源，讓洗牌完全可預測。 */
function fixedRandom(...values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)]!;
}

/** 可重現的偽亂數。要看「選項落在哪一格」這種分布就得多跑幾輪，固定值跑不出變化。 */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

const KOGASU = card('kogasu', '焦[こ]がす', '燒焦、烤焦');
const KUSHAMI = card('kushami', 'くしゃみ', '噴嚏');
const NEKO = card('neko', '猫[ねこ]', '貓');
/** 有漢字卻沒標讀音：讀音不是出題條件，照常出題。 */
const BARE = card('bare', '焦がす', '燒焦');
/** 釋義只有空白：匯入進來的卡可能長這樣，不出題。 */
const BLANK = card('blank', '犬[いぬ]', '   ');

/** 沒被挑到的另一本。干擾可以從這裡來。 */
const OTHER_BOOK = [
  card('inu', '犬[いぬ]', '狗', 'other'),
  card('tori', '鳥[とり]', '鳥', 'other'),
  card('sakana', '魚[さかな]', '魚', 'other'),
  card('uma', '馬[うま]', '馬', 'other'),
];

/** 整個 app 的卡。 */
const ALL = [KOGASU, KUSHAMI, NEKO, ...OTHER_BOOK];

/** 開一輪只有這張卡的題目。 */
function roundOf(target: Card, all: readonly Card[] = [target, ...OTHER_BOOK]): Round {
  return startRound([target], all, fixedRandom(0));
}

/** 目前這一題正解的那一格。 */
function answerOf(round: Round): number {
  return currentQuestion(round)!.answerIndex;
}

/** 目前這一題隨便一個錯的格。 */
function wrongOf(round: Round): number {
  return (answerOf(round) + 1) % OPTION_COUNT;
}

describe('開一輪', () => {
  it('同一組亂數種子跑兩次，卡序與每一題的選項順序完全一樣', () => {
    const picked = [KOGASU, KUSHAMI, NEKO];
    const shape = (round: Round) =>
      round.questions.map((question) => [question.card.id, ...question.options]);
    expect(shape(startRound(picked, ALL, seeded(7)))).toEqual(shape(startRound(picked, ALL, seeded(7))));
  });

  it('挑到的每一張卡剛好出一次', () => {
    const round = startRound([KOGASU, KUSHAMI, NEKO], ALL, seeded(3));
    expect(round.questions.map((question) => question.card.id).sort()).toEqual([
      'kogasu',
      'kushami',
      'neko',
    ]);
  });

  it('卡序洗過，不是永遠照挑進來的順序', () => {
    const picked = [KOGASU, KUSHAMI, NEKO];
    const orders = new Set<string>();
    for (let seed = 1; seed <= 30; seed += 1) {
      orders.add(startRound(picked, ALL, seeded(seed)).questions.map((q) => q.card.id).join());
    }
    expect(orders.size).toBeGreaterThan(1);
  });

  it('釋義去除頭尾空白後沒有字的卡不出題', () => {
    const round = startRound([KOGASU, BLANK], [...ALL, BLANK], seeded(1));
    expect(round.questions.map((question) => question.card.id)).toEqual(['kogasu']);
  });

  it('有漢字卻沒標讀音的卡照常出題', () => {
    const question = currentQuestion(roundOf(BARE))!;
    expect(question.card.id).toBe('bare');
    expect(question.options[question.answerIndex]).toBe('燒焦');
  });

  it('整個 app 湊不出四個不同的釋義、又沒有假釋義時，一開始就是結束的', () => {
    const three = [KOGASU, KUSHAMI, NEKO];
    const round = startRound(three, three, seeded(1));
    expect(round.questions).toHaveLength(0);
    expect(isRoundOver(round)).toBe(true);
  });

  it('卡有五張，但釋義去掉重複與空白只剩三個，沒有假釋義時也一樣出不了題', () => {
    const all = [KOGASU, KUSHAMI, NEKO, card('neko2', '猫[ねこ]ちゃん', ' 貓 '), BLANK];
    expect(isRoundOver(startRound(all, all, seeded(1)))).toBe(true);
  });

  it('挑到的本裡沒有可出的卡，一開始就是結束的', () => {
    expect(isRoundOver(startRound([BLANK], [...ALL, BLANK], seeded(1)))).toBe(true);
  });
});

describe('選項', () => {
  it('每一題恰好四個選項，其中恰好一個是這張卡自己的釋義', () => {
    const round = startRound([KOGASU, KUSHAMI, NEKO], ALL, seeded(5));
    for (const question of round.questions) {
      expect(question.options).toHaveLength(OPTION_COUNT);
      expect(question.options.filter((option) => option === question.card.meaning)).toHaveLength(1);
      expect(question.options[question.answerIndex]).toBe(question.card.meaning);
    }
  });

  it('兩張卡釋義相同（頭尾空白不同）時，四個選項仍互不相同，也沒有跟正解一樣的干擾', () => {
    const twin = card('twin', '焦[こ]げる', '  燒焦、烤焦 ', 'other');
    // 干擾那一側也放一對：少了它，兩個干擾撞在一起的情況沒人守。
    const dogTwin = card('inuTwin', '犬[いぬ]ころ', ' 狗', 'other');
    const all = [...ALL, twin, dogTwin];
    for (let seed = 1; seed <= 30; seed += 1) {
      for (const question of startRound([KOGASU, twin], all, seeded(seed)).questions) {
        const trimmed = question.options.map((option) => option.trim());
        expect(new Set(trimmed).size).toBe(OPTION_COUNT);
        expect(trimmed.filter((option) => option === '燒焦、烤焦')).toHaveLength(1);
      }
    }
  });

  it('干擾從整個 app 抽：挑到的本只有兩張卡時仍出得了題，干擾來自沒被挑到的本', () => {
    const round = startRound([KOGASU, KUSHAMI], ALL, seeded(2));
    expect(round.questions).toHaveLength(2);
    const fromOtherBook = new Set(OTHER_BOOK.map((other) => other.meaning));
    for (const question of round.questions) {
      expect(question.options.some((option) => fromOtherBook.has(option))).toBe(true);
    }
  });

  it('正解落在哪一格是亂的，不是永遠第一格', () => {
    const slots = new Set<number>();
    for (let seed = 1; seed <= 30; seed += 1) {
      slots.add(currentQuestion(startRound([KOGASU], ALL, seeded(seed)))!.answerIndex);
    }
    expect(slots.size).toBeGreaterThan(1);
  });
});

describe('假釋義（票 06）', () => {
  /** 這張卡的三個假釋義。畫面向 Gemini 要回來之後，照這個形狀遞進來。 */
  const fakesFor = (target: Card, ...fakes: string[]) => new Map([[target.id, fakes]]);

  it('只有一張卡，補了三個假釋義：開得出一題，四個選項互不相同，恰好一個是正解', () => {
    const round = startRound([KOGASU], [KOGASU], seeded(1), fakesFor(KOGASU, '洗乾淨', '曬乾', '冷凍'));

    expect(round.questions).toHaveLength(1);
    const question = currentQuestion(round)!;
    expect(new Set(question.options).size).toBe(OPTION_COUNT);
    expect([...question.options].sort()).toEqual(['冷凍', '曬乾', '洗乾淨', '燒焦、烤焦'].sort());
    expect(question.options[question.answerIndex]).toBe('燒焦、烤焦');
  });

  it('真的釋義優先：兩張卡時，另一張卡的釋義一定在選項裡，假釋義只補剩下的兩格', () => {
    const two = [KOGASU, NEKO];
    const fakes = new Map([
      ['kogasu', ['洗乾淨', '曬乾', '冷凍']],
      ['neko', ['狐狸', '老虎', '松鼠']],
    ]);
    for (let seed = 1; seed <= 30; seed += 1) {
      for (const question of startRound(two, two, seeded(seed), fakes).questions) {
        const other = question.card.id === 'kogasu' ? '貓' : '燒焦、烤焦';
        expect(question.options).toContain(other);
        expect(question.options).toHaveLength(OPTION_COUNT);
      }
    }
  });

  it('假釋義撞到正解或彼此重複（去除頭尾空白後比）就丟掉，丟完湊不滿三個就不出這一題', () => {
    const round = startRound(
      [KOGASU],
      [KOGASU],
      seeded(1),
      fakesFor(KOGASU, ' 燒焦、烤焦', '曬乾', '曬乾 ', '   '),
    );
    expect(isRoundOver(round)).toBe(true);
  });

  it('同一組亂數種子與同一份假釋義，卡序與選項順序完全一樣', () => {
    const two = [KOGASU, NEKO];
    const fakes = new Map([
      ['kogasu', ['洗乾淨', '曬乾', '冷凍']],
      ['neko', ['狐狸', '老虎', '松鼠']],
    ]);
    const shape = (round: Round) =>
      round.questions.map((question) => [question.card.id, ...question.options]);
    expect(shape(startRound(two, two, seeded(7), fakes))).toEqual(shape(startRound(two, two, seeded(7), fakes)));
  });
});

describe('哪幾張卡要補假釋義', () => {
  it('整個 app 有四個以上不同的釋義時，一張都不用補', () => {
    expect(cardsNeedingFakes([KOGASU, KUSHAMI], ALL)).toEqual([]);
  });

  it('不到四個時，挑到的卡裡有釋義的每一張都要補', () => {
    const all = [KOGASU, NEKO, BLANK];
    expect(cardsNeedingFakes([KOGASU, BLANK], all)).toEqual([KOGASU]);
  });

  it('一張卡也要補', () => {
    expect(cardsNeedingFakes([NEKO], [NEKO])).toEqual([NEKO]);
  });
});

describe('結算', () => {
  it('時限是 10 秒', () => {
    expect(TIME_LIMIT).toBe(10);
  });

  it('點對拿到的分與拼字的算分函式在 10 秒時限下一致', () => {
    for (const elapsed of [0, 3, 5, 7.5, 10]) {
      const round = roundOf(KOGASU);
      const { result } = settle(round, answerOf(round), elapsed);
      expect(result.correct).toBe(true);
      expect(result.points).toBe(points(elapsed, 10));
    }
  });

  it('點錯 0 分', () => {
    const round = roundOf(KOGASU);
    const { result } = settle(round, wrongOf(round), 1);
    expect(result).toMatchObject({ correct: false, points: 0 });
  });

  it('逾時沒點 0 分', () => {
    const { result } = settle(roundOf(KOGASU), null, TIME_LIMIT);
    expect(result).toMatchObject({ correct: false, points: 0, picked: null });
  });

  it('超過時限才點，即使點的是正解也不算對', () => {
    const round = roundOf(KOGASU);
    expect(settle(round, answerOf(round), TIME_LIMIT + 0.1).result).toMatchObject({
      correct: false,
      points: 0,
    });
    // 剛好壓在時限上還算對，一分。
    expect(settle(round, answerOf(round), TIME_LIMIT).result).toMatchObject({ correct: true, points: 1 });
  });

  it('一題的結果帶得出那張卡、四個選項、正解是第幾個、點了第幾個、對不對、幾分', () => {
    const round = roundOf(KOGASU);
    const question = currentQuestion(round)!;
    const { result } = settle(round, wrongOf(round), 2);
    expect(result).toEqual({
      card: KOGASU,
      options: question.options,
      answerIndex: question.answerIndex,
      picked: wrongOf(round),
      correct: false,
      points: 0,
    });
  });

  it('推進到下一題，原本那一輪不受影響', () => {
    const round = startRound([KOGASU, KUSHAMI], ALL, seeded(4));
    const first = currentQuestion(round)!;
    const { round: next } = settle(round, null, TIME_LIMIT);
    expect(currentQuestion(next)!.card.id).not.toBe(first.card.id);
    expect(round.index).toBe(0);
    expect(round.results).toEqual([]);
  });

  it('出完就結束，結束之後再結算會丟錯', () => {
    let round = startRound([KOGASU, KUSHAMI], ALL, seeded(4));
    round = settle(round, null, TIME_LIMIT).round;
    expect(isRoundOver(round)).toBe(false);
    round = settle(round, null, TIME_LIMIT).round;
    expect(isRoundOver(round)).toBe(true);
    expect(currentQuestion(round)).toBeUndefined();
    expect(() => settle(round, 0, 1)).toThrow();
  });
});

describe('成績', () => {
  it('帶得出總題數、答對幾題、總分、平均、沒答對的那幾題', () => {
    let round = startRound([KOGASU, KUSHAMI, NEKO], ALL, seeded(6));
    round = settle(round, answerOf(round), 0).round; // 對，滿分
    const wrong = currentQuestion(round)!.card.id;
    round = settle(round, wrongOf(round), 1).round; // 錯
    const late = currentQuestion(round)!.card.id;
    round = settle(round, null, TIME_LIMIT).round; // 逾時

    const result = summary(round);
    expect(result).toMatchObject({ total: 3, correct: 1, points: MAX_POINTS, average: MAX_POINTS / 3 });
    // 沒答對的清單包含逾時的題。
    expect(result.missed.map((one) => one.card.id)).toEqual([wrong, late]);
  });

  it('中途收工時，還沒出到的那幾題不算進總題數，也不算進沒答對的清單', () => {
    let round = startRound([KOGASU, KUSHAMI, NEKO], ALL, seeded(6));
    round = settle(round, wrongOf(round), 1).round;
    expect(summary(round)).toMatchObject({ total: 1, correct: 0, average: 0 });
    expect(summary(round).missed).toHaveLength(1);
  });

  it('平均除的是已經結算過的題數', () => {
    let round = startRound([KOGASU, KUSHAMI, NEKO], ALL, seeded(6));
    round = settle(round, answerOf(round), 0).round;
    round = settle(round, wrongOf(round), 1).round;
    expect(summary(round).average).toBe(MAX_POINTS / 2);
  });

  it('一題都沒結算時，平均是 0 而不是 NaN', () => {
    expect(summary(roundOf(KOGASU)).average).toBe(0);
  });
});

describe('不碰排程與儲存', () => {
  const source = readFileSync(new URL('./quiz.ts', import.meta.url), 'utf8');

  // 比照拼字那一道：釘 import，不釘 `storage`、`rate(` 這幾個字，免得註解提到檔名就假紅燈。
  it('不 import storage.ts，也不 import review.ts', () => {
    expect(source).not.toMatch(/from '\.\/storage'/);
    expect(source).not.toMatch(/from '\.\/review'/);
  });

  // 上面「分數與 points() 一致」那條擋不住抄一份一模一樣的曲線，所以另外釘 import（spec 實作決定二）。
  it('算分用的是拼字那支 points()，不是自己抄一份', () => {
    expect(source).toMatch(/import \{ points \} from '\.\/spelling'/);
    expect(source).not.toMatch(/function points\(/);
  });

  it('不取用全域亂數，也不看時鐘', () => {
    expect(source).not.toContain('Math.random(');
    expect(source).not.toContain('Date.now(');
    expect(source).not.toContain('new Date(');
  });
});
