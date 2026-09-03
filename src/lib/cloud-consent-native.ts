/**
 * 「這台裝置要不要接雲端」接上這台裝置的接線。平台判斷與問的方式都只出現在這裡，
 * `cloud-consent.ts` 因此維持可以在 vitest 裡測的純度，立場與 `daily-reminder-native.ts` 相同。
 *
 * 這一支沒有原生插件——問的方式就是 `confirm()`，WKWebView 會把它畫成一個系統對話框。
 * 它是同步的，答案當場就有，包一層 `Promise.resolve()` 交出去即可——非同步是為了
 * React Native 那一端（`Alert.alert` 是 callback），這裡沒有真的等待發生。
 * 用它而不是自己做一個畫面內的對話框：問的時機在畫面建立之前（見 `app.ts`），
 * 那一刻還沒有任何地方掛得上一個自製的對話框。「停止備份」的確認用的也是同一支。
 *
 * 本模組不寫自動測試：`Capacitor` 與 `confirm()` 在 node 環境下要嘛不存在、要嘛得整支
 * 換掉，測到的只是自己寫的假貨——與其餘幾支 `*-native.ts` 同一個立場。
 */
import { Capacitor } from '@capacitor/core';
import { t } from '@core/i18n';
import { createCloudConsent, type CloudConsent } from '@core/lib/cloud-consent';
import type { StorageLike } from '@core/lib/storage';

/**
 * 這台裝置的雲端同意。**網頁版回 null**——那裡沒有 Keychain，密碼不會憑空出現在
 * 一台新裝置上，這一問完全不必發生（見票 14）。
 */
export function createNativeCloudConsent(storage: StorageLike): CloudConsent | null {
  if (!Capacitor.isNativePlatform()) return null;

  return createCloudConsent({
    storage,
    // 查表擺在函式裡面，問的那一刻才算——這支模組被載入時 i18n 還沒接上。
    ask: (nickname) => Promise.resolve(confirm(t('cloud.pullConfirm', { nickname }))),
  });
}
