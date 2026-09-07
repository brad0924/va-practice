/**
 * 拼字：出題資格、磚、一輪的推進與計分，全收在這裡，一律不碰畫面。
 *
 * 時間與亂數以參數注入，模組內不看時鐘也不取用全域亂數，與 `review.ts` 同一套規矩。
 * 碼表怎麼跑是畫面的事，這裡只吃「花了幾秒」這個數字。
 *
 * 刻意不塞進 `review.ts`：那支管排程，這支一行排程都不碰（`ADR-0021`）。
 * 混在一起會讓「拼字不寫 `due`」這條規則失去一道天然的界線。
 */
import { AppError } from './app-error';
import { KANA, toReadingText } from './reading';
import type { Card } from './types';

/** 一個假名給幾秒。實玩之後再調（spec 決定 5）。 */
export const SECONDS_PER_KANA = 3;

/** 時限的前幾成之內拼完給滿分。 */
export const FULL_POINTS_RATIO = 0.3;

/** 一題拼對拿得到的最高分。 */
export const MAX_POINTS = 10;

/**
 * 一題：一張卡、它的正解、下半部那幾塊磚，以及時限。
 * 一輪開始時就全部算好，之後不再變動——會變的只有各格填了什麼。
 */
export interface Question {
  card: Card;
  /** 正解逐格一個假名。 */
  answer: readonly string[];
  /** 下半部的磚，順序即畫面上的順序。 */
  tiles: readonly string[];
  /** 時限（秒）。 */
  limit: number;
}

/** 一題結算後留下的東西。成績頁的逐格對照直接畫它，不再自己重算。 */
export interface Result {
  card: Card;
  /** 正解逐格。 */
  answer: readonly string[];
  /** 使用者當時填的逐格。逾時沒填完的格子是空字串。 */
  filled: readonly string[];
  correct: boolean;
  points: number;
}

/** 一輪：洗好的卡序、走到第幾題、目前這一題各格填了哪一塊磚、已結算的每一題。 */
export interface Round {
  questions: readonly Question[];
  /** 目前這一題的序號。等於題數即這一輪結束。 */
  index: number;
  /** 目前這一題每一格填了第幾塊磚，null 為空格。 */
  slots: readonly (number | null)[];
  results: readonly Result[];
}

/** 一輪的成績。 */
export interface Summary {
  /** 已經結算過的題數。中途收工時不含還沒出到的那幾題。 */
  total: number;
  correct: number;
  points: number;
  /** 總分除以 `total`。一題都還沒結算時為 0。 */
  average: number;
  /** 沒拼對的每一題，供逐格對照。 */
  missed: readonly Result[];
}

/**
 * 這張卡的正解：漢字換成標注的讀音（`焦[こ]がす` → `こがす`）。
 * 有漢字卻沒標讀音時，`toReadingText()` 會把漢字原樣吐回來，因此結果不全是假名。
 */
function answerOf(card: Card): string {
  return toReadingText(card.text);
}

/**
 * 出得了題嗎：正解必須整串都是假名（spec 決定 16）。
 *
 * 「匯入單字」進來的卡繞過編輯畫面的補齊要求（`ADR-0009`），可能有漢字卻沒標讀音。
 * 那種卡拿不出正解，濾掉不出題。判準與 `reading.ts` 同一條正則。
 */
export function isEligible(card: Card): boolean {
  return KANA.test(answerOf(card));
}

/** 洗牌。與 `buildQueue()`（`review.ts`）同一套 Fisher-Yates，亂數由外面遞進來。 */
function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  return shuffled;
}

/**
 * 目前這一題每一格的內容，空格是空字串。
 * 畫面與結算都要問這個，因此開在外面，不要各算一次。
 */
export function filledSlots(round: Round): string[] {
  const question = currentQuestion(round);
  if (!question) return [];
  return round.slots.map((tile) => (tile === null ? '' : question.tiles[tile]!));
}

/** 那一題的空格：正解幾個假名就幾格。沒有下一題時是空的。 */
function emptySlots(question: Question | undefined): (number | null)[] {
  return question ? question.answer.map(() => null) : [];
}

/**
 * 開一輪：濾掉出不了題的卡、洗牌，每一題各自把磚也洗好。
 * 同一組 `random` 種子跑兩次，卡序與磚序完全一樣。
 */
