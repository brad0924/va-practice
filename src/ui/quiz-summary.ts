import type { App } from '../app';
import { t } from '@core/i18n';
import { summary, type Result, type Round } from '@core/lib/quiz';
import { el, button } from './dom';
import { quizBar } from './quiz-bar';
import { renderTerm } from './reading-html';

/**
 * 沒答對的一列裡，詞條底下那兩行各自算哪一種。**不是顏色，是那一行的狀況**——
 * 顏色由 `styles.css` 決定，這裡只回答「這一行是什麼」。
 *
 * - `right`：正解的釋義。每一列都有，永遠是第一行。
 * - `wrong`：使用者點的那個釋義。
 * - `timeout`：逾時沒點。印「逾時」，不印紅的，讓「點錯」和「來不及」分得出來。
 */
export interface MissedLine {
  kind: 'right' | 'wrong' | 'timeout';
  text: string;
}

/**
 * 一張沒答對的卡，詞條底下印哪兩行（spec 實作決定八）。
 *
 * 開成 export 的純函式是為了測得動：`ADR-0014` 不准斷言 class 名，而「正解綠、點錯紅」
 * 又是要有驗收的一條。與 `spelling-summary.ts` 的 `toneOf()` 同一個做法。
 *
 * 點到正解卻沒答對，只可能是過了時限才點下去——`settle()` 判 0 分，但 `picked` 仍是正解
 * 那一格。答題畫面會先把它換成 null；這裡再擋一層，照逾時畫，不會印出同一個釋義一綠一紅。
 */
export function missedLines(result: Result): MissedLine[] {
  const right: MissedLine = { kind: 'right', text: result.options[result.answerIndex]! };
  if (result.picked === null || result.picked === result.answerIndex) {
    return [right, { kind: 'timeout', text: t('quiz.timedOut') }];
  }
  return [right, { kind: 'wrong', text: result.options[result.picked]! }];
}

/**
 * 一張沒答對的卡：詞條（標讀音）加上 `missedLines()` 那兩行。
 * 沒標讀音的卡，`renderTerm()` 就原樣印出詞條（spec 實作決定四）。
 */
function missedRow(result: Result): HTMLElement {
  return el(
    'div',
    'quiz-missed-card',
    el('div', 'quiz-missed-term', renderTerm(result.card.text, true)),
    ...missedLines(result).map((line) => el('div', `quiz-missed-line ${line.kind}`, line.text)),
  );
}

/**
 * 頂上那三格的其中一格：一個數字加一個標籤。
 *
 * **這幾行與 `spelling-summary.ts`、`stats-view.ts` 的 `tile()` 一模一樣，刻意不共用。**
 * 借的是同一套 `.tiles` / `.tile` 樣式，理由見 `spelling-summary.ts` 那一支的註解；
 * 不 import 那一支，是因為問答的畫面不該為了三行 DOM 去依賴拼字的畫面。
 */
function tile(num: string, label: string): HTMLElement {
  return el('div', 'tile', el('div', 'tile-num', num), el('div', 'tile-label', label));
}

/**
 * 一輪問答的成績（spec 實作決定八）。
 *
 * 頂上三格，底下只列沒答對的卡（票 03），最後是「再一輪」。「換單字本」是票 04 的事。
 *
 * 數字一律問 `summary()`，這一頁自己不算——平均除的是已經結算過的題數，那條規則住在
 * `quiz.ts`，抄過來就會有兩份。這一頁不落地：不寫 `AppData`、不進備份，重整頁面就沒了。
 */
export function quizSummaryView(app: App, round: Round, onAgain: () => void): HTMLElement {
  const screen = el('div', 'screen');

  const header = quizBar(app);

  const totals = summary(round);

  const main = el('main', 'panel');
  main.append(
    el(
      'div',
      'tiles',
      tile(
        t('quiz.correctRatio', { correct: totals.correct, total: totals.total }),
        t('quiz.correctLabel'),
      ),
      tile(String(totals.points), t('quiz.pointsLabel')),
      // 小數一位，與拼字成績頁同一個理由：看得出離滿分 10 分還有多遠。
      tile(totals.average.toFixed(1), t('quiz.averageLabel')),
    ),
  );

  // 答對的卡不列出來，這一頁只講沒答對的。全對時主體換成一句話，不留一塊空白；
  // 一題都還沒答就收工時換另一句——頂上是 `0 / 0`，再說全部答對就互相打架。
  // 外框與那一句借拼字成績頁的 `.missed-list` / `.missed-none`，兩頁看起來是同一種東西。
  main.append(
    totals.total === 0
      ? el('p', 'missed-none', t('quiz.nothingAnswered'))
      : totals.missed.length === 0
        ? el('p', 'missed-none', t('quiz.noMistakes'))
        : el('div', 'missed-list', ...totals.missed.map(missedRow)),
  );

  const footer = el('footer', 'actions', button('primary', t('quiz.again'), onAgain));

  // 問答整條線都不做鍵盤操作。明寫成 null 而不是留白：留白會讓上一個畫面的處理器活到這一頁來。
  app.keyHandler = null;

  screen.append(header, main, footer);
  return screen;
}
