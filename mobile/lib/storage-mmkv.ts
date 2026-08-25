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
 */
export function createMmkvStorage(): StorageLike {
  const mmkv = createMMKV({ id: INSTANCE_ID });

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
