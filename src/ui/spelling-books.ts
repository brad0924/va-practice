import type { App } from '../app';
import { t } from '@core/i18n';
import { isRoundOver, startRound, type Round } from '@core/lib/spelling';
import { bookFilter } from './book-filter';
import { el, button } from './dom';

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

  // 左右兩顆導覽鈕是票 06 的事，這裡只先把那一條的位置留出來，與 `spelling-view.ts` 一致。
  // 標題也留給那張票：`.bar-title` 靠左右兩欄等寬才會落在正中間，單獨掛上去會偏到左邊那一格。
  const header = el('header', 'bar');

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
    // 不借 `cardsInBooks()`：它住在 `storage.ts`，而拼字整條線一行都不 import 那支
    // （`ADR-0021`，票 03 的測試有守門）。這個過濾只有一行，抄比破例划算。
    const wanted = new Set(chosen);
    const round = startRound(
      app.data.cards.filter((card) => wanted.has(card.bookId)),
      app.random,
    );

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

  const header = el('header', 'bar');

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
