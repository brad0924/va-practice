# 07 — 保險副本防的那個威脅在 React Native 上不存在了，要不要留

Status: needs-triage
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
