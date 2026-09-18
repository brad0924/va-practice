import type { App } from '../app';
import { t, type Key } from '@core/i18n';
import { bookFilter } from './book-filter';
import { el, button } from './dom';
import { quizBar } from './quiz-bar';

/**
 * 問答的挑書頁：挑要練哪幾本單字本（票 04）。樣子照抄 `spelling-books.ts`。
 *
 * **與拼字那一頁差在一件事：這一頁不開一輪。** 問答開一輪時可能要先等 Gemini 補選項
 * （票 06），等的那一頁、開不成時退回來印哪一句，全都在 `quiz-home.ts`。這一頁只把挑到的
 * 那幾本交給 `onStart`；開不成時呼叫端把這一頁重建一次，把原因從 `reason` 遞進來。
 *
 * 挑到的那幾本存在本機自己那一格（`app.quizBooks`），與拼字那一格分開，不進 `AppData`、
 * 不隨備份走、不上雲端（`ADR-0021`、問答 spec 決定六）。
 */
export function quizBooksView(
  app: App,
  reason: Key | null,
  onStart: (bookIds: readonly string[]) => void,
): HTMLElement {
  if (app.data.books.length === 0) return noBooksView(app);

  const screen = el('div', 'screen');

  /** 目前勾了哪幾本。指不到的 id、沒挑過、讀壞了都由 read() 收乾淨，這裡拿到的一定是現存的本。 */
  let chosen = app.quizBooks.read(app.data.books);

  /** 上一次開不成的原因，印成那一句紅字。改選之後就清掉——它講的是上一次的挑法。 */
  let shownReason = reason;

  // 只重畫底下那兩樣，不整頁重建：下拉才不會每勾一本就收起來。
  const filter = bookFilter({
    books: app.data.books,
    selected: chosen,
    variant: 'block',
    onChange: (ids) => {
      chosen = ids;
      app.quizBooks.write(ids);
      shownReason = null;
      refresh();
    },
  });

  // `.error:empty` 本來就不顯示，清空就等於收起來，與拼字那一頁同一種處理。
  const notice = el('p', 'error');

  const main = el('main', 'panel');
  main.append(el('div', 'form', filter, el('p', 'hint', t('quiz.pickHint')), notice));

  const start = button('primary', t('quiz.start'), () => onStart(chosen));
  const footer = el('footer', 'actions', start);

  function refresh(): void {
    // 一本都沒挑就開始不了，比照拼字。`bookFilter` 會鎖住最後一本，這是第二層。
    start.disabled = chosen.length === 0;
    notice.textContent = shownReason === null ? '' : t(shownReason);
  }

  // 問答整條線都不做鍵盤操作。明寫成 null：留白會讓上一個畫面的處理器活到這一頁來。
  app.keyHandler = null;

  refresh();
  screen.append(quizBar(app), main, footer);
  return screen;
}

/**
 * 一本單字本都沒有：整頁換成指路，比照拼字零本那一頁（`spelling-books.ts` 的 `noBooksView()`）。
 * 標題列照樣是同一條，同一個位置的東西才不會忽有忽無。
 */
function noBooksView(app: App): HTMLElement {
  const screen = el('div', 'screen');

  const main = el('main', 'card done');
  main.append(
    el('div', 'done-mark', '📚'),
    el('h1', 'done-title', t('quiz.noBooksTitle')),
    el('p', 'done-note', t('quiz.noBooksNote')),
  );

  const footer = el('footer', 'actions', button('primary', t('books.goCreate'), () => app.showData()));

  app.keyHandler = null;
  screen.append(quizBar(app), main, footer);
  return screen;
}
