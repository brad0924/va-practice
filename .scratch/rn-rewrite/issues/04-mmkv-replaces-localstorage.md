# 04 — MMKV 頂替 `localStorage`，同步介面原封不動

Status: done
Type: enhancement
Blocked by: 02, 03

決策背景見 `../spec.md` 的〈儲存〉。

## 為什麼有這張票

`localStorage` 是瀏覽器的東西，React Native 上沒有。而它是唯一真相來源（`ADR-0002`），純邏輯層有 27 處在用。

React Native 官方給的 `AsyncStorage` 是非同步的——改下去會傳染到每一個呼叫端，連同呼叫它們的地方一起改。**`react-native-mmkv` 是完全同步的**（走 JSI），所以 `StorageLike` 這個同步介面可以原封搬過去，27 處一行不改。

`ADR-0015` 當初否決 React Native，第一條理由就是「儲存是非同步的」。**這張票要證明那條理由已經不成立。** 排在畫面之前，是因為它若不成立，後面全部要重新規劃。

## 要做什麼

在 React Native 那邊做一個 `StorageLike` 的 MMKV 實作，讓 `createStore()` 吃得下去。

介面就是現有那個，不新增方法、不改簽章。

> **保險副本這一段已經作廢（2026-08-25 動工時訂正）。** 原本要求是：
>
> > **保險副本仍然是唯讀的救援管道，不是第二個真相來源**（`ADR-0015`）。程式任何時候讀的都是主儲存，副本只有一個用途：啟動時發現主儲存空白而副本有東西，才寫回去。這個行為照搬，不要趁機改設計。
>
> 動工時發現**它防的那個威脅在 React Native 上不存在了**——它防的是 iOS 清掉 WebView 那一層的網站資料，而 MMKV 存的是 app 文件夾底下的檔，系統不清那個位置。維護者因此拍板：**這張票不做保險副本**，去留另開票 `07` 決定。驗收第 5 條跟著收不掉。

## 這張票不做的事

- **不改 `StorageLike` 介面。** 一旦發現非改不可，那不是這張票的事——停下來，那代表整個架構要重看，見 `../spec.md`。
- **不碰雲端備份與加解密。** 那是票 `05`。
- **不做資料搬遷。** Capacitor 版與 React Native 版是兩支不同的 app，各自的資料互不相通。使用者要搬資料走的是雲端備份或匯出檔那條既有的路。

## 驗收

- [x] React Native 上有一個 MMKV 版的 `StorageLike`，`createStore()` 直接吃得下
- [~] `StorageLike` 介面與呼叫端一行未改；`core/` 內部有一處瀏覽器 API 要補，見下方 Comments
- [x] 邏輯層的儲存測試在 React Native 環境跑得過（jest-expo，115 條全過）
- [x] 真機上存一批卡、關掉 app、重開，資料還在 — 2026-08-25 驗過，數字一模一樣
- [~] 保險副本的救援行為驗過：清掉主儲存、重開，資料從副本回來 — **這張票不做**，
      它防的那個威脅在 React Native 上不存在了，另開票 `07` 決定去留

## Comments

### 2026-08-25 — 真機驗過了，資料撐得過關機

出了新的 EAS Build 裝進 iPhone，按幾下「加 5 張卡」、**把 app 從背景滑掉**、重開，
畫面上的本數與卡數跟關掉之前一模一樣。

**這一條就是這張票排在畫面之前的理由。** 它問的不是 MMKV 好不好用，是「同步的 `StorageLike`
真的頂得上去嗎」——`ADR-0015` 當初否決 React Native 的第一條理由就是「儲存是非同步的」。
現在那條理由正式不成立，後面的畫面票不必為儲存重新規劃。

自動測試碰不到「關掉再開」那一段（它跑在記憶體裡的假實作上），所以這一條非得人做不可。
同時被它一起驗掉的還有 `crypto.randomUUID()` 那個補丁——按鈕走的是 `addBook()`，
補丁沒生效的話一按就當場丟例外，而它沒有。

**驗收五條的收法**：1、3、4 打勾；2 打勾但有一處例外（見下方「呼叫端一行未改」那節）；
5 這張票不做，去留在票 `07`。

**票 `03` 的驗收第 5 條仍然開著**——iOS 26 以下的退回行為要一支 iOS 16.4 到 25 的 iPhone，
這次手邊還是沒有。維護者要求往後每收掉一張票都要提醒一次。

### 2026-08-25 — MMKV 接上了，剩真機那一步要人

`createStore()` 吃得下 MMKV，`core/` 的 27 處呼叫端一行沒改。Metro 打得出包（640 個模組，
原本 587），根 repo 的 617 條測試前後一致。**剩下的是裝進真機按按鈕**，那一步只有人做得到。

