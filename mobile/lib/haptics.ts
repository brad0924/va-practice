/**
 * 評分時震的那一下。Capacitor 版走自己寫的 `ios/App/App/HapticsPlugin.swift`，
 * React Native 版走 `expo-haptics`——兩邊底下都是 `UIImpactFeedbackGenerator`。
 *
 * **這是重接，不是重新設計**（票 `08`）。四個評分共用同一種震動，沒有參數：
 * 輕重是使用者自己的判斷，程式不該用震動替它加註解。`HapticsPlugin.swift` 明寫
 * 「也不打算有第二支」，這裡照抄那個立場。
 *
 * > **交出去的是一個永遠可以呼叫的東西。** 網頁版那一支之所以這樣寫，是因為
 * > 瀏覽器沒有原生那一端，於是給呼叫端一個什麼都不做的空函式，`review-view.ts`
 * > 因此一個條件判斷都不必寫。React Native 這邊沒有「網頁版」這條分岔，但形狀留著：
 * > `review-session.ts` 的 `rate()` 直接叫，不問「這台機器震得動嗎」。
 *
 * 本模組不寫自動測試：原生模組在 Node 環境下不存在，硬要測就得造一整套假物件，
 * 測到的只是自己寫的假貨（與網頁版 `src/lib/haptics-native.ts` 同一個理由）。
 * 守得住的那一半——「評分會震、其它動作不震、震在存檔之前」——由
 * `review-session.test.ts` 遞一個假的進去驗，其餘靠真機的手動驗收清單。
 */
import * as Haptics from 'expo-haptics';

/** 給出一次觸覺回饋。四個評分共用同一種，因此沒有參數。 */
export type Haptic = () => void;

/**
 * 評分時要震的那一下。
 *
 * 用 `Light` 而不是 `Medium`（`expo-haptics` 的預設）或 `notificationAsync()`：
 * 目的是「確認」不是「警示」。它打到的是 `UIImpactFeedbackGenerator(style: .light)`，
 * 與 `HapticsPlugin.swift` 同一顆 API，手指摸起來一樣。
 *
 * 不等它震完：呼叫端正在評分，觸覺是旁邊順便發生的事。
 * 失敗也吞掉——使用者在系統設定裡關掉觸覺、低耗電模式、相機開著，iOS 都是靜靜不震；
 * 少震一下不值得打斷複習，使用者也無事可做。
 */
export const rateHaptic: Haptic = () => {
  try {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  } catch {
    // 兩層是刻意的，擋的是兩條不同的路。`.catch()` 接的是「叫得到、但沒震成」；
    // 這個 try 接的是「連叫都叫不到」——原生模組沒進到這一版包裡（出包前的舊 client、
    // Expo Go），呼叫會當場丟而不是回一個 rejected 的 promise。
    //
    // 少了它，評分整條會斷在第一行：存檔與雲端推送都排在 `rate()` 後面。
    // 網頁版不必寫這一段，它有 `Capacitor.isNativePlatform()` 那道閘門先擋住。
  }
};
