import type { App } from '../app';
import { t, type Key } from '@core/i18n';
import { acceptFakes, askFakes } from '@core/lib/gemini-fakes';
import { cardsNeedingFakes, isRoundOver, startRound, type FakeMeanings, type Round } from '@core/lib/quiz';
import type { Card } from '@core/lib/types';
import { el } from './dom';
import { quizBar } from './quiz-bar';
import { quizBooksView } from './quiz-books';
import { quizSummaryView } from './quiz-summary';
import { quizView } from './quiz-view';

/**
 * 問答的入口，也是它幾頁之間的接線：挑單字本（票 04）→ 答題 → 成績。
 * 釋義湊不到四個、要等 Gemini 補假釋義時，答題頁之前還有一頁「正在準備」（票 06）。
 * 形狀照抄 `spelling-home.ts`，幾頁之間換頁同樣**不經過 `app.ts`**，
 * 換的手法同樣是把自己那一棵 `.screen` 原地換掉（`replaceWith`）。
 *
 * **進來該看哪一頁，規則在這裡**：上一輪還封存著就給成績頁，否則給挑書頁（spec 實作決定五）。
 *
 * 一輪存在 `app.quizRound`，與拼字那一格（`app.spellingRound`）分開：兩種練法各自封存，
 * 來回切換時兩邊的上一輪都還在（spec 實作決定五）。
 */
export function quizHome(app: App): HTMLElement {
  let current: HTMLElement = app.quizRound === null ? booksPage(null) : summaryPage(app.quizRound);

  function show(next: HTMLElement): void {
    // 還沒掛上文件時 `replaceWith()` 什麼都不做，因此仍然要換掉手上的參照。
    current.replaceWith(next);
    current = next;
  }

  // 底下幾支的名字一律 `-Page` 結尾，因為它們**不只是取一頁回來**：每一支都順手把
  // `app.quizRound` 換成那一頁該有的樣子，與 `spelling-home.ts` 同一個規矩。

  /**
   * 挑書頁。`notice` 是上一次按「開始」卻開不成的原因，沒有就是 null。
   *
   * 回到挑書頁就是放掉上一輪：人已經在挑下一批要練什麼了，那份成績再擺著只會擋路。
   * 開不成退回來時也一樣——走到那裡的只有「按了開始」與「按了再一輪」，都已經不要那份成績了。
   */
  function booksPage(notice: Key | null): HTMLElement {
    app.quizRound = null;
    return quizBooksView(app, notice, (bookIds) => show(roundPage(bookIds)));
  }

  /**
   * 用挑到的那幾本開一輪，開得出來就給答題頁，一題都出不了就退回挑書頁印那一句
   * （票 04：比照拼字「這本是空的」）。挑書頁的「開始」與成績頁的「再一輪」走的是同一段
   * （spec 實作決定五）——各抄一份的話，改了出題資格只有一邊會跟著動。
   *
   * 每一次都重新讀 `app.data.cards`，不把上一輪的卡再洗一次——中途去卡片頁改過的東西，
   * 下一輪就吃得到。**只有出題的卡限挑到的那幾本**，干擾照樣從整個 app 抽（spec 實作決定三）。
   * 過濾只有一行，不借 `storage.ts` 的 `cardsInBooks()`，理由同 `spelling-books.ts` 的 `openRound()`。
   *
   * 整個 app 湊不到四個不同的釋義時，先請 Gemini 補假釋義（票 06）。夠四個的時候
   * 走的仍是原本那一行，一個請求都不發。沒設金鑰就直接退回挑書頁。
   */
  function roundPage(bookIds: readonly string[]): HTMLElement {
    const all = app.data.cards;
    const wanted = new Set(bookIds);
    const picked = all.filter((card) => wanted.has(card.bookId));

    const needing = cardsNeedingFakes(picked, all);
    if (needing.length === 0) {
      const round = startRound(picked, all, app.random);
      return isRoundOver(round) ? booksPage('quiz.noCardsNote') : answerPage(round);
    }

    const key = app.gemini.read();
    if (key === null) return booksPage('quiz.noKeyNote');

    const waiting = preparingPage();
    void fakesFor(key, needing).then((fakes) => {
      // 等的這段時間使用者可能已經跳去別的畫面。那時這一頁已經不在文件裡，
      // 回來的結果直接丟掉：換頁會搶走鍵盤，也會蓋掉別人的 `app.quizRound`。
      if (!waiting.isConnected) return;
      const round = fakes === null ? null : startRound(picked, all, app.random, fakes);
      show(round === null || isRoundOver(round) ? booksPage('quiz.fakesFailedNote') : answerPage(round));
    });
    return waiting;
  }

  /**
   * 向 Gemini 要這幾張卡的假釋義，一輪只問這一次。任何一種失敗——離線、逾時、額度用完、
   * 回覆過不了 `acceptFakes()`——一律回 null，畫面照舊退回挑書頁（票 06）。
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
   * 等 Gemini 回覆的那一頁：標題列與分段切換加一張置中的說明卡，樣子比照拼字零本那一頁。
   *
   * **碼表還沒開始跑**：答題頁要等回覆到了才建出來，碼表跟著它才開始。
   * 同時放掉上一輪與鍵盤，理由與 `answerPage()` 開頭那一行相同——這時已經是新的一輪了。
   */
  function preparingPage(): HTMLElement {
    app.quizRound = null;
    const screen = el('div', 'screen');
    const main = el('main', 'card done', el('div', 'done-mark', '⏳'), el('p', 'done-note', t('quiz.preparing')));

    app.keyHandler = null;
    screen.append(quizBar(app), main);
    return screen;
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
    return quizSummaryView(
      app,
      round,
      // 「再一輪」：用同一批單字本重來，不回挑書頁（spec 使用者故事 33）。
      // 重新讀一次本機存的那幾本，被刪掉的本在這裡就濾掉了。
      () => show(roundPage(app.quizBooks.read(app.data.books))),
      () => show(booksPage(null)),
    );
  }

  return current;
}
