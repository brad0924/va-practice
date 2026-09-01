/**
 * 讓 App Check 的 provider factory 搶在 `FirebaseApp.configure()` 之前掛上去。
 *
 * ## 為什麼非有這一支不可
 *
 * **Firebase 的規矩是 factory 必須在 `configure()` 之前註冊。** 順序錯了，
 * `FIRAppCheck` 在啟動的那一刻就拿著內建的 DeviceCheck，之後 JavaScript 再怎麼
 * `configureProvider('appAttest')` 都改不動它——那個實例早就建好了。
 *
 * 症狀是**去換權杖的網址結尾變成 `exchangeDeviceCheckToken`**，而主控台註冊的是
 * App Attest，於是 Google 回 `App not registered`，接著問模型就是 401。
 * 2026-09-01 真機踩到，靠資料頁那支探針才看得見（票 `16`）。
 *
 * **`@react-native-firebase/app` 的 Expo 外掛只做一半**：它把 `FirebaseApp.configure()`
 * 插進 `AppDelegate`，但沒有人在那之前掛 factory。官方文件（rnfirebase.io/app-check/usage）
 * 明講 React Native 0.79 以上要自己補這兩件事，而這裡是 0.86：
 *
 * 1. bridging header 加 `#import "RNFBAppCheckModule.h"`
 *    （文件明講**不要**在 Swift 裡 `import RNFBAppCheck`，那個 pod 是純 Objective-C）
 * 2. `didFinishLaunchingWithOptions` 裡 `RNFBAppCheckModule.sharedInstance()`
 *    排在 `FirebaseApp.configure()` **前面**
 *
 * > Capacitor 版當年為同一件事在 `ios/App/App/AppDelegate.swift` 手寫了十行 Swift
 * > （`.scratch/fixed-gemini-key/issues/01`）。那邊的 `ios/` 進版控所以改一次就好；
 * > 這裡每次 `expo prebuild` 都重新產生，因此得寫成外掛。
 *
 * ## 這支外掛要排在 `@react-native-firebase/app` 後面
 *
 * 它要找的錨點（`FirebaseApp.configure()`）是那支外掛插進去的，先跑就找不到。
 * **找不到時直接讓 prebuild 當場失敗**，不安靜地跳過——安靜跳過的下場就是再出一次
 * 「看起來好了、其實走 DeviceCheck」的包，而那種包要靠探針才驗得出來。
 */
const { withAppDelegate, withDangerousMod, IOSConfig } = require('@expo/config-plugins');
const { mergeContents } = require('@expo/config-plugins/build/utils/generateCode');
const fs = require('node:fs');
const path = require('node:path');

/** 產生的那幾行帶著這個標記，`expo prebuild` 重跑時認得出是自己上次寫的。 */
const TAG = 'va-practice/app-check-first';

const ANCHOR = 'FirebaseApp.configure()';
const CALL = 'RNFBAppCheckModule.sharedInstance()';
const IMPORT = '#import "RNFBAppCheckModule.h"';

/**
 * 把 `RNFBAppCheckModule.sharedInstance()` 插在 `FirebaseApp.configure()` 上面一行。
 *
 * `offset: 0` 是「插在錨點那一行之前」。這一格就是這支外掛的全部目的，寫錯方向的話
 * 一切照跑、只是沒有效果——與現在這個 bug 一模一樣的無聲失敗。
 */
function addSharedInstanceCall(contents) {
  if (contents.includes(CALL)) return contents;
  if (!contents.includes(ANCHOR)) {
    throw new Error(
      `[${TAG}] 在 AppDelegate 裡找不到 \`${ANCHOR}\`。` +
        '這一行是 @react-native-firebase/app 那支外掛插進去的——' +
        '請確認它排在本外掛前面（見 app.json 的 plugins 順序）。',
    );
  }
  return mergeContents({
    src: contents,
    newSrc: `    ${CALL}`,
    tag: TAG,
    anchor: new RegExp(ANCHOR.replace(/[.()]/g, '\\$&')),
    offset: 0,
    comment: '//',
  }).contents;
}

/**
 * bridging header 補上那一行 import，Swift 才叫得到那個 Objective-C 類別。
 *
 * 檔名跟著 Xcode 專案名字走（這支 app 是 `JPVocab`），所以用找的不用寫死——
 * 哪天 `app.json` 的 `name` 改了，寫死的那個名字會安靜地失效。
 */
function addBridgingHeaderImport(projectRoot) {
  const sourceRoot = IOSConfig.Paths.getSourceRoot(projectRoot);
  const found = fs
    .readdirSync(sourceRoot)
    .filter((name) => name.endsWith('-Bridging-Header.h'));
  if (found.length !== 1) {
    throw new Error(
      `[${TAG}] 在 ${sourceRoot} 底下預期剛好一份 *-Bridging-Header.h，實際找到 ${found.length} 份。`,
    );
  }
  const header = path.join(sourceRoot, found[0]);
  const contents = fs.readFileSync(header, 'utf8');
  if (contents.includes(IMPORT)) return;
  fs.writeFileSync(header, `${contents.trimEnd()}\n${IMPORT}\n`);
}

/** @type {import('@expo/config-plugins').ConfigPlugin} */
const withAppCheckFirst = (config) => {
  config = withAppDelegate(config, (modConfig) => {
    if (modConfig.modResults.language !== 'swift') {
      throw new Error(
        `[${TAG}] 只處理 Swift 的 AppDelegate，這一份是 ${modConfig.modResults.language}。`,
      );
    }
    modConfig.modResults.contents = addSharedInstanceCall(modConfig.modResults.contents);
    return modConfig;
  });

  // bridging header 不在 `withAppDelegate` 的管轄內，只能自己動檔案。
  return withDangerousMod(config, [
    'ios',
    (modConfig) => {
      addBridgingHeaderImport(modConfig.modRequest.projectRoot);
      return modConfig;
    },
  ]);
};

module.exports = withAppCheckFirst;
