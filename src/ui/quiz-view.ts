import type { App } from '../app';
import { t, type Key } from '@core/i18n';
import {
  TIME_LIMIT,
  currentQuestion,
  isRoundOver,
  settle,
  type Result,
  type Round,
} from '@core/lib/quiz';
import { el, button } from './dom';
import { countdownClock } from './countdown-clock';
import { quizBar } from './quiz-bar';
import { renderTerm } from './reading-html';

/**
 * 答完之後正解在畫面上停留幾毫秒才自動進下一題（spec 實作決定七）。
 *
 * 比拼字的 1.6 秒短：這裡只要看一個選項與一行讀音，不必逐格對照。而「答完才標讀音」
 * 只在這一段看得到，長度是為了這件事才定成 1 秒的。實玩之後調得動。
 */
export const SETTLE_PAUSE_MS = 1000;

/** 碼表多久重畫一次。與拼字同一個數字。 */
const TICK_MS = 100;

/**
 * 答完那一行的三種收尾各自的字與顏色（票 07），照抄 `spelling-view.ts` 的 `OUTCOMES`：
 * 存 key 不存字，查字與挑顏色收在同一張表。key 另開一組 `quiz.settled*`，
 * 拼字講「拼對」、這裡講「答對」。
 */
const OUTCOMES = {
  correct: { key: 'quiz.settledCorrect', tone: 'ok' },
  wrong: { key: 'quiz.settledWrong', tone: 'bad' },
  timeout: { key: 'quiz.settledTimeout', tone: 'late' },
} satisfies Record<string, { key: Key; tone: string }>;

/**
 * 一題結算的結果算哪一種收尾。沒點（`picked` 是 null）就是逾時——過了時限才點的那一下
 * 在 `pick()` 已經被改成 null，這裡因此不必再看時間。
 */
function outcomeOf(result: Result): keyof typeof OUTCOMES {
  if (result.picked === null) return 'timeout';
  return result.correct ? 'correct' : 'wrong';
}

/**
 * 問答的答題畫面：上方是詞條與碼表，下方直排四個選項（spec 實作決定七）。
 *
 * **一輪是端進來的，不在這裡開**，交出去的兩個出口也照抄 `spelling-view.ts`：
 *
 * - `onSettled` 每結算一題就報一次。這一頁隨時可能被換掉而不收到任何通知
 *   （`root.replaceChildren()` 不出聲），練到一半跳去別的畫面時那一輪要照樣封存，
 *   因此進度得一路往外遞，不能只在最後交一次。
 * - `onDone` 在這一輪收工時報一次：每一題都出過了，或使用者按了「結束」。
 *
 * 最後一題結算時兩支都會被呼叫，`onSettled` 先。
 *
 * 這一頁沒有朗讀鈕，也沒有鍵盤操作（spec「不做的事」）。選項前因此不印數字——
 * 印了會讓人以為能按。
 */
