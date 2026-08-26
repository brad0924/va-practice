# 11 — 朗讀要跟隨使用者在系統設定裡選的日文語音

Status: needs-triage
Type: bug
Blocked by: 06

決策背景見票 `06` 的〈朗讀與 Capacitor 版有一處對不齊〉與〈朗讀還有第二處落差〉。

## 為什麼有這張票

**這是對已經上架那一版的倒退。**

`ios/App/App/SpeechPlugin.swift` 會先問系統「使用者在『設定 → 輔助使用 → 朗讀內容』
選了哪顆日文語音」，再在同名的語音裡挑品質最好的版本。Capacitor 版的票 `ios-app 15`
修的就是這一條——**它是修過的行為，不是順手加的**。

React Native 版問不到這件事。`expo-speech` 的 `getVoices()` 只回報全部語音，
沒有任何一支 API 說得出系統偏好的是哪一顆。因此 `mobile/lib/japanese-voice.ts` 照票 `06`
的字面走「挑品質最好的日文語音」，使用者在設定裡換過語音的話，這支 app 不跟隨。

2026-08-26 真機試聽時維護者聽不出差別——**但他沒有在設定裡改過日文語音**，
碰不到這條的人本來就聽不出來。決定開票追蹤。

## 同一支模組還有第二處落差

`expo-speech` 把語音品質對應成 `quality == .enhanced ? "Enhanced" : "Default"`。
iOS 16 之後多了一級 **premium**，而它會被回報成 `Default`——
於是挑語音時 premium 輸給 enhanced，**拿到的是次好的那一顆**。

這一條與上面那條同源：兩件事都要問到 `AVSpeechSynthesisVoice` 本人才答得出來。
一起修，不分兩張票。

## 要做什麼

自寫一個原生模組，把 `SpeechPlugin.swift` 問系統的那兩件事接出來：

| 要問到的 | 現在為什麼問不到 |
| --- | --- |
| 系統偏好的日文語音是哪一顆 | `expo-speech` 沒有對應的 API |
| 語音的真實品質（含 premium） | `expo-speech` 把 premium 併進 `Default` |

**行為照抄 Capacitor 版，不重新設計。** 挑法、語速、失敗時怎麼辦，
`SpeechPlugin.swift` 那一份就是規格。

**它是原生模組，動工要重新出包。** 動工前先確認還有沒有別的原生模組要一起加。

## 這張票不做的事

- **不改語速。** `0.9` 已經與 Capacitor 版對得起來（兩邊算的都是
  `rate × AVSpeechUtteranceDefaultSpeechRate`），這一條沒有落差。
- **不動朗讀按鈕的位置與樣子。** 那在票 `06`，圖示化在票 `09` 那次出包。
- **不加語音選單。** 使用者選語音的地方是 iOS 的系統設定，不是這支 app。

## 驗收

- [ ] 在「設定 → 輔助使用 → 朗讀內容」換一顆日文語音，app 跟著換
- [ ] 系統選的那顆有 premium 版本時，拿到的是 premium 不是 enhanced
- [ ] 系統沒選過任何日文語音時，退回「挑品質最好的那顆」，行為與現在一樣
- [ ] 一台完全沒有日文語音的機器上，朗讀按鈕仍然不出現，不當掉
- [ ] 與 Capacitor 版兩支輪流按，聽不出是不同的語音
