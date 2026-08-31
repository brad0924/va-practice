/**
 * 卡片列表的純邏輯：六個時間桶與搜尋比對。**這裡不碰 DOM，也不碰 React。**
 *
 * 三支原本住在網頁版的 `src/ui/list-view.ts` 裡。React Native 版的卡片列表要用同一套
 * 規則，因此搬進來兩邊共用一份——票 `02` 那條「邏輯層不准分岔」畫的就是這條線
 * （見 `.scratch/rn-rewrite/issues/15-cards-list-and-books.md`）。**搬家不是重寫**：
 * 分桶的邊界、排序的兩層翻轉、搜尋比對的四個欄位，一個字都沒改。
 *
 * 桶的標籤要查介面字串表，因此這支檔案 import 得到 `../i18n`——與 `daily-reminder.ts`
 * 同一種情況，`core/lib/` 並不是「不准查表」的區域。
 */
import { t, type Key } from '../i18n';
import { toPlainText, toReadingText } from './reading';
import { overdueDays, sortByDue, type SortDirection } from './review';
import type { Card } from './types';

export type BucketKey = 'new' | 'now' | 'today' | 'tomorrow' | 'week' | 'future';

export interface Bucket {
  key: BucketKey;
  label: string;
  cards: Card[];
}

/**
 * 六個時間桶，順序即畫面由上而下的順序（最急的在最上面）。
 *
 * 「<24小時」是「今日到期」這一桶的別名，不是真的用小時算：排程只到日，
 * 分不出今天卡在當日的哪個時刻。逾期卡一律歸「現在」，不分拖了幾天。
 *
 * `key` 不是介面文字，原樣留著；`label` 存的是翻譯檔的 key 而不是字——寫成字的話
 * 在模組載入的那一刻就算完了，那比 `initI18n()` 還早，切語言之後也不會跟著換。
 * 與 `src/ui/stats-view.ts` 的 `EASE_BINS` 同一種寫法。
 */
export const BUCKETS: readonly { key: BucketKey; label: Key }[] = [
  { key: 'new', label: 'list.bucketNew' },
  { key: 'now', label: 'list.bucketNow' },
  { key: 'today', label: 'list.bucketToday' },
  { key: 'tomorrow', label: 'list.bucketTomorrow' },
  { key: 'week', label: 'list.bucketWeek' },
  { key: 'future', label: 'list.bucketFuture' },
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
  const buckets = BUCKETS.map(({ key, label }) => ({ key, label: t(label), cards: grouped.get(key)! }));
  return direction === 'asc' ? buckets : buckets.reverse();
}

/**
 * 搜尋比對。四個欄位任一含有那串字就算命中，不分大小寫：
 * 帶標記的詞條、去掉標記的詞條、讀音、釋義。
 *
 * 空字串（或只有空白）回傳整份，不是空的——「沒有在搜尋」與「搜尋不到」是兩件事。
 */
export function filterCards(cards: readonly Card[], query: string): Card[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...cards];
  return cards.filter((card) =>
    [card.text, toPlainText(card.text), toReadingText(card.text), card.meaning].some((field) =>
      field.toLowerCase().includes(needle),
    ),
  );
}
