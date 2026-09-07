import type { App } from '../app';
import { t, type Key } from '@core/i18n';
import { setScope } from '@core/lib/storage';
import { currentCard, isComplete } from '@core/lib/review';
import type { Rating } from '@core/lib/types';
import { bookFilter } from './book-filter';
import { el, button } from './dom';
import { renderTerm } from './reading-html';
import { hasJapaneseVoice, speak } from './speech';

/**
 * 四個評分與各自的快捷鍵。`label` 存的是翻譯檔的 key 而不是字——寫成字的話在模組
 * 載入的那一刻就算完了，那比 `initI18n()` 還早，切語言之後也不會跟著換。
 * 與 `list-view.ts` 的 `BUCKETS`、`stats-view.ts` 的 `EASE_BINS` 同一種寫法。
 */
const RATING_BUTTONS: { rating: Rating; label: Key; key: string }[] = [
  { rating: 'again', label: 'review.ratingAgain', key: '1' },
  { rating: 'hard', label: 'review.ratingHard', key: '2' },
  { rating: 'good', label: 'review.ratingGood', key: '3' },
  { rating: 'easy', label: 'review.ratingEasy', key: '4' },
];

/**
 * 複習畫面。標題列中央有一顆單字本開關，改的是複習範圍那一組；資料頁單字本區
 * 每一列的勾選框是同一組範圍的另一個入口，兩邊改的是同一個東西。
 *
 * 「複習中」與「今日份完成」是同一支函式畫的：頂部列建一次就不再動，`main` 與
 * `footer` 由 refresh() 依 isComplete() 換內容。分成兩支的話，勾一勾剛好把佇列
 * 勾空時得整頁重建，開著的選單會跟著收起來。
 *
 * 零本是另一件事，另有 noBooksView()——那時選單是空的，放上去就是顆死按鈕。
 */
