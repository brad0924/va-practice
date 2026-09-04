// @vitest-environment jsdom

/**
 * 資料畫面新增的那一段：介面語言（票 04）。
 *
 * 其餘幾段只驗順序——它們在這張票之前就長在那裡了，一個字都沒動。
 *
 * 刻意不測的：
 * - 說明文字的內容。斷言 `t('data.langHint')` 等於 `t('data.langHint')` 什麼都沒驗到，
 *   那句話講不講得清楚只有人看得出來。
 * - 切完之後畫面真的重畫。那條接線在 `app.ts`，由 `app.test.ts` 從開機演一次。
 */

import { describe, it, expect } from 'vitest';
import type { App } from '../app';
import { dataView } from './data-view';
import { setLang, t, type LangChoice } from '@core/i18n';

/**
 * 掛一張資料畫面到 document.body。
 *
 * 零本零卡是最單純的狀態，語言那一段跟使用者有多少卡片無關。
 */
function mountData(onSetLang: (choice: LangChoice) => void = () => {}): HTMLElement {
  const app = {
    data: { version: 3, books: [], cards: [], scopes: { review: [], list: [], stats: [] }, updatedAt: 0 },
    cloud: { nickname: () => null },
    gemini: { read: () => null },
    setLang: onSetLang,
  } as unknown as App;

  const screen = dataView(app);
  document.body.replaceChildren(screen);
  return screen;
}

function sectionTitles(screen: HTMLElement): (string | null)[] {
  return [...screen.querySelectorAll('.section-title')].map((node) => node.textContent);
}

/** 這一頁只有語言那一段有下拉選單。 */
function langSelect(screen: HTMLElement): HTMLSelectElement {
  const select = screen.querySelector('select');
  if (select === null) throw new Error('資料畫面上找不到語言選單');
  return select;
}

describe('介面語言那一段', () => {
  it('排在單字本與雲端備份之間，其餘幾段順序不變', () => {
    expect(sectionTitles(mountData())).toEqual([
      t('books.sectionTitle'),
      t('data.langTitle'),
      t('data.cloudTitle'),
      t('data.geminiTitle'),
      t('data.fileTitle'),
    ]);
  });

  it('四個選項齊全，除了「系統預設」都用各自的語言寫', () => {
    const options = [...langSelect(mountData()).options];

    expect(options.map((option) => option.value)).toEqual(['system', 'zh-Hant', 'en', 'ja']);
    // 「系統預設」沒有自稱，只能跟著當前介面語言變；其餘三個是寫死的自稱，
    // 手滑切到看不懂的語言時還認得出來（spec 決定十）。
    expect(options.map((option) => option.textContent)).toEqual([
      t('data.langSystem'),
      '繁體中文',
      'English',
      '日本語',
    ]);
  });

  it('目前選的那一個就是選單上停的那一個', () => {
    setLang('ja');

    expect(langSelect(mountData()).value).toBe('ja');
  });

  it('沒選過語言時停在「系統預設」', () => {
    expect(langSelect(mountData()).value).toBe('system');
  });

  it('換一個之後把選擇交給 app', () => {
    const chosen: LangChoice[] = [];
    const select = langSelect(mountData((choice) => chosen.push(choice)));

    select.value = 'en';
    select.dispatchEvent(new Event('change'));

    expect(chosen).toEqual(['en']);
  });
});
