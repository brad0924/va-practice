import type { App } from '../app';
import { t } from '../i18n';
import { toMessage } from '../lib/app-error';
import {
  addBook,
  cardsInBooks,
  deleteBook,
  renameBook,
  setScope,
  type ImportSkip,
} from '../lib/storage';
import type { AppData, Book } from '../lib/types';
import { el, button } from './dom';

/**
 * 資料頁最上面那一區：單字本的清單，也是複習範圍唯一的設定入口。
 *
 * 這一區有自己的展開狀態與那組新增／改名的輸入介面，因此不像其他三區畫完就不動，
 * 而是留一支 refresh() 就地重畫自己——重畫整個資料頁會把雲端那區使用者打到一半的
 * 密碼一起清掉。
 *
 * 判斷一律來自資料存取模組：名稱合不合法、範圍會不會被清空、匯入跳過了哪些詞，
 * 這裡只負責把它說的話翻成畫面上看得到的字與樣式。
 */
export function booksSection(app: App): HTMLElement {
  /** 整區收起來時只剩標頭。放在最上面就是因為它是主角，因此預設展開。 */
  let open = true;
  /** 目前展開維護鈕的那一本。同時只展開一列。 */
  let expandedId: string | null = null;
  /** 正在取名的對象：null 代表沒在取名，`{ id: null }` 是新增，帶 id 是改名。 */
  let naming: { id: string | null } | null = null;
  /** 剛結束的那次匯入，畫在那一本底下。失敗時 skipped 必為空。 */
  let outcome: { bookId: string; message: string; failed: boolean; skipped: ImportSkip[] } | null = null;

  const mark = el('span', 'section-mark');
  const head = button('section-head', '', () => {
    open = !open;
    refresh();
  });
  head.append(el('span', 'section-title', t('books.sectionTitle')), mark);

  // 匯入的選檔沿用備份檔那一區的做法：一個藏起來的 file input，按鈕替它按下去。
  // 整區共用一個，按下去的是哪一本記在 target 上。
  const file = el('input', 'file-input');
  file.type = 'file';
  file.accept = 'application/json,.json';
  let target: string | null = null;

  file.addEventListener('change', async () => {
    const chosen = file.files?.[0];
    // 選同一個檔案第二次也要能觸發 change，因此一律先清空。
    file.value = '';
    const bookId = target;
    target = null;
    if (!chosen || bookId === null) return;
    try {
      const result = app.importWords(await chosen.text(), bookId);
      outcome = {
        bookId,
        message: t('books.imported', { count: result.imported }),
        failed: false,
        skipped: result.skipped,
      };
    } catch (error) {
      outcome = {
        bookId,
        message: t('books.importFailed', { reason: toMessage(error) }),
        failed: true,
        skipped: [],
      };
    }
    refresh();
  });

  const body = el('div', 'book-body');
  const section = el('section', 'section', head, body, file);

  /** 資料改了：交給 app 存檔並推上雲端，再就地重畫。 */
  function apply(next: AppData): void {
    app.applyData(next);
    refresh();
  }

  function refresh(): void {
    mark.textContent = open ? '▾' : '▸';
    head.setAttribute('aria-expanded', String(open));
    if (!open) {
      body.replaceChildren();
      return;
    }

    const books = app.data.books;
    const children: Node[] =
      books.length === 0 ? [el('p', 'hint', t('books.empty'))] : books.flatMap(bookRow);
    // 取名中的是新增時，輸入介面取代「新增單字本」那顆；改名的那份長在該列底下。
    children.push(naming?.id === null ? nameForm(null) : addButton());
    body.replaceChildren(...children);
  }

  /** 一本一列：勾選框（＝納入複習範圍）＋ 本名 ＋ 張數，展開時再跟一排維護鈕。 */
  function bookRow(book: Book): Node[] {
    const count = cardsInBooks(app.data.cards, [book.id]).length;
    const inScope = app.data.scopes.review.includes(book.id);

    const check = el('input', 'book-check');
    check.type = 'checkbox';
    check.checked = inScope;
    // 取消它會讓複習範圍空掉時就點不動——含「只剩一本」那個情況。
    // 資料存取模組本來就會拒絕這種變更，但那是繞過去之後的最後一道，
    // 讓使用者按了才吃紅字不如一開始就按不動。
    check.disabled = inScope && app.data.scopes.review.length === 1;
    check.setAttribute('aria-label', t('books.scopeCheckLabel', { name: book.name }));
    check.addEventListener('change', () => {
      const current = app.data.scopes.review;
      const next = check.checked ? [...current, book.id] : current.filter((id) => id !== book.id);
      apply(setScope(app.data, 'review', next));
    });

    const isOpen = expandedId === book.id;
    const main = button('book-main', '', () => {
      expandedId = isOpen ? null : book.id;
      naming = null;
      outcome = null;
      refresh();
    });
    main.setAttribute('aria-expanded', String(isOpen));
    main.append(
      el('span', 'book-name', book.name),
      el('span', 'book-count', t('books.cardCount', { count })),
    );

    const row = el('div', 'book-row', check, main);
    if (!isOpen) return [row];

    // 改名沿用新增那組輸入介面，就地取代三顆維護鈕。
    if (naming?.id === book.id) return [row, nameForm(book)];

    const tools = el(
      'div',
      'book-tools',
      button('book-tool', t('books.rename'), () => {
        naming = { id: book.id };
        outcome = null;
        refresh();
      }),
      button('book-tool', t('books.importWords'), () => {
        target = book.id;
        file.click();
      }),
      button('book-tool remove', t('books.delete'), () => {
        if (!confirm(t('books.deleteConfirm', { name: book.name, count }))) return;
        expandedId = null;
        outcome = null;
        apply(deleteBook(app.data, book.id));
      }),
    );

    return outcome?.bookId === book.id ? [row, tools, outcomeBlock(outcome)] : [row, tools];
  }

  /**
   * 一次匯入的結果。跳過的清單可能有上百筆，因此自己捲動——
   * 讓它把底下的東西頂出容器外，使用者就找不到「新增單字本」了。
   */
  function outcomeBlock(shown: NonNullable<typeof outcome>): HTMLElement {
    const box = el('div', 'import-outcome', el('p', shown.failed ? 'error' : 'status', shown.message));
    if (shown.skipped.length === 0) return box;

    const nameOf = (bookId: string) =>
      app.data.books.find((book) => book.id === bookId)?.name ?? t('books.unknownBook');
    box.append(
      el('p', 'hint', t('books.skippedHeading', { count: shown.skipped.length })),
      el(
        'ul',
        'skip-list',
        ...shown.skipped.map((skip) =>
          el('li', '', t('books.skippedItem', { term: skip.term, book: nameOf(skip.bookId) })),
        ),
      ),
    );
    return box;
  }

  /** 新增與改名共用的輸入介面。book 為 null 代表新增。 */
  function nameForm(book: Book | null): HTMLElement {
    const input = el('input', 'field');
    input.type = 'text';
    input.value = book?.name ?? '';
    input.placeholder = t('books.namePlaceholder');
    input.autocapitalize = 'off';

    const error = el('p', 'error');
    const submit = el('button', 'primary', book ? t('books.rename') : t('books.confirmAdd'));
    submit.type = 'submit';

    const form = el('form', 'form book-form');
    form.append(
      input,
      error,
      el(
        'div',
        'form-actions split',
        button('secondary', t('books.cancel'), () => {
          naming = null;
          refresh();
        }),
        submit,
      ),
    );

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      try {
        const next = book
          ? renameBook(app.data, book.id, input.value)
          : addBook(app.data, input.value);
        naming = null;
        apply(next);
      } catch (reason) {
        // 名字違規的原因在按下確定才說，不邊打字邊提示——沿用編輯器的做法。
        // 就地寫紅字而不重畫，使用者打的字才留得住。
        error.textContent = toMessage(reason);
      }
    });

    // 按了「新增」就是要打字，游標自己落進去，手機上少點一下。
    queueMicrotask(() => input.focus());
    return form;
  }

  function addButton(): HTMLElement {
    return button('book-add', t('books.addButton'), () => {
      naming = { id: null };
      expandedId = null;
      outcome = null;
      refresh();
    });
  }

  refresh();
  return section;
}
