/**
 * 問答：出題資格、選項、一輪的推進與計分，全收在這裡，一律不碰畫面。
 *
 * 時間與亂數以參數注入，模組內不看時鐘也不取用全域亂數，與 `spelling.ts` 同一套規矩。
 * 碼表怎麼跑是畫面的事，這裡只吃「花了幾秒」這個數字。
 *
 * 刻意不併進 `spelling.ts`，也不併進 `review.ts`（spec 實作決定一）：
 * 那支管排程，這支一行排程都不碰（`ADR-0021`）；拼字的一輪長的是格子與磚，
 * 問答的一輪長的是四個選項，兩者形狀不同。唯一共用的是算分那一條，見 `settle()`。
 */
import { AppError } from './app-error';
import { points } from './spelling';
import type { Card } from './types';

/** 一題的時限（秒）。實玩之後再調（spec 實作決定二）。 */
export const TIME_LIMIT = 10;

/** 一題擺幾個選項：一個正解加三個干擾。 */
export const OPTION_COUNT = 4;

/**
 * 一題：一張卡與它的四個選項。一輪開始時就全部算好，之後不再變動。
 * 選項是去除頭尾空白之後的釋義。
 */
export interface Question {
  card: Card;
  options: readonly string[];
  /** 正解是第幾個選項。 */
  answerIndex: number;
}

/** 一題結算後留下的東西。成績頁直接畫它，不再自己重算。 */
export interface Result {
  card: Card;
  options: readonly string[];
  /** 正解是第幾個選項。 */
  answerIndex: number;
  /** 使用者點了第幾個選項。逾時沒點為 null。 */
  picked: number | null;
  correct: boolean;
  points: number;
}

/** 一輪：洗好的卡序、走到第幾題、已結算的每一題。 */
export interface Round {
  questions: readonly Question[];
  /** 目前這一題的序號。等於題數即這一輪結束。 */
  index: number;
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
  /** 沒答對的每一題，含逾時的。 */
  missed: readonly Result[];
}

/**
 * 比對用的釋義：去除頭尾空白。與 **必填格** 的「還空著」同一個判準（spec 實作決定三）。
 * 空字串代表這張卡沒有釋義。
 */
function meaningOf(card: Card): string {
  return card.meaning.trim();
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
 * 開一輪：濾掉出不了題的卡、洗牌，每一題各自把四個選項也洗好。
 * 同一組 `random` 種子跑兩次，卡序與選項順序完全一樣。
 *
 * `pickedCards` 是這一輪挑到的卡，`all` 是整個 app 的卡。**干擾從 `all` 抽**，
 * 不限挑到的那幾本：只挑一本兩張卡的小本時也練得起來。
 *
 * 出題資格（spec 實作決定四）：釋義去除頭尾空白後還有字就出題，**讀音不是條件**——
 * 問答拿釋義當正解，讀音只是答完的附贈。整個 app 湊不出四個不同的釋義時，一題都不出，
 * 開出來的一輪一開始就是結束的。
 */
export function startRound(
  pickedCards: readonly Card[],
  all: readonly Card[],
  random: () => number,
): Round {
  // 相同的釋義只算一個：干擾不能與正解相同，三個干擾彼此也不能相同。
  const pool = [...new Set(all.map(meaningOf).filter((meaning) => meaning !== ''))];
  const eligible = pool.length < OPTION_COUNT ? [] : pickedCards.filter((card) => meaningOf(card) !== '');

  const questions = shuffle(eligible, random).map((card): Question => {
    const answer = meaningOf(card);
    const decoys = shuffle(
      pool.filter((meaning) => meaning !== answer),
      random,
    ).slice(0, OPTION_COUNT - 1);
    const options = shuffle([answer, ...decoys], random);
    return { card, options, answerIndex: options.indexOf(answer) };
  });
  return { questions, index: 0, results: [] };
}

export function currentQuestion(round: Round): Question | undefined {
  return round.questions[round.index];
}

/** 每一題都出過了即這一輪結束。一題都出不了的一輪，一開始就是結束的。 */
export function isRoundOver(round: Round): boolean {
  return round.index >= round.questions.length;
}

/**
 * 點了一個選項或逾時之後判定這一題，回傳推進過的一輪與這一題的結果。
 * 與 `settle()`（`spelling.ts`）同一種形狀：新狀態加上這一步的結果。
 *
 * `picked` 是點了第幾個選項，逾時沒點傳 null。`elapsed` 是畫面量到的秒數。
 *
 * **算分直接呼叫拼字那支 `points()`**，只把時限換成 `TIME_LIMIT`（spec 實作決定二）。
 * 抄一份的話，日後調了拼字的曲線，問答不會跟著動，兩種練法就不再是同一把尺。
 */
export function settle(
  round: Round,
  picked: number | null,
  elapsed: number,
): { round: Round; result: Result } {
  const question = currentQuestion(round);
  if (!question) throw new AppError('quiz.roundOver');

  // 超過時限才點一律不算對，即使點的是正解也一樣：時間到了就是沒過關。
  const correct = elapsed <= TIME_LIMIT && picked === question.answerIndex;
  const result: Result = {
    card: question.card,
    options: question.options,
    answerIndex: question.answerIndex,
    picked,
    correct,
    points: correct ? points(elapsed, TIME_LIMIT) : 0,
  };

  return {
    result,
    round: { ...round, index: round.index + 1, results: [...round.results, result] },
  };
}

/**
 * 一輪的成績。
 *
 * **平均分除的是已經結算過的題數**，不是答對的題數。
 * 中途按「結束」收工時，還沒出到的那幾題不列入——它們沒被答錯，只是沒發生。
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
