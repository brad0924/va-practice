// @vitest-environment jsdom

/**
 * 失焦換欄的落點分類：`jumpToEmpty` 在「搶不搶焦點」這件事上的兩種答案。
 *
 * 該往哪跳（避讓、退讓、繞回頭）全在 `required-fields.test.ts`，那些不必碰 DOM。
 * 留在這裡的只有「焦點自己落到誰身上」——`relatedTarget` 是純 DOM 事件，翻不成序號，
 * 因此這個檔案要 jsdom（`book-filter.test.ts` 為了鍵盤與焦點也開了）。專案預設環境仍是
 * `node`，模組一旦 import DOM 測試照樣爆，`docs/spec.md` 那條紀律的牙齒沒掉。
 *
 * 刻意不測的：
 * - `cancelling` 旗子與 `isComposing`：jsdom 不模擬手指按下去、也不模擬輸入法，
 *   pointerdown 與 blur 的先後、組字中與否都是測試自己排的，寫出來等於把那行 if 再抄一遍。
 * - Tab 順序：jsdom 不實作 Tab 鍵移動焦點。
 * - DOM 結構：不斷言 class 名、不斷言文字、不做快照。
 */

import { describe, it, expect } from 'vitest';
import type { App } from '../app';
import { editorView } from './editor-view';

/**
 * 掛一張「新增卡片」的編輯畫面到 document.body，回傳等一下要動的那幾個節點。
 * 非掛不可：`focus()` 對不在文件裡的元素不生效，整組測試就無從演起。
 */
function mountEditor() {
  // editorView 全檔只碰這四支。金鑰回 null 是必要的而不是圖方便：
  // 沒有金鑰時那支帶 fetch 的 ask 根本不會被建出來，測試不可能外送任何請求。
  const app = {
    gemini: { read: () => null },
    data: { books: [{ id: 'b1', name: '預設' }] },
    upsert: () => {},
    remove: () => {},
  } as unknown as App;

  const screen = editorView(app, null, () => {});
  document.body.replaceChildren(screen);

  // 詞條與釋義是畫面上僅有的兩個 .field 輸入框（單字本那格是 select，不會被選中）。
  // 這句擋的是日後在中間多插一個：與其靜靜認錯節點、七條測試全綠地測錯東西，不如當場爆掉。
  const fields = screen.querySelectorAll<HTMLInputElement>('input.field');
  if (fields.length !== 2) throw new Error(`預期兩個必填輸入框，實際 ${fields.length} 個`);

  return {
    term: fields[0]!,
    meaning: fields[1]!,
    // 讀音區會整批重畫，因此現查而不是先存起來——與畫面自己的 readingInputs() 同一個理由。
    readings: () => [...screen.querySelectorAll<HTMLInputElement>('.reading-input')],
    /** 拆／合的縫。它是按鈕不是輸入框，落點分類的第二條專門管它。 */
    seam: () => screen.querySelector<HTMLButtonElement>('.reading-seam')!,
  };
}

/** 照使用者打字的樣子填一格：值進去、發一次 input，讀音格才會跟著重畫。 */
function type(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

/**
 * 跑一趟焦點移動，回傳這一趟裡「拿到焦點」的元素依序有誰。
 *
 * 為什麼不看 `document.activeElement`：`focus()` 是先發 blur、等處理器跑完才把新目標設成
 * activeElement，失焦處理器中途搶走的那一下會被後面這步蓋掉——只看終點的話，搶與不搶
 * 得到的都是使用者點的那一個，兩個 if 拔掉測試照樣全綠（試過了）。被搶的痕跡留在事件上：
 * 多出一次落在別人身上的 focus。
 */
function focusTrail(move: () => void): Element[] {
  const trail: Element[] = [];
  const record = (event: Event) => trail.push(event.target as Element);
  // focus 不冒泡，只能在捕獲階段接。
  document.addEventListener('focus', record, true);
  try {
    move();
  } finally {
    document.removeEventListener('focus', record, true);
  }
  return trail;
}

describe('焦點自己有落點就不搶', () => {
  it('釋義還空著，從詞條移到第一個讀音格：只有讀音格拿到焦點', () => {
    // 少了這條功能會壞掉：新增卡片時釋義必定是空的，一碰讀音區就會被彈走。
    const ui = mountEditor();
    type(ui.term, '大丈夫');
    ui.term.focus();

    const trail = focusTrail(() => ui.readings()[0]!.focus());

    expect(trail).toEqual([ui.readings()[0]]);
  });

  it('釋義還空著，從詞條移到讀音區裡的縫：只有那顆按鈕拿到焦點', () => {
    const ui = mountEditor();
    type(ui.term, '大丈夫');
    ui.term.focus();
    const seam = ui.seam();

    const trail = focusTrail(() => seam.focus());

    expect(trail).toEqual([seam]);
  });

  it('釋義還空著，從詞條直接移到釋義：只有釋義拿到焦點，讀音格不插隊', () => {
    const ui = mountEditor();
    type(ui.term, '大丈夫');
    ui.term.focus();

    const trail = focusTrail(() => ui.meaning.focus());

    expect(trail).toEqual([ui.meaning]);
  });
});

describe('焦點沒有落點才接手', () => {
  it('詞條有值、讀音格空著：送進第一個空的讀音格', () => {
    const ui = mountEditor();
    type(ui.term, '大丈夫');
    ui.term.focus();

    const trail = focusTrail(() => ui.term.blur());

    expect(trail).toEqual([ui.readings()[0]]);
  });

  it('詞條還空著：不跳（前提一）', () => {
    const ui = mountEditor();
    ui.term.focus();

    const trail = focusTrail(() => ui.term.blur());

    expect(trail).toEqual([]);
  });

  it('三種格全部有值：不跳', () => {
    const ui = mountEditor();
    type(ui.term, '大丈夫');
    for (const reading of ui.readings()) type(reading, 'か');
    type(ui.meaning, '沒問題');
    ui.meaning.focus();

    const trail = focusTrail(() => ui.meaning.blur());

    expect(trail).toEqual([]);
  });

  it('純假名詞條一個讀音格都沒有：從詞條落到釋義', () => {
    const ui = mountEditor();
    type(ui.term, 'ひらがな');
    ui.term.focus();

    const trail = focusTrail(() => ui.term.blur());

    expect(trail).toEqual([ui.meaning]);
  });
});
