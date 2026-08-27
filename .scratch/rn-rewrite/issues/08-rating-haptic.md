# 08 — 評分的觸覺回饋，在 React Native 上重接

Status: ready-for-human
Type: enhancement
Blocked by: 06

決策背景見 `../spec.md` 的〈原生功能〉與 `ADR-0015`。

## 為什麼有這張票

**它是上架前非補不可的四項之一，但在這之前沒有任何地方追蹤它。**

`ADR-0015` 把「評分時的觸覺回饋」列進通過 App Store 審查準則 4.2（Minimum Functionality）的實質內容——少一項就是一支「把網站裝進殼裡」的 app，會被退件。`spec.md` 的〈原生功能〉說五項全部要在 React Native 上重接。票 `06` 的〈這張票不做的事〉說「那四項另外開票，但都要在上架前補齊」。

**三份文件都說非做不可，卻沒有一張票。** 2026-08-26 真機測複習畫面時維護者問「按下去怎麼沒有震動」，才發現這件事掛在半空中，因此開這張票。

同一批還缺票的另外三項（每日提醒、Keychain 存密碼、保險副本）維持現狀，本票不代開——保險副本的去留另有票 `07`。

## 這是重接，不是重新設計

Capacitor 版已經有一份完整的實作，行為照抄，不重新想：

| 那一邊 | 檔 | 做什麼 |
| --- | --- | --- |
| 接線 | `src/lib/haptics-native.ts` | 交出一個**永遠可以呼叫**的東西。網頁版拿到的是什麼都不做的那一個 |
| 原生 | `ios/App/App/HapticsPlugin.swift` | `UIImpactFeedbackGenerator(style: .light)`，只有 `impact` 一支 |
| 呼叫點 | `src/app.ts` 的 `rate()` 第一行 | 擺最前面是為了立刻震——存檔與推雲端慢不慢，跟手指的回饋無關 |

**四個評分共用同一種震動，沒有參數。** 「再次」不震得比較重，`HapticsPlugin.swift` 明寫「也不打算有第二支」。

**呼叫端不必知道觸覺存在。** 網頁版拿到的是空的，因此 `review-view.ts` 一個條件判斷都不寫。React Native 這邊沒有「網頁版」這條分岔，但這個形狀要留著——之後卡片列表若也要震，接法一樣。

## 要做什麼

用 `expo-haptics` 重接，接在 `mobile/lib/review-session.ts` 的 `rate()` 開頭，與網頁版 `src/app.ts` 同一個位置。

強度要對齊 `.light`——`expo-haptics` 的對應值要查 SDK 57 的文件確認，不要從記憶寫。

**它是原生模組，加下去要重新出包。** 動工時先確認還有沒有別的原生模組要一起加，湊在一起只出一次包。

**2026-08-26：對象確定了，是票 `09`（底部導覽列）。** 那張票的 tab 圖示要用 SF Symbols（HIG `N-07`），因此要 `expo-symbols`。**兩張票一起做、出一次包。** 分兩次的話維護者的 Metro 快速迭代就要斷兩次。

票 `06` 那一項「四顆評分鈕長得一模一樣」最後**沒有走符號**——定案是玻璃方塊配上色文字，不需要原生模組。

## 這張票不做的事

- **不加第二種震動。** 四個評分共用同一種，與 Capacitor 版一致。
- **不在評分以外的地方加觸覺。** 掀開答案、複製、朗讀、切單字本都不震。
- **不做每日提醒、Keychain。** 那兩項各自另外開票。

## 驗收

- [ ] 真機上按四顆評分鈕都震得到，四顆一樣
- [ ] 震感與 Capacitor 版一致（兩支輪流按，分不出輕重）
- [ ] 掀開答案、複製、朗讀、切單字本都不震
- [ ] 系統設定關掉觸覺回饋時不當掉、也不出錯
- [ ] 震的那一下在存檔之前發生（手指立刻有回饋，不等雲端）

## Comments

### 2026-08-27 — 實作完成，五條驗收都要真機，而且加原生模組前先被一個相依相衝擋住

#### 強度查過文件才寫：`ImpactFeedbackStyle.Light`

票要求「不要從記憶寫」，因此查的是 SDK 57 那一版的 `expo-haptics` 文件。`impactAsync(style)` 收五種 style（`Light`／`Medium`／`Heavy`／`Rigid`／`Soft`），**預設是 `Medium`**，所以不能省參數。`Light` 打到的就是 `HapticsPlugin.swift` 那顆 `UIImpactFeedbackGenerator(style: .light)`。

