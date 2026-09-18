import type { App } from '../app';
import { t } from '@core/i18n';
import { isRoundOver, startRound, type Round } from '@core/lib/quiz';
import { el } from './dom';
import { quizBar } from './quiz-bar';
import { quizSummaryView } from './quiz-summary';
import { quizView } from './quiz-view';

/**
 * 問答的入口，也是它幾頁之間的接線：答題 → 成績，出不了題時另有一頁。
 * 形狀照抄 `spelling-home.ts`，三頁之間換頁同樣**不經過 `app.ts`**，
 * 換的手法同樣是把自己那一棵 `.screen` 原地換掉（`replaceWith`）。
 *
 * **進來該看哪一頁，規則在這裡**：上一輪還封存著就給成績頁，否則直接用全部單字本開一輪
 * （票 02）。挑書頁是票 04 的事，到時候「直接開一輪」那一條換成「給挑書頁」。
 *
 * 一輪存在 `app.quizRound`，與拼字那一格（`app.spellingRound`）分開：兩種練法各自封存，
 * 來回切換時兩邊的上一輪都還在（spec 實作決定五）。
 */
export function quizHome(app: App): HTMLElement {
  let current: HTMLElement = app.quizRound === null ? freshPage() : summaryPage(app.quizRound);

  function show(next: HTMLElement): void {
    // 還沒掛上文件時 `replaceWith()` 什麼都不做，因此仍然要換掉手上的參照。
    current.replaceWith(next);
    current = next;
  }

  // 底下幾支的名字一律 `-Page` 結尾，因為它們**不只是取一頁回來**：每一支都順手把
  // `app.quizRound` 換成那一頁該有的樣子，與 `spelling-home.ts` 同一個規矩。

  /**
   * 開一輪，開得出來就給答題頁，一題都出不了就給出不了題那一頁。
   * 進場與「再一輪」走的是同一段（spec 實作決定五）。
   *
   * 每一次都重新讀 `app.data.cards`，不把上一輪的卡再洗一次——中途去卡片頁改過的東西，
   * 下一輪就吃得到。這一張票沒有挑書，挑到的就是全部，干擾同樣從全部抽。
   */
  function freshPage(): HTMLElement {
    const round = startRound(app.data.cards, app.data.cards, app.random);
    return isRoundOver(round) ? emptyPage() : answerPage(round);
  }

  function answerPage(round: Round): HTMLElement {
    // 開始答題的那一刻先清掉上一輪：新的一輪還沒有任何一題結算過，這時跳走就是白練一場，
    // 不該讓上一輪的成績冒充成這一輪的。
    app.quizRound = null;
    return quizView(
      app,
      round,
      // **每結算一題就封存一次**，不等這一輪結束。練到第七題跳去卡片畫面，
      // 回問答看到的就是那七題的成績。
      (progress) => {
        app.quizRound = progress;
      },
      (done) => show(summaryPage(done)),
    );
  }

  function summaryPage(round: Round): HTMLElement {
    app.quizRound = round;
    return quizSummaryView(app, round, () => show(freshPage()));
  }

  /**
   * 一題都出不了（沒有可出的卡，或整個 app 湊不出四個不同的釋義）：整頁換成一段說明
   * （票 02 實作時維護者選的）。樣子比照拼字零本那一頁。
   *
   * 沒有東西可封存，因此放掉上一輪——走到這裡只有兩條路：沒有上一輪直接進來，
   * 或在成績頁按了「再一輪」，後者等於已經不要那一份成績了。
   */
  function emptyPage(): HTMLElement {
    app.quizRound = null;

    const screen = el('div', 'screen');
    const main = el('main', 'card done');
    main.append(
      el('div', 'done-mark', '📚'),
      el('h1', 'done-title', t('quiz.noCardsTitle')),
      el('p', 'done-note', t('quiz.noCardsNote')),
    );

    app.keyHandler = null;
    screen.append(quizBar(app), main);
    return screen;
  }

  return current;
}
