import type { App } from '../app';
import { newCard } from '../lib/review';
import type { Card } from '../lib/types';
import { el, button } from './dom';
import { renderTerm } from './reading-html';

const SYNTAX_HINT = '漢字後面用方括號標讀音，例如：焦[こ]がす、帰省[きせい]、書[か]き下[お]ろす';

/** card 為 null 代表新增。 */
export function editorView(app: App, card: Card | null, back: () => void): HTMLElement {
  const screen = el('div', 'screen');

  const header = el('header', 'bar');
  header.append(
    button('bar-action', '取消', back),
    el('span', 'bar-title', card ? '編輯卡片' : '新增卡片'),
  );

  const termInput = el('input', 'field');
  termInput.type = 'text';
  termInput.value = card?.text ?? '';
  termInput.placeholder = '焦[こ]がす';
  termInput.autocapitalize = 'off';
  termInput.spellcheck = false;

  const preview = el('div', 'preview');
  const refreshPreview = () => {
    preview.replaceChildren(renderTerm(termInput.value, true));
  };
  termInput.addEventListener('input', refreshPreview);
  refreshPreview();

  const meaningInput = el('input', 'field');
  meaningInput.type = 'text';
  meaningInput.value = card?.meaning ?? '';
  meaningInput.placeholder = '燒焦';

  const error = el('p', 'error');

  const form = el('form', 'form');
  form.append(
    labelled('詞條', termInput),
    el('p', 'hint', SYNTAX_HINT),
    el('div', 'labelled', el('span', 'label-text', '預覽'), preview),
    labelled('釋義', meaningInput),
    error,
  );

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = termInput.value.trim();
    const meaning = meaningInput.value.trim();
    if (!text || !meaning) {
      error.textContent = '詞條與釋義都要填。';
      return;
    }
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

function labelled(text: string, control: HTMLInputElement): HTMLElement {
  return el('label', 'labelled', el('span', 'label-text', text), control);
}
