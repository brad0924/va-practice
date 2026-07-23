import { describe, it, expect } from 'vitest';
import { buildQueue, currentCard, isComplete, rate, newCard, DEFAULT_EASE, MIN_EASE } from './review';
import type { Card } from './types';

const NOW = new Date('2026-07-23T09:00:00');

function card(id: string, overrides: Partial<Card> = {}): Card {
  return { id, text: id, meaning: id, interval: null, ease: DEFAULT_EASE, due: null, ...overrides };
}

/** 固定亂數來源，讓抖動與排序完全可預測。 */
function fixedRandom(...values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)]!;
}

const noFuzz = () => 0.5; // 抖動偏移 0%

describe('新卡', () => {
  it('沒有間隔與到期日，成長倍數為 2.5', () => {
    expect(newCard('a', '焦[こ]がす', '燒焦')).toEqual({
      id: 'a',
      text: '焦[こ]がす',
      meaning: '燒焦',
      interval: null,
      ease: DEFAULT_EASE,
      due: null,
    });
  });
});

describe('複習佇列', () => {
  it('新卡一律進入佇列', () => {
    const queue = buildQueue([card('a'), card('b')], NOW, noFuzz);
    expect(queue).toHaveLength(2);
  });

  it('只納入到期日已到的卡，未到期的完全不出現', () => {
    const cards = [
      card('昨天', { interval: 3, due: '2026-07-22' }),
      card('今天', { interval: 3, due: '2026-07-23' }),
      card('明天', { interval: 3, due: '2026-07-24' }),
    ];
    expect(buildQueue(cards, NOW, noFuzz).map((c) => c.id)).toEqual(['昨天', '今天']);
  });

  it('依注入的亂數打散順序', () => {
    const cards = [card('a'), card('b'), card('c')];
    const ordered = buildQueue(cards, NOW, fixedRandom(0, 0, 0)).map((c) => c.id);
    const shuffled = buildQueue(cards, NOW, fixedRandom(0.99, 0.99, 0.99)).map((c) => c.id);
    expect(ordered.slice().sort()).toEqual(['a', 'b', 'c']);
    expect(ordered).not.toEqual(shuffled);
  });

  it('佇列清空即為當日完成', () => {
    const empty = buildQueue([], NOW, noFuzz);
    expect(currentCard(empty)).toBeUndefined();
    expect(isComplete(empty)).toBe(true);
    expect(isComplete(buildQueue([card('a')], NOW, noFuzz))).toBe(false);
  });
});

describe('評分後的間隔與到期日', () => {
  const reviewCard = card('x', { interval: 10, ease: 2.5, due: '2026-07-23' });

  it('好：間隔乘上成長倍數，成長倍數不變', () => {
    const { card: updated } = rate([reviewCard], 'good', NOW, noFuzz);
    expect(updated.interval).toBe(25); // 10 × 2.5
    expect(updated.ease).toBe(2.5);
    expect(updated.due).toBe('2026-08-17'); // 2026-07-23 + 25 天
  });

  it('簡單：間隔再多乘 1.3，成長倍數 +0.15', () => {
    const { card: updated } = rate([reviewCard], 'easy', NOW, noFuzz);
    expect(updated.interval).toBe(33); // 10 × 2.5 × 1.3 = 32.5
    expect(updated.ease).toBeCloseTo(2.65);
  });

  it('困難：間隔只乘 1.2，成長倍數 −0.15', () => {
    const { card: updated } = rate([reviewCard], 'hard', NOW, noFuzz);
    expect(updated.interval).toBe(12); // 10 × 1.2
    expect(updated.ease).toBeCloseTo(2.35);
  });

  it('再次：間隔重設為 1 天，成長倍數 −0.20', () => {
    const { card: updated } = rate([reviewCard], 'again', NOW, noFuzz);
    expect(updated.interval).toBe(1);
    expect(updated.ease).toBeCloseTo(2.3);
    expect(updated.due).toBe('2026-07-24');
  });

  it('新卡的間隔以 1 天起算', () => {
    const { card: updated } = rate([card('新')], 'good', NOW, noFuzz);
    expect(updated.interval).toBe(3); // 1 × 2.5 = 2.5，四捨五入
    expect(updated.due).toBe('2026-07-26');
  });

  it('間隔至少 1 天', () => {
    const { card: updated } = rate([card('y', { interval: 1, ease: 1.3 })], 'again', NOW, noFuzz);
    expect(updated.interval).toBe(1);
  });
});

