import type { App } from '../app';
import { newCard } from '../lib/review';
import type { Card } from '../lib/types';
import { toMarkup, type KanjiRun, type ReadingCell } from '../lib/reading';
import { askReading } from '../lib/gemini-reading';
import { createReadingEditor, type Change, type Note } from './reading-editor';
import { el, button } from './dom';
import { renderTerm } from './reading-html';

/** card 為 null 代表新增。 */
export function editorView(app: App, card: Card | null, back: () => void): HTMLElement {
  const screen = el('div', 'screen');

  const header = el('header', 'bar');
  header.append(
    button('bar-action', '取消', back),
    el('span', 'bar-title', card ? '編輯卡片' : '新增卡片'),
  );

  // 讀音格的規則全在這台機器裡，畫面只負責畫、接事件、照它回的變更單辦事。
  // 金鑰在這裡取一次就夠：要改金鑰得離開這個畫面，回來時整個 editorView 已重建。
  const key = app.gemini.read();
  const editor = createReadingEditor({
    markup: card?.text,
    ask: key === null ? null : (term) => askReading(key, term),
  });

  const termInput = el('input', 'field');
  termInput.type = 'text';
  termInput.value = editor.term;
  termInput.placeholder = '焦がす';
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
      readingRegion.replaceChildren(el('p', 'hint', '這個詞沒有漢字'));
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
        seam.setAttribute('aria-label', `把${left.kanji}和${cell.kanji}合併`);
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
        seam.setAttribute('aria-label', `把${cell.kanji.slice(0, k)}和${cell.kanji.slice(k)}拆開`);
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

    cellEl.append(kanjiRow, input);
    return cellEl;
  };

  termInput.addEventListener('input', () => apply(editor.setTerm(termInput.value)));

  // 詞條打完離開輸入框時去問一次。守門沒過的話兩張單子都是空的，什麼都不會動。
  termInput.addEventListener('blur', () => {
    const { now, later } = editor.prefill();
    apply(now);
    void later.then(apply);
  });

  const meaningInput = el('input', 'field');
  meaningInput.type = 'text';
  meaningInput.value = card?.meaning ?? '';
  meaningInput.placeholder = '燒焦';

  const error = el('p', 'error');

  const form = el('form', 'form');
  form.append(
    labelled('詞條', termInput),
    el('div', 'labelled', el('span', 'label-text', '讀音'), readingRegion),
    el('div', 'labelled', el('span', 'label-text', '預覽'), preview),
    labelled('釋義', meaningInput),
    error,
  );

  renderReading();
  refreshPreview();

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const meaning = meaningInput.value.trim();
    const result = editor.commit();
    // 詞條空白與釋義空白在這裡合成同一句，順序維持現狀：空白檢查先、讀音驗證後。
    if ((!result.ok && result.reason === 'empty-term') || !meaning) {
      error.textContent = '詞條與釋義都要填。';
      return;
    }
    if (!result.ok) {
      error.textContent = result.errors.join('；');
      return;
    }
    const text = result.text;
    app.upsert(card ? { ...card, text, meaning } : newCard(crypto.randomUUID(), text, meaning));
    back();
  });

  const save = el('button', 'primary', '儲存');
  save.type = 'submit';
  form.append(el('div', 'form-actions', save));

  const main = el('main', 'panel');
  main.append(form);

  if (card) {
    main.append(
      button('danger', '刪除這張卡', () => {
        if (!confirm(`確定刪除「${card.meaning}」這張卡？此動作無法復原。`)) return;
        app.remove(card.id);
        back();
      }),
    );
  }

  screen.append(header, main);
  return screen;
}

/** 狀態代號翻成使用者看到的那一行字與樣式。措辭與樣式屬於畫面，不進讀音編輯器。 */
function noteWording(note: Note): { className: string; text: string } {
  switch (note.kind) {
    case 'asking':
      return { className: 'hint', text: '詢問中…' };
    case 'filled':
      return { className: 'hint', text: '讀音由 AI 填入，請確認' };
    case 'failed':
      return { className: 'error', text: `自動填讀音失敗：${note.reason}` };
  }
}

function labelled(text: string, control: HTMLInputElement): HTMLElement {
  return el('label', 'labelled', el('span', 'label-text', text), control);
}