#### 動工前兩題拍板

| 題目 | 決定 |
| --- | --- |
| React Native 的測試環境 | **架 jest-expo**，這一輪只收 `storage.test.ts` 與 `safety-copy.test.ts` |
| 保險副本 | **這張票不做**，另開票 `07` 決定去留 |

第一題票 `03` 原本整題留給票 `05`，是這張票的驗收第 3 條把它提前的。

**要更正一句動工前講過的話**：當時說「架起來票 `05` 直接接得上」，講太滿了。票 `05` 要驗的是
加解密的位元級相容，而 `react-native-quick-crypto` 的加解密是原生 C++ 寫的——jest-expo 給的是
假答案，假答案加出來的密文沒有驗證價值。jest-expo 對票 `05` 有幫助（純 TypeScript 的部分測得到），
但收不掉它。

#### 「呼叫端一行未改」有一個例外，而且不在呼叫端

`core/lib/storage.ts` 自己有三處呼叫 `crypto.randomUUID()`——新增單字本、匯入單字撞號時換識別碼、
把沒有歸屬的卡收攏成一本。**那是瀏覽器的全域函式，React Native 0.86 與 Expo SDK 57 都沒有**
（`expo/` 與 `react-native/` 兩個目錄整個翻過，一處都沒有）。

所以票上「27 處呼叫端一行不改」成立，但 `core/` 內部這一處要靠補丁才跑得動。補丁在
`mobile/lib/install-random-uuid.ts`，接在 `index.ts` 第一行，用 `expo-crypto` 的 `randomUUID()`
填上去，已經有的話不蓋掉。**`core/` 一行程式碼都沒改。**

（`core/lib/storage.ts` 動了兩行**註解**：模組開頭原本寫「目前實作為瀏覽器本機儲存」，
`StorageLike` 上方原本寫「localStorage 的最小介面」——這兩句現在都不對了。改的是說明，
不是行為，`git diff` 只有那兩行。）

**這件事自動測試看不到。** jest-expo 跑在 Node 上，Node 自己就有 `crypto.randomUUID`，
少了補丁測試照樣全綠，手機上才會爆。所以探針畫面那顆按鈕刻意走 `addBook()`——它內部就會叫到
那個函式，補丁沒生效的話一按就當場丟例外。真機驗收那條是它唯一的守門員。

#### jest-expo 怎麼架的

`jest-expo` 是 Expo 官方的測試預設設定。要它不要 vitest 的理由只有一個：`react-native-mmkv`
這類套件一被 import 進來就會去問「我跑在哪台手機上」，vitest 那台小機器答不出來。

**`core/` 的測試檔一行未改**，仍寫著 `from 'vitest'`。改的是「vitest 這個名字指到哪裡」——
`jest.config.js` 的 `moduleNameMapper` 把它指到 `test/vitest-shim.ts`，那支再把 Jest 的同名工具
原封轉出去。只轉 `core/` 真的用到的五樣，缺哪一樣當場就說 `xxx is not a function`。

另外要一個空殼：`react-native-nitro-modules` 是 MMKV 底下那層 C++ 的接線，在 Node 裡**被 import
的當場**就丟例外，不是等到有人叫它才丟。而測試一次都不會用到它——`createMMKV()` 進門先問
「我是不是跑在測試裡」，是的話直接切到套件自帶的假實作。理由寫在 `test/nitro-modules-stub.ts`。

`babel.config.js` 也是這次補的。Metro 有自己的預設，不需要它；Jest 這一側沒有，少了它連
`@react-native/jest-preset` 自己那支 setup 都解析不了。

#### 四個實作決定

1. **MMKV 只開一格**（`id: 'va-practice'`）。整份資料、介面語言、Gemini 金鑰、提醒開關各占一個鍵，
   與網頁版的 `localStorage` 一模一樣。分成好幾格只會多出「哪一格在哪裡」這個要記的東西。
2. **不開 MMKV 的加密。** 資料躺在 app 私有的文件夾裡，iOS 的 Data Protection 本來就鎖著它，
   多一把自己管的鑰匙只是多一個弄丟的機會。而且 `app.json` 的 `ITSAppUsesNonExemptEncryption: false`
   現在還是真的，開下去就不是了（票 `05` 會讓那個值重新變成問題，見 `mobile/README.md`）。
3. **不設 App Group。** MMKV 支援（在 `Info.plist` 放一個 `AppGroup` 鍵就會改寫進共用容器），
   但沒有東西需要共用：Widget 不在 `../spec.md` 的範圍，而 Capacitor 版那份副本存在
   `UserDefaults` 裡，MMKV 本來就讀不到。
