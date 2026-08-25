# mobile — React Native 版 iOS app

iOS 版改寫成 React Native 的專案本體。決策背景見 `.scratch/rn-rewrite/spec.md` 與
`docs/adr/0017-react-native-rewrite-for-liquid-glass.md`，這一份只寫「怎麼跑、怎麼出包」。

**現在裡面只有探針畫面，不是任何一頁正式介面**：一塊 `GlassView` 墊在斜條紋背景上（票
`03`），底下四塊狀態方塊——一塊報告玻璃的可用性檢查，一塊報告 MMKV 裡有幾本幾張卡，附一顆
「加 5 張卡」的按鈕（票 `04`），一塊報告雲端備份的標答比對過了沒，一塊可以輸入暱稱密碼真的
推拉一次備份（票 `05`）。複習畫面是票 `06`，那時整支 `App.tsx` 會被換掉，
`lib/cloud-probe.ts` 也跟著刪掉。

> **雲端那塊按不動，要等標答比對跑完。** 兩件事都會抽 12 個位元組當初始向量，而比對期間
> 亂數來源被換成表裡那個固定值。重疊的話，推上去那份會用到一個**公開在版控裡**的初始向量——
> 同一把金鑰配同一個初始向量，AES-GCM 的保護就整個垮了。同理，開 app 時也不自動接回雲端。

## 這個目錄與 repo 其他部分的關係

- **自己一份 `package.json` 與 `node_modules`**，不走 npm workspaces。網頁版在 repo 根，
  兩邊的相依套件完全不重疊，混在一起只會互相拖累。
- **共用邏輯在 repo 根的 `core/`**（票 `02`），用 `@core/` 這個別名取，寫法與網頁版一模一樣。
  接線在三個地方（型別、Metro、測試），見底下〈`@core/` 接在哪三處〉。
- **app 圖示不要手動放進 `assets/`。** 它由 repo 根的 `npm run icons` 從 `scripts/icon.svg`
  寫出來，跟 Capacitor 版與網頁版是同一份母檔。`scripts/generate-icons.test.mjs` 會逐像素比對。

## 在 Windows 上開發

```
cd mobile
npm install
npm start
```

`npm start` 起的是 Metro（簡單說就是一台把程式碼即時送進手機的小伺服器）。手機上要先裝好
下面那個 **development 版**，開起來就會連上這一台，改完檔案手機上直接刷新。

手機與電腦要在同一個網路。用 iPhone 開熱點、電腦連上去最省事。

**不要用 Expo Go 開這支 app。** Expo Go 裡沒有 `expo-glass-effect` 的原生模組，
`App.tsx` 一載入就會丟例外。這一點刻意不用 try/catch 包起來——原生模組不在的時候整支
app 本來就是壞的，把錯誤吞掉只會讓人花更久才查出是包沒編對。

## 跑測試

```
cd mobile
npm test
```

跑的是 **jest-expo**，Expo 官方的測試預設設定。它做三件事：把 React Native 的寫法翻譯成
Node 讀得懂的樣子、幫 `react-native` 與 `expo-*` 那批套件備好假答案讓 import 過得去、
讓套件認出「現在是在測試」自己切到假實作——`react-native-mmkv` 就內建一份，資料存在記憶體裡，
介面與真的一模一樣。

**為什麼不是網頁版那台 vitest**：`react-native-mmkv` 這類套件一被 import 進來就會去問
「我跑在哪台手機上」，vitest 那台答不出來，當場就爆。兩台機器各跑各的，沒有取代關係——
網頁版仍然跑 repo 根的 `npm test`。

現在收進來的是四支：`mobile/lib/storage-mmkv.test.ts`，加上 `core/lib/` 的
`storage.test.ts`、`safety-copy.test.ts` 與 `cloud-crypto-vectors.test.ts`。
**`core/` 那三支一行未改**，仍寫著 `from 'vitest'`——改的是「vitest 這個名字指到哪裡」，
接線見 `test/vitest-shim.ts`。

其餘 `core/` 測試何時接進來還沒決定。其中兩支（`app-name`、`cloud-backup`）綁著網頁版的
工具鏈，要各自先想辦法。

> **標答那一支在這裡跑的是 Node 內建的加解密，不是手機上那份。** `react-native-quick-crypto`
> 底下是 C++，在 Node 裡一被 import 就當場爆。所以它在這裡綠燈**不代表手機那一半是對的**，
> 守的是「標答表與 `cloud-crypto.ts` 沒走鐘」。真正驗手機那一半的是
> `lib/crypto-self-check.ts`，它要在裝置或模擬器上跑，見底下〈雲端備份怎麼加密〉。

