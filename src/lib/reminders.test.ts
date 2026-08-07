import { describe, it, expect } from 'vitest';
import { forecastDueCounts } from './reminders';
import { DEFAULT_EASE, toDateKey } from './review';
import type { Card } from './types';

const NOW = new Date('2026-07-23T09:00:00');

function card(id: string, overrides: Partial<Card> = {}): Card {
  return { id, bookId: 'book', text: id, meaning: id, interval: null, ease: DEFAULT_EASE, due: null, ...overrides };
}

/** 到期日在今天之後第 n 天的一張卡。各項期望值仍寫死日期字串，才不會與受測程式共用同一個錯。 */
function dueIn(days: number, now = NOW): Card {
  const due = toDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + days));
  return card(`+${days}`, { interval: 3, due });
}

describe('未來各天的累積到期張數', () => {
  it('沒有卡時回空', () => {
    expect(forecastDueCounts([], NOW)).toEqual([]);
  });

  it('全部卡都在 7 天以後才到期時，回空', () => {
    expect(forecastDueCounts([dueIn(8), dueIn(30)], NOW)).toEqual([]);
  });

  it('排未來 7 天，不含今天', () => {
    const forecast = forecastDueCounts([card('新卡')], NOW);
    expect(forecast.map((day) => day.date)).toEqual([
      '2026-07-24',
      '2026-07-25',
      '2026-07-26',
      '2026-07-27',
      '2026-07-28',
      '2026-07-29',
      '2026-07-30',
    ]);
  });

  it('逾期卡在每一天都被計入', () => {
    const forecast = forecastDueCounts([card('上週', { interval: 3, due: '2026-07-16' })], NOW);
    expect(forecast.map((day) => day.count)).toEqual([1, 1, 1, 1, 1, 1, 1]);
  });

  it('新卡（due 為 null）從第一天起就被計入', () => {
    const forecast = forecastDueCounts([card('新卡')], NOW);
    expect(forecast[0]).toEqual({ date: '2026-07-24', count: 1 });
  });

  it('今日到期的卡從第一天起被計入', () => {
    const forecast = forecastDueCounts([card('今天', { interval: 3, due: '2026-07-23' })], NOW);
    expect(forecast.map((day) => day.count)).toEqual([1, 1, 1, 1, 1, 1, 1]);
  });

  it('張數是累積的，只增不減', () => {
    const forecast = forecastDueCounts([dueIn(1), dueIn(3), dueIn(3), dueIn(6)], NOW);
    expect(forecast.map((day) => day.count)).toEqual([1, 1, 3, 3, 3, 4, 4]);
  });

  it('張數為 0 的日子不出現在結果裡', () => {
    const forecast = forecastDueCounts([dueIn(3)], NOW);
    expect(forecast).toEqual([
      { date: '2026-07-26', count: 1 },
      { date: '2026-07-27', count: 1 },
      { date: '2026-07-28', count: 1 },
      { date: '2026-07-29', count: 1 },
      { date: '2026-07-30', count: 1 },
    ]);
  });

  it('邊界：恰好第 7 天到期的卡計入，第 8 天到期的不計入', () => {
    const forecast = forecastDueCounts([dueIn(7), dueIn(8)], NOW);
    expect(forecast).toEqual([{ date: '2026-07-30', count: 1 }]);
  });

  it('跨月的日期推進正確', () => {
    const monthEnd = new Date('2026-07-29T09:00:00');
    const forecast = forecastDueCounts([card('新卡')], monthEnd);
    expect(forecast.map((day) => day.date)).toEqual([
      '2026-07-30',
      '2026-07-31',
      '2026-08-01',
      '2026-08-02',
      '2026-08-03',
      '2026-08-04',
      '2026-08-05',
    ]);
  });

  it('跨年的日期推進正確', () => {
    const yearEnd = new Date('2026-12-28T09:00:00');
    const forecast = forecastDueCounts([card('新卡')], yearEnd);
    expect(forecast.map((day) => day.date)).toEqual([
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
      '2027-01-03',
      '2027-01-04',
    ]);
  });
});
