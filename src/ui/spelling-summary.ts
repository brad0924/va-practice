import type { App } from '../app';
import { t } from '@core/i18n';
import { summary, type Result, type Round } from '@core/lib/spelling';
import { el, button } from './dom';
import { spellingBar } from './spelling-bar';

/**
 * 一格格子在成績頁上的三種樣子。**不是顏色，是那一格的狀況**——顏色由 `styles.css` 決定，
 * 這裡只回答「這一格怎麼了」。
 *
 * - `wrong`：「你拼的」那一排裡填錯的那一格。
 * - `right`：「正解」那一排裡，對應到上面某一格錯誤的那一格。
 * - `plain`：其餘。兩排都拼對的那幾格是中性的，不搶注意。
 *
 * 逾時沒填到的格子在「你拼的」那一排根本不畫內容（見 `slotCell()`），因此不在這三種裡。
 */
export type Tone = 'wrong' | 'right' | 'plain';

/**
 * 那一格算哪一種。**兩排的判準是同一條**：只看「這一格填的跟正解一不一樣」，
 * 上面錯了下面就標，因此兩排的標記必定成對出現，不可能一邊紅一邊沒有對到綠。
 *
 * 開成 export 的純函式是為了測得動：`ADR-0014` 不准斷言 class 名，而「拼錯的那一格是紅的」
 * 又是要有驗收的一條。把規則拉出 DOM 之後斷言得下去，剩下的顏色本身交給眼睛。
 */
export function toneOf(result: Result, index: number, row: 'filled' | 'answer'): Tone {
  const typed = result.filled[index] ?? '';
  // 逾時根本沒填到的位置**兩排都中性**。它不是「錯的那一格」，是「還沒填到的那一格」，
  // 而決定 4 只點名了錯的那一格與它對應的正解，其餘一律中性。答題畫面收尾時的
  // `.slot.done.missed` 對同一種情況也是中性（票 03），兩個畫面因此講同一句話。
  if (typed === '') return 'plain';
  if (typed === result.answer[index]) return 'plain';
  return row === 'filled' ? 'wrong' : 'right';
}

/** 逐格對照裡的一格。 */
function slotCell(result: Result, index: number, row: 'filled' | 'answer'): HTMLElement {
  const kana = row === 'filled' ? (result.filled[index] ?? '') : (result.answer[index] ?? '');
  // 逾時沒填到的位置留成空的虛線格（票 05 決定 5）。不補問號，也不留一整片空白——
  // 使用者要看得出自己拼到哪裡就停了。空的 `.slot` 本來就是虛線，不必另一種樣式。
  if (kana === '') return el('div', 'slot');
  return el('div', `slot done ${toneOf(result, index, row)}`, kana);
}

/** 「你拼的」或「正解」一整排。兩排各自畫，但格數一律照正解，上下才對得齊。 */
function slotRow(result: Result, row: 'filled' | 'answer'): HTMLElement {
  return el(
    'div',
    'slots compact',
    ...result.answer.map((_, index) => slotCell(result, index, row)),
  );
}

/**
 * 一張沒拼對的卡：釋義、「你拼的」、「正解」。
 *
 * 三行擺成兩欄的格線（標籤一欄、格子一欄），兩排的格子因此吃同一條欄線，
 * 「你拼的」與「正解」必定上下對齊——標籤在兩種語言下不一樣長也不影響。
 */
function missedBlock(result: Result): HTMLElement {
  return el(
    'div',
    'missed-card',
    el('div', 'missed-meaning', result.card.meaning),
    el('span', 'missed-label', t('spelling.yourTry')),
    slotRow(result, 'filled'),
    el('span', 'missed-label', t('spelling.answer')),
    slotRow(result, 'answer'),
  );
}

/**
 * 頂上那三格的其中一格：一個數字加一個標籤。
 *
 * **借的是統計畫面「現況」那三格的樣式**（`.tiles` / `.tile`，`styles.css` 的統計那一區），
 * 因為要的就是同一個東西：三個數字並排、每個底下一句話。已知代價是日後有人調統計那三格
 * 會遠端動到這一頁——`.prompt-meaning` 當初就是為了躲這個而自己另立一條規則。
 * 這裡選擇借，是因為那三格的長相本來就該一致：同一個 app 裡「一排數字」只該有一種樣子。
 *
 * **這幾行與 `stats-view.ts` 的 `tile()` 一模一樣，刻意不共用。** 那支為了改統計範圍
 * import 了 `storage.ts`，而拼字整條線一行都不碰它（`ADR-0021`，三支測試都有守門）。
 * 三行 DOM 抄一份比破例划算，與票 `04` 不借 `cardsInBooks()` 是同一個判斷。
 */
function tile(num: string, label: string): HTMLElement {
  return el('div', 'tile', el('div', 'tile-num', num), el('div', 'tile-label', label));
}

/**
 * 一輪的成績。拼字不動排程（`ADR-0021`），因此**這一頁是這個玩法唯一留下來的東西**：
 * 它要回答「我哪幾個字沒記熟，錯在哪一格」。
 *
 * 數字一律問 `summary()`，這一頁自己不算——平均除的是全部題數而不是拼對的題數
 * （spec 決定 23），那條規則住在 `spelling.ts`，抄過來就會有兩份。
 *
 * 這一頁不落地（spec 決定 26）：不寫 `AppData`、不進備份，重整頁面就沒了。整輪的內容
 * 由呼叫端遞進來，因此它連 `app.data` 都不必讀——`app` 只被拿來解除上一個畫面的鍵盤處理器，
 * 以及交給標題列上那兩顆導覽鈕（票 06）。
 * 與拼字另外兩頁同一個立場（`ADR-0021`）。
 */
export function spellingSummaryView(
  app: App,
  round: Round,
  onAgain: () => void,
  onPickBooks: () => void,
): HTMLElement {
  const screen = el('div', 'screen');

  const header = spellingBar(app);

  const scored = summary(round);

  const main = el('main', 'panel');
  main.append(
    el(
      'div',
      'tiles',
      tile(
        t('spelling.correctRatio', { correct: scored.correct, total: scored.total }),
        t('spelling.correctLabel'),
      ),
      tile(String(scored.points), t('spelling.pointsLabel')),
      // 小數一位。`toFixed()` 而不是四捨五入到整數：76 ÷ 12 要顯示 6.3，
      // 一位小數才看得出「離滿分 10 分還有多遠」。
      tile(scored.average.toFixed(1), t('spelling.averageLabel')),
    ),
  );

  // 拼對的卡不列出來（票 05 決定 6）——這一頁只講沒拼對的。全對時主體換成一句話，
  // 不留一塊空白（決定 7）。
  main.append(
    scored.missed.length === 0
      ? el('p', 'missed-none', t('spelling.noMistakes'))
      : el('div', 'missed-list', ...scored.missed.map(missedBlock)),
  );

  const footer = el(
    'footer',
    'actions',
    button('primary', t('spelling.again'), onAgain),
    // 左上角的返回鍵本來就回得去，這一顆因此是可以拿掉的；維護者未表示要拿掉，先留著
    // （票 05 決定 8）。
    button('secondary', t('spelling.otherBooks'), onPickBooks),
  );

  // 拼字整條線都不做鍵盤操作（spec 決定 25）。明寫成 null 而不是留白：
  // 留白會讓上一個畫面的處理器活到這一頁來。
  app.keyHandler = null;

  screen.append(header, main, footer);
  return screen;
}
