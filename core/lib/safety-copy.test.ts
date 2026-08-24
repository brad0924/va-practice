import { describe, it, expect } from 'vitest';
import { createSafetyCopy, restoreSafetyCopy, withSafetyCopy } from './safety-copy';
import { DATA_VERSION, STORAGE_KEY, type StorageLike } from './storage';
import { DEFAULT_EASE } from './review';

/** 一台裝置的本機儲存。沿用 storage.test.ts 的寫法，只存一個鍵，不必分辨。 */
function fakeStorage(initial?: string): StorageLike {
  let value = initial ?? null;
  return {
    getItem: () => value,
    setItem: (_key, next) => {
      value = next;
    },
    removeItem: () => {
      value = null;
    },
  };
}

/**
 * 原生儲存那一端，但每一趟寫入什麼時候完成由測試自己決定——
 * 「寫入期間又有新變動」這件事非得能停在半路才測得到。
 */
function fakeNative() {
  const waiting: { value: string; resolve: () => void; reject: (error: unknown) => void }[] = [];
  const written: string[] = [];

  /** 讓已經排好的 promise 全部跑完，flush 的下一圈才會真的開始。 */
  const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

  function pick(): (typeof waiting)[number] {
    const next = waiting.shift();
    if (next === undefined) throw new Error('現在沒有正在等的寫入');
    return next;
  }

  return {
    /** 真的落地的每一份，依落地順序。 */
    written,
    /** 還沒回來的寫入趟數。 */
    outstanding: () => waiting.length,
    write(value: string): Promise<void> {
      return new Promise((resolve, reject) => {
        waiting.push({ value, resolve, reject });
      });
    },
    /** 放行目前這一趟。 */
    async finish(): Promise<void> {
      const next = pick();
      written.push(next.value);
      next.resolve();
      await settle();
    },
    /** 讓目前這一趟失敗，例如原生儲存滿了。 */
    async fail(): Promise<void> {
      pick().reject(new Error('原生儲存寫不進去'));
      await settle();
    },
    settle,
  };
}

/** 一份能通過驗證的資料，`mark` 用來認出還原回來的是哪一份。 */
function backup(mark: string): string {
  return JSON.stringify({
    version: DATA_VERSION,
    books: [{ id: 'book', name: '我的單字' }],
    cards: [
      { id: mark, bookId: 'book', text: mark, meaning: mark, interval: 12, ease: DEFAULT_EASE, due: '2026-08-01' },
    ],
    scopes: { review: ['book'], list: ['book'], stats: ['book'] },
    updatedAt: 1784852211282,
  });
}

describe('createSafetyCopy', () => {
  it('把交進來的那一串原封寫進原生儲存', async () => {
    const native = fakeNative();
    const copy = createSafetyCopy(native.write);

    copy.push(backup('第一份'));
    await native.finish();

    expect(native.written).toEqual([backup('第一份')]);
  });

  it('寫入期間的連續變動併成一趟，落地的是最新那一份', async () => {
    const native = fakeNative();
    const copy = createSafetyCopy(native.write);

    copy.push('第一份');
    await native.settle();

    // 第一份還在路上時又改了兩次，例如匯入一批單字。
    copy.push('第二份');
    copy.push('第三份');

    await native.finish();
    expect(native.written).toEqual(['第一份']);

    // 被合併掉的第二份沒有意義，補的那一趟直接寫第三份。
    await native.finish();
    expect(native.written).toEqual(['第一份', '第三份']);

    // 而且只補這一趟，不會一份一份補完。
    expect(native.outstanding()).toBe(0);
  });

  it('連續變動但每一趟都等得到回應時，每一份都寫得出去', async () => {
    const native = fakeNative();
    const copy = createSafetyCopy(native.write);

    copy.push('第一份');
    await native.finish();
    copy.push('第二份');
    await native.finish();

    expect(native.written).toEqual(['第一份', '第二份']);
  });

  it('寫入失敗時不重試，也不留下一個轉不停的迴圈', async () => {
    const native = fakeNative();
    const copy = createSafetyCopy(native.write);

    copy.push('第一份');
    await native.fail();

    expect(native.written).toEqual([]);
    // 失敗後把機會留給下一次變動，與雲端推送同一個立場。
    expect(native.outstanding()).toBe(0);
  });

  it('寫入失敗後，下一次變動照樣再寫一趟', async () => {
    const native = fakeNative();
    const copy = createSafetyCopy(native.write);

    copy.push('第一份');
    await native.fail();

    copy.push('第二份');
    await native.finish();

    expect(native.written).toEqual(['第二份']);
  });
});

