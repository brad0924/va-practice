/**
 * 登入時那兩個問句接上這台裝置的接線（`ADR-0020`）。
 *
 * 立場與隔壁的 `cloud-consent-native.ts` 完全相同：問的方式只出現在這裡，
 * `core/lib/cloud-backup.ts` 因此維持可以在 vitest 裡測的純度。
 *
 * **React Native 上沒有 `confirm()`**，兩問都走 `Alert.alert()`。它收一個按鈕陣列，
 * 三顆與兩顆是同一支 API，因此三選一在這裡不必自己畫——網頁版那邊才要
 * （`src/ui/choice-modal.ts` 的檔頭寫著為什麼）。
 *
 * `Alert.alert` 是非同步的：按鈕的處理器在使用者選完之後才跑。`CloudBackupHooks`
 * 那兩個問句回 `Promise` 就是為了它。
 *
 * 本模組不寫自動測試：`Alert` 在 Node 底下是假的，測到的只是那個假貨自己的行為。
 * 三顆按鈕的排列與 `destructive` 樣式對不對，只有真機看得出來。
 */
import { Alert } from 'react-native';
import { t } from '@core/i18n';
import type { FirstBackupChoice } from '@core/lib/cloud-backup';

/**
 * 雲端已經有備份、而它的內容與本機這份不同：問要不要讓雲端那份整份取代本機。
 *
 * 「繼續」帶 `destructive`：這台裝置目前的卡片與進度會被整份蓋掉，而且救不回來。
 * 這一點與開機那一問（`cloud-consent-native.ts`）不同——那一問按了不接只是這次不接，
 * 沒有任何東西會少。
 */
export function askReplaceNatively(nickname: string): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(t('cloud.replaceTitle'), t('cloud.replaceConfirm', { nickname }), [
      // 「取消」帶 `cancel` 並排在前（HIG `B-06`，與這個 app 其他每一個警示窗同一套）。
      { text: t('cloud.cancel'), style: 'cancel', onPress: () => resolve(false) },
      { text: t('cloud.replaceAccept'), style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

/** 雲端還沒有這個暱稱的備份：問這份備份要拿什麼建立。 */
export function askFirstBackupNatively(nickname: string): Promise<FirstBackupChoice> {
  return new Promise((resolve) => {
    Alert.alert(t('cloud.firstBackupTitle', { nickname }), t('cloud.firstBackupBody'), [
      { text: t('cloud.cancel'), style: 'cancel', onPress: () => resolve('cancel') },
      { text: t('cloud.firstBackupUseLocal'), onPress: () => resolve('local') },
      // 這一顆把這台清成剛裝好的樣子，無法復原。
      { text: t('cloud.firstBackupBlank'), style: 'destructive', onPress: () => resolve('blank') },
    ]);
  });
}
