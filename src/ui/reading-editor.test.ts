import { describe, it, expect } from 'vitest';
import { createReadingEditor, type Change } from './reading-editor';

/** 什麼都不必動的變更單。多數斷言都是拿它比對。 */
const NOTHING: Change = { term: false, runs: false, note: false };

/** AI 回覆裡的一串漢字。splittable 為 false 代表整串共用一段讀音。 */
function replyRun(kanji: string, reading: string, splittable = true) {
  return { splittable, cells: [{ kanji, reading }] };
}

/** 一支假的 AI：記下被問了什麼，何時回、回什麼一律由測試決定，不發任何請求。 */
function fakeAsk() {
  const asked: string[] = [];
  const pending: Array<{
    resolve: (value: unknown) => void;
    reject: (reason: unknown) => void;
  }> = [];
  return {
    asked,
    ask(term: string): Promise<unknown> {
      asked.push(term);
      return new Promise((resolve, reject) => {
        pending.push({ resolve, reject });
      });
    },
    reply(value: unknown) {
      pending.shift()!.resolve(value);
    },
    fail(message: string) {
      pending.shift()!.reject(new Error(message));
    },
  };
}

describe('讀音預填', () => {
  it('等待期間改了詞條：這份回覆對的是舊的漢字串，整份丟掉', async () => {
    const ai = fakeAsk();
    const editor = createReadingEditor({ ask: ai.ask });
    editor.setTerm('焦がす');

    const { later } = editor.prefill();
    editor.setTerm('焦がした');
    ai.reply([replyRun('焦', 'こ')]);

    expect(await later).toEqual(NOTHING);
    expect(editor.runs).toEqual([{ start: 0, cells: [{ kanji: '焦', reading: '' }] }]);
  });

  it('沒設金鑰：全程靜默，提示字始終沒出現過', async () => {
    const editor = createReadingEditor({ ask: null });
    // 長出讀音格是打字本來就會發生的事；沒金鑰要靜默的是預填與提示字那一段。
    expect(editor.setTerm('焦がす').note).toBe(false);

    const { now, later } = editor.prefill();
    expect(now).toEqual(NOTHING);
    expect(await later).toEqual(NOTHING);
    expect(editor.note).toBeNull();
  });

  it('開舊卡：已有格子填了讀音就不問', () => {
    const ai = fakeAsk();
    const editor = createReadingEditor({ markup: '焦[こ]がす', ask: ai.ask });

    expect(editor.prefill().now).toEqual(NOTHING);
    expect(ai.asked).toEqual([]);
  });

  it('同一串詞條不問第二次，即使第一次失敗了', async () => {
    const ai = fakeAsk();
    const editor = createReadingEditor({ ask: ai.ask });
    editor.setTerm('焦がす');

    const first = editor.prefill();
    ai.fail('連不上 Gemini');
    await first.later;

    expect(editor.prefill().now).toEqual(NOTHING);
    expect(ai.asked).toEqual(['焦がす']);
  });

  it('シンポジウム：詞條沒有漢字就不問', () => {
    const ai = fakeAsk();
    const editor = createReadingEditor({ ask: ai.ask });
    editor.setTerm('シンポジウム');

    expect(editor.prefill().now).toEqual(NOTHING);
    expect(ai.asked).toEqual([]);
  });

  it('詞條 trim 後為空就不問', () => {
    const ai = fakeAsk();
    const editor = createReadingEditor({ ask: ai.ask });
    editor.setTerm('   ');

    expect(editor.prefill().now).toEqual(NOTHING);
    expect(ai.asked).toEqual([]);
  });

  it('回覆的漢字對不上詞條：掛失敗，讀音格保持原狀留空', async () => {
    const ai = fakeAsk();
    const editor = createReadingEditor({ ask: ai.ask });
    editor.setTerm('焦がす');

    const { now, later } = editor.prefill();
    expect(now).toEqual({ term: false, runs: false, note: true });
    expect(editor.note).toEqual({ kind: 'asking' });

    ai.reply([replyRun('煎', 'い')]);

    expect(await later).toEqual({ term: false, runs: false, note: true });
    expect(editor.note).toEqual({ kind: 'failed', reason: 'AI 給的讀音對不上這個詞條' });
    expect(editor.runs).toEqual([{ start: 0, cells: [{ kanji: '焦', reading: '' }] }]);
  });

  it('連不上、逾時：掛失敗並帶原訊息', async () => {
    const ai = fakeAsk();
    const editor = createReadingEditor({ ask: ai.ask });
    editor.setTerm('焦がす');

    const { later } = editor.prefill();
    ai.fail('等超過 10 秒沒有回覆');

    expect(await later).toEqual({ term: false, runs: false, note: true });
    expect(editor.note).toEqual({ kind: 'failed', reason: '等超過 10 秒沒有回覆' });
  });

  it('回覆採用後讀音格要重畫，提示字換成填好了', async () => {
    const ai = fakeAsk();
    const editor = createReadingEditor({ ask: ai.ask });
    editor.setTerm('考え込む');

    const { later } = editor.prefill();
    ai.reply([replyRun('考', 'かんが'), replyRun('込', 'こ')]);

    expect(await later).toEqual({ term: false, runs: true, note: true });
    expect(editor.note).toEqual({ kind: 'filled' });
    expect(editor.runs).toEqual([
      { start: 0, cells: [{ kanji: '考', reading: 'かんが' }] },
      { start: 2, cells: [{ kanji: '込', reading: 'こ' }] },
    ]);
  });
});