describe('withSafetyCopy', () => {
  it('存進本機的每一份都帶著副本一起走', async () => {
    const native = fakeNative();
    const storage = withSafetyCopy(fakeStorage(), createSafetyCopy(native.write));

    storage.setItem(STORAGE_KEY, backup('存進去的'));
    await native.finish();

    expect(native.written).toEqual([backup('存進去的')]);
    // 本機那一份仍然照常存下來，副本沒有取代它。
    expect(storage.getItem(STORAGE_KEY)).toBe(backup('存進去的'));
  });

  it('副本抄的只有整份資料那一個鍵，別人的東西不抄', async () => {
    const native = fakeNative();
    const storage = withSafetyCopy(fakeStorage(), createSafetyCopy(native.write));

    storage.setItem('va-practice:cloud', '暱稱與密碼');
    await native.settle();

    expect(native.outstanding()).toBe(0);
  });

  it('讀取與移除原封轉發給本機儲存', () => {
    const native = fakeNative();
    const storage = withSafetyCopy(fakeStorage(backup('本來就有的')), createSafetyCopy(native.write));

    expect(storage.getItem(STORAGE_KEY)).toBe(backup('本來就有的'));
    storage.removeItem(STORAGE_KEY);
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });
});

describe('restoreSafetyCopy', () => {
  it('localStorage 空白而副本有東西時，把副本寫回去', async () => {
    const storage = fakeStorage();

    await restoreSafetyCopy(storage, () => Promise.resolve(backup('救回來的')));

    const restored = JSON.parse(storage.getItem(STORAGE_KEY) ?? 'null') as { cards: { id: string }[] };
    expect(restored.cards.map((card) => card.id)).toEqual(['救回來的']);
  });

  it('副本永遠不是資料來源：localStorage 有東西時一個字都不動它', async () => {
    const storage = fakeStorage(backup('本機這份'));

    await restoreSafetyCopy(storage, () => Promise.resolve(backup('副本那份')));

    expect(storage.getItem(STORAGE_KEY)).toBe(backup('本機這份'));
  });

  it('兩邊都空白時什麼都不做，交給後續照常初始化成新使用者', async () => {
    const storage = fakeStorage();

    await expect(restoreSafetyCopy(storage, () => Promise.resolve(null))).resolves.toBeUndefined();
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('副本壞掉時當作沒有副本，不讓 app 倒在啟動', async () => {
    const storage = fakeStorage();

    await expect(restoreSafetyCopy(storage, () => Promise.resolve('{ 這不是 JSON'))).resolves.toBeUndefined();
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('副本讀不出來時同樣當作沒有副本', async () => {
    const storage = fakeStorage();

    await expect(
      restoreSafetyCopy(storage, () => Promise.reject(new Error('原生儲存讀不到'))),
    ).resolves.toBeUndefined();
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('還原走的是匯入那條驗證路徑，舊格式的副本會被遷移成當前格式', async () => {
    const legacy = JSON.stringify({
      version: 2,
      cards: [{ id: '焦がす', text: '焦[こ]がす', meaning: '燒焦', interval: 12, ease: 2.15, due: '2026-08-01' }],
      updatedAt: 1784852211282,
    });
    const storage = fakeStorage();

    await restoreSafetyCopy(storage, () => Promise.resolve(legacy));

    const restored = JSON.parse(storage.getItem(STORAGE_KEY) ?? 'null') as {
      version: number;
      books: { name: string }[];
    };
    expect(restored.version).toBe(DATA_VERSION);
    expect(restored.books).toHaveLength(1);
  });
});
