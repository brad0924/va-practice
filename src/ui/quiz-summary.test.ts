// @vitest-environment jsdom

/**
 * 問答成績頁的沒答對清單（票 03）。
 *
 * 頂上三格與「再一輪」怎麼接回開一輪，由 `quiz-home.test.ts` 顧；這裡只看清單本身——
 * 該列的列了沒、不該列的有沒有溜進來、每一列印的是哪兩行。
 *
 * 刻意不測的：
 * - **顏色**。正解綠、點錯紅是版面，`ADR-0014` 明文不斷言。改成測 `missedLines()`——
 *   「這一列的哪一行算哪一種」離開 DOM 照樣成立，斷言得下去；顏色本身靠眼睛。
 *   與 `spelling-summary.test.ts` 的 `toneOf()` 同一個做法。
 * - **讀音標在字的上方**。那是 `ruby` 的排版，這裡只驗讀音有沒有被印出來。
 */

import { describe, it, expect, afterEach } from 'vitest';
import type { App } from '../app';
import { missedLines, quizSummaryView } from './quiz-summary';
import type { Result, Round } from '@core/lib/quiz';
import type { Card } from '@core/lib/types';
import zhHant from '@core/i18n/zh-Hant';

function card(text: string, meaning: string): Card {
  return { id: text, bookId: 'b1', text, meaning, interval: null, ease: 2.5, due: null };
}

const OPTIONS = ['燒焦、烤焦', '山頂', '雨', '水'] as const;

/**
 * 手捏一題的結果。正解一律是 `answer` 那一格，`picked` 為 null 代表逾時沒點——
 * `settle()` 吐出來的就是這個形狀。
 */
function result(text: string, answer: number, picked: number | null, points = 0): Result {
  return {
    card: card(text, OPTIONS[answer]!),
    options: OPTIONS,
    answerIndex: answer,
    picked,
    correct: picked === answer && points > 0,
    points,
  };
}

function roundOf(...results: Result[]): Round {
  return { questions: [], index: 0, results };
}

function mount(round: Round): HTMLElement {
  const app = {
    data: { version: 3, books: [], cards: [], scopes: { review: [], list: [], stats: [] }, updatedAt: 0 },
    now: () => new Date(),
    keyHandler: null,
  } as unknown as App;
  const screen = quizSummaryView(app, round, () => {});
  document.body.replaceChildren(screen);
  return screen;
}

/** 每一列的文字：詞條那一行、正解那一行、點錯（或逾時）那一行。 */
const rows = (screen: HTMLElement) =>
  [...screen.querySelectorAll<HTMLElement>('.quiz-missed-card')].map((row) =>
    [...row.children].map((line) => line.textContent),
  );

afterEach(() => {
  document.body.replaceChildren();
});

describe('沒答對的清單', () => {
  it('每一張沒答對的卡一列，答對的一張都不列', () => {
    const screen = mount(
      roundOf(
        result('焦[こ]がす', 0, 1),
        result('あめ', 2, 2, 10),
        result('峠[とうげ]', 1, null),
      ),
    );

    expect(rows(screen).map((row) => row[1])).toEqual(['燒焦、烤焦', '山頂']);
  });

  it('點錯的那一列印詞條（標讀音）、正解的釋義、使用者點的那個釋義', () => {
    const screen = mount(roundOf(result('焦[こ]がす', 0, 1)));

    // 讀音印出來了：`ruby` 的 `rt` 也是文字，因此「焦こがす」連在一起。
    expect(rows(screen)).toEqual([['焦こがす', '燒焦、烤焦', '山頂']]);
  });

  it('逾時的那一列不印使用者點的釋義，改寫「逾時」', () => {
    const screen = mount(roundOf(result('峠[とうげ]', 1, null)));

    expect(rows(screen)).toEqual([['峠とうげ', '山頂', zhHant['quiz.timedOut']]]);
  });

  it('有漢字卻沒標讀音的卡，詞條原樣印出來', () => {
    const screen = mount(roundOf(result('焦がす', 0, 3)));

    expect(rows(screen)[0]![0]).toBe('焦がす');
  });

  it('一題都沒錯時主體是一句話，不是一塊空白', () => {
    const screen = mount(roundOf(result('あめ', 2, 2, 10)));

    expect(rows(screen)).toHaveLength(0);
    expect(screen.querySelector('.missed-none')!.textContent).toBe(zhHant['quiz.noMistakes']);
  });

  it('一題都還沒答就收工時，印「還沒答」而不是「全部答對」', () => {
    const screen = mount(roundOf());

    // 頂上是 `0 / 0`，底下再說全部答對就互相打架（維護者選定兩頁一起改）。
    expect(screen.querySelector('.missed-none')!.textContent).toBe(zhHant['quiz.nothingAnswered']);
  });
});

describe('一列裡的哪一行算哪一種', () => {
  // 顏色是版面，`ADR-0014` 不准斷言；規則離開 DOM 照樣成立，因此拉出來直接測。

  it('點錯：正解那一行算 right，點的那一行算 wrong', () => {
    expect(missedLines(result('焦[こ]がす', 0, 1))).toEqual([
      { kind: 'right', text: '燒焦、烤焦' },
      { kind: 'wrong', text: '山頂' },
    ]);
  });

  it('逾時：正解那一行算 right，第二行算 timeout，沒有 wrong', () => {
    expect(missedLines(result('峠[とうげ]', 1, null))).toEqual([
      { kind: 'right', text: '山頂' },
      { kind: 'timeout', text: zhHant['quiz.timedOut'] },
    ]);
  });

  it('過了時限才點到正解，照逾時畫，不會出現同一個釋義一綠一紅', () => {
    // `settle()` 對這種情況判 0 分、`picked` 仍是正解那一格。答題畫面會先把它換成 null，
    // 這裡是第二層：真的遞進來了也不印成「點錯了正解」。
    const late: Result = { ...result('あめ', 2, 2), correct: false, points: 0 };

    expect(missedLines(late)).toEqual([
      { kind: 'right', text: '雨' },
      { kind: 'timeout', text: zhHant['quiz.timedOut'] },
    ]);
  });
});
