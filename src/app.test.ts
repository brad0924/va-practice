// @vitest-environment jsdom

/**
 * 換語言之後畫面立刻變（票 04 驗收），也是 `app.setLang()` 唯一的覆蓋——
 * 那條接線是票 02 拉的，當時還沒有呼叫者（見票 02 的 Comments）。
 *
 * **只有這一件事從 `start()` 演起。** 各畫面自己的行為都有各自的測試，不必從開機演；
 * 但「選完就變」跨了三段（選單 → `app.setLang()` → 重畫），中間任何一段斷掉都
 * 只有真的走一遍才看得出來。
 *
 * 這裡不碰網路：沒登入的雲端備份一個請求都不發（`cloud.begin()` 在未登入時什麼都不做）。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { start } from './app';
import type { StorageLike } from './lib/storage';
import zhHant from './i18n/zh-Hant';
import en from './i18n/en';
import ja from './i18n/ja';

/**
 * 這台「裝置」的本機儲存。`start()` 直接碰全域的 `localStorage`，而這個環境裡沒有
 * 真的那一個（Node 的實驗性 `localStorage` 蓋掉了 jsdom 的，兩邊都是 undefined），
 * 因此換一份記在 Map 裡的假貨進去。每支測試一份新的，等同一台剛拿到手的裝置。
 */
let cells = new Map<string, string>();

beforeEach(() => {
  cells = new Map();
  const fake: StorageLike = {
    getItem: (key) => cells.get(key) ?? null,
    setItem: (key, value) => {
      cells.set(key, value);
    },
    removeItem: (key) => {
      cells.delete(key);
    },
  };
  vi.stubGlobal('localStorage', fake);
  document.body.replaceChildren();
});

/** 開一次 app，回傳它畫進去的那一格。 */
function boot(): HTMLElement {
  const root = document.createElement('div');
  document.body.append(root);
  // 雲端備份記暱稱密碼的地方。網頁版遞的就是 localStorage（見 main.ts）。
  start(root, localStorage);
  return root;
}

/** 照使用者的走法按過去：畫面上找得到那顆鈕才按得下去。 */
function click(root: HTMLElement, label: string): void {
  const found = [...root.querySelectorAll('button')].find((button) => button.textContent === label);
  if (found === undefined) throw new Error(`畫面上找不到「${label}」`);
  found.click();
}

function langSelect(root: HTMLElement): HTMLSelectElement {
  const select = root.querySelector('select');
  if (select === null) throw new Error('資料畫面上找不到語言選單');
  return select;
}

/** 單字本那一區的新增鈕。三種語言各自不同，是這輪唯一分辨得出語言的字（票 03）。 */
function addBookLabel(root: HTMLElement): string | null {
  return root.querySelector('.book-add')?.textContent ?? null;
}

describe('換介面語言', () => {
  it('選了日文之後當前畫面立刻變，不用重開', () => {
    localStorage.setItem('va-practice:lang', 'zh-Hant');
    const root = boot();
    click(root, zhHant['nav.cards']);
    click(root, zhHant['nav.data']);
    expect(addBookLabel(root)).toBe(zhHant['books.addButton']);

    const select = langSelect(root);
    select.value = 'ja';
    select.dispatchEvent(new Event('change'));

    expect(addBookLabel(root)).toBe(ja['books.addButton']);
    // 還停在資料畫面上，選單也記得剛選的那一個——重畫不是跳回開頭。
    expect(langSelect(root).value).toBe('ja');
  });

  it('選擇記在這台裝置上，重開之後還在', () => {
    localStorage.setItem('va-practice:lang', 'zh-Hant');
    const first = boot();
    click(first, zhHant['nav.cards']);
    click(first, zhHant['nav.data']);
    const select = langSelect(first);
    select.value = 'ja';
    select.dispatchEvent(new Event('change'));
    expect(localStorage.getItem('va-practice:lang')).toBe('ja');

    // 重開一次：同一份 localStorage，全新的畫面。
    document.body.replaceChildren();
    const second = boot();
    click(second, ja['nav.cards']);
    click(second, ja['nav.data']);

    expect(addBookLabel(second)).toBe(ja['books.addButton']);
    expect(langSelect(second).value).toBe('ja');
  });

  it('選「系統預設」時那一格存的是 system，介面跟著裝置語言走', () => {
    localStorage.setItem('va-practice:lang', 'ja');
    const root = boot();
    click(root, ja['nav.cards']);
    click(root, ja['nav.data']);

    const select = langSelect(root);
    select.value = 'system';
    select.dispatchEvent(new Event('change'));

    expect(localStorage.getItem('va-practice:lang')).toBe('system');
    // jsdom 這台「裝置」的語言是 en-US，主碼 en，因此落到英文那一份。
    expect(addBookLabel(root)).toBe(en['books.addButton']);
  });
});
