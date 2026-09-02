/**
 * Keychain 接上原生那一端的接線。`react-native-keychain` 只出現在這裡，
 * `core/lib/keychain.ts` 因此維持可以在 vitest 裡測的純度，立場與 `haptics.ts` 相同。
 *
 * **為什麼是 `react-native-keychain` 而不是 `expo-secure-store`：`cloudSync`**（見 `ADR-0019`）。
 * 官方那支沒有 iCloud 鑰匙圈同步的選項，而整個「這台裝置要不要接」的機制
 * （`core/lib/cloud-consent.ts`）就是為了「密碼會跟著 iCloud 走」而存在的。
 *
 * 本模組不寫自動測試：那支套件在 Node 底下是個原生模組，硬要測就得造一整套假物件，
 * 測到的只是自己寫的假貨——與 `gemini-reading-native.ts` 同一個立場。
 * 行為改由真機的手動驗收清單守住（票 `17`）。
 */
import { getGenericPassword, resetGenericPassword, setGenericPassword } from 'react-native-keychain';
import { CREDENTIALS_KEY } from '@core/lib/cloud-backup';
import { loadKeychainStorage } from '@core/lib/keychain';
import type { StorageLike } from '@core/lib/storage';

/**
 * 每一筆各占一個 `service`。套件的 API 是「一個 service 一組帳密」，沒有鍵值對那一層，
 * 拿鍵當 service 是最直接的對法——`keychain.ts` 那一端本來就只認得一個鍵。
 *
 * **`cloudSync: true` 是這支檔存在的理由**，三支方法都要帶：讀、寫、刪各自去問系統，
 * 少帶一支就會去找另一組項目（可同步與不可同步是兩筆不同的東西）。
 */
function options(key: string) {
  return { service: key, cloudSync: true };
}

/**
 * 開機時先把暱稱與密碼那一筆讀出來，回傳雲端備份要用的那個 `StorageLike`。
 *
 * 那一格存的是一整串 JSON（`cloud-backup.ts` 自己序列化的），這裡放進 `password` 欄，
 * `username` 擺鍵名只是為了讓人用鑰匙圈工具翻到時看得懂那是什麼。
 */
export async function loadNativeCloudStorage(mmkv: StorageLike): Promise<StorageLike> {
  const storage = await loadKeychainStorage({
    read: async (key) => {
      // 沒有那一筆時套件回的是 `false`，不是 null。
      const found = await getGenericPassword(options(key));
      return found === false ? null : found.password;
    },
    write: async (key, value) => {
      await setGenericPassword(key, value, options(key));
    },
    remove: async (key) => {
      await resetGenericPassword(options(key));
    },
  });

  // 這台 iPhone 在改用 Keychain 之前存在 MMKV 的那一份從此不再被讀到，但它是明文，
  // 留著只是白白多一個讀得到密碼的地方，而且「停止同步」也清不到它。
  // **刻意不把它搬進 Keychain**（票 `17` 明寫不做搬遷）：留兩條讀取路徑比重打一次密碼糟。
  // Keychain 是空的就是未登入，去資料頁重登一次即可。Capacitor 版那支做的是同一件事。
  mmkv.removeItem(CREDENTIALS_KEY);

  return storage;
}
