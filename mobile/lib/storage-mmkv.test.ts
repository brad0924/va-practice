// 這一支是 mobile/ 自己新寫的，所以直接寫 Jest。`core/` 那批仍寫著 `from 'vitest'`
// 並靠 `../test/vitest-shim.ts` 轉接——那個包袱只屬於搬過來的舊測試（票 `02`）。
import { describe, it, expect } from '@jest/globals';
import { createStore, STORAGE_KEY } from '@core/lib/storage';
import { createMmkvStorage } from './storage-mmkv';

/**
 * 這一支要回答的是票 `04` 的地基問題：**同步的 `StorageLike` 真的頂得上去嗎。**
 *
 * 跑的是 MMKV 在測試環境下的假實作（套件自己附的，資料存在記憶體裡，介面與真的一模一樣），
 * 所以驗得到「介面對不對得起來」，驗不到「關掉 app 資料還在不在」——後者是真機驗收那兩條。
 */
describe('createMmkvStorage', () => {
  it('沒存過的鍵回 null，不是 undefined', () => {
    // 這是 MMKV 與 `StorageLike` 之間唯一真正的落差：MMKV 的 getString() 給的是
    // undefined，而 `storage.ts` 的 read() 拿 `raw === null` 判斷「這台裝置是不是全新的」。
    // 漏掉這一層換算，全新裝置會走進 JSON.parse(undefined) 而不是初始化成新使用者。
    expect(createMmkvStorage().getItem(STORAGE_KEY)).toBeNull();
  });

  it('存進去的字串原封讀得回來', () => {
    const storage = createMmkvStorage();
    storage.setItem(STORAGE_KEY, '{"版本":3}');
    expect(storage.getItem(STORAGE_KEY)).toBe('{"版本":3}');
  });

  it('移除之後回到「沒存過」', () => {
    const storage = createMmkvStorage();
    storage.setItem(STORAGE_KEY, '有東西');
    storage.removeItem(STORAGE_KEY);
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('不同的鍵互不干擾', () => {
    // 整份資料、介面語言、Gemini 金鑰、提醒開關各占一格，全部住在同一個 MMKV 裡。
    const storage = createMmkvStorage();
    storage.setItem(STORAGE_KEY, '整份資料');
    storage.setItem('va-practice:lang', 'ja');
    storage.removeItem(STORAGE_KEY);
    expect(storage.getItem('va-practice:lang')).toBe('ja');
  });
});

describe('createStore 吃得下 MMKV', () => {
  it('全新裝置載入得到一份空資料，而且已經寫回去了', () => {
    const storage = createMmkvStorage();
    const data = createStore(storage).load();

    expect(data).toMatchObject({ books: [], cards: [] });
    // load() 一律寫回，所以這一格從「沒存過」變成有東西了。
    expect(storage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it('存下去的資料換一個 store 讀得回來——等同關掉 app 再開', () => {
    const storage = createMmkvStorage();
    const first = createStore(storage);
    const data = first.load();
    first.save({ ...data, books: [{ id: '書', name: 'JLPT N2' }] });

    // 同一格儲存交給新的 store，就是重開 app 之後的樣子。
    expect(createStore(storage).load().books).toEqual([{ id: '書', name: 'JLPT N2' }]);
  });
});