describe('讀音格要不要重畫', () => {
  it('考え込む → 考え込んだ：只動詞尾，不重畫', () => {
    const editor = createReadingEditor({ ask: null });
    editor.setTerm('考え込む');

    expect(editor.setTerm('考え込んだ').runs).toBe(false);
  });

  it('考え込む → 考え直す：換了漢字，要重畫', () => {
    const editor = createReadingEditor({ ask: null });
    editor.setTerm('考え込む');

    expect(editor.setTerm('考え直す').runs).toBe(true);
  });

  it('讀音格打字：恆為空單，重畫會打斷輸入法', () => {
    const editor = createReadingEditor({ ask: null });
    editor.setTerm('焦がす');

    expect(editor.setReading(0, 0, 'こ')).toEqual(NOTHING);
    expect(editor.runs).toEqual([{ start: 0, cells: [{ kanji: '焦', reading: 'こ' }] }]);
  });

  it('帰省：合併相鄰兩格要重畫', () => {
    const editor = createReadingEditor({ ask: null });
    editor.setTerm('帰省');

    expect(editor.mergeAt(0, 0)).toEqual({ term: false, runs: true, note: false });
    expect(editor.runs).toEqual([{ start: 0, cells: [{ kanji: '帰省', reading: '' }] }]);
  });

  it('帰省[きせい]：切開一格要重畫', () => {
    const editor = createReadingEditor({ markup: '帰省[きせい]', ask: null });

    expect(editor.splitAt(0, 0, 1)).toEqual({ term: false, runs: true, note: false });
    expect(editor.runs).toEqual([
      {
        start: 0,
        cells: [
          { kanji: '帰', reading: '' },
          { kanji: '省', reading: '' },
        ],
      },
    ]);
  });
});

describe('提示字的生死', () => {
  it('預填完成後改詞條、讀音還在：提示字留著', async () => {
    const ai = fakeAsk();
    const editor = createReadingEditor({ ask: ai.ask });
    editor.setTerm('考え込む');

    const { later } = editor.prefill();
    ai.reply([replyRun('考', 'かんが'), replyRun('込', 'こ')]);
    await later;

    expect(editor.setTerm('考え込んだ').note).toBe(false);
    expect(editor.note).toEqual({ kind: 'filled' });
  });

  it('清空所有讀音後改詞條：提示字消失', async () => {
    const ai = fakeAsk();
    const editor = createReadingEditor({ ask: ai.ask });
    editor.setTerm('考え込む');

    const { later } = editor.prefill();
    ai.reply([replyRun('考', 'かんが'), replyRun('込', 'こ')]);
    await later;

    editor.setReading(0, 0, '');
    editor.setReading(1, 0, '');

    expect(editor.setTerm('考え込んだ').note).toBe(true);
    expect(editor.note).toBeNull();
  });
});

describe('進出口', () => {
  it('貼上 焦[こ]がす：攤回讀音格，並回報詞條框要改寫', () => {
    const editor = createReadingEditor({ ask: null });

    expect(editor.setTerm('焦[こ]がす')).toEqual({ term: true, runs: true, note: false });
    expect(editor.term).toBe('焦がす');
    expect(editor.runs).toEqual([{ start: 0, cells: [{ kanji: '焦', reading: 'こ' }] }]);
  });

  it('儲存時詞條空白', () => {
    const editor = createReadingEditor({ ask: null });
    editor.setTerm('   ');

    expect(editor.commit()).toEqual({ ok: false, reason: 'empty-term' });
  });

  it('儲存時同串混填混空，錯誤清單指出是哪一串', () => {
    const editor = createReadingEditor({ ask: null });
    editor.setTerm('帰省');
    editor.setReading(0, 0, 'き');

    expect(editor.commit()).toEqual({
      ok: false,
      reason: 'invalid',
      errors: ['帰省 這串漢字的讀音要麼全部填、要麼全部留空'],
    });
  });

  it('儲存時組出標記字串，模組狀態不受影響', () => {
    const editor = createReadingEditor({ ask: null });
    editor.setTerm(' 焦がす ');
    editor.setReading(0, 0, 'こ');

    expect(editor.commit()).toEqual({ ok: true, text: '焦[こ]がす' });
    expect(editor.term).toBe(' 焦がす ');
    expect(editor.runs).toEqual([{ start: 1, cells: [{ kanji: '焦', reading: 'こ' }] }]);
  });
});
