/**
 * 把 `aps-environment` 這格 entitlement 從建置產物裡拿掉。
 *
 * ## 為什麼非有這一支不可
 *
 * **這支 app 一則遠端推播都不發。** 每日提醒走的是本機排程的通知，不需要任何推播權限
 * （見 `../lib/daily-reminder-native.ts` 的檔頭，2026-09-02 維護者拍板不加）。
 *
 * 帶著這格權限的代價是簽章當場失敗：Apple 會回頭查這個 App ID 有沒有開 Push
 * Notifications 能力，沒開就倒。**2026-09-03 第一趟 TestFlight build 就是這樣倒的**——
 *
 * ```
 * error: Provisioning profile "va-practice App Store" doesn't include
 *        the Push Notifications capability.
 * error: Provisioning profile "va-practice App Store" doesn't include
 *        the aps-environment entitlement.
 * ```
 *
 * ## 「不把外掛寫進 app.json」擋不住它
 *
 * 票 `19` 當時的做法是不把 `expo-notifications` 的設定檔外掛列進 `app.json` 的 `plugins`，
 * 以為這樣就不會帶到那格權限。**在 Expo SDK 57 上不成立。**
 *
 * `expo-notifications` 被列在 `@expo/prebuild-config` 的 `versionedExpoSDKPackages` 裡
 * （`build/plugins/withDefaultPlugins.js`），`expo prebuild` 會**自動套用**它的外掛，
 * 跟 `app.json` 寫了什麼無關。那支外掛的 iOS 那一半只有一句話：
 *
 * ```js
 * if (!config.modResults['aps-environment']) config.modResults['aps-environment'] = mode;
 * ```
 *
 * 所以只能等它加完再拿掉。
 *
 * ## 順序：這支要靠 `app.json` 的 `plugins` 才排得到最後
 *
 * mod 的執行順序是**倒過來的——最後註冊的先跑**（`@expo/config-plugins` 的
 * `withMod`：先跑自己的 action，再呼叫前一個註冊的）。而註冊順序是
 * `app.json` 的 `plugins` 最先、自動套用的那批在後，所以寫在 `app.json` 裡的這支跑在最後。
 *
 * 這與同目錄的 `with-app-check-first.js` 不衝突：那支動的是 `AppDelegate`，
 * 不是 entitlements，兩條鏈各自獨立。
 */
const { withEntitlementsPlist } = require('@expo/config-plugins');

const TAG = 'va-practice/without-push-entitlement';
const KEY = 'aps-environment';

/** @type {import('@expo/config-plugins').ConfigPlugin} */
const withoutPushEntitlement = (config) =>
  withEntitlementsPlist(config, (modConfig) => {
    if (!(KEY in modConfig.modResults)) {
      // 安靜跳過的兩種成因分不出來：可能是 expo-notifications 不再自己加它（那這支外掛
      // 可以刪了），也可能是這支跑在它前面（順序壞了，包照樣會帶著推播權限）。
      // 後者要等十分鐘後 Archive 才發現，當場擋下來便宜得多。
      throw new Error(
        `[${TAG}] entitlements 裡沒有 \`${KEY}\`，這支外掛因此沒有做任何事。` +
          '兩種可能：expo-notifications 不再自動加它（那就把這支外掛與 app.json 裡那一行刪掉），' +
          '或這支外掛跑在它前面（檢查 app.json 的 plugins 順序）。',
      );
    }
    delete modConfig.modResults[KEY];
    return modConfig;
  });

module.exports = withoutPushEntitlement;
