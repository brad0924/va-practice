import type { App } from '../app';
import { t } from '@core/i18n';
import { isRoundOver, startRound, type Round } from '@core/lib/spelling';
import { bookFilter } from './book-filter';
import { el, button } from './dom';
import { spellingBar } from './spelling-bar';

/**
 * 用挑到的那幾本開一輪。挑到的本一張卡都拿不出來時，回傳的一輪一開始就是結束的
 * （`isRoundOver()` 為真），由呼叫端決定要怎麼講那句話。
 *
 * 開在外面是因為成績頁的「再一輪」要用同一批單字本重來（票 05 決定 8），
 * 走的必須是同一段程式——各抄一份的話，改了出題資格只有一邊會跟著動。
 *
 * **不借 `cardsInBooks()`。** 它住在 `storage.ts`，而拼字整條線一行都不 import 那支
 * （`ADR-0021`，票 03 的測試有守門）。這個過濾只有一行，抄比破例划算。
 */
export function openRound(app: App, bookIds: readonly string[]): Round {
  const wanted = new Set(bookIds);
  return startRound(
    app.data.cards.filter((card) => wanted.has(card.bookId)),
    app.random,
  );
}

/**
 * 拼字的首頁：挑要練哪幾本單字本。按複習畫面的「拼字」進來看到的是這一頁，不是題目。
 *
 * **一輪在這裡開。** 洗牌與挑干擾要亂數，而亂數在這個 app 裡只有 `app.ts` 碰得到
 * （`app.random`）；洗好之後整份端給 `spellingView`，那一頁因此完全不必知道亂數存在。
 * `onStart` 收到的就是那一份，導覽由呼叫端接手（票 06）。
 *
 * 挑到的那幾本存在本機自己那一格（`spelling-books.ts`），不進 `AppData`、不隨備份走、
 * 不上雲端（`ADR-0021`）。手機挑的與電腦挑的可以不一樣，那是想要的行為。
 */
export function spellingBooksView(app: App, onStart: (round: Round) => void): HTMLElement {
  if (app.data.books.length === 0) return noBooksView(app);

  const screen = el('div', 'screen');

  const header = spellingBar(app);

  /** 目前勾了哪幾本。指不到的 id 與「沒挑過」都由 read() 收乾淨，這裡拿到的一定是現存的本。 */
  let chosen = app.spellingBooks.read(app.data.books);

  /** 按過「開始」但一題都出不了。改選之後就清掉——那一句話講的是上一次的挑法。 */
  let barren = false;

  // 只重畫底下那兩樣（按鈕的死活、那一句話），不整頁重建：下拉才不會每勾一本就收起來。
  const filter = bookFilter({
    books: app.data.books,
    selected: chosen,
    variant: 'block',
    onChange: (ids) => {
      chosen = ids;
      app.spellingBooks.write(ids);
      barren = false;
      refresh();
    },
  });

  /**
   * 出不了題時的那一句。`.error:empty` 本來就不顯示，因此清空就等於收起來，
   * 不必自己管 hidden——與 `editor-view.ts` 那幾句驗證訊息同一種處理。
   */
  const notice = el('p', 'error');

  const main = el('main', 'panel');
  main.append(el('div', 'form', filter, el('p', 'hint', t('spelling.pickHint')), notice));

  const start = button('primary', t('spelling.start'), begin);
  const footer = el('footer', 'actions', start);

  function refresh(): void {
    // 一本都沒挑就開始不了（票 04 決定 5），比照三組範圍「都至少要有一本」的規矩。
    // 只靠 disabled：它同時擋住點擊與鍵盤聚焦，樣式那條 `.actions > button:disabled` 也吃得到。
    start.disabled = chosen.length === 0;
    notice.textContent = barren ? t('spelling.noCards') : '';
  }

  function begin(): void {
    const round = openRound(app, chosen);

    // 挑到的每一本都拿不出卡（本身是空的，或全是有漢字卻沒標讀音的卡）：不開始，
    // 把那一句話印出來，人留在這一頁改選（票 04 決定 8）。`startRound()` 已經濾過出題資格，
    // 因此這裡不必自己再判一次 `isEligible()`。
    if (isRoundOver(round)) {
      barren = true;
      refresh();
      return;
    }
    onStart(round);
  }

  // 這一頁沒有快捷鍵。明寫成 null 而不是留白：留白會讓上一個畫面的處理器活到這一頁來。
  // 收下拉的 Esc 由 `bookFilter` 自己處理，不經過這裡。
  app.keyHandler = null;

  refresh();
  screen.append(header, main, footer);
  return screen;
}

/**
 * 一本單字本都沒有：選單放上去就是顆死按鈕，因此整頁換成指路（票 04 決定 9）。
 * 形狀比照 `review-view.ts` 的 `noBooksView()`，只有那一句話與去處不同。
 */
function noBooksView(app: App): HTMLElement {
  const screen = el('div', 'screen');

  // 與有本的版本同一條標題列：複習畫面右側那顆「拼字」在零本時也按得到，
  // 進來看到的這一頁若少一排鈕，同一個位置的東西就會忽有忽無。
  //
  // 票 06 只講了有本的那個版本，零本這一版是實作時端給維護者選的，他選「兩個狀態長一樣」。
  // 反面的選法是零本時複習畫面右邊只留「卡片」，代價是這一頁從此走不到（等於死路）。
  const header = spellingBar(app);

  const main = el('main', 'card done');
  main.append(
    el('div', 'done-mark', '📚'),
    el('h1', 'done-title', t('spelling.noBooksTitle')),
    el('p', 'done-note', t('spelling.noBooksNote')),
  );

  const footer = el('footer', 'actions');
  footer.append(button('primary', t('books.goCreate'), () => app.showData()));

  app.keyHandler = null;
  screen.append(header, main, footer);
  return screen;
}
