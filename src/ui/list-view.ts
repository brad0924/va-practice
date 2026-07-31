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
    el(
      'div',
      'bar-side',
      button('bar-action', '資料', () => app.showData()),
      button('bar-action', '新增', () => app.showEditor(null, () => app.showList())),
    ),
  );

  const search = el('input', 'field search');
  search.type = 'search';
  search.placeholder = '搜尋詞條、讀音或釋義';
  search.autocapitalize = 'off';

  const count = el('span', 'count');
  const rows = el('div', 'rows');

  // 方向與展開狀態只活在這次畫面裡，離開卡片頁再回來就回到正序、六桶全收合，
  // 與搜尋框的行為一致。UI 偏好不進 storage.ts，那份資料整份會被備份到別台裝置。
  let direction: SortDirection = 'asc';
  let expanded = new Set<BucketKey>();
  /** 搜尋前的收合狀態，清空搜尋框後還原。 */
  let beforeSearch = new Set<BucketKey>();
  const searching = () => search.value.trim() !== '';
  /** 只給「搜尋框由空變有字」這個轉折用，展開與否一律看 searching()。 */
  let wasSearching = false;

  const sort = button('sort-toggle', '', () => {
    direction = direction === 'asc' ? 'desc' : 'asc';
    refresh();
  });

  const now = app.now();
  const toggle = (key: BucketKey) => {
    if (expanded.has(key)) expanded.delete(key);
    else expanded.add(key);
    refresh();
  };

  const refresh = () => {
    const matches = filter(app.data.cards, search.value);
    count.textContent = searching()
      ? `符合 ${matches.length} 張，共 ${app.data.cards.length} 張`
      : `共 ${app.data.cards.length} 張`;
    sort.textContent = direction === 'asc' ? '到期 ↑' : '到期 ↓';
    sort.setAttribute(
      'aria-label',
      direction === 'asc' ? '切換到期排序方向，目前最急的在前' : '切換到期排序方向，目前最不急的在前',
    );

    // 空桶平時顯示並標 0（「明天 0」本身是資訊），搜尋中則藏起來，
    // 免得幾行「0」把結果擠下去。
    const buckets = groupByBucket(matches, now, direction);
    const shown = searching() ? buckets.filter((bucket) => bucket.cards.length > 0) : buckets;
    rows.replaceChildren(
      ...shown.flatMap((bucket) => bucketSection(app, bucket, expanded.has(bucket.key), toggle)),
    );
  };

  search.addEventListener('input', () => {
    if (searching() !== wasSearching) {
      wasSearching = searching();
      // 搜尋的意圖就是看到結果，把結果留在收合的桶裡等於搜尋壞掉。
      // 搜尋前的狀態存一份，清空搜尋框後還原——搜尋期間的展開／收合不帶回去。
      if (wasSearching) {
        beforeSearch = new Set(expanded);
        expanded = new Set(BUCKETS.map((bucket) => bucket.key));
      } else {
        expanded = new Set(beforeSearch);
      }
    }
    refresh();
  });
  refresh();

  const toolbar = el('div', 'list-toolbar', count, sort);
  const main = el('main', 'panel');
  main.append(search, toolbar, rows);

  screen.append(header, main);
  return screen;
}

/** 一個時間桶的標頭，加上展開時跟在後面的那疊卡片。 */
function bucketSection(
  app: App,
  bucket: Bucket,
  isOpen: boolean,
  toggle: (key: BucketKey) => void,
): HTMLElement[] {
  const head = button(`bucket-head ${bucket.key}`, '', () => toggle(bucket.key));
  head.setAttribute('aria-expanded', String(isOpen));
  head.append(
    el('span', 'bucket-mark', isOpen ? '▾' : '▸'),
    el('span', 'bucket-label', bucket.label),
    el('span', 'bucket-count', String(bucket.cards.length)),
  );
  // 空桶展開只換符號，不長出空的容器——那會在標頭之間多出一段空白。
  if (!isOpen || bucket.cards.length === 0) return [head];

  const cards = el('div', 'bucket-cards', ...bucket.cards.map((card) => row(app, card)));
  return [head, cards];
}

function row(app: App, card: Card): HTMLElement {
  const open = () => app.showEditor(card, () => app.showList());

  const entry = el('button', 'row');
  entry.type = 'button';
  entry.addEventListener('click', open);
  entry.append(el('span', 'row-term', renderTerm(card.text, true)), el('span', 'row-meaning', card.meaning));
  // 桶名由標頭承擔，列上改印實際到期日；新卡沒有到期日，不長出右欄也不填佔位字元。
  // 用完整 YYYY-MM-DD：間隔沒有上限，「未來」桶必然含跨年的卡，省掉年份會分不出哪一年。
  if (card.due !== null) entry.append(el('span', 'row-due', card.due));
  return entry;
}

type BucketKey = 'new' | 'now' | 'today' | 'tomorrow' | 'week' | 'future';

interface Bucket {
  key: BucketKey;
  label: string;
  cards: Card[];
}

/**
 * 六個時間桶的定義，順序即畫面由上而下的順序（最急的在最上面）。
 *
 * 「<24小時」是「今日到期」這一桶的別名，不是真的用小時算：排程只到日，
 * 分不出今天卡在當日的哪個時刻。逾期卡一律歸「現在」，不分拖了幾天。
 */
const BUCKETS: readonly { key: BucketKey; label: string }[] = [
  { key: 'new', label: '新' },
  { key: 'now', label: '現在' },
  { key: 'today', label: '<24小時' },
  { key: 'tomorrow', label: '明天' },
  { key: 'week', label: '<1週' },
  { key: 'future', label: '未來' },
];

/** 一張卡拖了幾天（`overdueDays()` 的結果）落在哪個桶。 */
export function bucketOf(days: number | null): BucketKey {
  if (days === null) return 'new';
  if (days > 0) return 'now';
  if (days === 0) return 'today';
  if (days === -1) return 'tomorrow';
  return days > -7 ? 'week' : 'future';
}

/**
 * 把卡片分進六個桶，永遠回傳完整六個桶（沒有卡的桶其 `cards` 為空陣列）。
 *
 * 桶順序與桶內順序都跟著 `sortByDue()`：桶是 `due` 的連續區間，`due` 遞增即
 * 由急到緩，因此 `desc` 就是整份清單反過來——兩層一起翻。
 */
export function groupByBucket(cards: readonly Card[], now: Date, direction: SortDirection): Bucket[] {
  const grouped = new Map<BucketKey, Card[]>(BUCKETS.map((bucket) => [bucket.key, []]));
  for (const card of sortByDue(cards, direction)) {
    grouped.get(bucketOf(overdueDays(card, now)))!.push(card);
  }
  const buckets = BUCKETS.map(({ key, label }) => ({ key, label, cards: grouped.get(key)! }));
  return direction === 'asc' ? buckets : buckets.reverse();
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
