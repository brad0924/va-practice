import type { App } from '../app';
import { t } from '@core/i18n';
import { summary, type Round } from '@core/lib/quiz';
import { el, button } from './dom';
import { quizBar } from './quiz-bar';

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
 * 這一張票（票 02）只有頂上三格加「再一輪」。沒答對的清單是票 03 的事，
 * 「換單字本」是票 04 的事。
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

  const footer = el('footer', 'actions', button('primary', t('quiz.again'), onAgain));

  // 問答整條線都不做鍵盤操作。明寫成 null 而不是留白：留白會讓上一個畫面的處理器活到這一頁來。
  app.keyHandler = null;

  screen.append(header, main, footer);
  return screen;
}
