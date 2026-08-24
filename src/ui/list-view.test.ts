import { describe, it, expect } from 'vitest';
import { bucketOf, groupByBucket } from './list-view';
import { DEFAULT_EASE } from '@core/lib/review';
import type { Card } from '@core/lib/types';
import zhHant from '@core/i18n/zh-Hant';

const NOW = new Date(2026, 6, 27); // 2026-07-27

function card(id: string, due: string | null): Card {
  return { id, bookId: 'book', text: id, meaning: id, interval: due === null ? null : 1, ease: DEFAULT_EASE, due };
}

/** 桶的邊界（null／1／0／−1／−2／−6／−7）是重點，與 overdueDays() 的天數一對一。 */
describe('bucketOf', () => {
  it('新卡落進「新」', () => {
    expect(bucketOf(null)).toBe('new');
  });

  it('逾期落進「現在」，不分拖了幾天', () => {
    expect(bucketOf(1)).toBe('now');
    expect(bucketOf(30)).toBe('now');
  });

  it('今日到期落進「<24小時」', () => {
    expect(bucketOf(0)).toBe('today');
  });

  it('明天到期落進「明天」', () => {
    expect(bucketOf(-1)).toBe('tomorrow');
  });

  it('後天到第 6 天落進「<1週」', () => {
    expect(bucketOf(-2)).toBe('week');
    expect(bucketOf(-6)).toBe('week');
  });

  it('滿 7 天以上落進「未來」', () => {
    expect(bucketOf(-7)).toBe('future');
    expect(bucketOf(-365)).toBe('future');
  });
});

describe('groupByBucket', () => {
  const cards = [
    card('新', null),
    card('現在', '2026-07-20'),
    card('今天', '2026-07-27'),
    card('明天', '2026-07-28'),
    card('週內', '2026-07-30'),
    card('未來', '2026-09-01'),
  ];

  it('正序由急到緩：新、現在、<24小時、明天、<1週、未來', () => {
    const buckets = groupByBucket(cards, NOW, 'asc');
    expect(buckets.map((bucket) => bucket.key)).toEqual([
      'new',
      'now',
      'today',
      'tomorrow',
      'week',
      'future',
    ]);
    expect(buckets.map((bucket) => bucket.label)).toEqual([
      zhHant['list.bucketNew'],
      zhHant['list.bucketNow'],
      zhHant['list.bucketToday'],
      zhHant['list.bucketTomorrow'],
      zhHant['list.bucketWeek'],
      zhHant['list.bucketFuture'],
    ]);
  });

  it('倒序時桶順序完全顛倒', () => {
    const buckets = groupByBucket(cards, NOW, 'desc');
    expect(buckets.map((bucket) => bucket.key)).toEqual([
      'future',
      'week',
      'tomorrow',
      'today',
      'now',
      'new',
    ]);
  });

  it('倒序時桶內卡片順序也顛倒', () => {
    const week = [card('a', '2026-07-29'), card('b', '2026-07-30'), card('c', '2026-08-01')];
    const ids = (direction: 'asc' | 'desc') =>
      groupByBucket(week, NOW, direction)
        .find((bucket) => bucket.key === 'week')!
        .cards.map((each) => each.id);
    expect(ids('asc')).toEqual(['a', 'b', 'c']);
    expect(ids('desc')).toEqual(['c', 'b', 'a']);
  });

  // 「桶內順序也顛倒」指的是日期反過來。同一天到期的卡在兩個方向下維持同一個
  // 相對順序，這是 sortByDue() 刻意保證的行為（見 CONTEXT.md「到期排序」），
  // 因此全是新卡的「新」桶在倒序時順序不動。
  it('同一天到期的卡在兩個方向下維持同一個相對順序', () => {
    const sameDay = [card('a', '2026-07-30'), card('b', '2026-07-30'), card('c', '2026-07-30')];
    const ids = (direction: 'asc' | 'desc') =>
      groupByBucket(sameDay, NOW, direction)
        .find((bucket) => bucket.key === 'week')!
        .cards.map((each) => each.id);
    expect(ids('asc')).toEqual(['a', 'b', 'c']);
    expect(ids('desc')).toEqual(['a', 'b', 'c']);
  });

  it('沒有卡片的桶仍然回傳，cards 為空陣列', () => {
    const buckets = groupByBucket([card('新', null)], NOW, 'asc');
    expect(buckets).toHaveLength(6);
    expect(buckets.find((bucket) => bucket.key === 'new')!.cards).toHaveLength(1);
    expect(buckets.filter((bucket) => bucket.cards.length === 0)).toHaveLength(5);
  });

  it('每張卡恰好出現在一個桶裡，各桶張數總和等於輸入張數', () => {
    const many = [...cards, card('另一張逾期', '2026-01-01'), card('另一張新卡', null)];
    const buckets = groupByBucket(many, NOW, 'asc');
    const ids = buckets.flatMap((bucket) => bucket.cards.map((each) => each.id));
    expect(ids).toHaveLength(many.length);
    expect(new Set(ids).size).toBe(many.length);
  });
});
