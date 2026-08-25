/**
 * 原生日文朗讀。Capacitor 版走自己寫的 `ios/App/App/SpeechPlugin.swift`，
 * React Native 版走 `expo-speech`——兩邊底下都是 `AVSpeechSynthesizer`。
 *
 * 念什麼由呼叫端決定：先跑 `toReadingText()` 把漢字換成標注的讀音，聽到的與卡片教的
 * 讀法一致（與網頁版 `src/ui/speech.ts` 同一條規矩）。挑語音與選語速在這裡。
 *
 * > **與 `SpeechPlugin.swift` 有一處對不齊，是已知的落差。** 那支 Swift 先問系統
 * > 「使用者在『設定 → 輔助使用 → 朗讀內容』選了哪一顆日文語音」，再在**同名**的語音裡
 * > 挑品質最好的版本（票 `ios-app 15` 修的就是這條）。`expo-speech` 的 `getVoices()`
 * > 只回報全部語音，**問不到系統偏好的是哪一顆**，因此這裡照票 `06` 的字面走
 * > 「挑品質最好的日文語音」。代價是使用者若在設定裡換過日文語音，這支 app 不跟隨。
 * > 要補回來得自寫原生模組，那不在這張票裡。
 */
import * as Speech from 'expo-speech';
import { toReadingText } from '@core/lib/reading';

/**
 * 挑語音只需要這三格。自己開一個型別而不是直接吃 `Speech.Voice`，
 * 是為了讓測試造得出假語音，不必把整個原生模組搬進 Node。
 */
export interface VoiceLike {
  identifier: string;
  language: string;
  quality: string;
}

/**
 * 語速：預設的 0.9 倍。
 *
 * `expo-speech` 的 iOS 那一端算的是 `rate × AVSpeechUtteranceDefaultSpeechRate`，
 * 與 `SpeechPlugin.swift` 的 `AVSpeechUtteranceDefaultSpeechRate * 0.9` 是同一個算式，
 * 所以這裡填 0.9 就與 Capacitor 版聽起來一樣。**不要改成 1.0 再自己乘 0.5**，
 * 那個 0.5 是 Apple 的常數，不保證每一版都一樣。
 */
export const SPEECH_RATE = 0.9;

/** 一顆語音是不是日文的。只比主碼，`ja` 與 `ja-JP` 都算。 */
function isJapanese(voice: VoiceLike): boolean {
  return voice.language.toLowerCase().split('-')[0] === 'ja';
}

/**
 * 挑品質最好的那顆日文語音，一顆都沒有時交回 null——那時候朗讀按鈕就不該出現，
 * 免得按了聽到外語腔調念日文。
 *
 * 品質一樣時留系統排在最前面的那顆（`reduce` 只在**嚴格比較好**時才換人）。
 */
export function pickJapaneseVoice(voices: readonly VoiceLike[]): VoiceLike | null {
  const japanese = voices.filter(isJapanese);
  if (japanese.length === 0) return null;
  return japanese.reduce((best, voice) => (score(voice) > score(best) ? voice : best));
}

/**
 * `expo-speech` 的品質只有兩級，`Enhanced` 是下載過的增強版。
 *
 * > **iOS 其實有三級，第三級在這裡看不見。** `AVSpeechSynthesisVoice.Quality` 從 iOS 16 起
 * > 多了 `premium`（比 `enhanced` 更好），但 `expo-speech` 的原生那一端寫的是
 * > `voice.quality == .enhanced ? "Enhanced" : "Default"`——**premium 被回報成 `Default`**。
 * > `SpeechPlugin.swift` 拿的是 `quality.rawValue` 的最大值，沒有這個問題。
 * >
 * > 後果：使用者若下載過 premium 的日文語音，這裡會挑到 enhanced 那顆，比 Capacitor 版差一級。
 * > 資訊在過橋的時候就沒了，補不回來——要補得自寫原生模組，與上面那條落差是同一個代價。
 */
function score(voice: VoiceLike): number {
  return voice.quality === 'Enhanced' ? 1 : 0;
}

/** 這台裝置上要用的那顆日文語音，開機問一次。問不到（或沒有）時交回 null。 */
export async function loadJapaneseVoice(): Promise<VoiceLike | null> {
  try {
    return pickJapaneseVoice(await Speech.getAvailableVoicesAsync());
  } catch {
    // 問不到語音清單不是使用者做錯什麼，朗讀按鈕不出現就是了。
    return null;
  }
}

/**
 * 念出詞條標注的讀音。
 *
 * 連按兩次不會疊在一起念：先 `stop()` 再 `speak()`，與 `SpeechPlugin.swift` 的
 * `stopSpeaking(at: .immediate)` 是同一件事——使用者按下一次就是不想再聽上一次。
 *
 * 不等它念完，失敗也吞掉：呼叫端是一個點擊處理器，而使用者能做的只有再按一次，
 * 跳一個錯誤出來只會打斷複習。
 */
export function speakTerm(markup: string, voice: VoiceLike | null): void {
  if (voice === null) return;
  void Speech.stop().catch(() => {});
  Speech.speak(toReadingText(markup), {
    voice: voice.identifier,
    language: voice.language,
    rate: SPEECH_RATE,
  });
}