#### 接線的形狀：遞進去，不是 import 進去

`lib/haptics.ts` 交出一個永遠可以呼叫的 `rateHaptic`，由 `lib/app-context.tsx` 遞給 `createReviewSession()`，`rate()` 第一行叫它——與網頁版 `src/app.ts` 同一個位置。

**為什麼是遞進去而不是讓 `review-session.ts` 直接 import**：原生模組在 Node 裡不存在，那支檔一沾上，它整批 24 條測試就跑不動了。當前時間與亂數本來就是這個規矩，觸覺跟著走同一條。代價是 `ReviewSessionHooks` 上多一格 `haptic`——但畫面層仍然完全不知道觸覺存在，票要留的那個形狀留住了。

#### 多寫了一層 `try`，擋的是「連叫都叫不到」

```ts
try {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
} catch { /* 原生模組沒進到這一版包裡 */ }
```

`.catch()` 接的是「叫得到、但沒震成」；`try` 接的是原生模組根本不在這一版包裡（出包前的舊 dev client、Expo Go）——那時候呼叫會當場丟，不是回一個 rejected 的 promise。**少了它，評分整條會斷在第一行**，存檔與雲端推送都排在後面。網頁版不必寫這一段，它有 `Capacitor.isNativePlatform()` 先擋。

#### 票沒要求、但非做不可的一件事：`react-dom` 的版本相衝

**加原生模組的第一步就撞牆了**：`npm install expo-haptics` 直接失敗，而且不是這個套件的錯——**現在這份 lockfile 誰都裝不起來**，`npm install`、`npm ci` 全部一樣，`.github/workflows/test.yml` 與 `mobile-crypto.yml` 那兩支 CI 也會掛在裝套件那一步。

病灶：lockfile 裡釘的 `react-dom@19.2.8` 的 peer 要 `react ^19.2.8`，而 Expo SDK 57 把 `react` 釘在 `19.2.3`。`react-dom` 是票 `09` 裝 `expo-router` 時被連帶拉進來的（它的網頁那一半要），沒有人直接用它。

修法是 `mobile/package.json` 加四行：

```json
"overrides": { "react-dom": "19.2.3" }
```

**先試過 `--legacy-peer-deps`，那條路是錯的**：它會把 18 個 peer 套件整批從樹上刮掉，包含 `@react-native/jest-preset` 與 `@react-native/metro-config`——測試與 Metro 當場死。`overrides` 這條的 lockfile 差異是 19 加 16 減，只有 `expo-haptics` 進來、`react-dom` 從 19.2.8 退到 19.2.3，一個套件都沒少，`npm ci` 事後驗過。

#### 驗收：哪幾條程式碼守得住，哪幾條只有手指知道

| 驗收 | 程式碼那一半 | 還缺什麼 |
| --- | --- | --- |
| 四顆評分鈕都震，四顆一樣 | 測試守著「四種評分各叫一次、每次一下」，且四顆共用同一個沒有參數的 `rateHaptic` | 真機 |
| 震感與 Capacitor 版一致 | `Light` ↔ `.light`，同一顆 API | 真機，兩支輪流按 |
| 掀開答案、複製、朗讀、切單字本都不震 | 掀開、複製、切單字本三項有測試守著。**朗讀那顆沒有測試**——它要有日文語音才出現，測試環境問不到，而它的 `onPress` 只叫 `speakTerm()`，一個字都沒碰觸覺 | 真機補上朗讀那一顆 |
| 系統設定關掉觸覺時不當掉 | `try` 加 `.catch()` 兩層都吞掉 | 真機，到設定裡關掉再走一輪 |
| 震在存檔之前 | 測試守著：把儲存的 `setItem` 攔下來記順序，斷言是 `['震', '存檔']` | — |

#### 出包這一步還沒做，那是維護者的手

票說「動工時先確認還有沒有別的原生模組要一起加」。確認過了，這一次要帶三個：`expo-haptics`（這張票）、`expo-symbols` 與 `react-native-screens`（票 `09`，已經在 `package.json` 裡）。

**EAS Build 沒有跑**——它要 Expo 帳號登入，而且會佔掉維護者的 Metro 迭代一段時間，不該由 agent 自己按下去。出包之後票 `09` 那七條真機驗收與這張票的五條一起走一輪。
