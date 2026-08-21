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

import { t } from '../i18n';
import { AppError, SilentError, toMessage } from '../lib/app-error';
import {
  parseReading,
  toDraft,
  toMarkup,
  rebuildRuns,
  mergeSeam,
  splitCellAt,
  validateDraft,
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

/**
 * 去問 AI（Artificial Intelligence，人工智慧）讀音的那支函式。回的是還沒被信任的原始
 * 回覆——收不收由 `acceptPrefill`（`reading.ts`）決定，這裡只負責把它拿回來。
 *
 * 誰去問由 `editor-view.ts` 的 `createAsk()` 決定：網頁版是使用者自備金鑰打 Gemini，
 * iOS 是固定金鑰走 Firebase AI Logic。這一層兩條都不認識。
 */
export type Ask = (term: string) => Promise<unknown>;

/** 讀音區上方那一行的狀態。中文與樣式由畫面決定。 */
export type Note =
  | { kind: 'asking' }
  | { kind: 'filled' }
  | { kind: 'failed'; reason: string };

/**
 * 「沒填」不在這裡：必填由 `required-fields.ts` 一手判，畫面按儲存時先問過它才會走到 commit。
 * 這裡回的錯只有一種——填了但填錯（讀音不是假名），出紅字、游標不動（ADR-0009）。
 */
export type Commit = { ok: true; text: string } | { ok: false; errors: string[] };

export interface ReadingEditor {
  /** 目前的詞條原文，不含任何標記。 */
  readonly term: string;
  readonly runs: KanjiRun[];
  /** null 代表沒話講。 */
  readonly note: Note | null;
  /**
   * 讀音格接下來會不會被 AI 動到：正在問，或下一次 `prefill()` 就會去問。
   *
   * 換欄鍵靠它決定要不要整段跳過讀音格（ADR-0006 的避讓）。「會不會去問」比「正在問」多
   * 一半：詢問是詞條失焦才觸發的，而按鍵發生在失焦之前——只看「正在問」第一次按永遠漏掉。
   */
  readonly prefilling: boolean;
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
  /** null 代表根本沒有人可問（網頁版沒設金鑰），讀音預填全程靜默。 */
  ask: Ask | null;
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
   * 預填的五條守門。抽出來是因為 `prefilling` 也要看同一份清單——兩邊各寫一份會漂移，
   * 漂移的下場是換欄鍵把游標送進讀音格、AI 的回覆再把使用者正在打的字蓋掉。
   */
  const willAsk = () =>
    ask !== null &&
    term.trim() !== '' &&
    runs.length > 0 &&
    !anyFilled() &&
    term !== askedTerm;

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
    get prefilling() {
      return note?.kind === 'asking' || willAsk();
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
      // 守門在 willAsk 裡：已經填過的格子不覆蓋（開舊卡也因此不會觸發）、沒金鑰全程靜默。
      // 「沒金鑰」那條再問一次是為了型別——包在函式裡的檢查，編譯器看不出 ask 已經不是 null。
      if (!willAsk() || ask === null) return silent();

      const asked = term;
      askedTerm = asked;
      return { now: setNote({ kind: 'asking' }), later: settle(ask(asked), asked) };
    },

    commit() {
      const trimmed = term.trim();
      // 對齊 trim 後的詞條，讀音照漢字內容搬過來。模組自己的狀態不動——
      // 驗證沒過時使用者還留在畫面上，這裡改了就會跟輸入框裡的不一致。
      const draft: ReadingDraft = { term: trimmed, runs: rebuildRuns(trimmed, runs) };
      const errors = validateDraft(draft);
      if (errors.length > 0) return { ok: false, errors };
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
      // 讀音格已經有字了就不套用。`willAsk()` 的 `anyFilled()` 只守到發問之前，回覆進來的
      // 這一刻要再問一次——不然使用者等不下去自己打的字會整組被換掉，畫面上還沒有任何線索
      // 可以追查（`.scratch/reading-prefill/issues/05`）。
      //
      // 只收得掉「詢問中」那一句：不收就變成一場問不完的等待。其餘一律不動——這幾個字也
      // 可能是另一份回覆剛填的（同一串問過兩次、後發的先到），那時「請確認」還得掛在上面。
      if (anyFilled()) {
        if (note?.kind !== 'asking') return NOTHING;
        note = null;
        return { term: false, runs: false, note: true };
      }
      if (filled === null) throw new AppError('reading.prefillMismatch');
      runs = filled;
      note = { kind: 'filled' };
      return { term: false, runs: true, note: true };
    } catch (reason) {
      if (term !== asked) return NOTHING;
      // 說不出口的那一種：iOS 拿不到 App Check 憑證，使用者一點辦法都沒有，
      // 讀音格留空、畫面上一個字都不出（spec 決定十一）。仍然回「提示字要換」——
      // 換成沒有：`prefill()` 已經掛上「詢問中」，不收掉就變成一場問不完的等待。
      if (reason instanceof SilentError) {
        note = null;
        return { term: false, runs: false, note: true };
      }
      // 讀音格維持原狀留空，接下來得自己填——必填之後，填好之前這張卡存不下去。
      // 這裡走 toMessage()：問 Gemini 的失敗現在帶的是 key，直接讀 `.message` 只會拿到那條 key。
      // 外面那層 `instanceof Error` 不是多餘的——連 Error 都不是的東西 toMessage() 會吐
      // `String(error)`（`[object Object]` 那類），那不是一句話，所以仍然換成「未知原因」。
      return setNote({
        kind: 'failed',
        reason: reason instanceof Error ? toMessage(reason) : t('reading.unknownReason'),
      });
    }
  }
}

/** 漢字排列的指紋，用來判斷詞條改動後讀音格需不需要重畫。 */
function shape(runs: KanjiRun[]): string {
  return runs.map((run) => run.cells.map((cell) => cell.kanji).join(',')).join(';');
}
