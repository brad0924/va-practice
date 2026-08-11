/**
 * 評分觸覺接上原生那一端的接線。所有 Capacitor 的東西都只出現在這裡，
 * 立場與 `speech-native.ts`、`safety-copy-native.ts` 相同。
 *
 * 與朗讀不同的是，這件事沒有網頁版的替代路徑，因此交出去的不是「有或沒有」，
 * 而是一個**永遠可以呼叫**的東西：網頁版拿到的是什麼都不做的那一個。
 * 呼叫端因此一個條件判斷都不必寫，`src/ui/review-view.ts` 也就不必知道
 * 「觸覺」這個概念存在（見 spec 決定二十五）。
 *
 * 本模組不寫自動測試：原生插件在 node 環境下不存在，硬要測就得造一整套假物件，
 * 測到的只是自己寫的假貨。行為改由真機的手動驗收清單守住。
 */
import { Capacitor, registerPlugin } from '@capacitor/core';

/** 原生那一端只有一支方法。震多重、用哪種回饋都在那邊決定，這裡連參數都不帶。 */
interface HapticsPlugin {
  impact(): Promise<void>;
}

const plugin = registerPlugin<HapticsPlugin>('Haptics');

/** 給出一次觸覺回饋。四個評分共用同一種，因此沒有參數。 */
export type Haptic = () => void;

/** 評分時要震的那一下。**網頁版拿到的是空的**，呼叫端照樣直接呼叫。 */
export function createNativeHaptic(): Haptic {
  if (!Capacitor.isNativePlatform()) return () => {};

  return () => {
    // 不等它震完：呼叫端正在評分，觸覺是旁邊順便發生的事。
    // 失敗也吞掉——少震一下不值得打斷複習，使用者也無事可做。
    void plugin.impact().catch(() => {});
  };
}