describe('成長倍數下限', () => {
  it('連續按再次不會低於 1.3', () => {
    let target = card('難', { interval: 5, ease: 1.4 });
    for (let i = 0; i < 5; i += 1) {
      target = rate([target], 'again', NOW, noFuzz).card;
    }
    expect(target.ease).toBe(MIN_EASE);
  });

  it('不設上限，連按簡單可以持續上升', () => {
    let target = card('易', { interval: 1, ease: 2.5 });
    for (let i = 0; i < 5; i += 1) {
      target = rate([target], 'easy', NOW, noFuzz).card;
    }
    expect(target.ease).toBeCloseTo(3.25);
  });
});

describe('抖動', () => {
  it('間隔未滿 7 天不抖動，亂數再極端結果都一樣', () => {
    const short = card('短', { interval: 2, ease: 2.5 });
    const low = rate([short], 'good', NOW, fixedRandom(0)).card;
    const high = rate([short], 'good', NOW, fixedRandom(1)).card;
    expect(low.interval).toBe(5);
    expect(high.interval).toBe(5);
  });

  it('間隔滿 7 天後施加 ±15% 偏移', () => {
    const long = card('長', { interval: 40, ease: 2.5 }); // 100 天
    expect(rate([long], 'good', NOW, fixedRandom(0)).card.interval).toBe(85); // −15%
    expect(rate([long], 'good', NOW, fixedRandom(1)).card.interval).toBe(115); // +15%
    expect(rate([long], 'good', NOW, fixedRandom(0.5)).card.interval).toBe(100); // 0%
  });

  it('抖動後的間隔落在 ±15% 區間內', () => {
    const long = card('長', { interval: 40, ease: 2.5 });
    for (let i = 0; i <= 10; i += 1) {
      const { card: updated } = rate([long], 'good', NOW, fixedRandom(i / 10));
      expect(updated.interval!).toBeGreaterThanOrEqual(85);
      expect(updated.interval!).toBeLessThanOrEqual(115);
    }
  });
});

describe('評分後的佇列', () => {
  const queue = [card('a'), card('b'), card('c'), card('d'), card('e'), card('f')];

  it('再次以外的評分把該卡移出佇列', () => {
    for (const rating of ['hard', 'good', 'easy'] as const) {
      const result = rate(queue, rating, NOW, noFuzz);
      expect(result.queue.map((c) => c.id)).toEqual(['b', 'c', 'd', 'e', 'f']);
    }
  });

  it('再次把該卡插回剩餘佇列的後半段', () => {
    const rest = 5; // 移除 a 之後還剩 5 張，後半段起點為索引 2
    const earliest = rate(queue, 'again', NOW, fixedRandom(0)).queue.map((c) => c.id);
    const latest = rate(queue, 'again', NOW, fixedRandom(0.999)).queue.map((c) => c.id);
    expect(earliest.indexOf('a')).toBe(2);
    expect(latest.indexOf('a')).toBe(rest);
    expect(earliest).toHaveLength(6);
  });

  it('剩餘少於 4 張時，再次改排到佇列末端', () => {
    const short = [card('a'), card('b'), card('c'), card('d')]; // 移除 a 後剩 3 張
    const result = rate(short, 'again', NOW, fixedRandom(0));
    expect(result.queue.map((c) => c.id)).toEqual(['b', 'c', 'd', 'a']);
  });

  it('佇列只剩最後一張時，再次讓它留在原地', () => {
    const result = rate([card('a')], 'again', NOW, noFuzz);
    expect(result.queue.map((c) => c.id)).toEqual(['a']);
  });

  it('重排回佇列的是更新後的卡片狀態', () => {
    const result = rate(queue, 'again', NOW, fixedRandom(0));
    expect(result.queue.find((c) => c.id === 'a')!.interval).toBe(1);
  });

  it('對空佇列評分會拋錯', () => {
    expect(() => rate([], 'good', NOW, noFuzz)).toThrow();
  });

  it('不會改動傳入的佇列與卡片', () => {
    const original = card('a', { interval: 10, ease: 2.5 });
    const input = [original];
    rate(input, 'good', NOW, noFuzz);
    expect(input).toEqual([{ ...original }]);
    expect(original.interval).toBe(10);
  });
});

describe('一整輪複習', () => {
  it('全部按好之後佇列清空，且都排到未來', () => {
    let queue = buildQueue([card('a'), card('b'), card('c')], NOW, noFuzz);
    const done: Card[] = [];
    while (queue.length > 0) {
      const result = rate(queue, 'good', NOW, noFuzz);
      queue = result.queue;
      done.push(result.card);
    }
    expect(done).toHaveLength(3);
    expect(done.every((c) => c.due! > '2026-07-23')).toBe(true);
    expect(isComplete(buildQueue(done, NOW, noFuzz))).toBe(true);
  });
});
