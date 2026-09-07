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
  DECOY_COUNT,
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
/** 兩個假名的短詞。 */
const NEKO = card('neko', '猫[ねこ]', '貓');
/** 整串片假名。 */
const KAMERA = card('kamera', 'カメラ', '相機');
/** 片假名夾一個長音符。 */
const KEEKI = card('keeki', 'ケーキ', '蛋糕');
/** 同一個長音符在正解裡出現兩次。 */
const KOOHII = card('koohii', 'コーヒー', '咖啡');

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

  it('每一題的磚含正解各一塊，另加固定幾塊干擾', () => {
    const question = currentQuestion(roundOf(KOGASU))!;
    for (const kana of question.answer) {
      expect(question.tiles.filter((tile) => tile === kana)).toHaveLength(1);
    }
    expect(question.tiles).toHaveLength(question.answer.length + DECOY_COUNT);
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

describe('干擾', () => {
  /**
   * `こがす` 三個假名各自拉得出來的干擾：
   * `こ` 拉 `ご` 與か行同行，`が` 拉 `か` 與か行的濁音，`す` 拉 `ず` 與さ行同行。
   */
  const KOGASU_DECOYS = ['ご', 'か', 'き', 'く', 'け', 'ぎ', 'ぐ', 'げ', 'ず', 'さ', 'し', 'せ', 'そ'];

  /** 磚裡扣掉正解那幾塊，剩下的就是干擾。 */
  function decoysOf(round: Round): string[] {
    const question = currentQuestion(round)!;
    const rest = [...question.tiles];
    for (const kana of question.answer) rest.splice(rest.indexOf(kana), 1);
    return rest;
  }

  /** 可重現的偽亂數。要看「這張卡拉得出哪些干擾」就得多跑幾輪，固定值跑不出變化。 */
  function seeded(seed: number): () => number {
    let state = seed;
    return () => {
      state = (state * 1103515245 + 12345) % 2147483648;
      return state / 2147483648;
    };
  }

  /** 同一張卡跑三十組亂數，把出現過的干擾全部收起來。 */
  function everyDecoyOf(target: Card): string[] {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 30; seed += 1) {
      for (const decoy of decoysOf(startRound([target], seeded(seed)))) seen.add(decoy);
    }
    return [...seen].sort();
  }

  it('干擾不與正解裡的任何一個假名相同', () => {
    for (let seed = 1; seed <= 30; seed += 1) {
      const round = startRound([KOGASU], seeded(seed));
      for (const decoy of decoysOf(round)) expect(['こ', 'が', 'す']).not.toContain(decoy);
    }
  });

  it('九塊磚彼此不重複', () => {
    for (let seed = 1; seed <= 30; seed += 1) {
      const tiles = currentQuestion(startRound([KOGASU], seeded(seed)))!.tiles;
      expect(new Set(tiles).size).toBe(tiles.length);
    }
  });

  it('干擾只從濁音清音變體與同行鄰居來，整表其他字一個都不會出現', () => {
    // 跑三十輪也抽不到 を、ん 這種一看就知道不可能的字。
    expect(everyDecoyOf(KOGASU)).toEqual([...KOGASU_DECOYS].sort());
  });

  it('拉得到濁音清音的對子，也拉得到同行鄰居', () => {
    const seen = everyDecoyOf(KOGASU);
    expect(seen).toContain('か'); // が 的清音
    expect(seen).toContain('ご'); // こ 的濁音
    expect(seen).toContain('そ'); // す 的同行鄰居
  });

  it('小字假名跟大字同一行，ゃ 拉得出 や', () => {
    expect(everyDecoyOf(KUSHAMI)).toContain('や');
  });

  it('每個正解假名都拉得到自己的干擾，不會被排前面的吃光', () => {
    // くしゃみ 四個假名輪流拿，所以 ゃ 的同行鄰居每一輪都在場，不是碰運氣。
    const YA_ROW = ['や', 'ゅ', 'ゆ', 'ょ', 'よ'];
    for (let seed = 1; seed <= 30; seed += 1) {
      const decoys = decoysOf(startRound([KUSHAMI], seeded(seed)));
      expect(decoys.some((decoy) => YA_ROW.includes(decoy))).toBe(true);
    }
  });

  it('長詞的尾巴不會永遠被餓死', () => {
    // ありがとうございます 十個假名搶六塊額度，本來就分不完，只能問「輪得到誰」公不公平。
    // 排在第九個的 ま 是觀測點：輪流的順序有洗過，六十輪裡它大約四成的機會拿得到自己的
    // 同行鄰居；照正解原順序輪的話只剩一成，因為額度每次都被前六個假名先吃光。
    // 種子固定，這個數字不會抖。
    const MA_ROW = ['み', 'む', 'め', 'も'];
    const ARIGATOU = card('arigatou', 'ありがとうございます', '謝謝');
    let rounds = 0;
    for (let seed = 1; seed <= 60; seed += 1) {
      const decoys = decoysOf(startRound([ARIGATOU], seeded(seed)));
      if (decoys.some((decoy) => MA_ROW.includes(decoy))) rounds += 1;
    }
    expect(rounds).toBeGreaterThan(25);
  });

  it('正解本身有重複的假名時，干擾照樣一塊都不重複', () => {
    // コーヒー 兩個 ー 是正解自己帶的，那兩塊躲不掉；干擾不會再添第三塊一樣的。
    for (let seed = 1; seed <= 30; seed += 1) {
      const decoys = decoysOf(startRound([KOOHII], seeded(seed)));
      expect(new Set(decoys).size).toBe(DECOY_COUNT);
      for (const decoy of decoys) expect(['コ', 'ー', 'ヒ']).not.toContain(decoy);
    }
  });

  it('兩個假名的短詞照樣擺出八塊', () => {
    const question = currentQuestion(roundOf(NEKO))!;
    expect(question.answer).toHaveLength(2);
    expect(question.tiles).toHaveLength(2 + DECOY_COUNT);
    expect(new Set(question.tiles).size).toBe(question.tiles.length);
  });

  it('六個假名的長詞擺出十二塊', () => {
    const question = currentQuestion(roundOf(TABEMONO))!;
    expect(question.answer).toHaveLength(6);
    expect(question.tiles).toHaveLength(6 + DECOY_COUNT);
  });

  it('正解是片假名時，干擾也是片假名，不會混進平假名', () => {
    for (const decoy of everyDecoyOf(KAMERA)) expect(decoy).toMatch(/^[ァ-ヺ]$/);
  });

  it('正解含長音符時不會爆掉，磚數照樣是正解加六', () => {
    const question = currentQuestion(roundOf(KEEKI))!;
    expect(question.answer).toEqual(['ケ', 'ー', 'キ']);
    expect(question.tiles).toHaveLength(3 + DECOY_COUNT);
    // 長音符沒有濁音也沒有同行，它那一塊的干擾由備案補，但備案不會再補一個 ー 進來。
    expect(everyDecoyOf(KEEKI)).not.toContain('ー');
  });

  it('候選不夠時往外擴，寧可補到滿也不讓磚變少', () => {
    // ケーキ 只拉得出五個候選（ゲ、カ、ク、コ、ギ），第六塊一定來自相鄰行。
    expect(everyDecoyOf(KEEKI).length).toBeGreaterThan(5);
    expect(currentQuestion(roundOf(KEEKI))!.tiles).toHaveLength(3 + DECOY_COUNT);
  });

  it('同一組亂數種子跑兩次，磚的內容與順序完全一樣', () => {
    const tiles = () => currentQuestion(startRound([KOGASU, KUSHAMI], seeded(7)))!.tiles;
    expect(tiles()).toEqual(tiles());
  });
});

describe('五十音表是算出來的', () => {
  const source = readFileSync(new URL('./spelling.ts', import.meta.url), 'utf8');

  // 釘的是「原始碼裡有幾串假名」：手打一張對照表就一定要把行的成員寫出來，
  // 那些字串會在這裡現形。唯一準許的是行尾那十一個字（票 02 決定 2）。
  it('程式裡沒有手打的五十音對照表，只有十一個行尾', () => {
    expect(source.match(/'[ぁ-ゖァ-ヺー]+'/g)).toEqual(["'おごぞどのぽもよろをん'"]);
  });

  it('片假名不是另外打一份，是從平假名的碼位算過去的', () => {
    expect(source).toContain('KATAKANA_OFFSET');
  });
});
