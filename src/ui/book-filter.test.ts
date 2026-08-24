// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest';
import { bookFilter, scopeLabel } from './book-filter';
import type { Book } from '@core/lib/types';
import zhHant from '@core/i18n/zh-Hant';

const BOOKS: Book[] = [
  { id: 'a', name: 'JLPT N2' },
  { id: 'b', name: '工作用日文' },
  { id: 'c', name: '文法句型' },
];

/** 收合後那顆鈕上只有一行字，三種情況要說得清楚：全選、單選、其餘。 */
describe('scopeLabel', () => {
  it('全部勾滿時顯示「全部」', () => {
    expect(scopeLabel(BOOKS, ['a', 'b', 'c'])).toBe(zhHant['filter.all']);
  });

  it('只勾一本時顯示那本的名字', () => {
    expect(scopeLabel(BOOKS, ['b'])).toBe('工作用日文');
  });

  it('勾了兩本以上但沒勾滿時報本數', () => {
    expect(scopeLabel(BOOKS, ['a', 'c'])).toBe('2 本');
  });

  it('勾的那本已經不在時退回報本數，不顯示空字串', () => {
    expect(scopeLabel(BOOKS, ['gone'])).toBe('1 本');
  });
});

/**
 * 開合行為要碰真的鍵盤事件與焦點，因此這個檔案掛 jsdom（見檔頂那行）。
 * 只測「選單開了沒、有沒有回報、焦點停在哪」——拿節點免不了借 class 當把手，
 * 但斷言只看 `hidden`、`aria-expanded` 與 `activeElement`，不比對文字與版面。
 */
describe('bookFilter 的開合', () => {
  const escape = (from: HTMLElement) =>
    from.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

  /** 回傳事件本身，好斷言那一下有沒有被 preventDefault() 吃掉。 */
  function pointerDown(on: HTMLElement): PointerEvent {
    const event = new PointerEvent('pointerdown', { bubbles: true, cancelable: true });
    on.dispatchEvent(event);
    return event;
  }

  function mount(selected: string[] = ['b']) {
    const onChange = vi.fn();
    const onOpenChange = vi.fn();
    const node = bookFilter({
      books: BOOKS,
      selected,
      variant: 'pill',
      onChange,
      onOpenChange,
    });
    document.body.replaceChildren(node);

    const toggle = node.querySelector('button') as HTMLButtonElement;
    const menu = node.querySelector('.book-filter-menu') as HTMLElement;
    /** 第 0 顆是「全部」，單字本從第 1 顆起，順序照 BOOKS。 */
    const checks = () =>
      [...node.querySelectorAll('.book-filter-check')] as HTMLInputElement[];

    return { node, toggle, menu, checks, onChange, onOpenChange };
  }

  it('點 toggle 展開時回報一次 true', () => {
    const { toggle, menu, onOpenChange } = mount();
    toggle.click();
    expect(menu.hidden).toBe(false);
    expect(onOpenChange.mock.calls).toEqual([[true]]);
  });

  it('再點一次收起時回報一次 false', () => {
    const { toggle, menu, onOpenChange } = mount();
    toggle.click();
    onOpenChange.mockClear();
    toggle.click();
    expect(menu.hidden).toBe(true);
    expect(onOpenChange.mock.calls).toEqual([[false]]);
  });

  it('展開時按 Esc 收起來並回報', () => {
    const { toggle, menu, onOpenChange } = mount();
    toggle.click();
    onOpenChange.mockClear();
    escape(toggle);
    expect(menu.hidden).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(onOpenChange.mock.calls).toEqual([[false]]);
  });

  it('收起狀態下按 Esc 什麼都不回報', () => {
    const { toggle, onOpenChange } = mount();
    escape(toggle);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('勾某一本只回報 onChange，開合不動', () => {
    const { toggle, checks, menu, onChange, onOpenChange } = mount();
    toggle.click();
    onOpenChange.mockClear();
    const first = checks()[1];
    first.checked = true;
    first.dispatchEvent(new Event('change'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(menu.hidden).toBe(false);
  });

  it('焦點在勾選框上按 Esc 時，焦點回到 toggle', () => {
    const { toggle, checks, menu } = mount();
    toggle.click();
    // 挑真的單字本那顆，不挑「全部」：預設換成全勾時「全部」會被鎖起來，focus 不上去。
    const check = checks()[1];
    check.focus();
    escape(check);
    expect(menu.hidden).toBe(true);
    expect(document.activeElement).toBe(toggle);
  });

  it('沒傳 onOpenChange 時展開、收起、按 Esc 都不丟例外', () => {
    const node = bookFilter({
      books: BOOKS,
      selected: ['b'],
      variant: 'pill',
      onChange: () => {},
    });
    document.body.replaceChildren(node);
    const toggle = node.querySelector('button') as HTMLButtonElement;

    expect(() => {
      toggle.click();
      escape(toggle);
      toggle.click();
      toggle.click();
    }).not.toThrow();
  });

  it('沒傳 onOpenChange 時點外面不丟例外', () => {
    const node = bookFilter({
      books: BOOKS,
      selected: ['b'],
      variant: 'pill',
      onChange: () => {},
    });
    document.body.replaceChildren(node);
    const toggle = node.querySelector('button') as HTMLButtonElement;

    expect(() => {
      toggle.click();
      pointerDown(document.body);
    }).not.toThrow();
  });

  it('展開時點外面收起來並回報', () => {
    const { toggle, menu, onOpenChange } = mount();
    toggle.click();
    onOpenChange.mockClear();
    pointerDown(document.body);
    expect(menu.hidden).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(onOpenChange.mock.calls).toEqual([[false]]);
  });

  it('點外面那一下被吃掉，不會變成後續的 click', () => {
    const { toggle } = mount();
    toggle.click();
    expect(pointerDown(document.body).defaultPrevented).toBe(true);
  });

  it('點 toggle 自己或選單裡的勾選框都不算點外面', () => {
    const { toggle, checks, menu, onOpenChange } = mount();
    toggle.click();
    onOpenChange.mockClear();
    pointerDown(toggle);
    pointerDown(checks()[1]);
    expect(menu.hidden).toBe(false);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('收起狀態下點外面什麼都不回報', () => {
    const { onOpenChange } = mount();
    pointerDown(document.body);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('收起之後再點外面沒有任何反應，監聽器已經解除', () => {
    const { toggle, onOpenChange } = mount();
    toggle.click();
    pointerDown(document.body);
    onOpenChange.mockClear();
    pointerDown(document.body);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('選單開著時畫面被換掉，之後點外面不丟例外且監聽器自我拆除', () => {
    const { node, toggle, menu, onOpenChange } = mount();
    toggle.click();
    onOpenChange.mockClear();
    // 模擬 mount() 的 replaceChildren()：舊節點整棵被丟掉，沒有人叫監聽器下班。
    node.remove();
    expect(() => pointerDown(document.body)).not.toThrow();

    // 拆掉了才對：把節點放回文件再點一次，已經沒有人理會這一下。
    document.body.append(node);
    pointerDown(document.body);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(menu.hidden).toBe(false);
  });
});