4. **唯一要換算的是「沒存過」。** MMKV 的 `getString()` 給的是 `undefined`，而 `storage.ts` 拿
   `raw === null` 判斷「這台裝置是不是全新的」。漏掉這一層，全新裝置會走進
   `JSON.parse(undefined)` 而不是初始化成新使用者。測試第一條守的就是它。

#### `@core/` 的別名接了三處

| 檔 | 管什麼 |
| --- | --- |
| `mobile/tsconfig.json` 的 `paths` | `tsc --noEmit` 看不看得懂 |
| `mobile/metro.config.js` 的 `resolveRequest` 與 `watchFolders` | 手機上找不找得到檔、改了會不會刷新 |
| `mobile/jest.config.js` 的 `moduleNameMapper` 與 `roots` | 測試找不找得到檔 |

加上網頁版原本那四處，這個別名現在在**七個地方**各記了一次。清單寫在根 `tsconfig.json` 的
`paths` 上方，`core/` 換位置時七處要一起改。

Metro 那邊刻意不用 `resolver.extraNodeModules`：那張表是照套件名查的，而 `@` 開頭在 npm 的規矩裡
是 scope，`@core/lib` 整段會被當成套件名，`@core` 這一格永遠對不上。

#### 探針畫面多了一塊

`App.tsx` 仍是探針，不是任何一頁正式介面。玻璃那一塊原封不動（票 `03` 的驗收第 5 條還開著，
那個畫面還要用），底下多一塊：一行字報告 `N 本 · M 張卡`，一顆「加 5 張卡」的按鈕。

一次加五張而不是一張——一張看不出整份資料有沒有完整寫回去。

#### Code review 抓出來的四處，都改了

1. **探針畫面本來會多帶一個原生模組進包裡。** 原本用 `expo-localization` 問裝置語言，
   照著網頁版 `src/app.ts` 那行寫。但探針畫面自己那幾行字本來就是寫死的中文，查表只在資料壞掉
   要顯示錯誤時才用得到——為那一句話多一個原生相依不划算，而且「跟著裝置語言走」是票 `06` 的題目。
   改成寫死 `'zh-TW'`，`expo-localization` 移除，`app.json` 回到一個字未改。
2. **`store.load()` 沒接住例外。** 資料壞掉時它會丟出帶 key 的錯（`ADR-0013`），沒接住的話畫面
   直接掛掉，人看到一片空白——正好在最需要它說話的那一刻失聲。現在讀不出來就顯示「MMKV：讀不出來」
   加那句錯誤，不捏一份假的空資料頂上去。
3. **探針卡片的詞條會撞號。** 原本每批都從 1 編到 5，按第二次就跟第一次撞在一起，
   存進去的是一份這支 app 自己不接受的資料（詞條全域唯一）。改成接著現有張數往下數。
4. **票的正文與驗收自相矛盾。** 〈要做什麼〉還寫著保險副本「照搬」，驗收第 5 條卻寫「不做」。
   正文那段改成引言方塊，寫明它作廢與作廢的理由；`../spec.md` 的〈原生功能〉也補了一條——
   那裡的「五項」在票 `07` 拍板之前讀作「四項加一項待決」。

#### 記下來但這張票不改的

- **`mobile/` 的測試不在 CI 裡跑。** `deploy.yml` 跑的是根 repo 的 `npm test`，而且它的
  `paths-ignore` 刻意排除 `mobile/**`（票 `03` 加的，理由是 React Native 的改動不該重新部署網頁版）。
  所以 `mobile/npm test` 現在只有人在本機跑才會跑到。`../spec.md` 說加解密的標答測試是「CI 綠燈的前提」，
  那件事要在票 `05` 一起解。
- **`core/lib/cloud-crypto.ts` 用的 `crypto.subtle` 同樣不存在。** 與上面那個 `randomUUID` 是同一類
  問題，但那是票 `05` 的正題（`react-native-quick-crypto`），這裡不預先補。
- **`coreRoot` 那一行在 `metro.config.js` 與 `jest.config.js` 各算一次。** Code review 建議抽成
  共用檔。沒抽：兩邊要的格式不一樣（Metro 吃系統原生的路徑分隔符號，Jest 的設定值吃 POSIX 斜線），
  為兩行加一層 import 換不到什麼。它已經在根 `tsconfig.json` 那張七處清單裡。
- **票 `03` 的驗收第 5 條還開著**：iOS 26 以下的退回行為要一支舊 iPhone 才驗得到。這次沒有進展。

#### 剩下要人做的

1. `eas build --profile development --platform ios` 出一個新包——加了原生模組（MMKV 與它底下的
   Nitro），舊的那個包載不動新的 JavaScript。
2. 裝進 iPhone，按幾下「加 5 張卡」，**把 app 從背景滑掉**，重開。數字要跟關掉之前一樣。
3. 結果寫回本節。
