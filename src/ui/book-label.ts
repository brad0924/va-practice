import { t } from '@core/i18n';
import { el } from './dom';

/**
 * 卡片左上角那一行**所屬單字本**——「這張卡住在哪一本」。與複習畫面標題列那顆膠囊的
 * **複習範圍**（「我今天要複習哪幾本」）是兩件事，同一個畫面上都在，別混（`CONTEXT.md`）。
 *
 * **只顯示，不可點**——搬家在編輯畫面裡做，與 `list-view.ts` 的 `.row-book` 同一個立場，
 * 因此這裡不接任何事件。
 *
 * 看得到的是本名，唸出來的是整句「單字本：XXX」——光唸本名講不出它是什麼。作法是把
 * 整句話放進一段只給螢幕閱讀器的文字，看得到的那一段則對輔助使用隱形。**不在 span 上
 * 掛 aria-label**：那條屬性在沒有 role 的元素上不保證被唸出來，各家瀏覽器做法不一。
 * 借的是標題列那顆膠囊在用的同一條翻譯，不新增 key。
 *
 * **自己一支檔案，不掛在 `review-view.ts` 上。** 複習與拼字兩個畫面都印這一枚標籤；
 * 讓拼字去 import 複習的話會拖進 `storage.ts`（複習畫面自己要改複習範圍），
 * 而拼字明文一行都不准碰它（`ADR-0021`），還會在票 06 接上導覽時變成兩支互相 import。
 */
export function bookLabel(name: string): HTMLElement {
  const shown = el('span', undefined, name);
  shown.setAttribute('aria-hidden', 'true');
  return el(
    'span',
    'card-book',
    el('span', 'sr-only', t('filter.blockLabel', { scope: name })),
    shown,
  );
}
