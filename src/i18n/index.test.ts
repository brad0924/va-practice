import { describe, it, expect, vi } from 'vitest';
import { initI18n, lang, setLang, t } from './index';
import type { StorageLike } from '../lib/storage';

/** 一台裝置的本機儲存。記得每一格，才驗得出這個模組只碰自己那一格。 */
function fakeStorage(): StorageLike & { keys(): string[] } {
  const cells = new Map<string, string>();
  return {
    getItem: (key) => cells.get(key) ?? null,
    setItem: (key, value) => {
      cells.set(key, value);
    },
    removeItem: (key) => {
      cells.delete(key);
    },
    keys: () => [...cells.keys()],
  };
}

describe('查表', () => {
  it('取得繁體中文那一份的字串', () => {
    initI18n(fakeStorage(), 'zh-TW');
    expect(t('books.addButton')).toBe('＋ 新增單字本');
  });
});

describe('使用者選過語言', () => {
  it('選了日文就查日文那一份，裝置是什麼語言都不管', () => {
    const storage = fakeStorage();
    storage.setItem('va-practice:lang', 'ja');

    initI18n(storage, 'de-DE');
    expect(t('books.addButton')).toBe('＋ 単語帳を追加');
  });
});

describe('沒選過語言，跟著裝置走', () => {
  /** 主碼比對表見票 02。橫線後面砍掉再比，一條規則管三種語言。 */
  const cases: [system: string, expected: string][] = [
    ['zh-TW', '＋ 新增單字本'],
    // 簡體中文算「符合」，給繁體中文——讀繁中的門檻遠低於讀英文（spec 決定六）。
    ['zh-CN', '＋ 新增單字本'],
    ['ja-JP', '＋ 単語帳を追加'],
    ['de-DE', '+ Add vocabulary book'],
    // 韓文不再是支援的語言（spec 決定十四），走「其餘一切」那條。
    ['ko-KR', '+ Add vocabulary book'],
  ];

  for (const [system, expected] of cases) {
    it(`裝置是 ${system} 就給 ${expected}`, () => {
      initI18n(fakeStorage(), system);
      expect(t('books.addButton')).toBe(expected);
    });
  }

  it('選了「系統預設」也走同一條', () => {
    const storage = fakeStorage();
    storage.setItem('va-practice:lang', 'system');

    initI18n(storage, 'ja-JP');
    expect(t('books.addButton')).toBe('＋ 単語帳を追加');
  });

  it('那一格存了不認得的值就當成「系統預設」', () => {
    const storage = fakeStorage();
    // 'ko' 曾經是支援的語言（spec 決定十四砍掉），舊裝置上真的可能留著這種值。
    storage.setItem('va-practice:lang', 'ko');

    initI18n(storage, 'ja-JP');
    expect(t('books.addButton')).toBe('＋ 単語帳を追加');
  });
});

describe('切換語言', () => {
  it('選了英文之後查表立刻換一份，那一格也記下來', () => {
    const storage = fakeStorage();
    initI18n(storage, 'zh-TW');

    setLang('en');

    expect(t('books.addButton')).toBe('+ Add vocabulary book');
    expect(storage.getItem('va-practice:lang')).toBe('en');
  });

  it('選回「系統預設」就重新跟著裝置走，那一格記的是 system', () => {
    const storage = fakeStorage();
    initI18n(storage, 'ja-JP');
    setLang('en');

    setLang('system');

    expect(t('books.addButton')).toBe('＋ 単語帳を追加');
    expect(storage.getItem('va-practice:lang')).toBe('system');
  });

  it('目前選的是哪一個問得出來，沒選過就是 system', () => {
    const storage = fakeStorage();
    initI18n(storage, 'zh-TW');
    expect(lang()).toBe('system');

    setLang('ja');
    expect(lang()).toBe('ja');
  });

  it('只碰 va-practice:lang 這一格，不動資料與雲端那兩格', () => {
    const storage = fakeStorage();
    storage.setItem('va-practice:data', '{}');
    storage.setItem('va-practice:cloud', '{}');
    initI18n(storage, 'zh-TW');

    setLang('ja');

    expect(storage.keys()).toEqual(['va-practice:data', 'va-practice:cloud', 'va-practice:lang']);
  });
});

describe('帶參數的字串', () => {
  it('把參數代進佔位符，不靠字串拼接', () => {
    initI18n(fakeStorage(), 'zh-TW');
    expect(t('books.nameTaken', { name: 'N5 常用' })).toBe('已經有一本叫「N5 常用」了');
  });

  it('換一種語言時參數落在該語言自己的位置上', () => {
    initI18n(fakeStorage(), 'en-US');
    expect(t('books.nameTaken', { name: 'N5' })).toBe('A vocabulary book named "N5" already exists');
  });
});

describe('還沒接上這台裝置', () => {
  it('沒呼叫過 initI18n 就查表會直接丟例外', async () => {
    // 拿一份沒被本檔其他測試接過線的模組。最可能踩到這條的是「在模組載入的當下
    // 就呼叫 t()」——例如寫在 module-level 常數裡，那比 app.ts 接線還早。
    vi.resetModules();
    const fresh = await import('./index');

    expect(() => fresh.t('books.addButton')).toThrow('i18n 還沒啟動');
  });
});

describe('那一格被塞了奇怪的東西', () => {
  // `in` 會走原型鏈，'constructor' 那類名字會被當成合法語言、接著查表查到 undefined。
  it.each(['constructor', 'toString', '__proto__'])('存了 %s 也一樣當成「系統預設」', (junk) => {
    const storage = fakeStorage();
    storage.setItem('va-practice:lang', junk);

    initI18n(storage, 'ja-JP');
    expect(t('books.addButton')).toBe('＋ 単語帳を追加');
  });
});
