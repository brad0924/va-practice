/**
 * 原生日文語音接上原生那一端的接線。所有 Capacitor 的東西都只出現在這裡，
 * `src/ui/speech.ts` 因此只需要問「有沒有原生語音」，不必知道這台裝置是什麼，
 * 立場與 `safety-copy-native.ts`、`download-native.ts` 相同。
 *
 * 原生實作是 app 自己那支插件（`ios/App/App/SpeechPlugin.swift`），沒有加任何新的
 * npm 依賴。改用原生的理由是音質：iOS 的 Web Speech 底層雖然也是 `AVSpeechSynthesizer`，
 * 卻只拿得到 compact（壓縮）品質的語音，那就是實測聽到的機械感來源（見 spec 決定十五）。
 *
 * 本模組不寫自動測試：原生插件在 node 環境下不存在，硬要測就得造一整套假物件，
 * 測到的只是自己寫的假貨。行為改由真機的手動驗收清單守住。
 */
import { Capacitor, registerPlugin } from '@capacitor/core';

/** 原生那一端只有一支方法。挑語音、選語速、中斷前一次都在那邊，這裡只遞文字。 */
interface SpeechPlugin {
  speak(options: { text: string }): Promise<void>;
}

const plugin = registerPlugin<SpeechPlugin>('Speech');

/** 朗讀那個動作本身。念什麼由呼叫端決定，這裡收到的已經是要念出來的讀音文字。 */
export type Speak = (text: string) => void;

/**
 * 原生殼裡的朗讀手段。**網頁版恆為 `null`**，呼叫端因此沿用既有的 Web Speech 路徑，
 * 一行都不必為 iOS 改寫。
 */
export function createNativeSpeak(): Speak | null {
  if (!Capacitor.isNativePlatform()) return null;

  return (text) => {
    // 不等它念完：呼叫端是一個點擊處理器，朗讀是背景發生的事。
    // 失敗也吞掉——使用者能做的只有再按一次，而跳一個錯誤出來只會打斷複習。
    void plugin.speak({ text }).catch(() => {});
  };
}
