import type { App } from '../app';
import { t } from '@core/i18n';
import { toMessage } from '@core/lib/app-error';
import { newCard } from '@core/lib/review';
import { assertTermAvailable } from '@core/lib/storage';
import type { Card } from '@core/lib/types';
import { toMarkup, toPlainText, type KanjiRun, type ReadingCell } from '@core/lib/reading';
import { askReading } from '@core/lib/gemini-reading';
import { createReadingEditor, type Ask, type Change, type Note } from './reading-editor';
import { createRequiredFields, type FieldRef } from '@core/lib/required-fields';
import { el, button } from './dom';
import { createToast } from './toast';
import { renderTerm } from './reading-html';

/**
 * 這次開 app 期間上一張卡選的那本，新增卡片時的預設值。
 * 只活在記憶體：不進 storage、也不進備份——它是連續加字時的手感，不是使用者的資料。
 */
let lastBookId: string | null = null;

/** card 為 null 代表新增。零本時進不來，「新增」入口會先把人導去建一本。 */
export function editorView(app: App, card: Card | null, back: () => void): HTMLElement {
  const screen = el('div', 'screen');

  const header = el('header', 'bar');
  // 這顆按鈕底下還掛了防「點空」的 pointerdown，見下面的 jumpToEmpty。
  const cancel = button('bar-action', t('editor.cancel'), back);
  header.append(cancel, el('span', 'bar-title', card ? t('editor.titleEdit') : t('editor.titleNew')));

  // 讀音格的規則全在這台機器裡，畫面只負責畫、接事件、照它回的變更單辦事。
  // 去問讀音的那支函式在這裡取一次就夠：要改金鑰得離開這個畫面，回來時整個 editorView 已重建。
  const ask = createAsk(app);
  const makeEditor = () =>
    createReadingEditor({
      markup: card?.text,
      ask,
    });

  // 讀音格由這台機器持有，「儲存並繼續」要把它們清空，因此換一台空的就是清空——
  // 所以這裡不是 const。
  let editor = makeEditor();

  // 單字本排在詞條之前：先決定這張卡放哪裡，再打內容。
  // 編輯既有卡時改掉它就等於搬家，interval／ease／due 一律不動。
  const bookSelect = el('select', 'field');
  for (const book of app.data.books) {
    const option = el('option', '', book.name);
    option.value = book.id;
    bookSelect.append(option);
  }
  // 上一張選的那本若已經被刪掉，find 找不到，退回清單第一本——與第一次進來同一個結果。
  bookSelect.value = card
    ? card.bookId
    : app.data.books.find((book) => book.id === lastBookId)?.id ?? app.data.books[0]?.id ?? '';

  const termInput = el('input', 'field');
  termInput.type = 'text';
  termInput.value = editor.term;
  termInput.placeholder = t('editor.termPlaceholder');
  termInput.autocapitalize = 'off';
  termInput.spellcheck = false;

  const readingRegion = el('div', 'reading');

  // 讀音區上方那一行：詢問中、AI（Artificial Intelligence，人工智慧）填好了、或失敗的原因。
  // 沒話講時整個元素拿掉，
  // 免得 .labelled 的 gap 留下一道空隙。
  const readingNote = el('p', 'hint');
  const refreshNote = () => {
    const note = editor.note;
    if (note === null) {
      readingNote.remove();
      return;
    }
    const { className, text } = noteWording(note);
    readingNote.className = className;
    readingNote.textContent = text;
    readingRegion.before(readingNote);
  };

  const preview = el('div', 'preview');
  const refreshPreview = () => {
    // 預覽一律看「組出來的標記字串」，行為與舊版一致。
    preview.replaceChildren(renderTerm(toMarkup({ term: editor.term, runs: editor.runs }), true));
  };

  // 依 runs 重建整個讀音區。只有變更單說要重畫時才會呼叫，
  // 讀音格自己打字時不重建，才不會失焦、不打斷 IME（Input Method Editor，輸入法編輯器）組字。
  const renderReading = () => {
    if (editor.runs.length === 0) {
      readingRegion.replaceChildren(el('p', 'hint', t('editor.noKanji')));
      return;
    }
    readingRegion.replaceChildren(...editor.runs.map((run, ri) => renderRun(run, ri)));
  };

  /** 照單辦事。預覽由 term 與 runs 組出來，任何改動都要刷，因此不進變更單。 */
  const apply = (change: Change) => {
    if (change.term) termInput.value = editor.term;
    if (change.runs) renderReading();
    if (change.note) refreshNote();
    refreshPreview();
  };

  const renderRun = (run: KanjiRun, ri: number): HTMLElement => {
    const runEl = el('div', 'reading-run');
    run.cells.forEach((cell, ci) => {
      if (ci > 0) {
        const left = run.cells[ci - 1]!;
        const seam = button('reading-seam', '⊕', () => apply(editor.mergeAt(ri, ci - 1)));
        seam.setAttribute('aria-label', t('editor.mergeLabel', { left: left.kanji, right: cell.kanji }));
        runEl.append(seam);
      }
      runEl.append(renderCell(cell, ri, ci));
    });
    return runEl;
  };

  const renderCell = (cell: ReadingCell, ri: number, ci: number): HTMLElement => {
    const cellEl = el('div', 'reading-cell');

    const kanjiRow = el('div', 'reading-kanji');
    [...cell.kanji].forEach((char, k) => {
      if (k > 0) {
        // 第 k 個字前的縫：只把這格從第 k 字切成左右兩格，其餘不動。
        const seam = button('reading-seam', '·', () => apply(editor.splitAt(ri, ci, k)));
        seam.setAttribute(
          'aria-label',
          t('editor.splitLabel', { left: cell.kanji.slice(0, k), right: cell.kanji.slice(k) }),
        );
        kanjiRow.append(seam);
      }
      kanjiRow.append(el('span', 'reading-char', char));
    });

    const input = el('input', 'reading-input');
    input.type = 'text';
    input.value = cell.reading;
    input.autocapitalize = 'off';
    input.spellcheck = false;
    input.addEventListener('input', () => apply(editor.setReading(ri, ci, input.value)));
    // 換欄那三支掛在這裡而不是外面：renderReading 會把讀音格整批換掉，掛在外面的會跟著沒。
    bindField(input);

    cellEl.append(kanjiRow, input);
    return cellEl;
  };

  termInput.addEventListener('input', () => apply(editor.setTerm(termInput.value)));

  // 詞條打完離開輸入框時去問一次。守門沒過的話兩張單子都是空的，什麼都不會動。
  // 詞條的 blur 底下還有一支（下面的 jumpToEmpty），兩支互不相干。
  termInput.addEventListener('blur', () => {
    const asked = editor;
    // 中途按了「儲存並繼續」的話，這兩份單子對的是上一張。內容不會被抄過來
    // （apply 讀的是新的那台），但重畫讀音區會讓正在打的下一張失焦、打斷組字。
    // 重試回報與最後那份回覆走同一道守門，兩邊漂移的下場一樣。
    const stillMine = () => asked === editor;
    const { now, later } = editor.prefill((change) => {
      if (!stillMine()) return;
      apply(change);
    });
    apply(now);
    void later.then((change) => {
      if (!stillMine()) return;
      apply(change);
    });
  });

  const meaningInput = el('input', 'field');
  meaningInput.type = 'text';
  meaningInput.value = card?.meaning ?? '';
  meaningInput.placeholder = t('editor.meaningPlaceholder');

  // iPhone 上鍵盤還開著時直接點按鈕，blur 先發生、焦點跳走、畫面捲動，按鈕在 touchend
  // 前就移位了，那一下 click 不會觸發。三顆按鈕都會中，但只有「取消」白按沒有便宜可佔
  // （想離開卻被拉回輸入框、鍵盤又彈出來），所以只在它身上立旗子擋掉那次跳轉。
  // 旗子由「焦點回到任一必填格」清掉——該跳的失焦前面必定有一次這樣的聚焦，因此不會留過夜。
  let cancelling = false;
  cancel.addEventListener('pointerdown', () => {
    cancelling = true;
  });

  /** 目前畫面上的讀音格，攤平後由左到右——順序與 editor.runs 一致，必填格的序號也照這個數。 */
  const readingInputs = (): HTMLInputElement[] => [
    ...readingRegion.querySelectorAll<HTMLInputElement>('.reading-input'),
  ];

  // 「還空著」與兩條順序（換欄、儲存）全在這台機器裡，畫面只負責把輸入框翻成序號、
  // 再把它回的序號翻回輸入框。值一律現取畫面上的字，因此讀音格重畫也不必重接。
  const fields = createRequiredFields({
    term: () => termInput.value,
    readings: () => readingInputs().map((input) => input.value),
    meaning: () => meaningInput.value,
    prefilling: () => editor.prefilling,
  });

  /** 輸入框 → 必填格。讀音格在失焦的同一刻被重畫換掉時 indexOf 回 -1，必填格會當它是空的。 */
  const refOf = (field: HTMLInputElement): FieldRef => {
    if (field === termInput) return { kind: 'term' };
    if (field === meaningInput) return { kind: 'meaning' };
    return { kind: 'reading', index: readingInputs().indexOf(field) };
  };

  /** 必填格 → 輸入框。序號是必填格剛從畫面數出來的，一定找得到。 */
  const nodeOf = (ref: FieldRef): HTMLInputElement => {
    switch (ref.kind) {
      case 'term':
        return termInput;
      case 'meaning':
        return meaningInput;
      case 'reading':
        return readingInputs()[ref.index]!;
    }
  };

  /**
   * 失焦那條路（ADR-0006）。iPhone 鍵盤上方那條橫條右端的「完了」是純系統 UI，按下去
   * 網頁只收到 blur、沒有任何按鍵事件，這件事因此只能掛在失焦上。也因為不在使用者手勢裡，
   * 焦點跳得動但鍵盤叫不回來——想留住鍵盤要按 ↵，見 jumpOnEnter。
   *
   * 「離開的這一格有值」是不加就會壞掉的前提：少了它，兩格都空時按打勾會來回彈，
   * 鍵盤永遠收不掉。
   */
  const jumpToEmpty = (event: FocusEvent, from: HTMLInputElement) => {
    if (cancelling) return;
    // 焦點自己落到別處就不搶：另一個輸入框，或讀音區裡的任何東西——格子與拆／合的縫
    // 都算。少了這條功能會壞掉：新增卡片時釋義必定是空的，一碰讀音區就會被彈走，
    // 讀音永遠改不成。桌機按 Tab 也走這條，既有的 Tab 順序因此不受影響。
    const next = event.relatedTarget;
    if (next instanceof HTMLInputElement) return;
    if (next instanceof HTMLElement && readingRegion.contains(next)) return;
    // 這裡刻意不出紅字：使用者還沒說要儲存，紅字只留給真的按下儲存那一刻。
    // 前提一沒過（stay）與全部有值（done）都不必做事——✓ 本來就不送出表單。
    const jump = fields.nextEmpty(refOf(from));
    if (jump.kind === 'move') nodeOf(jump.to).focus();
  };

  /**
   * Enter 分兩段：還有空格時只把游標送過去，不出紅字也不儲存；全部有值才放行去存。
   *
   * 手機九宮格右下角那顆 ↵ 走的就是這裡。它與收鍵盤的「完了」不同，是真按鍵——因此
   * 這支 handler 站在使用者手勢裡，`focus()` 帶得動鍵盤，跳過去之後可以直接接著打。
   *
   * 與兩顆儲存按鈕刻意不同調：按鈕是「我要存」，Enter 是「我要往下走」，紅字只留給前者。
   */
  const jumpOnEnter = (event: KeyboardEvent, from: HTMLInputElement) => {
    // 組字中的 Enter 是輸入法在確定候選字，不是使用者要往下走。
    if (event.key !== 'Enter' || event.isComposing) return;
    const jump = fields.nextEmpty(refOf(from));
    // 全部有值才放行讓表單送出去存。
    if (jump.kind === 'done') return;
    // 剩下兩種都得攔：move 是要自己跳，stay 是前提一沒過——從空格出發按 ↵ 本來就不該
    // 有事發生，送出去反而會冒出一行「我要存」才該有的紅字。
    event.preventDefault();
    if (jump.kind === 'move') nodeOf(jump.to).focus();
  };

  const startEditing = () => {
    cancelling = false;
  };

  /** 三種必填格共用同一組：清防點空的旗子、↵ 換欄、✓（失焦）換欄。 */
  const bindField = (field: HTMLInputElement) => {
    field.addEventListener('focus', startEditing);
    field.addEventListener('keydown', (event) => jumpOnEnter(event, field));
    field.addEventListener('blur', (event) => jumpToEmpty(event, field));
  };

  bindField(termInput);
  bindField(meaningInput);

  const error = el('p', 'error');

  const form = el('form', 'form');
  form.append(
    labelled(t('editor.labelBook'), bookSelect),
    labelled(t('editor.labelTerm'), termInput),
    el('div', 'labelled', el('span', 'label-text', t('editor.labelReading')), readingRegion),
    el('div', 'labelled', el('span', 'label-text', t('editor.labelPreview')), preview),
    labelled(t('editor.labelMeaning'), meaningInput),
    error,
  );

  renderReading();
  refreshPreview();

  const toast = createToast();

  /** 空欄擋下來：同一句紅字，游標落到該填的那一欄。不指名是哪一格——游標已經指路。 */
  const rejectBlank = (field: HTMLInputElement): null => {
    error.textContent = t('editor.blankFields');
    field.focus();
    return null;
  };

  /** 兩顆按鈕共用的驗證與儲存。存好回這張卡的讀音標記，驗證沒過回 null 並留下錯誤那行。 */
  const saveCard = (): string | null => {
    // 三處「沒填」合成同一句紅字，游標落在第一個該填的地方。順序由必填格決定（ADR-0009）。
    const blocking = fields.firstBlocking();
    if (blocking !== null) return rejectBlank(nodeOf(blocking));
    const result = editor.commit();
    // 讀音「填了但不是假名」不同路：列出每一條，游標不動——錯可能一次好幾個（ADR-0006）。
    if (!result.ok) {
      error.textContent = result.errors.join(t('editor.errorSeparator'));
      return null;
    }
    const text = result.text;
    // 詞條全域唯一：撞到已經有卡的詞時擋在這裡，與空欄同一個時機、同一行紅字。
    // 訊息由資料存取模組給，它說得出那個詞現在在哪一本。
    try {
      assertTermAvailable(app.data, text, card?.id);
    } catch (reason) {
      error.textContent = toMessage(reason);
      return null;
    }
    // 存進去的釋義去掉頭尾空白；「還空著」那條已經由必填格擋過，這裡只是不留空白進資料。
    const meaning = meaningInput.value.trim();
    // 存成功才記住，下一張新卡就預設同一本——連續往同一本加字時不必每次重選。
    const bookId = bookSelect.value;
    lastBookId = bookId;
    app.upsert(
      card ? { ...card, bookId, text, meaning } : newCard(crypto.randomUUID(), bookId, text, meaning),
    );
    return text;
  };

  /** 清回剛進新增頁的樣子：草稿、提示字、錯誤那行全部帶走，焦點回到詞條。 */
  const reset = () => {
    editor = makeEditor();
    meaningInput.value = '';
    error.textContent = '';
    // 換了編輯器等於三面都變了，照既有的變更單走一次，不另外列一份會各自漂移的清單。
    apply({ term: true, runs: true, note: true });
    termInput.focus();
  };

  // Enter 也走這裡。新增模式的 submit 是「儲存並繼續」，編輯模式是唯一那顆「儲存」。
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = saveCard();
    if (text === null) return;
    if (card) {
      back();
      return;
    }
    // 留在原地又被清空，是唯一分不出「存進去了」還是「白打一場」的時刻。
    // 措辭只講本機那一份：推雲端失敗與否由 sync-status 那行小字負責。
    toast.show(t('editor.saved', { term: toPlainText(text) }));
    reset();
  });

  if (card) {
    const save = el('button', 'primary', t('editor.save'));
    save.type = 'submit';
    form.append(el('div', 'form-actions', save));
  } else {
    // 「儲存」排在 DOM（Document Object Model，文件物件模型）前面，type 必須是 button——
    // 兩顆都是 submit 的話它會把 Enter 搶走。Enter 歸「儲存並繼續」：
    // 連著加卡時可以打字、Enter、打字、Enter，手不離鍵盤。
    const save = button('secondary', t('editor.save'), () => {
      if (saveCard() !== null) back();
    });
    const saveAndContinue = el('button', 'primary', t('editor.saveAndContinue'));
    saveAndContinue.type = 'submit';
    form.append(el('div', 'form-actions split', save, saveAndContinue));
  }

  const main = el('main', 'panel');
  main.append(form);

  if (card) {
    main.append(
      button('danger', t('editor.deleteCard'), () => {
        if (!confirm(t('editor.deleteConfirm', { meaning: card.meaning }))) return;
        app.remove(card.id);
        back();
      }),
    );
  }

  screen.append(header, main);
  // toast 只有「儲存並繼續」會跳，編輯模式不必長這個節點。
  if (!card) screen.append(toast.node);
  return screen;
}

