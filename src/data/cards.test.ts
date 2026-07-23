import { describe, it, expect } from 'vitest';
import builtin from './cards.json';
import { parseReading } from '../lib/reading';

describe('內建牌組', () => {
  it('有 132 張卡', () => {
    expect(builtin.cards).toHaveLength(132);
  });

  it('識別碼不重複，否則單向合併會漏卡', () => {
    const ids = builtin.cards.map((card) => card.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('每張卡都有詞條與釋義', () => {
    for (const card of builtin.cards) {
      expect(card.text.trim(), card.id).not.toBe('');
      expect(card.meaning.trim(), card.id).not.toBe('');
    }
  });

  it('讀音標記全部解析得掉，沒有殘留的方括號', () => {
    for (const card of builtin.cards) {
      const leftover = parseReading(card.text).filter((segment) => /[[\]]/.test(segment.text));
      expect(leftover, `${card.id} 的讀音標記有問題`).toEqual([]);
    }
  });
});
