const path = require('node:path');

/** Jest 的設定值吃的是 POSIX 斜線，Windows 上 `path.resolve` 給的是反斜線。 */
const coreRoot = path.resolve(__dirname, '..', 'core').split(path.sep).join('/');

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
  // 目前收了四支。其餘 core 測試何時接進來另外決定——
  // 其中兩支（app-name、cloud-backup）綁著網頁版的工具鏈，接進來要先各自想辦法。
  //
  // 標答那一支（`cloud-crypto-vectors`）在這裡跑的是 **Node 內建的加解密**，不是手機上那份
  // quick-crypto——那個套件底下是 C++，在 Node 裡一被 import 就當場爆。所以它在這裡綠燈
  // **不代表手機那一半是對的**，守的是「標答表與 `cloud-crypto.ts` 沒走鐘、在 React Native
  // 這套工具鏈底下也載得進來」。真正驗手機那一半的是 `lib/crypto-self-check.ts`，
  // 它要在裝置或模擬器上跑（票 `05`）。
  testMatch: [
    '<rootDir>/**/*.test.ts',
    `${coreRoot}/lib/storage.test.ts`,
    `${coreRoot}/lib/safety-copy.test.ts`,
    `${coreRoot}/lib/cloud-crypto-vectors.test.ts`,
  ],
  // 跑 core 的測試就要看得到 core 的檔，Jest 預設只看 rootDir 底下。
  roots: ['<rootDir>', coreRoot],
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
