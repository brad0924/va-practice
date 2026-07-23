import { describe, it, expect } from 'vitest';
import { parseReading, toPlainText, toReadingText } from './reading';

describe('讀音標記解析', () => {
  it('單一漢字加送假名', () => {
    expect(parseReading('焦[こ]がす')).toEqual([
      { text: '焦', reading: 'こ' },
      { text: 'がす' },
    ]);
  });

  it('連續漢字共用一段讀音', () => {
    expect(parseReading('帰省[きせい]')).toEqual([{ text: '帰省', reading: 'きせい' }]);
  });

  it('多段漢字各自標讀音，送假名邊界正確切開', () => {
    expect(parseReading('書[か]き下[お]ろす')).toEqual([
      { text: '書', reading: 'か' },
      { text: 'き' },
      { text: '下', reading: 'お' },
      { text: 'ろす' },
    ]);
  });

  it('讀音只吃緊鄰括號的漢字，前面的假名不被吞掉', () => {
    expect(parseReading('送[おく]り仮名[がな]')).toEqual([
      { text: '送', reading: 'おく' },
      { text: 'り' },
      { text: '仮名', reading: 'がな' },
    ]);
  });

  it('純假名詞條沒有讀音', () => {
    expect(parseReading('ざるを得[え]ない')).toEqual([
      { text: 'ざるを' },
      { text: '得', reading: 'え' },
      { text: 'ない' },
    ]);
  });

  it('外來語完全沒有標記時視為單一無讀音區段', () => {
    expect(parseReading('シンポジウム')).toEqual([{ text: 'シンポジウム' }]);
  });

  it('空字串回傳空陣列', () => {
    expect(parseReading('')).toEqual([]);
  });

  it('括號前沒有漢字時原樣保留，不當成讀音', () => {
    expect(parseReading('あ[い]')).toEqual([{ text: 'あ[い]' }]);
  });

  it('未閉合的方括號原樣保留', () => {
    expect(parseReading('焦[こ')).toEqual([{ text: '焦[こ' }]);
  });

  it('疊字符號算漢字', () => {
    expect(parseReading('人々[ひとびと]')).toEqual([{ text: '人々', reading: 'ひとびと' }]);
  });
});

describe('文字轉換', () => {
  it('去掉標記後得到詞條原文', () => {
    expect(toPlainText('書[か]き下[お]ろす')).toBe('書き下ろす');
    expect(toPlainText('シンポジウム')).toBe('シンポジウム');
  });

  it('以讀音取代漢字後得到朗讀用的假名字串', () => {
    expect(toReadingText('書[か]き下[お]ろす')).toBe('かきおろす');
    expect(toReadingText('シンポジウム')).toBe('シンポジウム');
  });
});
