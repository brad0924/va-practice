import type { App } from '../app';
import { toPlainText, toReadingText } from '../lib/reading';
import { overdueDays, sortByDue, type SortDirection } from '../lib/review';
import type { Card } from '../lib/types';
import { el, button } from './dom';
import { renderTerm } from './reading-html';

export function listView(app: App): HTMLElement {
  const screen = el('div', 'screen');

  const header = el('header', 'bar');
  header.append(
    button('bar-action', '複習', () => app.showReview()),
    el('span', 'bar-title', '卡片'),
    button('bar-action', '資料', () => app.showData()),
    button('bar-action', '新增', () => app.showEditor(null, () => app.showList())),
  );

  const search = el('input', 'field search');
  search.type = 'search';
  search.placeholder = '搜尋詞條、讀音或釋義';
  search.autocapitalize = 'off';

  const count = el('span', 'count');
  const rows = el('div', 'rows');

  // 方向只活在這次畫面裡，離開卡片頁再回來就回到正序，與搜尋框的行為一致。
  let direction: SortDirection = 'asc';
  const sort = button('sort-toggle', '', () => {
    direction = direction === 'asc' ? 'desc' : 'asc';
    refresh();
  });

  const now = app.now();
  const refresh = () => {
    const matches = sortByDue(filter(app.data.cards, search.value), direction);
    count.textContent = search.value.trim()
      ? `符合 ${matches.length} 張，共 ${app.data.cards.length} 張`
      : `共 ${app.data.cards.length} 張`;
    sort.textContent = direction === 'asc' ? '到期 ↑' : '到期 ↓';
    sort.setAttribute(
      'aria-label',
      direction === 'asc' ? '切換到期排序方向，目前最急的在前' : '切換到期排序方向，目前最不急的在前',
    );
    rows.replaceChildren(...matches.map((card) => row(app, card, now)));
  };
  search.addEventListener('input', refresh);
  refresh();

  const toolbar = el('div', 'list-toolbar', count, sort);
  const main = el('main', 'panel');
  main.append(search, toolbar, rows);

  screen.append(header, main);
  return screen;
}

function row(app: App, card: Card, now: Date): HTMLElement {
  const open = () => app.showEditor(card, () => app.showList());
  const days = overdueDays(card, now);

  const entry = el('button', 'row');
  entry.type = 'button';
  entry.addEventListener('click', open);
  entry.append(
    el('span', 'row-term', renderTerm(card.text, true)),
    el('span', 'row-meaning', card.meaning),
    el('span', `row-state${stateModifier(days)}`, describeSchedule(card, days)),
  );
  return entry;
}

function describeSchedule(card: Card, days: number | null): string {
  if (days === null) return '新卡';
  if (days > 0) return `逾期 ${days} 天`;
  if (days === 0) return '今日到期';
  return `${card.due} 到期`;
}

function stateModifier(days: number | null): string {
  if (days === null || days < 0) return '';
  return days > 0 ? ' overdue' : ' due';
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
