# 07 — 保險副本防的那個威脅在 React Native 上不存在了，要不要留

Status: done
Type: enhancement
Blocked by: 04

決策背景見 `../spec.md` 的〈原生功能〉、`ADR-0002` 的 2026-08-18 補充、`ADR-0015`。

## 為什麼有這張票

票 `04` 動工時發現的：**保險副本原本防的那件事，React Native 版上不會再發生。**

Capacitor 版的 iOS app 骨子裡是一個瀏覽器視窗（WKWebView），資料存在那個視窗的 `localStorage` 裡。iOS 把 WebView 的 `localStorage` 歸類成「網站資料」，跟 Safari 的快取同一類——**手機空間不夠時系統會自己清掉，不會問使用者。** 對 Safari 來說沒差，網站重載就好；對這支 app 來說，那就是全部卡片與複習進度一起消失。

保險副本就是為這件事做的：每存一次本機，多抄一份到 App Group 的 `UserDefaults`（app 自己的設定檔，不屬於「網站資料」，系統不清）。開 app 時發現 `localStorage` 空了而副本還在，就寫回去。

**React Native 版沒有 WebView。** MMKV 存的是 app 文件夾（`Documents/`）底下一個檔，跟使用者匯出的備份檔同一類。iOS 從來不清這個位置，它只清快取。

清得掉 MMKV 的只剩兩種：使用者自己刪掉整支 app（副本住在同一個容器裡，一起沒了），或者那個檔損毀。

## 要決定什麼

保險副本在 React Native 版上要不要留。三種答案各有代價：

- **不留。** `core/lib/safety-copy.ts` 與它那 14 條測試留著給 Capacitor 版用（那一版還在 `ios/`，隨時可能被裝回手機），React Native 這一側不接。代價是 `../spec.md` 的〈原生功能〉寫著「五項全部要在 React Native 上重接」，那句話要訂正，`ADR-0015` 講審查準則 4.2 的那一段也要一起看——不過保險副本本來就不是使用者看得到的功能，拿它當 4.2 的實質內容本來就勉強。
- **留，理由換成防檔案損毀。** MMKV 自己有 `recoveryStrategy: 'recover-on-error'` 這個選項，先問清楚它涵蓋到哪裡，副本要補的是它補不到的哪一段。沒問清楚就留，等於留一個講不出理由的東西。
- **留，理由換成別的。** 例如將來的主畫面 Widget 要讀得到資料（`ios-app` spec 決定九當初選 App Group 就是為了這個）。但 Widget 明寫不在 `../spec.md` 的範圍內，所以這條要先有人想做 Widget 才成立。

## 這張票不做的事

- **不碰 Capacitor 版。** `ios/App/App/SafetyCopyPlugin.swift` 與 `src/lib/safety-copy-native.ts` 一個字不改。那一版的威脅是真的。
- **不改 `core/lib/safety-copy.ts` 的行為。** 它是純邏輯、測得到、現在也還在被 Capacitor 版用。要動的是「React Native 這一側接不接它」。

## 現況

票 `04` 已經把 MMKV 接上去了，**副本沒有實作**——`mobile/` 底下完全沒有第二份寫入。所以現在的狀態就是上面第一種答案，只是還沒正式拍板、文件也還沒訂正。

票 `04` 的驗收第 5 條（清掉主儲存、重開、資料從副本回來）因此收不掉，記在那張票的 Comments 裡。

## 驗收

- [x] 保險副本在 React Native 版的去留有正式答案，理由寫得出來
- [x] `../spec.md`〈原生功能〉與 `ADR-0017` 的「五項」訂正，不再與 `ADR-0015` 打架
- [x] `mobile/` 底下沒有任何暗示保險副本存在的殘留
- [x] Capacitor 版一個字未改（`ios/App/App/SafetyCopyPlugin.swift`、`src/lib/safety-copy-native.ts`、`core/lib/safety-copy.ts`）
- [x] 票 `04` 的驗收第 5 條收掉
- [x] `createMmkvStorage()` 確實帶 `recoveryStrategy: 'recover-on-error'`，且 `mobile/README.md`、
      `ADR-0002` 的說法與程式碼對得起來（人工對照，沒有自動測試，理由見下方 Comments）
- [x] `mobile/npm test` 與 repo 根的 `npm test` 都綠燈 — 175 條與 626 條，兩邊全過；
      兩處 `npx tsc --noEmit` 也乾淨

## Comments

### 2026-08-27 — 拍板：不留。順手把 MMKV 損毀時的行為也定了

**答案是第一種：不留。** 保險副本防的是 iOS 清掉 WebView 那一層的網站資料，
React Native 版沒有 WebView，威脅不存在。留一個防不到東西的機制，下次讀 code 的人
得再推理一次它為什麼在。

**票裡擔心的 4.2 那一段，查下去發現是虛驚。** `ADR-0015` 自己數的就是**四項**：
提醒、原生語音、Keychain、觸覺（該檔第 11 行與第 37 行都是四項），保險副本是用「另外」
帶出來的附加項，從來不在 4.2 的名單裡。把它算成五項之一的是 `../spec.md` 與 `ADR-0017`
這兩處**後來寫的轉述**。所以這次不是拿掉一項實質內容，是把轉述改回 ADR 的原話，
`ADR-0015` 本身一個字未改。

#### 順手定掉的另一件事：檔案損毀時退回上一版，不歸零

決策過程中維護者問「不留副本的話，檔案損毀怎麼辦」，追下去發現一件本來沒人知道的事。

