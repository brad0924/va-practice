import { describe, it, expect } from 'vitest';
import { termColumns, termMetrics, BASE_LINE_RATIO } from './term-layout';

describe('切欄', () => {
  it('蓋著答案時只給原文，一個字一欄', () => {
    expect(termColumns('焦[こ]がす', false)).toEqual([{ base: '焦' }, { base: 'が' }, { base: 'す' }]);
  });

  it('掀開答案時，標了音的那段整段一欄', () => {
    expect(termColumns('焦[こ]がす', true)).toEqual([
      { base: '焦', reading: 'こ' },
      { base: 'が' },
      { base: 'す' },
    ]);
  });

  it('一段多字的漢字不會被拆開，讀音跟著整段走', () => {
    expect(termColumns('帰省[きせい]する', true)).toEqual([
      { base: '帰省', reading: 'きせい' },
      { base: 'す' },
      { base: 'る' },
    ]);
  });

  it('沒標音的漢字逐字一欄，換行只會發生在字與字之間', () => {
    expect(termColumns('ざるを得ない', true)).toEqual([
      { base: 'ざ' },
      { base: 'る' },
      { base: 'を' },
      { base: '得' },
      { base: 'な' },
      { base: 'い' },
    ]);
  });

  it('空詞條給空的一排', () => {
    expect(termColumns('', true)).toEqual([]);
  });

  /**
   * `𠮟` 佔兩個碼元。用 `split('')` 切的話會變成兩欄各半個字，畫出來是兩個問號方框。
   *
   * 它標不了讀音——`core/lib/reading.ts` 的漢字表收到擴充 A 區為止，這個字在擴充 B 區。
   * 那是共用邏輯既有的範圍，不是這裡的事，所以這一條只驗切欄。
   */
  it('一個字佔兩個碼元的字元不會被切成兩半', () => {
    expect(termColumns('𠮟る', true)).toEqual([{ base: '𠮟' }, { base: 'る' }]);
    expect(termColumns('𠮟る', false)).toEqual([{ base: '𠮟' }, { base: 'る' }]);
  });
});

describe('位移量', () => {
  const metrics = termMetrics(1);

  it('假名比漢字小', () => {
    expect(metrics.kana).toBeLessThan(metrics.term);
  });

  it('漢字底下留的行距是 0.45 em', () => {
    expect(metrics.baseLineHeight - metrics.term).toBeCloseTo(metrics.term * (BASE_LINE_RATIO - 1));
    expect((metrics.baseLineHeight - metrics.term) / 2).toBeCloseTo(metrics.term * 0.45);
  });

  it('假名往下拉的距離剛好等於漢字上方那半份行距', () => {
    expect(metrics.readingPull).toBeCloseTo((metrics.baseLineHeight - metrics.term) / 2);
  });

  it('假名的行框剛好一個字身，多出來的空間不會把它推離漢字', () => {
    expect(metrics.kanaLineHeight).toBeCloseTo(metrics.kana);
  });

  it('調大系統字級時，每一個尺寸都等比放大', () => {
    const bigger = termMetrics(2);
    expect(bigger.term).toBeCloseTo(metrics.term * 2);
    expect(bigger.kana).toBeCloseTo(metrics.kana * 2);
    expect(bigger.baseLineHeight).toBeCloseTo(metrics.baseLineHeight * 2);
    expect(bigger.readingPull).toBeCloseTo(metrics.readingPull * 2);
  });
});
