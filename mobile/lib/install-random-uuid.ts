/**
 * 把 `crypto.randomUUID()` 補進執行環境。**要在任何 `core/` 的程式碼被載入之前跑**，
 * 因此接在 `index.ts` 的第一行。
 *
 * 為什麼需要它：`core/lib/storage.ts` 有三處呼叫 `crypto.randomUUID()`——新增單字本、
 * 匯入單字撞號時換識別碼、把沒有歸屬的卡收攏成一本。那是瀏覽器的全域函式，
 * React Native 0.86 與 Expo SDK 57 都沒有。票 `04` 說「27 處呼叫端一行不改」仍然成立，
 * 但 `core/` 內部這一處要靠這個補丁才跑得動。
 *
 * **自動測試看不到這個問題。** jest-expo 跑在 Node 上，Node 自己就有 `crypto.randomUUID`，
 * 所以少了這個補丁測試照樣全綠，手機上才會爆。真機驗收那條才是它的守門員。
 */
import { randomUUID } from 'expo-crypto';

/** 執行環境那個全域物件。TypeScript 的型別裡沒有 `crypto` 這一格，所以自己描述一次。 */
const runtime = globalThis as unknown as { crypto?: { randomUUID?: () => string } };

// 已經有的話不蓋掉：哪天 React Native 自己補上了，用它原生的那一份。
if (runtime.crypto === undefined) runtime.crypto = {};
if (typeof runtime.crypto.randomUUID !== 'function') runtime.crypto.randomUUID = randomUUID;