`react-native-mmkv` 的 `recoveryStrategy` 沒設時，會把 `std::nullopt` 傳給上游
（`cpp/HybridMMKV.cpp:260-262`）。上游 Tencent MMKV 2.4.0 對這個欄位的註解寫著
`// if not set, use the old style callback`（`Core/MMKV.h:89`），而那個舊式回呼要先有人
註冊 handler 才生效——`react-native-mmkv` 從沒註冊過。沒 handler 時上游直接回
`OnErrorDiscard`（`Core/MMKV.cpp:1725-1737`）。

**所以現狀是：檔案的對帳碼或長度對不上，整格丟掉，app 開起來像剛裝好的。**
使用者的單字本、卡片、複習進度全部歸零。有一道緩衝——MMKV 會先試上一次確認過的對帳碼
（`Core/MMKV_IO.cpp:341-346`），過了就正常載入，走不到這個岔路。

已改成 `'recover-on-error'`。它走 `greedyDecodeMap`（`Core/MiniPBCoder.cpp:504-535`）：
從檔案開頭一筆一筆讀，讀到壞掉那筆接住例外、保留已讀到的就收工。MMKV 存檔是**往後接、
不覆寫**，壞掉的通常是尾巴那筆（正是寫失敗的那一次），所以救回來的是**上一次成功寫入的
完整版本**。切分以「一格」為單位，不會生出半份 JSON，因此也不會把殘缺資料推上雲端蓋掉好的。
沒有舊版可退時（例如上次剛做過整理壓縮）結果與丟掉相同——**退一版是常見情況，不是保證**，
但這個設定只會比預設好，不會比較差。

這條路純本機，與雲端備份無關。雲端那邊 AES-GCM 自帶完整性檢查，內容壞掉是解不開，
丟 `RejectedByCloud`、畫面說「密碼不對」，本機資料一個字不動（`core/lib/cloud-backup.ts` 的 `open()`）。

#### 動到的東西

**程式碼兩處。**

1. `mobile/lib/storage-mmkv.ts`：`createMMKV()` 加上 `recoveryStrategy: 'recover-on-error'`，
   註解寫進上面那段溯源。
2. `mobile/jest.config.js`：`testMatch` 拿掉 `core/lib/safety-copy.test.ts`。讓它在 `mobile/`
   這台跑，等於暗示 React Native 這一側用得到保險副本。**那 14 條沒有損失**——repo 根的 vitest
   收的是 `core/**/*.test.ts`，照跑。

**文件五處。** `../spec.md`〈原生功能〉、`ADR-0017`、`ADR-0002`（拍板紀錄加損毀策略補充）、
`mobile/README.md`、`CONTEXT.md` 的詞條。

**`mobile/lib/review-session.ts` 的一行註解。** 它的「不做的事」名單上列著保險副本，
現在整個 React Native 版都不做，寫在單一畫面的名單裡會誤導，拿掉。

#### 沒動的東西

- **Capacitor 版一個字未改。** `ios/App/App/SafetyCopyPlugin.swift`、`src/lib/safety-copy-native.ts`、
  `core/lib/safety-copy.ts` 與它那 14 條測試。那一版的威脅是真的。
- **`ADR-0015` 一個字未改。** 它本來就寫對了，錯的是轉述它的那兩處。
- **票 `06` 與 `08` 的正文沒改。** 兩張都是 `done`，正文是當時的紀錄。票 `06` 第 53 行
  把保險副本列進「上架前要補齊的四項」，那句現在不成立，但正本是 `../spec.md` 與 ADR，
  已經訂正；改已收的票等於改歷史。
- **`docs/glossary.md` 沒改。** 那張表只管譯名與避用詞，兩版共用一個詞，沒有版本差異要記。

#### Code review 抓出來的三處，都改了

1. **`mobile/jest.config.js` 的數字沒校對。** 原本寫「目前收了四支」，實際列的是三支——
   那是票 `05` 加標答測試時就多算的舊帳。我第一版只把四減成三，等於把錯誤照抄下來。
   拿掉 `safety-copy` 之後正確數字是**兩支**，已訂正。
2. **`mobile/lib/review-session.ts` 的指路失效。** 拿掉「保險副本」之後，下一行仍寫著
   「名單的正本在票 `06`」，而票 `06` 第 53 行還列著保險副本（本票明講不改已收的票）。
   指路指到一份對不上的正本。照同段「觸覺已經不在名單上」的既有寫法補了一句，
   並指明以 `CONTEXT.md` 與 `ADR-0002` 為準。
3. **驗收沒有一條涵蓋 `recoveryStrategy`。** 它是這次唯一的行為變更，成功條件卻缺席
   （Karpathy 第四條）。補上一條人工對照的驗收。

另外兩點記下來但沒改：`ADR-0002` 那段機制描述與 `storage-mmkv.ts` 的 JSDoc 近乎重複，
已把 ADR 那邊收成「立場加指路」，正本留在程式碼旁邊；`AES-GCM` 沒附中英文全名，
但 repo 既有六處都不展開，沿用既有寫法。

#### 剩下要人做的

**`recover-on-error` 沒有自動測試守著，這是刻意的。** 測試環境走的是 MMKV 自帶的假實作
（資料在記憶體裡，見 `mobile/test/nitro-modules-stub.ts`），碰不到檔案損毀那條路；
要為它寫測試只能去斷言「我們有沒有傳這個字串」，那是在測自己剛打的字。真要驗得弄壞
真機上的檔案，成本與風險都不成比例，不做。

**票 `03` 的驗收第 5 條仍然開著**——iOS 26 以下的退回行為要一支 iOS 16.4 到 25 的 iPhone，
這次沒有進展。

**票 `12` 的相依守門還在等真機測完再問。**