`mobile/` 的測試現在跑得進 CI（Continuous Integration，持續整合）了，票 `05` 加的
`.github/workflows/test.yml` 收了它。原本的 `deploy.yml` 沒變——那一支是**發佈**用的開關，
它的 `paths-ignore` 排除 `mobile/**` 對發佈是對的。

## `@core/` 接在哪三處

`core/` 在 `mobile/` 外面，所以三套工具各要被告知一次：

| 檔 | 管什麼 |
| --- | --- |
| `tsconfig.json` 的 `paths` | `npm run typecheck` 看不看得懂 |
| `metro.config.js` 的 `resolveRequest` 與 `watchFolders` | 手機上找不找得到檔、改了會不會刷新 |
| `jest.config.js` 的 `moduleNameMapper` 與 `roots` | `npm test` 找不找得到檔 |

加上網頁版那四處，這個別名一共記在七個地方。清單在 repo 根 `tsconfig.json` 的 `paths` 上方，
`core/` 換位置時七處要一起改。

Metro 那邊刻意**不用** `resolver.extraNodeModules`：那張表是照套件名查的，而 `@` 開頭在 npm
的規矩裡是 scope，`@core/lib` 整段會被當成套件名，`@core` 這一格永遠對不上。

## 資料存在哪裡

`react-native-mmkv`，一格叫 `va-practice`（票 `04`）。整份資料、介面語言、Gemini 金鑰、
提醒開關各占一個鍵，與網頁版的 `localStorage` 一模一樣。

**選它而不是 `AsyncStorage` 的理由只有一個：它是完全同步的**（走 JSI（JavaScript Interface，
JavaScript 與原生程式碼之間那條直通管道），簡單說就是 JavaScript 直接叫得動底下那層 C++，
不必等回覆）。`core/lib/storage.ts` 的 `StorageLike` 因此原封搬得過來，
27 處呼叫端一行不改。`AsyncStorage` 是非同步的，改下去會傳染到每一個呼叫端。

**沒開 MMKV 的加密。** 資料躺在 app 私有的文件夾裡，iOS 的 Data Protection 本來就鎖著它；
而且 `app.json` 的 `ITSAppUsesNonExemptEncryption: false` 現在還是真的，開下去就不是了。

**沒有保險副本。** Capacitor 版有一份，防的是 iOS 把 WebView 那層的網站資料清掉；React Native
版沒有 WebView，MMKV 存的是 app 文件夾底下的檔，系統不清那個位置。去留由票 `07` 決定。

**`crypto.randomUUID()`、`crypto.subtle`、`btoa()`／`atob()` 都是補上去的。** 瀏覽器裡這些
是免費附贈的，React Native 一個都沒有。補丁在 `lib/install-crypto.ts`，接在 `index.ts` 第一行，
三件事的順序不能換（見該檔）。自動測試看不到這件事（Node 自己全都有），所以探針畫面那顆按鈕
刻意走 `addBook()`——補丁沒生效的話一按就當場丟例外。

## 雲端備份怎麼加密

`core/lib/cloud-crypto.ts`，**與網頁版同一份程式碼、一個字沒改**。它叫的是全域的
`crypto.subtle`，而在手機上那個全域是 `react-native-quick-crypto` 頂上去的（票 `05`）。

要緊的是**兩邊加出來的東西要位元級相同**：同一個人用電腦存上去的備份，手機必須解得開，
反過來也一樣。這件事錯了不會當場報錯——存的時候一切正常，某天想還原才發現打不開。

守它的是一張寫死的標答表，`core/lib/cloud-crypto-vectors.json`。表裡六列，涵蓋純 ASCII、
日文、帶讀音標記的詞條、表情符號、日文暱稱與密碼，以及一份貼著雲端上限的長備份
（19,417 張卡）。

**那條上限量的是加密後那串 base64 的字數，不是明文的位元組數**——`core/lib/cloud-backup.ts`
擋的是 `payload.length`。所以那一列的密文是 4,194,112 字，離 `CLOUD_PAYLOAD_LIMIT`
只差 192 字。量錯尺的話做出來的是一份這支 app 根本不會送出去的備份，看起來有在守，
其實驗的是一個不存在的情況。

長的那一列不把內容存進版控，只存「拿這段重複幾次」與一串 64 字的指紋——明文是跑的當下
現場產生的。表由 `scripts/generate-crypto-vectors.mjs` 產生，不要手改。

三個地方各跑一次這張表：

| 誰跑 | 用哪一套加解密 | 什麼時候 |
| --- | --- | --- |
| `core/lib/cloud-crypto-vectors.test.ts`（vitest） | Node 內建的 | 每次推程式（`test.yml`） |
| 同一支測試（jest，`mobile/npm test`） | Node 內建的 | 同上 |
| `lib/crypto-self-check.ts` | quick-crypto | 開 app 時；CI 在模擬器裡（`mobile-crypto.yml`） |

