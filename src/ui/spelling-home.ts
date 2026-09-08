import type { App } from '../app';
import { isRoundOver, type Round } from '@core/lib/spelling';
import { openRound, spellingBooksView } from './spelling-books';
import { spellingSummaryView } from './spelling-summary';
import { spellingView } from './spelling-view';

/**
 * 拼字的入口，也是它三頁之間的接線：挑單字本（票 04）→ 答題（票 03）→ 成績（票 05）。
 *
 * **進來該看哪一頁，規則在這裡**：上一輪還封存著就給成績頁，否則給挑書頁（票 05 決定 1
 * 的第三條）。票 06 的 `showSpelling()` 只要呼叫這一支，不必自己判斷。
 *
 * 三頁之間換頁**不經過 `app.ts`**：拼字是一座小島，島內的三頁互相認得，島外只有一道門。
 * 換的手法是把自己那一棵 `.screen` 原地換掉（`replaceWith`），因此不必多包一層容器，
 * 每一頁仍然是 `#app` 的直接子節點，`.screen` 那條 `height: 100%` 照樣算得出高度。
 *
 * 一輪存在 `app.spellingRound`：畫面被 `root.replaceChildren()` 丟掉時沒有人通知它，
 * 記在這一頁裡的東西會跟著消失，而「中途跳去別的畫面，那一輪照樣封存」要求它活得比畫面久。
 */
export function spellingHome(app: App): HTMLElement {
  // 第一頁先建出來，之後每一次換頁都是把手上這一棵換掉。
  let current: HTMLElement =
    app.spellingRound === null ? booksPage() : summaryPage(app.spellingRound);

  function show(next: HTMLElement): void {
    // 還沒掛上文件時 `replaceWith()` 什麼都不做，因此仍然要換掉手上的參照——
    // 這一支唯一的呼叫者是使用者的點擊，那時一定掛著，但少了這一行就只有第一次換得動。
    current.replaceWith(next);
    current = next;
  }

  // 底下三支的名字一律 `-Page` 結尾，因為它們**不只是取一頁回來**：每一支都順手把
  // `app.spellingRound` 換成那一頁該有的樣子。封存與放掉只發生在這三行，讀一次就數得完。

  function booksPage(): HTMLElement {
    // 回到挑書頁就是放掉上一輪：人已經在挑下一批要練什麼了，那份成績再擺著只會擋路。
    app.spellingRound = null;
    return spellingBooksView(app, (round) => show(answerPage(round)));
  }

  function answerPage(round: Round): HTMLElement {
    // 開始答題的那一刻先清掉上一輪：新的一輪還沒有任何一題結算過，這時跳走就是白練一場，
    // 不該讓上一輪的成績冒充成這一輪的。
    app.spellingRound = null;
    return spellingView(
      app,
      round,
      // **每結算一題就封存一次**，不等這一輪結束（spec 決定 12）。練到第七題跳去卡片畫面，
      // 回拼字看到的就是那七題的成績。只在收工時封存的話，中途跳走等於全部白練。
      (progress) => {
        app.spellingRound = progress;
      },
      (done) => show(summaryPage(done)),
    );
  }

  function summaryPage(round: Round): HTMLElement {
    app.spellingRound = round;
    return spellingSummaryView(app, round, again, () => show(booksPage()));
  }

  /**
   * 「再一輪」：用同一批單字本重來，不回挑書那頁（票 05 決定 8）。
   *
   * 重新讀一次挑到的那幾本而不是把上一輪的卡再洗一次——中途去卡片頁改過的東西，
   * 下一輪就吃得到。那幾本在這中間被刪光時開出來的是一輪空的，退回挑書頁講那句話，
   * 與按「開始」撞到同一件事時的去處一致（票 04 決定 8）。
   */
  function again(): void {
    const round = openRound(app, app.spellingBooks.read(app.data.books));
    show(isRoundOver(round) ? booksPage() : answerPage(round));
  }

  return current;
}