/**
 * 去問讀音的那支函式，兩條路在這裡分岔（spec 決定一、二）。
 *
 * 網頁版走使用者自備的金鑰直接打 Gemini，沒設金鑰就回 null、讀音預填全程不發生；
 * iOS 走固定金鑰與 Firebase AI Logic，沒有「金鑰」這回事，因此一律回得出一支。
 *
 * `import.meta.env.MODE` 在打包時就換成字面值，另一條整段是死碼，連帶那個動態 import
 * 的 chunk 也不會產出——firebase 不會進網頁版產物（spec 決定十六）。動態 import 而不是
 * 頂端的 import：後者無論如何都會被打包進來。
 */
function createAsk(app: App): Ask | null {
  if (import.meta.env.MODE === 'ios') {
    const native = import('../lib/gemini-reading-native');
    // 先去排憑證的隊，不等它。使用者接下來要打詞條，那幾秒剛好夠 App Attest 跑完。
    void native.then((module) => module.prepare());
    return (term, onAttempt) => native.then((module) => module.askReadingNative(term, onAttempt));
  }

  const key = app.gemini.read();
  // bind 不可省：fetch 被拆下來單獨呼叫時瀏覽器會丟 Illegal invocation。
  return key === null
    ? null
    : (term, onAttempt) => askReading(key, term, fetch.bind(window), onAttempt);
}

/** 狀態代號翻成使用者看到的那一行字與樣式。措辭與樣式屬於畫面，不進讀音編輯器。 */
function noteWording(note: Note): { className: string; text: string } {
  switch (note.kind) {
    case 'asking':
      return { className: 'hint', text: t('editor.noteAsking') };
    case 'retrying':
      return { className: 'hint', text: t('editor.noteRetrying', { attempt: note.attempt }) };
    case 'filled':
      return { className: 'hint', text: t('editor.noteFilled') };
    case 'failed':
      return { className: 'error', text: t('editor.noteFailed', { reason: note.reason }) };
  }
}

function labelled(text: string, control: HTMLElement): HTMLElement {
  return el('label', 'labelled', el('span', 'label-text', text), control);
}
