import { describe, it, expect } from 'vitest';
import { computeSnapshot, easeBinOf, groupByEaseBin } from './stats-view';
import { DEFAULT_EASE } from '@core/lib/review';
import type { Card } from '@core/lib/types';

const NOW = new Date(2026, 6, 27); // 2026-07-27

function card(id: string, overrides: Partial<Card> = {}): Card {
  return { id, bookId: 'book', text: id, meaning: id, interval: null, ease: DEFAULT_EASE, due: null, ...overrides };
}

/**
 * 六段邊界（1.31、1.7、2.1、2.49、2.51）是重點：「下限」用 <= 1.31 而非 === 1.3
 * 是為了容忍浮點誤差，「2.5 附近」單獨一段是為了看出從未被調整過的卡（issue 01 決定 6）。
 */
describe('easeBinOf', () => {
  it('1.3 與 1.31 都落進「下限」', () => {
    expect(easeBinOf(1.3)).toBe('floor');
    expect(easeBinOf(1.31)).toBe('floor');
  });

  it('1.31 到 1.7 之間落進「1.31–1.7」', () => {
    expect(easeBinOf(1.5)).toBe('low');
  });

  it('1.7 落進「1.7–2.1」（含下界）', () => {
    expect(easeBinOf(1.7)).toBe('mid-low');
  });

  it('2.1 落進「2.1–2.5」（含下界）', () => {
    expect(easeBinOf(2.1)).toBe('mid-high');
  });

  it('2.49、2.5、2.51 都落進「2.5 附近」', () => {
    expect(easeBinOf(2.49)).toBe('steady');
    expect(easeBinOf(2.5)).toBe('steady');
    expect(easeBinOf(2.51)).toBe('steady');
  });

  it('超過 2.51 落進「2.5 以上」', () => {
    expect(easeBinOf(2.52)).toBe('high');
    expect(easeBinOf(3)).toBe('high');
  });
});

describe('groupByEaseBin', () => {
  it('沒有卡片時仍回傳完整六段，cards 皆為空陣列', () => {
    const bins = groupByEaseBin([]);
    expect(bins).toHaveLength(6);
    expect(bins.every((bin) => bin.cards.length === 0)).toBe(true);
  });

  it('每張卡恰好落進一段，各段張數總和等於輸入張數', () => {
    const cards = [
      card('a', { ease: 1.2 }),
      card('b', { ease: 1.5 }),
      card('c', { ease: 1.9 }),
      card('d', { ease: 2.3 }),
      card('e', { ease: 2.5 }),
      card('f', { ease: 2.8 }),
    ];
    const bins = groupByEaseBin(cards);
    const ids = bins.flatMap((bin) => bin.cards.map((each) => each.id));
    expect(ids).toHaveLength(cards.length);
    expect(new Set(ids).size).toBe(cards.length);
  });
});

describe('computeSnapshot', () => {
  it('空卡片清單：總數與已複習過都是 0，平均間隔是 0', () => {
    const snapshot = computeSnapshot([], NOW);
    expect(snapshot.total).toBe(0);
    expect(snapshot.reviewCount).toBe(0);
    expect(snapshot.avgInterval).toBe(0);
    expect(snapshot.buckets).toHaveLength(6);
    expect(snapshot.easeBins).toHaveLength(6);
  });

  it('只有新卡：已複習過是 0，平均間隔不把新卡當 0 算進分母', () => {
    const cards = [card('a'), card('b'), card('c')];
    const snapshot = computeSnapshot(cards, NOW);
    expect(snapshot.total).toBe(3);
    expect(snapshot.reviewCount).toBe(0);
    expect(snapshot.avgInterval).toBe(0);
  });

  it('平均間隔只算已複習過的卡，四捨五入到小數一位', () => {
    const cards = [
      card('新卡'),
      card('a', { interval: 3, due: '2026-07-28' }),
      card('b', { interval: 4, due: '2026-07-29' }),
      card('c', { interval: 4, due: '2026-07-30' }),
    ];
    const snapshot = computeSnapshot(cards, NOW);
    expect(snapshot.total).toBe(4);
    expect(snapshot.reviewCount).toBe(3);
    // (3 + 4 + 4) / 3 = 3.666... 四捨五入到小數一位 = 3.7
    expect(snapshot.avgInterval).toBe(3.7);
  });
});
