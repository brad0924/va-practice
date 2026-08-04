import { describe, it, expect } from 'vitest';
import { createRequiredFields } from './required-fields';

/**
 * 用一組固定的值組出必填格。測試在意的只有「哪一格空著」，
 * 值本身填什麼字不重要，因此不必假造輸入框。
 */
function fieldsOf(snapshot: {
  term: string;
  readings: string[];
  meaning: string;
  prefilling?: boolean;
}) {
  return createRequiredFields({
    term: () => snapshot.term,
    readings: () => snapshot.readings,
    meaning: () => snapshot.meaning,
    prefilling: () => snapshot.prefilling ?? false,
  });
}

describe('換欄輪詢 nextEmpty', () => {
  it('從詞條出發，讀音格還空著就送進第一格', () => {
    const fields = fieldsOf({ term: '大丈夫', readings: ['', ''], meaning: '沒問題' });

    expect(fields.nextEmpty({ kind: 'term' })).toEqual({
      kind: 'move',
      to: { kind: 'reading', index: 0 },
    });
  });

  it('從空著的那一格出發：不跳，也不放行（前提一）', () => {
    const fields = fieldsOf({ term: '', readings: [''], meaning: '' });

    expect(fields.nextEmpty({ kind: 'term' })).toEqual({ kind: 'stay' });
  });

  it('三種格全部有值：放行', () => {
    const fields = fieldsOf({ term: '大丈夫', readings: ['だい', 'じょうぶ'], meaning: '沒問題' });

    expect(fields.nextEmpty({ kind: 'term' })).toEqual({ kind: 'done' });
  });

  it('讀音格之間往下走', () => {
    const fields = fieldsOf({
      term: '大丈夫',
      readings: ['だい', 'じょう', ''],
      meaning: '沒問題',
    });

    expect(fields.nextEmpty({ kind: 'reading', index: 1 })).toEqual({
      kind: 'move',
      to: { kind: 'reading', index: 2 },
    });
  });

  it('從釋義出發，到底繞回詞條', () => {
    const fields = fieldsOf({ term: '', readings: ['こ'], meaning: '燒焦' });

    expect(fields.nextEmpty({ kind: 'meaning' })).toEqual({
      kind: 'move',
      to: { kind: 'term' },
    });
  });

  it('從讀音格出發，後面都有值就繞回詞條', () => {
    const fields = fieldsOf({ term: '', readings: ['こ'], meaning: '燒焦' });

    expect(fields.nextEmpty({ kind: 'reading', index: 0 })).toEqual({
      kind: 'move',
      to: { kind: 'term' },
    });
  });

  it('純假名詞條沒有讀音格，詞條之後就是釋義', () => {
    const fields = fieldsOf({ term: 'ありがとう', readings: [], meaning: '' });

    expect(fields.nextEmpty({ kind: 'term' })).toEqual({
      kind: 'move',
      to: { kind: 'meaning' },
    });
  });

  it('讀音格在失焦的同一刻被重畫換掉，序號數不到自己：就地不動', () => {
    const fields = fieldsOf({ term: '大丈夫', readings: ['だい'], meaning: '沒問題' });

    expect(fields.nextEmpty({ kind: 'reading', index: 5 })).toEqual({ kind: 'stay' });
  });
});

describe('AI 預填避讓', () => {
  it('離開詞條時 AI 會動讀音格：這一輪整段跳過，直接送到釋義', () => {
    const fields = fieldsOf({
      term: '大丈夫',
      readings: ['', ''],
      meaning: '',
      prefilling: true,
    });

    expect(fields.nextEmpty({ kind: 'term' })).toEqual({
      kind: 'move',
      to: { kind: 'meaning' },
    });
  });

  it('避讓之後無處可去（釋義已有值）：退讓，仍然送進第一個空的讀音格', () => {
    const fields = fieldsOf({
      term: '大丈夫',
      readings: ['', ''],
      meaning: '沒問題',
      prefilling: true,
    });

    expect(fields.nextEmpty({ kind: 'term' })).toEqual({
      kind: 'move',
      to: { kind: 'reading', index: 0 },
    });
  });

  it('沒有預填時照一般規則走，詞條之後就是讀音格', () => {
    const fields = fieldsOf({
      term: '大丈夫',
      readings: ['', ''],
      meaning: '沒問題',
      prefilling: false,
    });

    expect(fields.nextEmpty({ kind: 'term' })).toEqual({
      kind: 'move',
      to: { kind: 'reading', index: 0 },
    });
  });

  it('從讀音格出發時避讓不適用，就算正在問也照一般規則走', () => {
    const fields = fieldsOf({
      term: '大丈夫',
      readings: ['だい', ''],
      meaning: '沒問題',
      prefilling: true,
    });

    expect(fields.nextEmpty({ kind: 'reading', index: 0 })).toEqual({
      kind: 'move',
      to: { kind: 'reading', index: 1 },
    });
  });
});

describe('還空著＝還沒填完', () => {
  it('讀音格只填了一個空白，換欄與儲存都當它是空的', () => {
    const fields = fieldsOf({ term: '大丈夫', readings: ['だい', ' '], meaning: '沒問題' });

    expect(fields.nextEmpty({ kind: 'reading', index: 0 })).toEqual({
      kind: 'move',
      to: { kind: 'reading', index: 1 },
    });
    expect(fields.firstBlocking()).toEqual({ kind: 'reading', index: 1 });
  });

  it('詞條只填了一個空白，當它是空的', () => {
    const fields = fieldsOf({ term: ' ', readings: [], meaning: '沒問題' });

    expect(fields.firstBlocking()).toEqual({ kind: 'term' });
  });

  it('釋義只填了一個空白，當它是空的', () => {
    const fields = fieldsOf({ term: 'ありがとう', readings: [], meaning: ' ' });

    expect(fields.firstBlocking()).toEqual({ kind: 'meaning' });
  });
});

describe('儲存順序 firstBlocking', () => {
  it('三種格都空：擋在詞條', () => {
    const fields = fieldsOf({ term: '', readings: ['', ''], meaning: '' });

    expect(fields.firstBlocking()).toEqual({ kind: 'term' });
  });

  it('釋義與讀音都空：擋在釋義，讀音排最後', () => {
    const fields = fieldsOf({ term: '大丈夫', readings: ['', ''], meaning: '' });

    expect(fields.firstBlocking()).toEqual({ kind: 'meaning' });
  });

  it('只剩讀音格空著：擋在第一個空的那格', () => {
    const fields = fieldsOf({ term: '大丈夫', readings: ['だい', ''], meaning: '沒問題' });

    expect(fields.firstBlocking()).toEqual({ kind: 'reading', index: 1 });
  });

  it('三種格全部有值：放行', () => {
    const fields = fieldsOf({ term: '大丈夫', readings: ['だい', 'じょうぶ'], meaning: '沒問題' });

    expect(fields.firstBlocking()).toBeNull();
  });

  it('純假名詞條沒有讀音格，詞條與釋義填了就放行', () => {
    const fields = fieldsOf({ term: 'ありがとう', readings: [], meaning: '謝謝' });

    expect(fields.firstBlocking()).toBeNull();
  });
});
