/**
 * 保險副本：iOS 上另存的一份資料複本，防的是「WebView 那一層的資料被系統清掉」。
 *
 * **這不是第二個真相來源。** localStorage 仍然是唯一的（見 ADR-0002）：
 * 程式任何時候讀的都是它，副本只有一個用途——啟動時發現 localStorage 空白、
 * 而副本有東西，才把副本寫回去並照常啟動，使用者不會看到一個空的 app。
 *
 * 本模組不碰任何原生 API：讀寫的方式一律由呼叫端遞進來，與 `cloud-backup.ts`
 * 對 `hooks.fetch` 的立場相同。接上 Capacitor 那一端的接線在 `safety-copy-native.ts`。
 * 網頁版完全沒有這條支線。
 */
import { createStore, STORAGE_KEY, type StorageLike } from './storage';

export interface SafetyCopy {
  /**
   * 本機資料有變動，`value` 是剛存進 localStorage 的那一串——
   * 副本抄的永遠是它逐字的複本，本模組不自己序列化第二次。
   * 寫的永遠是最新的整份，寫入期間的變動會併到下一趟。
   */
  push(value: string): void;
}

/**
 * 沿用 `cloud-backup.ts` 的 `pending` / `sending` 模式，不用計時器：
 * 同時只寫一份，寫入期間進來的變動一律覆蓋成「待寫的最新那一份」，
 * 上一趟回來後若 `pending` 已換人就再寫一次。寫的永遠是整份資料，
 * 被合併掉的中間那幾份沒有任何意義。
 *
 * 不用固定延遲的節流：延遲秒數是無從論證的魔術數字，且計時器會開出一個
 * 「資料已改、計時中、app 被滑掉」的破口，「一次一趟」沒有這個窗口。
 */
export function createSafetyCopy(write: (value: string) => Promise<void>): SafetyCopy {
  /** 待寫的那一份。永遠只留最後一份。 */
  let pending: string | null = null;
  let writing = false;

  async function flush(): Promise<void> {
    if (writing || pending === null) return;
    writing = true;
    try {
      while (pending !== null) {
        const latest: string = pending;
        await write(latest);
        // 寫入期間又有新變動的話 pending 已經換人，這一份不能清掉。
        if (pending === latest) pending = null;
      }
    } catch {
      // 複習流程不被打斷，與雲端推送同一個立場：副本寫不進去就算了，
      // localStorage 那一份才是真相。待寫的那份留著，下次變動會再試一趟。
    } finally {
      writing = false;
    }
  }

  return {
    push(value) {
      pending = value;
      void flush();
    },
  };
}

/**
 * 把副本夾在 `createStore()` 與本機儲存之間，讓每一次本機寫入都必然帶著副本一起走。
 *
 * 改成散在每個呼叫 store 的地方的話（評分、匯入單字、整份匯入、雲端拉下來、
 * 推送成功後回填時間戳），漏掉任何一處就是一份與本機對不上的副本——
 * 而那正是使用者永遠不會發現、直到需要它的那一天才發現的那種錯。
 */
export function withSafetyCopy(storage: StorageLike, copy: SafetyCopy): StorageLike {
  return {
    getItem: (key) => storage.getItem(key),
    setItem: (key, value) => {
      storage.setItem(key, value);
      // store 目前只寫這一個鍵，但寫死比較誠實：副本抄的必須是整份資料，
      // 哪天多出第二個鍵時，這裡不會默默改抄錯的東西。
      if (key === STORAGE_KEY) copy.push(value);
    },
    removeItem: (key) => storage.removeItem(key),
  };
}

/**
 * 啟動時的還原，**必須早於 `store.load()`**——它在 localStorage 空白時會自行
 * 初始化一份新資料，還原晚一步使用者就會先看到一個空的 app。
 *
 * localStorage 只要有東西就完全不動它：副本永遠不是資料來源，
 * 兩邊不一致時本機那份一律勝出，這裡不做任何新舊比較。
 */
export async function restoreSafetyCopy(
  storage: StorageLike,
  read: () => Promise<string | null>,
): Promise<void> {
  if (storage.getItem(STORAGE_KEY) !== null) return;
  try {
    const copy = await read();
    if (copy === null) return;
    // 走一次匯入的驗證路徑，順帶把舊格式遷移掉，與雲端拉下來那條路同一條。
    createStore(storage).importJson(copy);
  } catch {
    // 讀不出來、或副本壞掉，一律當作沒有副本：照常初始化成新使用者，
    // 比整個 app 倒在啟動畫面好。
  }
}
