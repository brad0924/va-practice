# iOS 版改寫成 React Native，為了 iOS 26 的 Liquid Glass

iOS 版離開 Capacitor 的 WKWebView，畫面層以 React Native 重寫，目的只有一個：拿到 iOS 26 的 **Liquid Glass**。網頁版留在原地繼續跑 GitHub Pages，不跟進這套外觀。

**畫面兩份，邏輯一份。** `src/lib/` 那批純邏輯（排程、儲存、雲端備份、加解密、讀音預填、提醒排程）抽成共用，網頁版與 React Native 各自只留自己的畫面碼。邏輯層分岔是這條路上最不能踩的線——雲端備份若有兩套實作在寫同一批資料，哪天解不開會查不出是誰寫壞的。

決策的完整經過見 `.scratch/rn-rewrite/spec.md`，本 ADR 只記錄路線本身。

## 這份與 `ADR-0015` 的關係

**`ADR-0015` 的結論被推翻，但它的證據沒有被推翻。** 那份留著不改寫，由這一份指回去。

`ADR-0015` 用一次實機盲測否決 React Native：兩支 app 裝在同一支 iPhone 上，蒙著滑完整張卡，**判斷之前分不出哪個是原生的**。那個結論今天依然成立——它回答的是「像不像原生」。

**這次問的是另一個問題：跟不跟得上 iOS 26。** 盲測是 2026-08-18 做的，那時系統還沒換上 Liquid Glass，這個差異當時量不到。現在別的 app 都長成那樣，這支擺在一起就顯得舊。同一支 app、同一個維護者，兩個問題的答案可以不一樣，而且確實不一樣。

**動機仍然不是「哪裡用起來不順」。** 這一點跟 `.scratch/swiftui-spike/issues/01` 與 `.scratch/rn-spike/issues/01` 兩度釘出來的一樣：講不出來。變的是判準——這次拿的不是「改完會不會更好用」，是「並排看起來還舊不舊」。

### `ADR-0015` 列的三個技術障礙，現在的狀態

那份 ADR 點名三處接不上，是否決 React Native 的技術依據。逐條重看：

- **`localStorage` 同步、`AsyncStorage` 非同步** — **已有解**。`react-native-mmkv` 是完全同步的（走 JSI，v4 是 Nitro Module），`ADR-0002` 的 `StorageLike` 同步介面可以原封搬過去，27 處呼叫端一行不改。當初寫 ADR 時只把 `AsyncStorage` 算進來。
- **`crypto.subtle` 沒有對應物** — **已有解，但要驗**。`react-native-quick-crypto` 的 `subtle` 支援 PBKDF2 與 AES-GCM。「有這個 API」不等於「加出來的東西網頁版解得開」，位元級相容仍是這條路上風險最高的一塊，驗法見 Consequences。
- **振假名沒有對應物** — **已經驗過做得出來**。`.scratch/rn-spike/issues/01` 用兩層 `<Text>` 疊字做完並在真機上量過：假名字身底端與漢字字身頂端的距離兩版皆為 15 device px，換行也驗了。這一題不必重問。

**它的代價還在，而且沒有消失。** 詞條被拆成多個 `<Text>` 之後，iOS 的長按選取跨不過去——**整串詞條選起來複製去查字典會做不到**。這次的處理是補一顆「複製詞條」按鈕，複製去掉讀音標記後的詞條原文，見 Consequences。

## 為什麼是 React Native，不是 SwiftUI

**維護者主要在 Windows 上開發。** React Native 用 Expo 開發、EAS Build 在雲端編譯，整條路在 Windows 上走得完——`.scratch/rn-spike/issues/01` 已經實際走過一次。SwiftUI 要 macOS 與 Xcode，可用時間只有週末在家那台 Mac。

這也是 `.scratch/swiftui-spike/issues/01` 當初否決 React Native 的理由**反過來**的地方。那張票的動機是「想寫原生」，React Native 買不到（還是 TypeScript），所以出局。**這次的動機是 Liquid Glass，跟寫哪種語言無關**，那個否決理由跟著失效。

代價是 Liquid Glass 在 React Native 上要靠第三方套件包系統元件（`expo-glass-effect` 的 `GlassView` 包的是 `UIVisualEffectView`），不是 Apple 第一手的 `.glassEffect()`。

## Considered Options

- **留在 WebView，用 CSS 把 Liquid Glass 做像**：改動全在 `src/` 裡，網頁版與 iOS 版一起變，風險最低。**否決的理由是它做不到**：Liquid Glass 的關鍵是折射，網頁上要靠 `backdrop-filter` 吃 SVG 的 `<feDisplacementMap>`，而 **Safari 與 WKWebView 不支援這個組合**，只會退回單純的毛玻璃模糊。這條路在「材質」這一項上直接觸頂。

