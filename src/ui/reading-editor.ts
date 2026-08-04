/**
 * 讀音編輯器：編輯畫面上讀音格的協調邏輯，完全不碰 DOM。
 *
 * `reading.ts` 那七支純函式各自知道怎麼算，但「什麼時候該呼叫哪一支」原本埋在
 * `editor-view.ts` 裡跟畫面綁死，測不到。這裡把那些判斷收進來：搶答檢查、要不要
 * 重畫、提示字的生死、預填的五條守門，以及讀音格與「問過哪一串」的記錄。
 *
 * 對外只用「變更單」溝通——每支指令回一個小物件，說明畫面各處要不要動；內容則從
 * 唯讀的 `term`、`runs`、`note` 取。中文文案與樣式一律留在畫面那一側，這裡只吐狀態代號。
 */

import {
  parseReading,
  toDraft,
  toMarkup,
  rebuildRuns,
  mergeSeam,
  splitCellAt,
  validateDraft,
  firstEmptyReading,
  acceptPrefill,
  type KanjiRun,
  type ReadingDraft,
} from '../lib/reading';

/** 一支指令做完之後，畫面各處要不要動。 */
export interface Change {
  /** 詞條框要改寫。只有貼上帶標記字串時為 true。 */
  term: boolean;
  /** 讀音格要重畫。 */
  runs: boolean;
  /** 提示字要換。 */
  note: boolean;
}

/** 讀音區上方那一行的狀態。中文與樣式由畫面決定。 */
export type Note =
  | { kind: 'asking' }
  | { kind: 'filled' }
  | { kind: 'failed'; reason: string };

/**
 * `empty-reading` 與 `invalid` 刻意分家：沒填要把游標送到那一格，填錯只出紅字、游標不動
 * （ADR-0009）。`index` 是讀音格攤平後的序號，畫面照號碼找輸入框。
 */
export type Commit =
  | { ok: true; text: string }
  | { ok: false; reason: 'empty-term' }
  | { ok: false; reason: 'empty-reading'; index: number }
  | { ok: false; reason: 'invalid'; errors: string[] };

export interface ReadingEditor {
  /** 目前的詞條原文，不含任何標記。 */
  readonly term: string;
  readonly runs: KanjiRun[];
  /** null 代表沒話講。 */
  readonly note: Note | null;
  setTerm(raw: string): Change;
  setReading(ri: number, ci: number, value: string): Change;
  mergeAt(ri: number, seam: number): Change;
  splitAt(ri: number, ci: number, at: number): Change;
  prefill(): { now: Change; later: Promise<Change> };
  commit(): Commit;
}

const NOTHING: Change = { term: false, runs: false, note: false };