export function quizView(
  app: App,
  round: Round,
  onSettled: (round: Round) => void,
  onDone: (round: Round) => void,
): HTMLElement {
  const screen = el('div', 'screen');

  const header = quizBar(app);
  const main = el('main', 'prompt');
  // 選項排在 footer：複習畫面的 footer 放的是「你要按的那幾顆」，這一頁要按的就是選項。
  const footer = el('footer', 'quiz-options');

  const term = el('div', 'term quiz-term');
  // 空的時候也借拼字 `.verdict` 那條 `min-height` 佔住一行：字冒出來的那一下詞條不會被往上擠。
  const verdict = el('div', 'verdict');
  const { element: clock, paint: paintRing } = countdownClock();
  const quit = button('end-round', t('quiz.quit'), endRound);

  /** 目前這一輪。每一次動作換上新的一份，不就地改——與 `quiz.ts` 那幾支純函式同一種形狀。 */
  let current = round;
  /** 這一題開始的時刻（毫秒）。碼表與計分都從它算。 */
  let startedAt = 0;
  /** 這一題結算後的結果；還沒點、也還沒逾時時是 null。 */
  let settled: Result | null = null;
  let ticker: number | null = null;
  let pause: number | null = null;

  /** 這一題花掉幾秒。時間在這一層才第一次被讀，`quiz.ts` 只吃這個數字。 */
  function elapsed(): number {
    return (app.now().getTime() - startedAt) / 1000;
  }

  function stopTicker(): void {
    if (ticker !== null) clearInterval(ticker);
    ticker = null;
  }

  /**
   * 碼表與「停留一下再進下一題」那兩支計時器一起收掉。
   *
   * 畫面被換掉時沒有人通知它們，因此每一下醒來都先看一眼自己還在不在文件上，
   * 脫離了就呼叫這支自我拆除。與拼字答題頁同一個立場（`ADR-0011`）。
   */
  function stopTimers(): void {
    stopTicker();
    if (pause !== null) clearTimeout(pause);
    pause = null;
  }

  function tick(): void {
    if (!screen.isConnected) {
      stopTimers();
      return;
    }
    const spent = elapsed();
    const left = TIME_LIMIT - spent;
    paintRing(left, TIME_LIMIT);
    if (left <= 0) finishQuestion(null, spent);
  }

  /**
   * 一個選項收尾之後的樣子：正解是 `ok`，點錯的那一個是 `bad`，其餘不標。
   * 逾時沒有點，因此只有正解那一格會標（spec 實作決定七）。
   */
  function optionTone(result: Result, index: number): string {
    if (index === result.answerIndex) return ' ok';
    if (index === result.picked) return ' bad';
    return '';
  }

  function refresh(): void {
    const question = currentQuestion(current);
    if (!question) return;

    // 詞條一開始不標讀音，答完才標上（spec 實作決定七）。沒標讀音的卡照常出題，
    // 那時答完也就原樣顯示（spec 實作決定四）。
    term.replaceChildren(renderTerm(question.card.text, settled !== null));

    // 幾分一律照 `settle()` 回的那一份印，畫面自己不算（票 07）。
    if (settled) {
      const outcome = OUTCOMES[outcomeOf(settled)];
      verdict.className = `verdict ${outcome.tone}`;
      verdict.textContent = t(outcome.key, { points: settled.points });
    } else {
      verdict.className = 'verdict';
      verdict.textContent = '';
    }

    // 收尾之後整批選項都只靠 `disabled`：它同時擋住點擊與鍵盤聚焦，手滑連點第二個
    // 也點不下去。`pick()` 開頭那一行是第二層。
    footer.replaceChildren(
      ...question.options.map((meaning, index) => {
        const tone = settled ? optionTone(settled, index) : '';
        const node = button(`quiz-option${tone}`, meaning, () => pick(index));
        node.disabled = settled !== null;
        return node;
      }),
    );

    // 收尾那一下到進下一題之間也按不動。那一段裡剛判好的結果還在 `finishQuestion()` 手上，
    // 沒有換進 `current`；此時交出去會把那一題弄丟。與拼字答題頁同一個理由。
    quit.disabled = settled !== null;

    main.replaceChildren(clock, term, verdict, quit);
  }

  function pick(index: number): void {
    if (settled) return;
    // 碼表 0.1 秒才醒一次，真的瀏覽器裡還常常晚到。過了時限才點下去的那一下，
    // `quiz.ts` 本來就判 0 分；這裡把它當成逾時來畫，才不會出現「正解轉綠卻 0 分」
    // 或「逾時卻有紅的」。判準與 `settle()` 的 `elapsed <= TIME_LIMIT` 同一條。
    // 時鐘只讀這一次，同一個數字交給 `settle()`：分兩次讀的話，剛好卡在時限上的那一下
    // 會這邊判沒逾時、那邊判 0 分，印出「答錯了」（票 07 審查時抓到的）。
    const spent = elapsed();
    finishQuestion(spent > TIME_LIMIT ? null : index, spent);
  }

  /**
   * 這一題收尾：停住碼表、翻出正解與讀音、停一下再進下一題。
   * 對錯與計分一律問 `quiz.ts`，畫面自己不算。`spent` 是呼叫的人量好的作答秒數。
   */
  function finishQuestion(picked: number | null, spent: number): void {
    stopTicker();
    const judged = settle(current, picked, spent);
    settled = judged.result;
    // **推進的那一份立刻往外報**，不等停留那 1 秒結束：這一頁在那段期間照樣可能被換掉。
    onSettled(judged.round);
    // 逾時的讀數停在 0，不停在最後一下量到的 0.1。
    paintRing(picked === null ? 0 : TIME_LIMIT - spent, TIME_LIMIT);
    refresh();

    pause = window.setTimeout(() => {
      pause = null;
      if (!screen.isConnected) {
        stopTimers();
        return;
      }
      current = judged.round;
      settled = null;
      if (isRoundOver(current)) {
        onDone(current);
        return;
      }
      startQuestion();
    }, SETTLE_PAUSE_MS);
  }

  /**
   * 中途收工：停住碼表，把這一輪原樣交出去，成績頁接手。
   * **正在答的那一題不判**，與拼字同一個立場：它沒被答錯，只是還沒發生。
   */
  function endRound(): void {
    stopTimers();
    onDone(current);
  }

  /** 開始一題。碼表在這一題出現的那一刻就跑，不等使用者動作。 */
  function startQuestion(): void {
    startedAt = app.now().getTime();
    refresh();
    paintRing(TIME_LIMIT, TIME_LIMIT);
    ticker = window.setInterval(tick, TICK_MS);
  }

  // 明寫成 null 而不是留白：留白會讓上一個畫面的處理器活到這一頁來。
  app.keyHandler = null;

  // 一題都出不了的一輪不該走到這裡，`quiz-home.ts` 擋在前面。
  // 真的走到了也不當機：碼表不跑，畫面停在空的。
  if (!isRoundOver(current)) startQuestion();

  screen.append(header, main, footer);
  return screen;
}
