import { describe, it, expect } from 'vitest';
import { describeSchedule, stateModifier } from './list-view';

/** 六個時間桶與 overdueDays() 的天數一對一，邊界（−1／−2／−6／−7）是重點。 */
describe('describeSchedule', () => {
  it('新卡標「新」', () => {
    expect(describeSchedule(null)).toBe('新');
  });

  it('逾期一律標「現在」，不顯示拖了幾天', () => {
    expect(describeSchedule(1)).toBe('現在');
    expect(describeSchedule(30)).toBe('現在');
  });

  it('今日到期標「<24小時」', () => {
    expect(describeSchedule(0)).toBe('<24小時');
  });

  it('明天到期標「明天」', () => {
    expect(describeSchedule(-1)).toBe('明天');
  });

  it('後天到第 6 天標「<1週」', () => {
    expect(describeSchedule(-2)).toBe('<1週');
    expect(describeSchedule(-6)).toBe('<1週');
  });

  it('滿 7 天以上標「未來」', () => {
    expect(describeSchedule(-7)).toBe('未來');
    expect(describeSchedule(-365)).toBe('未來');
  });
});

describe('stateModifier', () => {
  it('六個桶各自對應一個 class 尾綴', () => {
    expect(stateModifier(null)).toBe(' new');
    expect(stateModifier(1)).toBe(' now');
    expect(stateModifier(0)).toBe(' today');
    expect(stateModifier(-1)).toBe(' tomorrow');
    expect(stateModifier(-2)).toBe(' week');
    expect(stateModifier(-6)).toBe(' week');
    expect(stateModifier(-7)).toBe(' future');
  });
});
