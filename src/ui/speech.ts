import { toReadingText } from '@core/lib/reading';
import { createNativeSpeak, type Speak } from '../lib/speech-native';

/**
 * 語音朗讀：只在裝置真的有日文語音時才可用，
 * 否則按了會聽到外語腔調念日文，不如不要出現這個按鈕。
 * 一律由使用者主動點擊才播放，不自動發聲。
 *
 * 兩條路：原生殼裡走 `AVSpeechSynthesizer`（音質好得多，見 spec 決定十五），
 * 網頁版走 Web Speech。分支只發生在這裡，對外仍是同樣那三支，
 * `review-view.ts` 一字不改。
 */
let japaneseVoice: SpeechSynthesisVoice | null = null;
let speakNatively: Speak | null = null;

export function hasJapaneseVoice(): boolean {
  // 原生那邊的日文語音是系統內建、離線可用，因此 iOS 上恆為真——按鈕不會時有時無。
  return speakNatively !== null || japaneseVoice !== null;
}

/** 語音清單在部分瀏覽器是非同步載入的，改變時透過 onChange 通知畫面重畫。 */
export function initSpeech(onChange: () => void): void {
  speakNatively = createNativeSpeak();
  // 原生那條路沒有「清單稍後才載入」這回事，一開始就是可用的，不必通知重畫。
  if (speakNatively !== null) return;

  if (typeof speechSynthesis === 'undefined') return;

  const refresh = () => {
    const found = speechSynthesis.getVoices().find((voice) => voice.lang.toLowerCase().startsWith('ja'));
    const next = found ?? null;
    if (next === japaneseVoice) return;
    japaneseVoice = next;
    onChange();
  };

  refresh();
  speechSynthesis.addEventListener('voiceschanged', refresh);
}

/** 念出詞條標注的讀音，確保聽到的與卡片教的讀法一致。 */
export function speak(text: string): void {
  // 兩條路念的是同一串字：轉讀音這件事與用哪個引擎無關。
  const reading = toReadingText(text);

  if (speakNatively !== null) {
    speakNatively(reading);
    return;
  }

  if (japaneseVoice === null) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(reading);
  utterance.voice = japaneseVoice;
  utterance.lang = japaneseVoice.lang;
  utterance.rate = 0.9;
  speechSynthesis.speak(utterance);
}
