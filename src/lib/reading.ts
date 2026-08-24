/**
 * 讀音標記：把 `焦[こ]がす` 這種寫法解析成可渲染的振假名結構。
 * 純函式，不涉及任何狀態。
 */

import { t } from '../i18n';

/** 詞條中的一段文字，有 reading 者代表該段漢字要標振假名。 */
export interface Segment {
  text: string;
  reading?: string;
}

/** 漢字（含擴充 A 區與疊字符號々）。方括號前緊鄰的漢字序列才是被標注對象。 */
const KANJI = /[㐀-䶿一-鿿々]/;

export function parseReading(text: string): Segment[] {
  const segments: Segment[] = [];
  let buffer = '';
  let i = 0;

  const flush = () => {
    if (buffer) segments.push({ text: buffer });
    buffer = '';
  };

  while (i < text.length) {
    const char = text[i]!;
    if (char !== '[') {
      buffer += char;
      i += 1;
      continue;
    }

    const close = text.indexOf(']', i);
    if (close === -1) {
      // 未閉合的方括號，原樣保留
      buffer += text.slice(i);
      break;
    }

    // 往回吃掉緊鄰括號的漢字序列
    let start = buffer.length;
    while (start > 0 && KANJI.test(buffer[start - 1]!)) start -= 1;
    const base = buffer.slice(start);

    if (base) {
      buffer = buffer.slice(0, start);
      flush();
      segments.push({ text: base, reading: text.slice(i + 1, close) });
    } else {
      // 括號前沒有漢字，不成立為讀音標記，原樣保留
      buffer += text.slice(i, close + 1);
    }
    i = close + 1;
  }

  flush();
  return segments;
}

/** 去掉讀音標記後的詞條原文，用於卡片正面與搜尋。 */
export function toPlainText(text: string): string {
  return parseReading(text)
    .map((segment) => segment.text)
    .join('');
}

/** 把漢字換成標注的讀音，用於語音朗讀，確保聽到的與卡片教的讀法一致。 */
export function toReadingText(text: string): string {
  return parseReading(text)
    .map((segment) => segment.reading ?? segment.text)
    .join('');
}

// ── 讀音格：編輯畫面用的可切分結構，與標記字串雙向轉換 ──────────────

/** 一格：一段連續漢字與使用者填的讀音。reading 為空字串代表未填。 */
export interface ReadingCell {
  kanji: string;
  reading: string;
}

/** 詞條裡的一串連續漢字，切成一或多格。各格的 kanji 接起來即原文。 */
export interface KanjiRun {
  /** 這串漢字在詞條純文字中的起始索引，用來定位與重建。 */
  start: number;
  cells: ReadingCell[];
}

/** 編輯畫面的完整狀態。term 為不含任何標記的詞條原文。 */
export interface ReadingDraft {
  term: string;
  runs: KanjiRun[];
}

/** 讀音允許的字元：平假名、片假名、長音符 ー。 */
const KANA = /^[ぁ-ゖァ-ヺー]+$/;

/**
 * 標記字串 → ReadingDraft。舊卡與貼上都走這裡。
 * 已存的標記就是使用者選過的切法：`帰省[きせい]` 得一格，未標音的漢字串才逐字開格。
 */
export function toDraft(markup: string): ReadingDraft {
  const segments = parseReading(markup);
  const term = segments.map((segment) => segment.text).join('');

  // 先攤成帶位置的原子格：有讀音的整段一格，未標音的漢字逐字一格。
  const flat: Array<ReadingCell & { start: number }> = [];
  let pos = 0;
  for (const segment of segments) {
    if (segment.reading !== undefined) {
      flat.push({ kanji: segment.text, reading: segment.reading, start: pos });
      pos += segment.text.length;
    } else {
      for (const char of segment.text) {
        if (KANJI.test(char)) flat.push({ kanji: char, reading: '', start: pos });
        pos += char.length;
      }
    }
  }

  // 位置相鄰的格併成同一串漢字。
  const runs: KanjiRun[] = [];
  for (const cell of flat) {
    const last = runs[runs.length - 1];
    const cellStart = cell.start;
    const contiguous =
      last && last.start + runLength(last) === cellStart;
    const bare: ReadingCell = { kanji: cell.kanji, reading: cell.reading };
    if (contiguous) {
      last!.cells.push(bare);
    } else {
      runs.push({ start: cellStart, cells: [bare] });
    }
  }

  return { term, runs };
}

