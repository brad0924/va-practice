/**
 * iOS Keychain 裡的那一份暱稱與密碼，接成雲端備份吃得下的同步介面。
 *
 * 為什麼要有這個中間人：Keychain 的 API 是非同步的，而 `StorageLike` 是同步的
 * （見 ADR-0002，那個介面不改）。解法是在啟動流程中先非同步讀出來、填進一個記憶體
 * 物件；此後 `getItem` 由記憶體同步回答，`setItem` 同步更新記憶體、並在背景寫回
 * Keychain。暱稱與密碼只有登入、換密碼、停止同步三個時機會變動，頻率極低，
 * 這個模型足夠（見 spec 決定十二）。
 *
 * 這也是 `cloud-backup.ts` 一行都不必改的原因：`CloudBackupHooks.storage` 本來就是
 * 外部遞進來的 `StorageLike`，iOS 版改遞這一個即可（見 spec 決定十一）。
 *
 * 本模組不碰任何原生 API：讀寫的方式一律由呼叫端遞進來。接上原生那一端的接線在
 * `mobile/lib/keychain-native.ts`。網頁版完全沒有這條支線。
 */
import { CREDENTIALS_KEY } from './cloud-backup';
import type { StorageLike } from './storage';

/** Keychain 那一端的三支方法。沒有那一筆時 `read` 回 null。 */
export interface KeychainLike {
  read(key: string): Promise<string | null>;
  write(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/**
 * 啟動時先把暱稱與密碼那一筆讀出來，回傳一個此後都同步作答的 `StorageLike`。
 *
 * 進得了 Keychain 的只有那一個鍵，寫死的——雲端備份目前也只用這一個鍵，但寫死比較
 * 誠實：哪天多出第二個鍵時，這裡不會默默把別人的東西也塞進去。
 */
export async function loadKeychainStorage(keychain: KeychainLike): Promise<StorageLike> {
  const memory = new Map<string, string>();
  try {
    const preloaded = await keychain.read(CREDENTIALS_KEY);
    if (preloaded !== null) memory.set(CREDENTIALS_KEY, preloaded);
  } catch {
    // 讀不出來就當作沒登入過：使用者重新輸入一次暱稱與密碼就好，本機的卡片與進度
    // 一張都不會少，比整個 app 倒在啟動畫面好。
  }

  /**
   * 寫回 Keychain 一律排隊，一次一趟。並行的話回來的順序可能相反，
   * 落地的就會是已經被推翻的那一份——「登入後立刻停止同步」正是這種前後腳。
   */
  let queue: Promise<void> = Promise.resolve();
  function enqueue(operation: () => Promise<void>): void {
    // 失敗就算了，不重試：這一層沒有可以回報的畫面，而下一次登入或換密碼會再寫一趟
    // （與雲端推送同一個立場）。記憶體那一份不受影響，這次開著的 app 照常運作。
    queue = queue.then(operation).catch(() => {});
  }

  return {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => {
      memory.set(key, value);
      if (key === CREDENTIALS_KEY) enqueue(() => keychain.write(key, value));
    },
    removeItem: (key) => {
      memory.delete(key);
      if (key === CREDENTIALS_KEY) enqueue(() => keychain.remove(key));
    },
  };
}