**只有第三列驗得到真正的風險。** 前兩列守的是另一件事：標準答案不准漂。

對不上的時候不要繞路——把差在哪裡（哪一種明文、差在哪個位元組）記進
`.scratch/rn-rewrite/issues/05-crypto-golden-vectors.md` 的 `## Comments`。那是重新評估
整條路線的依據，不是一個 bug。

## 出包裝進真機（這一段要人做）

需要：Expo 帳號（EAS（Expo Application Services，Expo 的雲端建置服務）Build 有免費額度）、
已設定的 Apple 開發者帳號、一支 iPhone。

> ### 裝之前先做一次雲端備份
>
> 這支 app 的識別碼與 Capacitor 版是**同一組**（`io.github.brad0924.vapractice`），
> 所以 iPhone 會把它當成同一支 app **覆蓋掉**。現在天天在用的那支連同裡面的卡片會一起消失，
> 而這個骨架版沒有單字本、沒有複習畫面——手機上到票 `06` 之前都不會有能複習的東西。
>
> **裝之前先在 Capacitor 版做一次雲端備份。** 這一步不只是保險，它是**把資料交接給網頁版**：
> 兩邊共用同一份雲端備份，推上去之後在網頁版輸入同一組暱稱與密碼就接得回同一批卡片。
> 過渡期就在網頁版複習，這是維護者拍板時選的路。
>
> 想把 Capacitor 版裝回手機的話，要手動觸發 `.github/workflows/ios-testflight.yml`，
> 等 Apple 處理完再從 TestFlight 裝——而且它會反過來蓋掉這一版。識別碼只有一組，
> 手機上永遠只能有一支。

```
npm install -g eas-cli
eas login
eas init            # 在 Expo 後台建專案，會把 projectId 寫進 app.json
eas build --profile development --platform ios
```

`eas build` 第一次會問 Apple 帳號，然後自己去產憑證與 provisioning profile。跑完給一個
網址與 QR code（Quick Response code，方形的黑白掃描碼），用 iPhone 相機掃就裝得起來。

`eas.json` 裡有兩個 profile：

| profile | 用途 |
| --- | --- |
| `development` | 連 Metro 的開發版。改完程式碼手機上立刻看得到，日常開發用這個。 |
| `preview` | 不連 Metro 的獨立版。裝在**不跟電腦同一個網路的機器**上時只能用它——例如翻出一支舊 iPhone 來看 iOS 26 以下的退回長什麼樣。 |

兩個都是**內部發佈**（`distribution: internal`），不經過 App Store。

## 設定值為什麼長這樣

**`ios.bundleIdentifier`** — 沿用 Capacitor 版那一組，維護者拍板的選擇。代價見上面那格。

**`ios.deploymentTarget: "16.4"`** — 不是自己挑的，是 Expo 給的下限：`expo-modules-core`
的 podspec 寫死 iOS 16.4，SDK（Software Development Kit，軟體開發套件）57 底下沒有更低的
走法。spec 與 `ADR-0017` 原本寫「最低支援仍是 iOS 15」，已一併訂正。實際排除掉的是
iPhone 7 與更舊的機器。

**`userInterfaceStyle: "dark"`** — 網頁版只有深色一套配色（`src/styles.css` 的
`--bg: #141821`），沒有淺色版可跟。跟著系統走的話，使用者切到淺色模式時 `GlassView`
會變成淺色玻璃，配深色背景就髒了。

**`platforms: ["ios"]`** — 不做 Android，連帶把 Android 與網頁版的範本素材都刪掉了。

**`ITSAppUsesNonExemptEncryption: false`** — 出包時 EAS 問的那一題。

> ### 這個值現在是錯的，送審前一定要改
>
> 票 `05` 已經把 `react-native-quick-crypto` 接進來，用 PBKDF2 加 AES-GCM 把雲端備份鎖起來，
> 鑰匙是使用者的密碼。**那不是只走 HTTPS、也不是只拿來做身分驗證**，兩個最常見的豁免理由
> 都不適用；而且加密的那包 OpenSSL 是跟著 app 一起帶進去的，不是叫 Apple 系統內建的那份，
> 所以「只用了作業系統提供的加密」這條也走不通。
>
> 沒有馬上改掉，是因為改法牽到出口管制的申報，那屬於票 `ios-app 11`（送審）。
> 那張票另外要查：這個 repo 是公開的（`ios-testflight.yml` 靠 public repo 的免費 macOS
> runner 在跑），而原始碼公不公開會影響美國出口管制的分類。
>
> **在那張票拍板之前，這一版不要送審。** 反正 spec 也把上架擋著（見〈上架〉那一節）。

**啟動畫面** — app 圖示置中，底色 `#141821`。Capacitor 版那張是 `cap add ios` 留下的
Capacitor 商標配白底，從來沒換過，沒有東西可以沿用。