/** 一串漢字的總字數，用來算它在 term 裡佔到哪。 */
function runLength(run: KanjiRun): number {
  return run.cells.reduce((sum, cell) => sum + cell.kanji.length, 0);
}

/** 一格輸出成標記：有讀音是 `漢字[讀音]`，沒讀音原樣輸出漢字。 */
function cellToMarkup(cell: ReadingCell): string {
  return cell.reading ? `${cell.kanji}[${cell.reading}]` : cell.kanji;
}

/** ReadingDraft → 標記字串。儲存時走這裡；非漢字部分原樣保留。 */
export function toMarkup(draft: ReadingDraft): string {
  const runs = [...draft.runs].sort((a, b) => a.start - b.start);
  let result = '';
  let pos = 0;
  for (const run of runs) {
    result += draft.term.slice(pos, run.start);
    for (const cell of run.cells) result += cellToMarkup(cell);
    pos = run.start + runLength(run);
  }
  result += draft.term.slice(pos);
  return result;
}

/** 掃出 term 裡的每一串連續漢字，回傳 [start, kanji]。 */
function scanRuns(term: string): Array<{ start: number; kanji: string }> {
  const runs: Array<{ start: number; kanji: string }> = [];
  let current: { start: number; kanji: string } | null = null;
  for (let i = 0; i < term.length; i += 1) {
    const char = term[i]!;
    if (KANJI.test(char)) {
      if (current) current.kanji += char;
      else current = { start: i, kanji: char };
    } else if (current) {
      runs.push(current);
      current = null;
    }
  }
  if (current) runs.push(current);
  return runs;
}

/**
 * 詞條改動後重算各串，依漢字內容（不按位置）保留已填讀音與切法。
 * 逐格拿舊格對齊：往後找第一個 kanji 對得上的舊格就整格搬過來（含合併切法），
 * 對不上就是新漢字，逐字開空格。前面插入漢字不會讓已填讀音錯位。
 */
export function rebuildRuns(term: string, previous: KanjiRun[]): KanjiRun[] {
  const oldCells = previous.flatMap((run) => run.cells);
  let oi = 0; // 下一個尚未使用的舊格，保順序、可跳過（被刪的漢字）

  return scanRuns(term).map(({ start, kanji }) => {
    const cells: ReadingCell[] = [];
    let k = 0;
    while (k < kanji.length) {
      let matched = -1;
      for (let t = oi; t < oldCells.length; t += 1) {
        if (kanji.startsWith(oldCells[t]!.kanji, k)) {
          matched = t;
          break;
        }
      }
      if (matched !== -1) {
        const old = oldCells[matched]!;
        cells.push({ kanji: old.kanji, reading: old.reading });
        k += old.kanji.length;
        oi = matched + 1;
      } else {
        cells.push({ kanji: kanji[k]!, reading: '' });
        k += 1;
      }
    }
    return { start, cells };
  });
}

/** 把第 seam 道縫黏起來（seam 0 起算，0 ~ cells.length−2）。讀音接起來。 */
export function mergeSeam(run: KanjiRun, seam: number): KanjiRun {
  const cells = run.cells.map((cell) => ({ ...cell }));
  const left = cells[seam]!;
  const right = cells[seam + 1]!;
  const merged: ReadingCell = {
    kanji: left.kanji + right.kanji,
    reading: left.reading + right.reading,
  };
  cells.splice(seam, 2, merged);
  return { start: run.start, cells };
}

/**
 * 把第 index 格的 kanji 從第 at 字切成左右兩格（at 為 1 ~ kanji.length−1）。
 * 每道縫獨立，只切這一個邊界，其餘格不動。兩格讀音皆清空
 * （無法把合併讀音分配回各段，同 mergeSeam 的反向限制）。
 */
export function splitCellAt(run: KanjiRun, index: number, at: number): KanjiRun {
  const cells = run.cells.map((cell) => ({ ...cell }));
  const target = cells[index]!;
  const left: ReadingCell = { kanji: target.kanji.slice(0, at), reading: '' };
  const right: ReadingCell = { kanji: target.kanji.slice(at), reading: '' };
  cells.splice(index, 1, left, right);
  return { start: run.start, cells };
}

