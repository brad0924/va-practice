const path = require('node:path');

/** Jest 的設定值吃的是 POSIX 斜線，Windows 上 `path.resolve` 給的是反斜線。 */
const toPosix = (absolute) => absolute.split(path.sep).join('/');
const coreRoot = toPosix(path.resolve(__dirname, '..', 'core'));
const mobileModules = toPosix(path.resolve(__dirname, 'node_modules'));

/**
 * React Native 這一側的測試環境（票 `04`）。
 *
 * 為什麼不是 vitest：`react-native-mmkv` 這類套件一被 import 進來就會去問「我跑在
 * 哪台手機上」，vitest 那台小機器答不出來。`jest-expo` 是 Expo 官方的預設設定，
 * 它把 React Native 的寫法翻譯成 Node 讀得懂的樣子，並讓套件認出「現在是在測試」，
 * 自己切到假實作——MMKV 就內建一份，資料存在記憶體裡，介面與真的一模一樣。
 *
 * 網頁版仍然跑 vitest（repo 根的 `npm test`）。兩台機器各跑各的，沒有取代關係。
 */
module.exports = {
  preset: 'jest-expo/ios',
  // 目前收了兩支。其餘 core 測試何時接進來另外決定——
  // 其中兩支（app-name、cloud-backup）綁著網頁版的工具鏈，接進來要先各自想辦法。
  //
  // `safety-copy` 本來也在這裡，票 `07` 拿掉了：保險副本在 React Native 這一側不接，
  // 讓它在這台跑等於暗示 `mobile/` 用得到它。那 14 條沒有損失，repo 根的 vitest
  // 收的是 `core/**/*.test.ts`，照跑。
  //
  // 標答那一支（`cloud-crypto-vectors`）在這裡跑的是 **Node 內建的加解密**，不是手機上那份
  // quick-crypto——那個套件底下是 C++，在 Node 裡一被 import 就當場爆。所以它在這裡綠燈
  // **不代表手機那一半是對的**，守的是「標答表與 `cloud-crypto.ts` 沒走鐘、在 React Native
  // 這套工具鏈底下也載得進來」。真正驗手機那一半的是 `lib/crypto-self-check.ts`，
  // 它要在裝置或模擬器上跑（票 `05`）。
  testMatch: [
    // `.tsx` 是畫面測試（票 `06` 起）。純邏輯那幾支仍是 `.ts`。
    '<rootDir>/**/*.test.ts',
    '<rootDir>/**/*.test.tsx',
    `${coreRoot}/lib/storage.test.ts`,
    `${coreRoot}/lib/cloud-crypto-vectors.test.ts`,
  ],
  // 跑 core 的測試就要看得到 core 的檔，Jest 預設只看 rootDir 底下。
  roots: ['<rootDir>', coreRoot],
  /**
   * 找套件時多看一個地方：`mobile/node_modules`。
   *
   * 找套件的規矩是**從用它的那個檔往上層走**。`core/` 住在 `mobile/` 外面，所以從
   * `core/i18n/index.ts` 往上走會走到 repo 根，永遠走不進 `mobile/node_modules`。
   * 本機看不出問題——repo 根自己也有一份 `node_modules`，剛好接住了。
   * CI 上那個工作只在 `mobile/` 裡裝套件，根目錄是空的，`core/` 底下的檔就整批載不進來。
   *
   * 缺的那個是 `@babel/runtime`（babel 轉譯後的程式碼會去叫它的小工具），
   * 它同時被列進 `package.json`，不靠「剛好有別的套件把它帶進來」。
   */
  moduleDirectories: ['node_modules', mobileModules],
  moduleNameMapper: {
    // 與 metro.config.js、tsconfig.json 是同一件事的第三半：那兩邊管手機與型別，這邊管測試。
    '^@core/(.*)$': `${coreRoot}/$1`,
    // core 的測試檔一行未改，仍寫著 `from 'vitest'`。理由見 test/vitest-shim.ts。
    '^vitest$': '<rootDir>/test/vitest-shim.ts',
    // MMKV 底下那層 C++ 的接線，在 Node 裡 import 就丟例外。理由見 test/nitro-modules-stub.ts。
    '^react-native-nitro-modules$': '<rootDir>/test/nitro-modules-stub.ts',
  },
  // 介面語言在每支測試開跑前接上繁體中文，與網頁版共用同一支（理由見該檔）。
  setupFilesAfterEnv: [`${coreRoot}/test-setup.ts`],
};
