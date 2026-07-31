import type { App } from '../app';
import { groupByBucket } from './list-view';
import type { Card } from '../lib/types';
import { el, button } from './dom';
import { renderTerm } from './reading-html';

export type EaseBinKey = 'floor' | 'low' | 'mid-low' | 'mid-high' | 'steady' | 'high';

interface EaseBin {
  key: EaseBinKey;
  label: string;
  cards: Card[];
}

/**
 * 熟練度分佈的六段區間。「下限」用 <= 1.31 而非 === 1.3：MIN_EASE 理論上會精準
 * 卡在 1.3，容差避免浮點誤差漏判。「2.5 附近」單獨一段：「好」評分不改變成長倍數
 * （見 review.ts 的 RATINGS），這段能看出哪些卡從未被調整過。
 */
const EASE_BINS: readonly { key: EaseBinKey; label: string; match: (ease: number) => boolean }[] = [
  { key: 'floor', label: '下限', match: (ease) => ease <= 1.31 },
  { key: 'low', label: '1.31–1.7', match: (ease) => ease > 1.31 && ease < 1.7 },
  { key: 'mid-low', label: '1.7–2.1', match: (ease) => ease >= 1.7 && ease < 2.1 },
  { key: 'mid-high', label: '2.1–2.5', match: (ease) => ease >= 2.1 && ease < 2.49 },
  { key: 'steady', label: '2.5 附近', match: (ease) => ease >= 2.49 && ease <= 2.51 },
  { key: 'high', label: '2.5 以上', match: (ease) => ease > 2.51 },
];

/** 一張卡的成長倍數落在哪一段。 */
export function easeBinOf(ease: number): EaseBinKey {
  return EASE_BINS.find((bin) => bin.match(ease))!.key;
}

/** 把卡片分進熟練度六段，永遠回傳完整六段（沒有卡的段其 cards 為空陣列）。 */
export function groupByEaseBin(cards: readonly Card[]): EaseBin[] {
  const grouped = new Map<EaseBinKey, Card[]>(EASE_BINS.map((bin) => [bin.key, []]));
  for (const card of cards) grouped.get(easeBinOf(card.ease))!.push(card);
  return EASE_BINS.map(({ key, label }) => ({ key, label, cards: grouped.get(key)! }));
}

export interface Snapshot {
  total: number;
  reviewCount: number;
  /** 已複習過的卡的 interval 平均值，四捨五入到小數一位；沒有已複習過的卡時為 0。 */
  avgInterval: number;
  buckets: ReturnType<typeof groupByBucket>;
  easeBins: EaseBin[];
}

/** 只用 Card[] 目前的欄位算出的一次性快照，不涉及任何歷史紀錄。 */
export function computeSnapshot(cards: readonly Card[], now: Date): Snapshot {
  const total = cards.length;
  // 分母不含新卡：新卡沒有 interval，當成 0 硬算平均會把數字往下拉，失真。
  const reviewed = cards.filter((card): card is Card & { interval: number } => card.interval !== null);
  const reviewCount = reviewed.length;
  const avgInterval =
    reviewCount === 0
      ? 0
      : Math.round((reviewed.reduce((sum, card) => sum + card.interval, 0) / reviewCount) * 10) / 10;

  return {
    total,
    reviewCount,
    avgInterval,
    buckets: groupByBucket(cards, now, 'asc'),
    easeBins: groupByEaseBin(cards),
  };
}