export function reviewView(app: App): HTMLElement {
  if (app.data.books.length === 0) return noBooksView(app);

  const screen = el('div', 'screen');

  const remaining = el('span', 'remaining');

  // 選單展開期間快捷鍵讓路，見底下的 keyHandler。
  let menuOpen = false;

  // 只重畫 main 與 footer 而不整頁重建（不呼叫 app.showReview()），下拉才不會
  // 每勾一本就收起來。app.applyData() 會保住正在看的那張卡，見 review.ts 的 rebuildQueue()。
  const books = bookFilter({
    books: app.data.books,
    selected: app.data.scopes.review,
    variant: 'pill',
    onChange: (ids) => {
      app.applyData(setScope(app.data, 'review', ids));
      refresh();
    },
    onOpenChange: (open) => {
      menuOpen = open;
    },
  });

  const header = el('header', 'bar bar-centered');
  header.append(remaining, books, button('bar-action', t('nav.cards'), () => app.showList()));

  const main = el('main', 'card');
  const footer = el('footer', 'actions');

  // 掀答案與評分影響的也只有 main 與 footer，一併走 refresh()：規則一條走到底——
  // 選單開著時，畫面上任何操作都不會弄丟選單。快捷鍵被閘門擋住，但滑鼠點得到底部的評分列。
  const reveal = () => {
    app.reveal();
    refresh();
  };

  const submit = (rating: Rating) => {
    app.rate(rating);
    refresh();
  };

  function refresh(): void {
    const complete = isComplete(app.queue);
    remaining.textContent = t('review.remaining', { count: app.queue.length });
    main.classList.toggle('done', complete);
    footer.classList.toggle('ratings', !complete && app.revealed);

    if (complete) {
      main.replaceChildren(
        el('div', 'done-mark', '✓'),
        el('h1', 'done-title', t('review.doneTitle')),
        el('p', 'done-note', t('review.doneNote')),
      );
      footer.replaceChildren(button('secondary', t('review.browseAll'), () => app.showList()));
      return;
    }

    const card = currentCard(app.queue)!;

    const face = el('div', 'face');
    face.append(el('div', 'term', renderTerm(card.text, app.revealed)));
    if (app.revealed) {
      face.append(el('div', 'meaning', card.meaning));
      if (hasJapaneseVoice()) {
        const speakButton = button('speak', t('review.speak'), () => speak(card.text));
        speakButton.setAttribute('aria-label', t('review.speakLabel'));
        face.append(speakButton);
      }
    }

    // 這張卡的**所屬單字本**——「它住在哪一本」。與標題列那顆膠囊的**複習範圍**
    // （「我今天要複習哪幾本」）是兩件事，同一個畫面上都在，別混。
    //
    // 浮在卡片左上角、不佔一行：排進 face 那一疊的話詞條會被往下推，掀答案時還會再跳
    // 一次。右上角已經被「編輯」用同一種手法佔走，左上是對稱的空位。
    //
    // 蓋著答案時就在，掀開後留在同一個位置。已知代價是本名有機會洩題（單字本若叫
    // 「N2 動詞」，蓋著時就先知道詞性），維護者知情接受——Anki 也是把卡片所屬的那一組
    // 一直擺在畫面上。
    //
    // 找不到那本就不顯示、也不填佔位字元，與 list-view.ts 的 `if (book)` 一致。
    const book = app.data.books.find((candidate) => candidate.id === card.bookId);

    main.replaceChildren(
      ...(book ? [bookLabel(book.name)] : []),
      button('edit-here', t('review.edit'), () => app.showEditor(card, () => app.showReview())),
      face,
    );

    if (app.revealed) {
      footer.replaceChildren(
        ...RATING_BUTTONS.map(({ rating, label, key }) => {
          const node = button(`rating rating-${rating}`, t(label), () => submit(rating));
          node.append(el('span', 'key-hint', key));
          return node;
        }),
      );
    } else {
      footer.replaceChildren(button('primary', t('review.showAnswer'), reveal));
    }
  }

  // 電腦端：空白鍵掀開答案，數字鍵 1–4 對應四個評分。
  app.keyHandler = (event) => {
    // 點開下拉之後焦點停在 toggle 按鈕上，isTyping() 只放行輸入框、擋不住這裡的空白鍵，
    // 沒有這條會變成「想收起選單，結果答案被掀開」。收選單用 Esc，由 bookFilter 自己處理。
    if (menuOpen) {
      // 焦點在 <button> 上時空白鍵是原生的「按下這顆鈕」，會走到 toggle 自己的開合。
      // 連這一下也吃掉，「選單開著時畫面上任何操作都不弄丟選單」才是一條規則走到底。
      if (event.key === ' ') event.preventDefault();
      return;
    }
    // 今日份完成時沒東西可按。合併之前這是 doneView 的 app.keyHandler = null。
    if (isComplete(app.queue)) return;

    if (event.key === ' ') {
      event.preventDefault();
      if (!app.revealed) reveal();
      return;
    }
    if (!app.revealed) return;
    const match = RATING_BUTTONS.find((entry) => entry.key === event.key);
    if (match) {
      event.preventDefault();
      submit(match.rating);
    }
  };

  refresh();
  screen.append(header, main, footer);
  return screen;
}

/**
 * 卡片左上角那一行所屬單字本。**只顯示，不可點**——搬家在編輯畫面裡做，與
 * `list-view.ts` 的 `.row-book` 同一個立場，因此這裡不接任何事件。
 *
 * 看得到的是本名，唸出來的是整句「單字本：XXX」——光唸本名講不出它是什麼。作法是把
 * 整句話放進一段只給螢幕閱讀器的文字，看得到的那一段則對輔助使用隱形。**不在 span 上
 * 掛 aria-label**：那條屬性在沒有 role 的元素上不保證被唸出來，各家瀏覽器做法不一。
 * 借的是標題列那顆膠囊在用的同一條翻譯，不新增 key。
 */
function bookLabel(name: string): HTMLElement {
  const shown = el('span', undefined, name);
  shown.setAttribute('aria-hidden', 'true');
  return el('span', 'card-book', el('span', 'sr-only', t('filter.blockLabel', { scope: name })), shown);
}

function noBooksView(app: App): HTMLElement {
  const screen = el('div', 'screen');
  const header = el('header', 'bar');
  header.append(
    el('span', 'remaining', t('review.remaining', { count: 0 })),
    button('bar-action', t('nav.cards'), () => app.showList()),
  );

  const main = el('main', 'card done');
  main.append(
    el('div', 'done-mark', '📚'),
    el('h1', 'done-title', t('review.noBooksTitle')),
    el('p', 'done-note', t('review.noBooksNote')),
  );

  const footer = el('footer', 'actions');
  footer.append(button('primary', t('books.goCreate'), () => app.showData()));

  app.keyHandler = null;
  screen.append(header, main, footer);
  return screen;
}