export function startRound(cards: readonly Card[], random: () => number): Round {
  const questions = shuffle(cards.filter(isEligible), random).map((card): Question => {
    const answer = [...answerOf(card)];
    return {
      card,
      answer,
      tiles: shuffle(answer, random),
      limit: answer.length * SECONDS_PER_KANA,
    };
  });
  return { questions, index: 0, slots: emptySlots(questions[0]), results: [] };
}

export function currentQuestion(round: Round): Question | undefined {
  return round.questions[round.index];
}

/** 每一題都出過了即這一輪結束。一張卡都出不了題的一輪，一開始就是結束的。 */
export function isRoundOver(round: Round): boolean {
  return round.index >= round.questions.length;
}

/**
 * 把那塊磚放進最前面的空格。沒有空格就原樣回傳。
 *
 * **只負責放，不回答對錯**（spec 決定 3）。判定只發生在 `settle()`。
 * 已經填在某一格的磚再點一次也原樣回傳，否則同一塊磚會同時佔住兩格。
 */
export function place(round: Round, tileIndex: number): Round {
  const question = currentQuestion(round);
  if (!question) return round;
  if (tileIndex < 0 || tileIndex >= question.tiles.length) return round;
  if (round.slots.includes(tileIndex)) return round;

  const target = round.slots.indexOf(null);
  if (target === -1) return round;

  const slots = [...round.slots];
  slots[target] = tileIndex;
  return { ...round, slots };
}

/**
 * 清掉那一格，其他格不動，那塊磚回到可點的狀態（spec 決定 4）。
 * 清的是中間那一格時，下一次 `place()` 補進的就是這個洞——`place()` 找的是最前面的空格。
 */
export function clearSlot(round: Round, slotIndex: number): Round {
  if (slotIndex < 0 || slotIndex >= round.slots.length) return round;
  if (round.slots[slotIndex] === null) return round;

  const slots = [...round.slots];
  slots[slotIndex] = null;
  return { ...round, slots };
}

/**
 * 一題拿幾分（spec 決定 8）：
 * 時限的前三成之內拼完給滿分，之後線性遞減到 1 分。逾時 0 分。
 *
 * 不用「純按剩餘秒數比例」：點三塊磚本身就要花一兩秒，滿分永遠拿不到。
 */
export function points(elapsed: number, limit: number): number {
  if (elapsed > limit) return 0;
  const full = FULL_POINTS_RATIO * limit;
  if (elapsed <= full) return MAX_POINTS;
  const decayed = MAX_POINTS - (MAX_POINTS - 1) * ((elapsed - full) / (limit - full));
  return Math.max(1, Math.round(decayed));
}

/**
 * 整排填滿或逾時之後判定這一題，回傳推進過的一輪與這一題的結果。
 * 與 `rate()`（`review.ts`）同一種形狀：新狀態加上這一步的結果。
 *
 * `elapsed` 是畫面量到的秒數。逾時的那一題照樣走這裡，只是格子沒填滿，判不對。
 */
export function settle(round: Round, elapsed: number): { round: Round; result: Result } {
  const question = currentQuestion(round);
  if (!question) throw new AppError('spelling.roundOver');

  const filled = filledSlots(round);
  // 逾時一律不算拼對，即使倒數歸零的那一瞬間剛好把最後一塊磚放對也一樣：
  // 時間到了就是沒過關。少了這一條，成績頁的「拼對」會混進一題 0 分的。
  const correct = elapsed <= question.limit && filled.every((kana, i) => kana === question.answer[i]);
  const result: Result = {
    card: question.card,
    answer: question.answer,
    filled,
    correct,
    points: correct ? points(elapsed, question.limit) : 0,
  };

  const index = round.index + 1;
  return {
    result,
    round: {
      ...round,
      index,
      slots: emptySlots(round.questions[index]),
      results: [...round.results, result],
    },
  };
}

/**
 * 一輪的成績。
 *
 * **平均分除的是已經結算過的題數**（spec 決定 23），不是拼對的題數。
 * 中途按「結束」收工時，還沒出到的那幾題不列入——它們沒被拼錯，只是沒發生。
 */
export function summary(round: Round): Summary {
  const total = round.results.length;
  const earned = round.results.reduce((sum, result) => sum + result.points, 0);
  return {
    total,
    correct: round.results.filter((result) => result.correct).length,
    points: earned,
    average: total === 0 ? 0 : earned / total,
    missed: round.results.filter((result) => !result.correct),
  };
}
