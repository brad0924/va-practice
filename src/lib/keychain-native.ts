/**
 * Keychain 接上原生那一端的接線。所有 Capacitor 的東西都只出現在這裡，
 * `keychain.ts` 因此維持可以在 vitest 裡測的純度，立場與 `safety-copy-native.ts` 相同。
 *
 * 原生實作是 app 自己那支插件（`ios/App/App/KeychainPlugin.swift`），沒有加任何新的
 * npm 依賴。那一端把項目標記為可同步到 iCloud 鑰匙圈——換新 iPhone 時密碼自動跟著走，
 * 而 iCloud 鑰匙圈是端對端加密的，Apple 自己讀不到內容（見 spec 決定十）。
 *
 * 本模組不寫自動測試：原生插件在 node 環境下不存在，硬要測就得造一整套假物件，
 * 測到的只是自己寫的假貨。行為改由真機的手動驗收清單守住。
 */
import { registerPlugin } from '@capacitor/core';
import { CREDENTIALS_KEY } from '@core/lib/cloud-backup';
import { loadKeychainStorage } from '@core/lib/keychain';
import type { StorageLike } from '@core/lib/storage';

/** 原生那一端的三支方法。沒有那一筆時 `read` 不帶 `value` 回來。 */
interface KeychainPlugin {
  read(options: { key: string }): Promise<{ value?: string }>;
  write(options: { key: string; value: string }): Promise<void>;
  remove(options: { key: string }): Promise<void>;
}

const plugin = registerPlugin<KeychainPlugin>('Keychain');

/**
 * 啟動前先把暱稱與密碼讀出來，回傳雲端備份要用的那個 `StorageLike`。
 * 只有 iOS 會走到，呼叫端負責判斷平台（見 `main.ts`）。
 */
export async function loadNativeCloudStorage(): Promise<StorageLike> {
  const storage = await loadKeychainStorage({
    read: async (key) => (await plugin.read({ key })).value ?? null,
    write: (key, value) => plugin.write({ key, value }),
    remove: (key) => plugin.remove({ key }),
  });

  // 這台 iPhone 在改用 Keychain 之前存在 localStorage 的那一份從此不再被讀到，
  // 但它是明文，留著只是白白多一個讀得到密碼的地方，而且「停止同步」也清不到它。
  // 刻意不把它搬進 Keychain：使用者重新輸入一次就好，換來的是不必養一段只跑一次的搬遷碼。
  localStorage.removeItem(CREDENTIALS_KEY);

  return storage;
}