- **殼改原生，內容仍在 WebView**：分頁列與選單用真的 iOS 元件畫在 WebView 外面。買得到系統元件，但要寫 Swift、要處理兩層之間的溝通，而且卡片內容仍是網頁——`ADR-0015` 想離開的那一層還在原地。

- **SwiftUI 原生重寫**：Liquid Glass 的第一手支援，對準 Apple 的介面指南最直接。否決的理由是開發環境，見上一節；另外它讓 `src/lib/` 3,638 行純邏輯與 4,732 行測試一併作廢，React Native 不會。

- **維持 Capacitor，接受它看起來舊**：零成本、零風險，上架流程可以立刻走完。這是被動機否決的，不是被技術否決的。

## Consequences

**`ADR-0002` 的立場不變。** localStorage 仍是唯一真相來源，同步介面不變——`react-native-mmkv` 之所以被選中，正是因為它同步。若哪天發現它其實頂不上去，那不是換個套件的問題，是整個架構要重看。

**`ADR-0014` 的 1,319 行畫面測試作廢。** 那批是 jsdom 環境專用的，React Native 上跑不了，改用 React Native 自己那套工具重寫重要的幾支。`src/lib/` 的 4,732 行邏輯測試同為 TypeScript，整批搬。

**雲端備份的位元級相容用寫死的標答擋住。** 先用網頁版加密一組固定資料把結果存起來當標答，React Native 那邊要能解開它、也要能加出一模一樣的結果，CI 每次都跑。另外真機實際存一次、拉一次。**這件事錯了不會當場報錯**——存的時候一切正常，某天想還原才發現打不開，那時資料已經沒了。自動測試是為了讓它當場報錯。

**長按選取整串詞條這個能力沒了，換成一顆按鈕。** 這是振假名疊字做法的代價，不是實作沒做好。網頁版 `src/styles.css` 特地寫明不碰 `.term` 與 `.meaning`，保的正是這個功能，iOS 上保不住。補救是卡片上多一顆「複製詞條」按鈕，複製去掉讀音標記後的詞條原文（`焦[こ]がす` → `焦がす`）。**釋義不受影響**，它沒有振假名、是完整一段文字，加上可選取就選得起來。

**畫面碼從一份變成兩份，而且會越走越開。** `ADR-0015` 選 Capacitor 的核心理由就是「不維護第二份畫面碼」，這條現在自願放棄。網頁版不跟進 Liquid Glass（它本來也做不出來），同一顆按鈕改一次要改兩邊。邏輯層維持一份，是這個代價的上限。

**上架被無限期擋住。** 票 `ios-app 11`（送審）與 `20`（在地化）都已備妥，維護者決定不先送、等 React Native 版好了才一起送，而且**不設回頭看的時間點**。這與 `.scratch/rn-spike/issues/01` 當初「互不阻擋，先上架不吃虧」的做法相反。萬一卡在加解密相容那一關，App Store 上就是一直空著。

**驗收標準是主觀的，而且沒有停損線。** 兩把尺：Apple 的介面指南逐項當施工指引，最後拿它跟 Apple 自家 app 並排目測，維護者說了算。因為路線已定案，目測沒過的唯一結果是繼續改，不是回 Capacitor。前兩張探路票刻意在動工前寫死停損條件，這次刻意不寫。

**最低支援是 iOS 16.4，不是原本寫的 iOS 15。** 這個數字不是選的，是 Expo 給的：`expo-modules-core` 的 podspec 把 iOS 16.4 寫死，SDK 57 底下沒有更低的走法（退回 SDK 54 也只到 15.1）。本 ADR 初版寫「最低支援仍是 iOS 15」，`.scratch/rn-rewrite/issues/03` 動工時發現達不到，2026-08-24 訂正。**代價是 iPhone 7 與更舊的機器裝不了**——Capacitor 版原本裝得了。`GlassView` 在 iOS 26 以下自動退回一般區塊，16.4 到 25 的機器用得到 app、只是沒有玻璃質感。因此「並排不覺得舊」這條驗收只在 iOS 26 上成立。

**不做 Android。** 每個決定只需要對 iOS 負責——真要寫原生模組時只寫 Swift，不必再寫一份 Kotlin。Liquid Glass 本來也只有 iOS 有。

**五個原生功能全部要在 React Native 上重接**：每日提醒、原生日文語音、評分觸覺、Keychain 存密碼、保險副本。`ADR-0015` 寫明這五項是通過 App Store 審查準則 4.2（Minimum Functionality）的實質內容，少一項就是一支「把網站裝進殼裡」的 app。
