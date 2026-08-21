import { describe, it, expect } from 'vitest';
import { createReadingEditor, type Change } from './reading-editor';
import zhHant from '../i18n/zh-Hant';
import { SilentError } from '../lib/app-error';

/** 什麼都不必動的變更單。多數斷言都是拿它比對。 */
const NOTHING: Change = { term: false, runs: false, note: false };

/** 儲存前那兩句檢查結果。比對翻譯檔裡的字，不在測試裡另抄一份。 */
const kanaRequired = (kanji: string) => zhHant['reading.kanaRequired'].replace('{kanji}', kanji);
const cellsRequired = (kanji: string) => zhHant['reading.cellsRequired'].replace('{kanji}', kanji);

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
    /** 回覆還沒回的第 at 份請求，預設最早那一份。 */
    reply(value: unknown, at = 0) {
      pending.splice(at, 1)[0]!.resolve(value);
    },
    fail(message: string) {
      pending.shift()!.reject(new Error(message));
    },
    /** iOS 上 App Check 沒過的那一種：問不成，但一個字都不必說。 */
    stayQuiet() {
      pending.shift()!.reject(new SilentError());
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

  it('等待期間使用者自己把讀音打好了：遲到的回覆不覆蓋，詢問中那句收掉', async () => {
    const ai = fakeAsk();
    const editor = createReadingEditor({ ask: ai.ask });
    editor.setTerm('考え込む');

    const { later } = editor.prefill();
    // 等不下去，自己填。這時請求還在路上。
    editor.setReading(0, 0, 'かんが');
    editor.setReading(1, 0, 'こ');
    ai.reply([replyRun('考', 'まちが'), replyRun('込', 'い')]);

    // 提示字要「換成沒有」：沒有一個字是 AI 填的，「請確認」掛不上去，
    // 但「詢問中」留著就變成一場問不完的等待。
    expect(await later).toEqual({ term: false, runs: false, note: true });
    expect(editor.note).toBeNull();
    expect(editor.runs).toEqual([
      { start: 0, cells: [{ kanji: '考', reading: 'かんが' }] },
      { start: 2, cells: [{ kanji: '込', reading: 'こ' }] },
    ]);
  });

  it('等待期間只填了一格：整份回覆還是丟掉，另一格留空自己填', async () => {
    const ai = fakeAsk();
    const editor = createReadingEditor({ ask: ai.ask });
    editor.setTerm('考え込む');

    const { later } = editor.prefill();
    editor.setReading(0, 0, 'かんが');
    ai.reply([replyRun('考', 'まちが'), replyRun('込', 'い')]);

    expect(await later).toEqual({ term: false, runs: false, note: true });
    expect(editor.note).toBeNull();
    expect(editor.runs).toEqual([
      { start: 0, cells: [{ kanji: '考', reading: 'かんが' }] },
      { start: 2, cells: [{ kanji: '込', reading: '' }] },
    ]);
  });

  it('前一份遲到的回覆：AI 剛填好的假名還在，「請確認」不能被它抹掉', async () => {
    const ai = fakeAsk();
    const editor = createReadingEditor({ ask: ai.ask });

    // 同一串漢字問兩次：改走一趟再改回來，`askedTerm` 已經被中間那次換掉。
    editor.setTerm('考え込む');
    const first = editor.prefill();
    editor.setTerm('考え込');
    editor.prefill();
    editor.setTerm('考え込む');
    const third = editor.prefill();

    // 後發的先到：格子填好，掛上「請確認」。
    ai.reply([replyRun('考', 'かんが'), replyRun('込', 'こ')], 2);
    expect(await third.later).toEqual({ term: false, runs: true, note: true });
    expect(editor.note).toEqual({ kind: 'filled' });

    // 第一份這時才回。不套用是對的，但「請確認」是擋讀音幻覺的唯一一道，
    // 假名還活著就絕不能跟著收掉。
    ai.reply([replyRun('考', 'まちが'), replyRun('込', 'い')], 0);
    expect(await first.later).toEqual(NOTHING);
    expect(editor.note).toEqual({ kind: 'filled' });
    expect(editor.runs).toEqual([
      { start: 0, cells: [{ kanji: '考', reading: 'かんが' }] },
      { start: 2, cells: [{ kanji: '込', reading: 'こ' }] },
    ]);
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
    expect(editor.note).toEqual({ kind: 'failed', reason: zhHant['reading.prefillMismatch'] });
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

  it('說不出口的失敗：提示字整個收掉，讀音格留空', async () => {
    const ai = fakeAsk();
    const editor = createReadingEditor({ ask: ai.ask });
    editor.setTerm('焦がす');

    const { later } = editor.prefill();
    expect(editor.note).toEqual({ kind: 'asking' });
    ai.stayQuiet();

    // 提示字仍然要「換」——換成沒有。詢問中那句留在畫面上會變成一場問不完的等待。
    expect(await later).toEqual({ term: false, runs: false, note: true });
    expect(editor.note).toBeNull();
    expect(editor.runs).toEqual([{ start: 0, cells: [{ kanji: '焦', reading: '' }] }]);
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

describe('AI 會不會動到讀音格（換欄鍵的避讓條件）', () => {
  it('詞條打完、還沒失焦：按鍵的當下就要答得出「等一下會去問」', () => {
    const ai = fakeAsk();
    const editor = createReadingEditor({ ask: ai.ask });
    editor.setTerm('大丈夫');

    expect(editor.prefilling).toBe(true);
    expect(ai.asked).toEqual([]);
  });

  it('正在問的期間也算', () => {
    const ai = fakeAsk();
    const editor = createReadingEditor({ ask: ai.ask });
    editor.setTerm('大丈夫');
    editor.prefill();

    expect(editor.prefilling).toBe(true);
  });

  it('填好了就不算：讀音格已經有值，AI 不會再動它', async () => {
    const ai = fakeAsk();
    const editor = createReadingEditor({ ask: ai.ask });
    editor.setTerm('焦がす');

    const { later } = editor.prefill();
    ai.reply([replyRun('焦', 'こ')]);
    await later;

    expect(editor.prefilling).toBe(false);
  });

  it('失敗了就不算：同一串不問第二次，讀音格從此安全', async () => {
    const ai = fakeAsk();
    const editor = createReadingEditor({ ask: ai.ask });
    editor.setTerm('焦がす');

    const { later } = editor.prefill();
    ai.fail('連不上 Gemini');
    await later;

    expect(editor.prefilling).toBe(false);
  });

  it('沒設金鑰的人永遠不算', () => {
    const editor = createReadingEditor({ ask: null });
    editor.setTerm('大丈夫');

    expect(editor.prefilling).toBe(false);
  });

  it('シンポジウム：沒有讀音格就沒有東西要避讓', () => {
    const ai = fakeAsk();
    const editor = createReadingEditor({ ask: ai.ask });
    editor.setTerm('シンポジウム');

    expect(editor.prefilling).toBe(false);
  });

  it('開舊卡：讀音已經填好，不算', () => {
    const ai = fakeAsk();
    const editor = createReadingEditor({ markup: '焦[こ]がす', ask: ai.ask });

    expect(editor.prefilling).toBe(false);
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

  it('儲存時讀音填了非假名，回錯誤清單', () => {
    const editor = createReadingEditor({ ask: null });
    editor.setTerm('考');
    editor.setReading(0, 0, 'kanga');

    expect(editor.commit()).toEqual({ ok: false, errors: [kanaRequired('考')] });
  });

  // 空讀音格是道守門：畫面按儲存時必填格已經先擋過，走到 commit 代表輸入框與讀音格漂移了。
  // 少了它，一張沒讀音的卡會靜默存進去（ADR-0009）。
  it('讀音還空著就 commit：守門擋下，不會靜默存成沒讀音的卡', () => {
    const editor = createReadingEditor({ ask: null });
    editor.setTerm('大丈夫');
    editor.setReading(0, 0, 'だい');

    expect(editor.commit()).toEqual({
      ok: false,
      errors: [cellsRequired('大丈夫')],
    });
  });

  it('開一張沒讀音的舊卡，什麼都沒改也存不回去', () => {
    const editor = createReadingEditor({ markup: '仕事', ask: null });

    expect(editor.commit()).toEqual({
      ok: false,
      errors: [cellsRequired('仕事')],
    });
  });

  it('儲存純假名詞條，沒有讀音格也存得下去', () => {
    const editor = createReadingEditor({ ask: null });
    editor.setTerm('ありがとう');

    expect(editor.commit()).toEqual({ ok: true, text: 'ありがとう' });
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