/**
 * 採用 AI（Artificial Intelligence，人工智慧）預填的讀音：
 * 驗證回覆確實是「這個詞條的漢字」再轉成讀音格。
 *
 * `reply` 是外面世界丟進來的東西（結構化輸出保證的是形狀，不是內容），
 * 因此漢字必須逐串比對到完全相同，位置一律用 `scanRuns` 自己算，不採信回覆。
 * 任一條不過就整批回 `null`：部分採用會產生半填的串，反而卡住 `validateDraft`。
 *
 * 每一串另外帶一個 `splittable`，是 AI 對「這串假名拆不拆得開」的自述。
 * 它說拆不開卻還是拆了，就在這裡合併回去——合併是無損的（讀音接起來即原讀音），
 * 使用者要再拆卻得重打，所以由程式往便宜的方向修。
 *
 * **回覆最外層還有一格 `termKana`，這裡讀都不讀。** 它是寫給模型自己看的思考鷹架：
 * 逼它在填任何一格之前先寫下整個詞條唸起來的音，`吹雪` 才不會被拼成 `吹`＝ふく 接
 * `雪`＝ふき（票 08）。鷹架的效果發生在生成的當下——那一串音一旦寫在上文裡，後面
 * 每一格都看得到它——收回來之後就沒有用途了。所以它是空字串、缺漏、或跟各格假名接
 * 不起來，一律不影響結果。要不要拿它對帳是另一個決定，等這一輪的數字出來再談。
 */
export function acceptPrefill(term: string, reply: unknown): KanjiRun[] | null {
  if (typeof reply !== 'object' || reply === null) return null;
  const { runs: replyRuns } = reply as { runs?: unknown };
  if (!Array.isArray(replyRuns)) return null;
  const scanned = scanRuns(term);
  if (replyRuns.length !== scanned.length) return null;

  const runs: KanjiRun[] = [];
  for (let i = 0; i < scanned.length; i += 1) {
    const replyRun: unknown = replyRuns[i];
    if (typeof replyRun !== 'object' || replyRun === null) return null;
    const { splittable, cells: replyCells } = replyRun as { splittable?: unknown; cells?: unknown };
    if (typeof splittable !== 'boolean') return null;
    if (!Array.isArray(replyCells) || replyCells.length === 0) return null;

    const cells: ReadingCell[] = [];
    for (const raw of replyCells as unknown[]) {
      if (typeof raw !== 'object' || raw === null) return null;
      const { kanji, reading } = raw as Partial<ReadingCell>;
      if (typeof kanji !== 'string' || kanji === '') return null;
      if (typeof reading !== 'string' || !KANA.test(reading)) return null;
      cells.push({ kanji, reading });
    }

    // AI 不得增刪或改寫任何一個漢字：接起來要跟原本那串一字不差。
    if (cells.map((cell) => cell.kanji).join('') !== scanned[i]!.kanji) return null;
    runs.push({ start: scanned[i]!.start, cells: splittable ? cells : [joinCells(cells)] });
  }
  return runs;
}

/** 把一串的所有格併成一格。漢字與讀音各自接起來，與 `mergeSeam` 同一套規則。 */
function joinCells(cells: ReadingCell[]): ReadingCell {
  return {
    kanji: cells.map((cell) => cell.kanji).join(''),
    reading: cells.map((cell) => cell.reading).join(''),
  };
}

/**
 * 儲存時檢查：每一格都要填、讀音只能是假名。回傳錯誤訊息，全過為空。
 *
 * 「沒填」那段是道守門，不是給人看的：畫面按下儲存時 `required-fields.ts` 已經先擋過空格
 * （單一句紅字加游標，見 ADR-0009），走到這裡還有空格代表輸入框與讀音格的內容漂移了。
 * 少了這段，一張沒讀音的卡會靜默存進去，正是 ADR-0009 要擋的東西。
 * 一串只報一次：反正不該發生，逐格報只是把同一件事講三遍。
 */
export function validateDraft(draft: ReadingDraft): string[] {
  const errors: string[] = [];
  for (const run of draft.runs) {
    if (run.cells.some((cell) => cell.reading === '')) {
      const label = run.cells.map((cell) => cell.kanji).join('');
      errors.push(t('reading.cellsRequired', { kanji: label }));
    }
    for (const cell of run.cells) {
      if (cell.reading !== '' && !KANA.test(cell.reading)) {
        errors.push(t('reading.kanaRequired', { kanji: cell.kanji }));
      }
    }
  }
  return errors;
}
