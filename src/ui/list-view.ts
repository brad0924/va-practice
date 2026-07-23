import type { App } from '../app';
import { toPlainText, toReadingText } from '../lib/reading';
import { isDue, toDateKey } from '../lib/review';
import { toMessage } from '../lib/storage';
import type { Card } from '../lib/types';
import { el, button } from './dom';
import { renderTerm } from './reading-html';

export function listView(app: App): HTMLElement {
  const screen = el('div', 'screen');

  const header = el('header', 'bar');
  header.append(
    button('bar-action', '複習', () => app.showReview()),
    el('span', 'bar-title', '卡片'),
    button('bar-action', '新增', () => app.showEditor(null, () => app.showList())),
  );

  const search = el('input', 'field search');
  search.type = 'search';
  search.placeholder = '搜尋詞條、讀音或釋義';
  search.autocapitalize = 'off';

  const count = el('p', 'count');
  const rows = el('div', 'rows');
  const status = el('p', 'status');

  const now = app.now();
  const refresh = () => {
    const matches = filter(app.data.cards, search.value);
    count.textContent = search.value.trim()
      ? `符合 ${matches.length} 張，共 ${app.data.cards.length} 張`
      : `共 ${app.data.cards.length} 張`;
    rows.replaceChildren(...matches.map((card) => row(app, card, now)));
  };
  search.addEventListener('input', refresh);
  refresh();

  const main = el('main', 'panel');
  main.append(search, count, rows, dataSection(app, status), status);

  screen.append(header, main);
  return screen;
}

function row(app: App, card: Card, now: Date): HTMLElement {
  const open = () => app.showEditor(card, () => app.showList());
  const dueToday = card.due !== null && isDue(card, now);

  const entry = el('button', 'row');
  entry.type = 'button';
  entry.addEventListener('click', open);
  entry.append(
    el('span', 'row-term', renderTerm(card.text, true)),
    el('span', 'row-meaning', card.meaning),
    el('span', `row-state${dueToday ? ' due' : ''}`, describeSchedule(card, dueToday)),
  );
  return entry;
}

function describeSchedule(card: Card, dueToday: boolean): string {
  if (card.due === null) return '新卡';
  return dueToday ? '今日到期' : `${card.due} 到期`;
}

function filter(cards: readonly Card[], query: string): Card[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...cards];
  return cards.filter((card) =>
    [card.text, toPlainText(card.text), toReadingText(card.text), card.meaning].some((field) =>
      field.toLowerCase().includes(needle),
    ),
  );
}

function dataSection(app: App, status: HTMLElement): HTMLElement {
  const file = el('input', 'file-input');
  file.type = 'file';
  file.accept = 'application/json,.json';
  file.addEventListener('change', async () => {
    const chosen = file.files?.[0];
    file.value = '';
    if (!chosen) return;
    if (!confirm('匯入會整份覆蓋目前的卡片與進度，且無法復原。確定要繼續？')) return;
    try {
      app.store.importJson(await chosen.text());
      app.reload();
      app.showList();
    } catch (error) {
      status.textContent = `匯入失敗：${toMessage(error)}`;
      status.classList.add('error');
    }
  });

  const section = el('section', 'data-section');
  section.append(
    el('h2', 'section-title', '資料'),
    el('p', 'hint', '匯出後可在另一台裝置匯入，用來備份或搬家。'),
    el(
      'div',
      'data-actions',
      button('secondary', '匯出備份', () => download(app)),
      button('secondary', '匯入備份', () => file.click()),
    ),
    file,
  );
  return section;
}

function download(app: App): void {
  const blob = new Blob([app.store.exportJson()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = el('a');
  link.href = url;
  link.download = `jlpt-cards-${toDateKey(app.now())}.json`;
  link.click();
  URL.revokeObjectURL(url);
}
