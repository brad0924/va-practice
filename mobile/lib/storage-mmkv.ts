/**
 * `localStorage` 在 React Native 上的頂替品（票 `04`）。網頁版與 Capacitor 版遞
 * `localStorage`，這一版遞這個；`core/lib/storage.ts` 不知道差別。
 *
 * **為什麼是 `react-native-mmkv` 而不是官方的 `AsyncStorage`**：MMKV 是完全同步的，
 * `StorageLike` 這個同步介面因此原封搬得過來，27 處呼叫端一行不改。完整理由記在
 * `ADR-0002` 的 2026-08-25 補充，那份是正本。
 *
 * **這裡不加密。** MMKV 帶得動加密但沒開，理由見 `../README.md` 的〈資料存在哪裡〉。
 */
import { createMMKV } from 'react-native-mmkv';
import type { StorageLike } from '@core/lib/storage';

/**
 * 這台裝置上那一份資料的名字。整份資料、介面語言、Gemini 金鑰、提醒開關全部住在這裡面，
 * 各占一格，與網頁版的 `localStorage` 一模一樣——分成好幾個 MMKV 只會多出「哪一格在哪裡」
 * 這個要記的東西。
 */
const INSTANCE_ID = 'va-practice';

/**
 * 開一格 MMKV，包成 `createStore()` 吃得下的樣子。
 *
 * 三支方法都是同步的，`StorageLike` 因此原樣成立。唯一要換算的是**沒存過的時候**：
 * MMKV 給的是 `undefined`，而 `storage.ts` 拿 `raw === null` 判斷「這台裝置是不是全新的」。
 *
 * **`recoveryStrategy` 是明訂的，不是照預設值。** 不設的時候 MMKV 走的是舊式的錯誤回呼，
 * 而 `react-native-mmkv` 從沒註冊過那個回呼，於是上游直接回 `OnErrorDiscard`——檔案的
 * 對帳碼或長度對不上就整格丟掉，app 開起來像剛裝好的一樣。設成 `'recover-on-error'` 之後，
 * MMKV 改成從檔案開頭一筆一筆讀，讀到壞掉那筆就收工並保留已經讀到的。MMKV 存檔是往後接、
 * 不覆寫，壞掉的通常是尾巴那筆（正是寫失敗的那一次），所以救回來的是**上一次成功寫入的
 * 完整版本**，不是半份資料。沒有舊版可退時結果與丟掉相同，所以這個設定只會比預設好。
 *
 * 這條路與雲端備份無關，純本機。雲端那邊解不開走的是 `RejectedByCloud`，
 * 見 `core/lib/cloud-backup.ts` 的 `open()`。
 */
export function createMmkvStorage(): StorageLike {
  const mmkv = createMMKV({ id: INSTANCE_ID, recoveryStrategy: 'recover-on-error' });

  return {
    getItem: (key) => mmkv.getString(key) ?? null,
    setItem: (key, value) => {
      mmkv.set(key, value);
    },
    removeItem: (key) => {
      mmkv.remove(key);
    },
  };
}
