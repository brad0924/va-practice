import type { App } from '../app';
import { t, type Key } from '@core/i18n';
import { acceptFakes, askFakes } from '@core/lib/gemini-fakes';
import { cardsNeedingFakes, isRoundOver, startRound, type FakeMeanings, type Round } from '@core/lib/quiz';
import type { Card } from '@core/lib/types';
import { el } from './dom';
import { quizBar } from './quiz-bar';
import { quizSummaryView } from './quiz-summary';
import { quizView } from './quiz-view';

/**
 * 問答的入口，也是它幾頁之間的接線：答題 → 成績，出不了題時另有一頁。
 * 釋義湊不到四個、要等 Gemini 補假釋義時，答題頁之前還有一頁「正在準備」（票 06）。
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
   *
   * 整個 app 湊不到四個不同的釋義時，先請 Gemini 補假釋義（票 06）。夠四個的時候
   * 走的仍是原本那一行，一個請求都不發。沒設金鑰就直接給出不了題那一頁。
   */
  function freshPage(): HTMLElement {
    const cards = app.data.cards;
    const needing = cardsNeedingFakes(cards, cards);
    if (needing.length === 0) {
      const round = startRound(cards, cards, app.random);
      return isRoundOver(round) ? emptyPage('quiz.noCardsNote') : answerPage(round);
    }

    const key = app.gemini.read();
    if (key === null) return emptyPage('quiz.noKeyNote');

    const waiting = preparingPage();
    void fakesFor(key, needing).then((fakes) => {
      // 等的這段時間使用者可能已經跳去別的畫面。那時這一頁已經不在文件裡，
      // 回來的結果直接丟掉：換頁會搶走鍵盤，也會蓋掉別人的 `app.quizRound`。
      if (!waiting.isConnected) return;
      const round = fakes === null ? null : startRound(cards, cards, app.random, fakes);
      show(round === null || isRoundOver(round) ? emptyPage('quiz.fakesFailedNote') : answerPage(round));
    });
    return waiting;
  }

  /**
   * 向 Gemini 要這幾張卡的假釋義，一輪只問這一次。任何一種失敗——離線、逾時、額度用完、
   * 回覆過不了 `acceptFakes()`——一律回 null，畫面照舊給出不了題那一頁（票 06）。
   */
  async function fakesFor(key: string, needing: readonly Card[]): Promise<FakeMeanings | null> {
    try {
      // bind 不可省：fetch 被拆下來單獨呼叫時瀏覽器會丟 Illegal invocation。
      return acceptFakes(needing, await askFakes(key, needing, fetch.bind(window)));
    } catch {
      return null;
    }
  }

  /**
   * 等 Gemini 回覆的那一頁。樣子比照出不了題那一頁，只換掉圖示與字。
   *
   * **碼表還沒開始跑**：答題頁要等回覆到了才建出來，碼表跟著它才開始。
   * 同時放掉上一輪與鍵盤，理由與 `answerPage()` 開頭那一行相同——這時已經是新的一輪了。
   */
  function preparingPage(): HTMLElement {
    app.quizRound = null;
    return notePage('⏳', null, t('quiz.preparing'));
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
   * 一題都出不了：整頁換成一段說明（票 02 實作時維護者選的）。樣子比照拼字零本那一頁。
   * 說明依原因分三種（票 06 待決 3）：沒有可出的卡、沒設金鑰、Gemini 沒補成。
   *
   * 沒有東西可封存，因此放掉上一輪——走到這裡只有兩條路：沒有上一輪直接進來，
   * 或在成績頁按了「再一輪」，後者等於已經不要那一份成績了。
   */
  function emptyPage(note: Key): HTMLElement {
    app.quizRound = null;
    return notePage('📚', t('quiz.noCardsTitle'), t(note));
  }

  /** 出不了題與正在準備共用的那個樣子：導覽列加一張置中的說明卡，鍵盤沒有事可做。 */
  function notePage(mark: string, title: string | null, note: string): HTMLElement {
    const screen = el('div', 'screen');
    const main = el('main', 'card done');
    main.append(el('div', 'done-mark', mark));
    if (title !== null) main.append(el('h1', 'done-title', title));
    main.append(el('p', 'done-note', note));

    app.keyHandler = null;
    screen.append(quizBar(app), main);
    return screen;
  }

  return current;
}