export function createReadingEditor(options: {
  /** 舊卡的標記字串；新卡不傳。 */
  markup?: string;
  /** 去問 AI（Artificial Intelligence，人工智慧）的那支函式。null 代表沒金鑰，全程靜默。 */
  ask: ((term: string) => Promise<unknown>) | null;
}): ReadingEditor {
  const { markup, ask } = options;

  // 舊卡照已存標記還原成讀音格；新卡從空白開始。
  const initial: ReadingDraft = markup === undefined ? { term: '', runs: [] } : toDraft(markup);
  let term = initial.term;
  let runs: KanjiRun[] = initial.runs;
  let note: Note | null = null;
  /** 這次編輯已經問過的詞條，同一串不重複問。 */
  let askedTerm: string | null = null;

  /** 目前有沒有任何一格填了讀音。守門與提示字的存亡都看這個。 */
  const anyFilled = () => runs.some((run) => run.cells.some((cell) => cell.reading !== ''));

  /**
   * 詞條一改，上一次的提示就過期了——但改詞條會保留已填的讀音，
   * AI 填的假名還活著時「請確認」那行絕不能跟著消失，那是唯一擋得住讀音幻覺的東西。
   */
  const expireNote = (): boolean => {
    if (note === null || anyFilled()) return false;
    note = null;
    return true;
  };

  const setNote = (next: Note): Change => {
    note = next;
    return { term: false, runs: false, note: true };
  };

  return {
    get term() {
      return term;
    },
    get runs() {
      return runs;
    },
    get note() {
      return note;
    },

    setTerm(raw) {
      const parsed = parseReading(raw);
      let changedRuns: boolean;
      let changedTerm = false;
      if (parsed.some((segment) => segment.reading !== undefined)) {
        // 貼上帶標記的字串：括號攤回格子，詞條框只留純文字。
        const draft = toDraft(raw);
        term = draft.term;
        runs = draft.runs;
        changedTerm = true;
        changedRuns = true;
      } else {
        // 依漢字內容保留已填讀音。漢字排列沒變（多半只是尾端加減假名）就不重畫，
        // 正在打字的讀音格才不會失焦、IME（Input Method Editor，輸入法編輯器）才不會被打斷。
        const next = rebuildRuns(raw, runs);
        changedRuns = shape(next) !== shape(runs);
        term = raw;
        runs = next;
      }
      return { term: changedTerm, runs: changedRuns, note: expireNote() };
    },

    setReading(ri, ci, value) {
      runs[ri]!.cells[ci]!.reading = value;
      // 重畫會打斷輸入法，這一支永遠不准要求重畫。
      return NOTHING;
    },

    mergeAt(ri, seam) {
      runs[ri] = mergeSeam(runs[ri]!, seam);
      return { term: false, runs: true, note: false };
    },

    splitAt(ri, ci, at) {
      runs[ri] = splitCellAt(runs[ri]!, ci, at);
      return { term: false, runs: true, note: false };
    },

    /**
     * 詞條打完之後去問一次 AI。守門條件任一不成立就完全靜默——
     * 尤其是沒設定金鑰的情況（新裝置、手機），不能每次新增卡片都嘮叨一句。
     *
     * 刻意不宣告成 `async`：守門與掛提示字要當場做完（那是 `now` 這張單子），
     * 等回覆才做的事包成 Promise 交出去（那是 `later`）。
     */
    prefill() {
      if (ask === null || term.trim() === '' || runs.length === 0) return silent();
      // 已經填過的格子不覆蓋，開舊卡也因此不會觸發。
      if (anyFilled() || term === askedTerm) return silent();

      const asked = term;
      askedTerm = asked;
      return { now: setNote({ kind: 'asking' }), later: settle(ask(asked), asked) };
    },

    commit() {
      const trimmed = term.trim();
      if (trimmed === '') return { ok: false, reason: 'empty-term' };
      // 對齊 trim 後的詞條，讀音照漢字內容搬過來。模組自己的狀態不動——
      // 驗證沒過時使用者還留在畫面上，這裡改了就會跟輸入框裡的不一致。
      const draft: ReadingDraft = { term: trimmed, runs: rebuildRuns(trimmed, runs) };
      // 沒填先報：它是三種欄位共用那條「還空著就要填」，與讀音填錯不同路。
      const empty = firstEmptyReading(draft);
      if (empty !== null) return { ok: false, reason: 'empty-reading', index: empty };
      const errors = validateDraft(draft);
      if (errors.length > 0) return { ok: false, reason: 'invalid', errors };
      return { ok: true, text: toMarkup(draft) };
    },
  };

  function silent() {
    return { now: NOTHING, later: Promise.resolve(NOTHING) };
  }

  /** 等回覆、驗證、填進格子。這支不會失敗，壞消息一律變成提示字。 */
  async function settle(reply: Promise<unknown>, asked: string): Promise<Change> {
    try {
      const filled = acceptPrefill(asked, await reply);
      // 等待期間使用者又改了詞條，這份回覆對的是舊的那串漢字，不能套上去。
      // 提示字的生死已經由那一下的 setTerm 處理過，這裡不再插手。
      if (term !== asked) return NOTHING;
      if (filled === null) throw new Error('AI 給的讀音對不上這個詞條');
      runs = filled;
      note = { kind: 'filled' };
      return { term: false, runs: true, note: true };
    } catch (reason) {
      if (term !== asked) return NOTHING;
      // 讀音格維持原狀留空，接下來得自己填——必填之後，填好之前這張卡存不下去。
      return setNote({
        kind: 'failed',
        reason: reason instanceof Error ? reason.message : '未知原因',
      });
    }
  }
}

/** 漢字排列的指紋，用來判斷詞條改動後讀音格需不需要重畫。 */
function shape(runs: KanjiRun[]): string {
  return runs.map((run) => run.cells.map((cell) => cell.kanji).join(',')).join(';');
}
