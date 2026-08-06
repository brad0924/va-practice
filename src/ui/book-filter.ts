import type { Book } from '../lib/types';
import { el, button } from './dom';

/**
 * 單字本範圍的開關，三組範圍都用這顆。每處長得一樣，只差外觀：
 * 擠在工具列裡的是小膠囊，自成一列的那顆撐滿一行。
 *
 * 複習範圍另有一個入口，是資料頁單字本區每一列的勾選框。
 *
 * 選了什麼由呼叫端存回 AppData；這裡另留一份副本用來重畫勾選狀態。
 * 這顆在場的時候沒有別人會改這一組，離開畫面再回來時整個元件會重建，
 * 因此副本不會與 AppData 那份走散。
 */
export interface BookFilterOptions {
  books: readonly Book[];
  selected: readonly string[];
  /**
   * `pill` 是工具列裡的小膠囊，`block` 撐滿一列並在鈕上多一個「單字本：」前綴。
   * 刻意不叫 `row`：那個 class 名被卡片列佔走了，掛上去會連帶吃到它的格線版面。
   */
  variant: 'pill' | 'block';
  /** 勾選變了。呼叫端負責存檔與重畫自己那份清單。 */
  onChange(bookIds: string[]): void;
  /** 選單開了或關了。給需要在展開期間讓路的呼叫端用（複習畫面的快捷鍵）。 */
  onOpenChange?(open: boolean): void;
}

/** 收合後鈕上的那行字：全勾是「全部」，只勾一本是那本的名字，其餘報本數。 */
export function scopeLabel(books: readonly Book[], selected: readonly string[]): string {
  if (selected.length === books.length) return '全部';
  if (selected.length === 1) {
    return books.find((book) => book.id === selected[0])?.name ?? '1 本';
  }
  return `${selected.length} 本`;
}

export function bookFilter({
  books,
  selected,
  variant,
  onChange,
  onOpenChange,
}: BookFilterOptions): HTMLElement {
  let chosen = [...selected];
  let open = false;

  // 標籤與箭頭分開兩個元素：本名可以很長，只有它自己是一個元素時才截得斷。
  const label = el('span', 'book-filter-label');
  const mark = el('span', 'book-filter-mark');
  // 開合有這裡、底下的 Esc 與點外面三個觸發點，都是真的翻面才報；refresh() 的重畫不算。
  const toggle = button(`book-filter-toggle ${variant}`, '', () => {
    open = !open;
    refresh();
    onOpenChange?.(open);
  });
  toggle.append(label, mark);
  const menu = el('div', 'book-filter-menu');
  const node = el('div', `book-filter ${variant}`, toggle, menu);

  /**
   * Esc 掛在自己節點上而不是 document：mount() 用 replaceChildren() 換畫面，
   * 元件沒有拆卸的時機可以解除監聽器，掛 document 會每重畫一次就多留一個。
   * （底下的點外面躲不掉 document，那條改用「開才掛、關就解除」，見 onOutside。）
   * 代價是焦點跑到元件外面就收不起來——點開 toggle 之後焦點就在 toggle 上，
   * 勾選框也在節點內，正常操作全程都在範圍裡。
   */
  node.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !open) return;
    event.preventDefault();
    open = false;
    refresh();
    // 為「焦點在某個勾選框上按 Esc」那條路：不然焦點會落在剛被藏起來的元素上。
    // 排在通知之前：呼叫端收到通知後可能整頁重畫，那時 toggle 已經不在文件上了。
    toggle.focus();
    onOpenChange?.(false);
  });

  /**
   * 點外面收起來。看的是指標按在哪裡，不看焦點在誰手上：iOS Safari 點到不可聚焦的
   * 空白處時按鈕不一定失焦，靠 focusout 判會收不起來。用 pointerdown 而不是 click，
   * 順便避開 iOS Safari「點非互動元素時 click 不冒泡到 document」那個老問題。
   *
   * 這條掛在 document 上，與上面的 Esc 不同，靠的是 refresh() 開才掛、關就解除，
   * 數量最多一個。
   */
  function onOutside(event: PointerEvent): void {
    // 節點已經脫離文件：選單開著時畫面被 mount() 換掉了，沒有人叫這個監聽器下班
    // （initSpeech 載完語音清單、雲端拉到新資料都會重畫）。少了這三行，使用者在新
    // 畫面上的第一下會被一顆看不見的選單吃掉，還會對死掉的元件回報一次關閉。
    if (!node.isConnected) {
      document.removeEventListener('pointerdown', onOutside);
      return;
    }
    if (node.contains(event.target as Node)) return;
    // 這一下只用來收選單，不讓它變成後續的 mousedown／click——複習畫面上隨手一點
    // 可能掀開答案，而那收不回去。監聽器由這裡的 refresh() 順手解除。
    event.preventDefault();
    open = false;
    refresh();
    onOpenChange?.(false);
  }

  /** 一律照 books 的順序存回去，勾選的先後不影響存下來的樣子。 */
  function choose(wanted: Set<string>): void {
    chosen = books.filter((book) => wanted.has(book.id)).map((book) => book.id);
    onChange(chosen);
    refresh();
  }

  function item(name: string, checked: boolean, locked: boolean, onToggle: () => void): HTMLElement {
    const check = el('input', 'book-filter-check');
    check.type = 'checkbox';
    check.checked = checked;
    check.disabled = locked;
    check.addEventListener('change', onToggle);
    return el('label', 'book-filter-item', check, el('span', 'book-filter-name', name));
  }

  function refresh(): void {
    const prefix = variant === 'block' ? '單字本：' : '';
    label.textContent = `${prefix}${scopeLabel(books, chosen)}`;
    mark.textContent = open ? '▴' : '▾';
    toggle.setAttribute('aria-expanded', String(open));
    menu.hidden = !open;
    // 三個觸發點都會走到這裡，開合狀態與監聽器就不會走散。重複掛同一個函式沒有作用，
    // 解除沒掛上的也沒有作用，所以 refresh() 被勾選連續叫好幾次也不會出事。
    if (open) document.addEventListener('pointerdown', onOutside);
    else document.removeEventListener('pointerdown', onOutside);

    const all = chosen.length === books.length;
    menu.replaceChildren(
      // 已經全勾時它沒有事情可做，鎖起來——與底下「取消它就空了」同一種處理。
      item('全部', all, all, () => choose(new Set(books.map((book) => book.id)))),
      ...books.map((book) => {
        const checked = chosen.includes(book.id);
        const wanted = new Set(chosen);
        if (checked) wanted.delete(book.id);
        else wanted.add(book.id);
        // 取消它會讓範圍空掉時就點不動，含「只剩一本單字本」那個情況。
        return item(book.name, checked, checked && chosen.length === 1, () => choose(wanted));
      }),
    );
  }

  refresh();
  return node;
}
