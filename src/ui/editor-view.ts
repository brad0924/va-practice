import type { App } from '../app';
import { newCard } from '../lib/review';
import type { Card } from '../lib/types';
import {
  parseReading,
  toDraft,
  toMarkup,
  rebuildRuns,
  mergeSeam,
  splitCellAt,
  validateDraft,
  type KanjiRun,
  type ReadingCell,
  type ReadingDraft,
} from '../lib/reading';
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

  // 舊卡照已存標記還原成讀音格；新卡從空白開始。
  const initial: ReadingDraft = card ? toDraft(card.text) : { term: '', runs: [] };
  let runs: KanjiRun[] = initial.runs;

  const termInput = el('input', 'field');
  termInput.type = 'text';
  termInput.value = initial.term;
  termInput.placeholder = '焦がす';
  termInput.autocapitalize = 'off';
  termInput.spellcheck = false;

  const readingRegion = el('div', 'reading');

  const preview = el('div', 'preview');
  const refreshPreview = () => {
    // 預覽一律看「組出來的標記字串」，行為與舊版一致。
    preview.replaceChildren(renderTerm(toMarkup({ term: termInput.value, runs }), true));
  };

  // 依 runs 重建整個讀音區。只有詞條改動與切開／合併會呼叫，
  // 讀音框自己打字時不重建，才不會失焦、不打斷 IME（Input Method Editor，輸入法編輯器）組字。
  const renderReading = () => {
    if (runs.length === 0) {
      readingRegion.replaceChildren(el('p', 'hint', '這個詞沒有漢字'));
      return;
    }
    readingRegion.replaceChildren(...runs.map((run, ri) => renderRun(run, ri)));
  };

  // 切開／合併都是「換掉某一串、重畫、刷新預覽」，抽出來免得兩處各寫一遍。
  const applyToRun = (ri: number, transform: (run: KanjiRun) => KanjiRun) => {
    runs[ri] = transform(runs[ri]!);
    renderReading();
    refreshPreview();
  };

  const renderRun = (run: KanjiRun, ri: number): HTMLElement => {
    const runEl = el('div', 'reading-run');
    run.cells.forEach((cell, ci) => {
      if (ci > 0) {
        const left = run.cells[ci - 1]!;
        const seam = button('reading-seam', '⊕', () => applyToRun(ri, (r) => mergeSeam(r, ci - 1)));
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
        const seam = button('reading-seam', '·', () => applyToRun(ri, (r) => splitCellAt(r, ci, k)));
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
    input.addEventListener('input', () => {
      runs[ri]!.cells[ci]!.reading = input.value;
      refreshPreview();
    });

    cellEl.append(kanjiRow, input);
    return cellEl;
  };

  termInput.addEventListener('input', () => {
    const parsed = parseReading(termInput.value);
    if (parsed.some((segment) => segment.reading !== undefined)) {
      // 貼上帶標記的字串：括號攤回格子，詞條框只留純文字。
      const draft = toDraft(termInput.value);
      termInput.value = draft.term;
      runs = draft.runs;
      renderReading();
    } else {
      // 依漢字內容保留已填讀音。漢字排列沒變（多半只是尾端加減假名）就不動
      // DOM（Document Object Model，文件物件模型），正在打字的讀音框才不會失焦、IME 才不會被打斷。
      const next = rebuildRuns(termInput.value, runs);
      const changed = shape(next) !== shape(runs);
      runs = next;
      if (changed) renderReading();
    }
    refreshPreview();
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
    const term = termInput.value.trim();
    const meaning = meaningInput.value.trim();
    if (!term || !meaning) {
      error.textContent = '詞條與釋義都要填。';
      return;
    }
    // 對齊 trim 後的 term，讀音照漢字內容搬過來。
    const draft: ReadingDraft = { term, runs: rebuildRuns(term, runs) };
    const problems = validateDraft(draft);
    if (problems.length > 0) {
      error.textContent = problems.join('；');
      return;
    }
    const text = toMarkup(draft);
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

/** 漢字排列的指紋，用來判斷詞條改動後是否需要重建讀音區 DOM。 */
function shape(runs: KanjiRun[]): string {
  return runs.map((run) => run.cells.map((cell) => cell.kanji).join(',')).join(';');
}

function labelled(text: string, control: HTMLInputElement): HTMLElement {
  return el('label', 'labelled', el('span', 'label-text', text), control);
}
