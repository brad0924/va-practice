/**
 * 「這台裝置要不要接雲端」接上這台裝置的接線。問的方式只出現在這裡，
 * `core/lib/cloud-consent.ts` 因此維持可以在 vitest 裡測的純度，
 * 立場與 `src/lib/cloud-consent-native.ts`（Capacitor 版那支）相同。
 *
 * **React Native 上沒有 `confirm()`**，改用 `Alert.alert()`——那是原生的警示窗，而且是
 * 非同步的：按鈕的處理器在使用者選完之後才跑。`cloud-consent.ts` 的 `ask()` 從票 `17` 起
 * 回 `Promise` 就是為了它（做法與 `../ui/book-scope-sheet.tsx` 刪單字本一致）。
 *
 * 這裡沒有平台判斷。Capacitor 版那支要判斷是因為同一份程式碼也跑在瀏覽器上；
 * 這支 app 只出 iOS，走到這裡就是在 iPhone 上。
 *
 * 本模組不寫自動測試：`Alert` 在 Node 底下是假的，測到的只是那個假貨自己的行為。
 */
import { Alert } from 'react-native';
import { t } from '@core/i18n';
import { createCloudConsent, type CloudConsent } from '@core/lib/cloud-consent';
import type { StorageLike } from '@core/lib/storage';

/**
 * 這台裝置的雲端同意。
 *
 * @param storage 這台裝置本機那一格（MMKV）。**不能遞 Keychain 那一個**：
 *   答案不跟著 iCloud 走正是這件事的重點（見 `cloud-consent.ts` 的檔頭）。
 */
export function createNativeCloudConsent(storage: StorageLike): CloudConsent {
  return createCloudConsent({
    storage,
    // 查表擺在函式裡面，問的那一刻才算——這支模組被載入時 i18n 還沒接上。
    ask: (nickname) =>
      new Promise((resolve) => {
        Alert.alert(t('cloud.pullTitle'), t('cloud.pullConfirm', { nickname }), [
          // 「取消」排在前面並拿 `cancel` 樣式（HIG `B-06`，與刪單字本那一問同一套）。
          // 這一問不帶 `destructive`：不接只是這次不接，雲端那份一個字都不會少。
          { text: t('cloud.pullDecline'), style: 'cancel', onPress: () => resolve(false) },
          { text: t('cloud.pullAccept'), onPress: () => resolve(true) },
        ]);
      }),
  });
}
