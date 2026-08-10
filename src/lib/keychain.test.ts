import { describe, it, expect } from 'vitest';
import { loadKeychainStorage, type KeychainLike } from './keychain';
import { CREDENTIALS_KEY as KEY } from './cloud-backup';

/**
 * Keychain 那一端，但每一趟寫入什麼時候完成由測試自己決定——
 * 「登入後立刻停止同步」這種前後腳的事，非得能停在半路才測得到。
 * 讀取則一律立刻回來：它只發生在啟動時，沒有第二件事在跟它搶。
 */
function fakeKeychain(initial?: string) {
  const stored = new Map<string, string>();
  if (initial !== undefined) stored.set(KEY, initial);

  const waiting: { land: () => void; resolve: () => void; reject: (error: unknown) => void }[] = [];

  /** 讓已經排好的 promise 全部跑完，排隊的下一趟才會真的開始。 */
  const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

  function defer(land: () => void): Promise<void> {
    return new Promise((resolve, reject) => {
      waiting.push({ land, resolve, reject });
    });
  }

  function pick(): (typeof waiting)[number] {
    const next = waiting.shift();
    if (next === undefined) throw new Error('現在沒有正在等的寫入');
    return next;
  }

  return {
    /** Keychain 裡真的落地的東西。 */
    stored,
    /** 還沒回來的寫入趟數。 */
    outstanding: () => waiting.length,
    keychain: {
      read: (key) => Promise.resolve(stored.get(key) ?? null),
      write: (key, value) => defer(() => stored.set(key, value)),
      remove: (key) => defer(() => stored.delete(key)),
    } satisfies KeychainLike,
    /** 放行目前這一趟。前後都讓 promise 跑完：排隊本身也是排在 microtask 上的。 */
    async finish(): Promise<void> {
      await settle();
      const next = pick();
      next.land();
      next.resolve();
      await settle();
    },
    /** 讓目前這一趟失敗，例如裝置鎖著。 */
    async fail(): Promise<void> {
      await settle();
      pick().reject(new Error('Keychain 寫不進去'));
      await settle();
    },
    settle,
  };
}

/** 存進去的那一串長這樣，與 `cloud-backup.ts` 的 `remember()` 一致。 */
function saved(nickname: string, password: string): string {
  return JSON.stringify({ nickname, password });
}

describe('loadKeychainStorage', () => {
  it('啟動時預載，之後 getItem 同步就答得出來', async () => {
    const fake = fakeKeychain(saved('brad', '密碼'));

    const storage = await loadKeychainStorage(fake.keychain);

    expect(storage.getItem(KEY)).toBe(saved('brad', '密碼'));
  });

  it('Keychain 裡還沒有那一筆時是未登入', async () => {
    const fake = fakeKeychain();

    const storage = await loadKeychainStorage(fake.keychain);

    expect(storage.getItem(KEY)).toBeNull();
  });

  it('讀不出來時當作未登入，不讓 app 倒在啟動', async () => {
    const broken: KeychainLike = {
      read: () => Promise.reject(new Error('Keychain 讀不到')),
      write: () => Promise.resolve(),
      remove: () => Promise.resolve(),
    };

    const storage = await loadKeychainStorage(broken);

    expect(storage.getItem(KEY)).toBeNull();
  });

  it('剛存進去的立刻讀得到，不必等 Keychain 那一趟回來', async () => {
    const fake = fakeKeychain();
    const storage = await loadKeychainStorage(fake.keychain);

    storage.setItem(KEY, saved('brad', '密碼'));

    // 同一拍就讀得到，中間沒有任何等待。
    expect(storage.getItem(KEY)).toBe(saved('brad', '密碼'));
    // 而 Keychain 那一趟這時還在路上。
    await fake.settle();
    expect(fake.outstanding()).toBe(1);
  });

  it('存進去的東西會寫回 Keychain', async () => {
    const fake = fakeKeychain();
    const storage = await loadKeychainStorage(fake.keychain);

    storage.setItem(KEY, saved('brad', '密碼'));
    await fake.finish();

    expect(fake.stored.get(KEY)).toBe(saved('brad', '密碼'));
  });

  it('換密碼後，Keychain 裡是新的那一份', async () => {
    const fake = fakeKeychain(saved('brad', '舊密碼'));
    const storage = await loadKeychainStorage(fake.keychain);

    storage.setItem(KEY, saved('brad', '新密碼'));
    await fake.finish();

    expect(storage.getItem(KEY)).toBe(saved('brad', '新密碼'));
    expect(fake.stored.get(KEY)).toBe(saved('brad', '新密碼'));
  });

  it('停止同步後，Keychain 裡那一筆真的被清掉', async () => {
    const fake = fakeKeychain(saved('brad', '密碼'));
    const storage = await loadKeychainStorage(fake.keychain);

    storage.removeItem(KEY);
    await fake.finish();

    expect(storage.getItem(KEY)).toBeNull();
    expect(fake.stored.has(KEY)).toBe(false);
  });

  it('登入後立刻停止同步時，Keychain 是空的——兩趟不會前後腳顛倒', async () => {
    const fake = fakeKeychain();
    const storage = await loadKeychainStorage(fake.keychain);

    storage.setItem(KEY, saved('brad', '密碼'));
    storage.removeItem(KEY);

    // 清除那一趟要等寫入回來才輪得到它，此刻還沒被叫。
    await fake.settle();
    expect(fake.outstanding()).toBe(1);
    await fake.finish();
    expect(fake.stored.get(KEY)).toBe(saved('brad', '密碼'));

    await fake.finish();
    expect(fake.stored.has(KEY)).toBe(false);
  });

  it('進得了 Keychain 的只有暱稱與密碼那一個鍵，別人的東西不收', async () => {
    const fake = fakeKeychain();
    const storage = await loadKeychainStorage(fake.keychain);

    storage.setItem('va-practice:gemini', '別人的金鑰');
    await fake.settle();

    expect(fake.outstanding()).toBe(0);
    expect(fake.stored.size).toBe(0);
  });

  it('寫回失敗時記憶體那一份照舊，這次開著的 app 仍然是登入狀態', async () => {
    const fake = fakeKeychain();
    const storage = await loadKeychainStorage(fake.keychain);

    storage.setItem(KEY, saved('brad', '密碼'));
    await fake.fail();

    expect(storage.getItem(KEY)).toBe(saved('brad', '密碼'));
    // 失敗後不重試，也不留下一個轉不停的迴圈。
    expect(fake.outstanding()).toBe(0);
  });

  it('寫回失敗後，下一次變動照樣寫得出去', async () => {
    const fake = fakeKeychain();
    const storage = await loadKeychainStorage(fake.keychain);

    storage.setItem(KEY, saved('brad', '密碼'));
    await fake.fail();

    storage.setItem(KEY, saved('brad', '新密碼'));
    await fake.finish();

    expect(fake.stored.get(KEY)).toBe(saved('brad', '新密碼'));
  });
});