export function statsView(app: App): HTMLElement {
  const screen = el('div', 'screen');

  const header = el('header', 'bar');
  header.append(button('bar-action', '資料', () => app.showData()), el('span', 'bar-title', '統計'));

  const snapshot = computeSnapshot(app.data.cards, app.now());

  const overview = el('section', 'section');
  overview.append(
    el('h2', 'section-title', '現況'),
    el(
      'div',
      'tiles',
      tile(String(snapshot.total), '卡片總數'),
      tile(String(snapshot.reviewCount), '已複習過'),
      tile(snapshot.avgInterval.toFixed(1), '平均間隔（天）'),
    ),
  );

  const dueMax = Math.max(...snapshot.buckets.map((bucket) => bucket.cards.length));
  const dueSection = el('section', 'section');
  dueSection.append(
    el('h2', 'section-title', '到期分佈'),
    el(
      'div',
      'bar-list',
      ...snapshot.buckets.map((bucket) =>
        barRow(bucket.key, bucket.label, bucket.cards.length, dueMax, () =>
          openModal(bucket.label, bucket.cards, (card) => card.due ?? '新卡'),
        ),
      ),
    ),
  );

  const easeMax = Math.max(...snapshot.easeBins.map((bin) => bin.cards.length));
  const easeSection = el('section', 'section');
  easeSection.append(
    el('h2', 'section-title', '熟練度分佈'),
    el(
      'div',
      'bar-list',
      ...snapshot.easeBins.map((bin) =>
        barRow(bin.key, bin.label, bin.cards.length, easeMax, () =>
          openModal(bin.label, bin.cards, (card) => `倍數 ${card.ease.toFixed(2)}`),
        ),
      ),
    ),
  );

  const main = el('main', 'panel');
  main.append(overview, dueSection, easeSection);

  // 這個 app 第一個彈窗元件：常駐在畫面裡的 .modal-overlay，openModal／closeModal
  // 只換內容與 hidden 屬性，不重新建立節點。
  const modalHeading = el('span', 'modal-title');
  const modalClose = button('modal-close', '✕', closeModal);
  const modalHeader = el('div', 'modal-header', modalHeading, modalClose);
  const modalRows = el('div', 'modal-rows');
  const modalPanel = el('div', 'modal-panel', modalHeader, modalRows);
  const overlay = el('div', 'modal-overlay', modalPanel);
  overlay.hidden = true;
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeModal();
  });

  function openModal(title: string, cards: Card[], tagFn: (card: Card) => string): void {
    modalHeading.textContent = `${title}，共 ${cards.length} 張`;
    modalRows.replaceChildren(...cards.map((card) => modalRow(card, tagFn)));
    overlay.hidden = false;
  }

  function closeModal(): void {
    overlay.hidden = true;
  }

  app.keyHandler = (event) => {
    if (event.key === 'Escape' && !overlay.hidden) closeModal();
  };

  screen.append(header, main, overlay);
  return screen;
}

function tile(num: string, label: string): HTMLElement {
  return el('div', 'tile', el('div', 'tile-num', num), el('div', 'tile-label', label));
}

/**
 * onClick 有值且 count > 0 才長成按鈕；否則是純 div，游標維持正常。
 * labelClass 掛在最外層，styles.css 用 `.bar-row.<key>` 一次決定標籤與長條的顏色，
 * 不在 JS 裡重複一份色票。
 */
function barRow(labelClass: string, label: string, count: number, max: number, onClick?: () => void): HTMLElement {
  const labelEl = el('span', 'bar-row-label', label);
  const fill = el('div', 'bar-row-fill');
  fill.style.width = `${count === 0 ? 0 : Math.max(4, (count / max) * 100)}%`;
  const track = el('div', 'bar-row-track', fill);
  const countEl = el('span', 'bar-row-count', String(count));

  if (onClick && count > 0) {
    const node = el('button', `bar-row bar-row-btn ${labelClass}`, labelEl, track, countEl);
    node.type = 'button';
    node.addEventListener('click', onClick);
    return node;
  }
  return el('div', `bar-row ${labelClass}`, labelEl, track, countEl);
}

function modalRow(card: Card, tagFn: (card: Card) => string): HTMLElement {
  const row = el('div', 'row');
  row.append(
    el('span', 'row-term', renderTerm(card.text, true)),
    el('span', 'row-meaning', card.meaning),
    el('span', 'row-tag', tagFn(card)),
  );
  return row;
}
