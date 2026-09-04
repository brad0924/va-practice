import { toReadingText } from '@core/lib/reading';

/**
 * 語音朗讀：只在裝置真的有日文語音時才可用，
 * 否則按了會聽到外語腔調念日文，不如不要出現這個按鈕。
 * 一律由使用者主動點擊才播放，不自動發聲。
 */
let japaneseVoice: SpeechSynthesisVoice | null = null;

export function hasJapaneseVoice(): boolean {
  return japaneseVoice !== null;
}

/** 語音清單在部分瀏覽器是非同步載入的，改變時透過 onChange 通知畫面重畫。 */
export function initSpeech(onChange: () => void): void {
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
  const reading = toReadingText(text);

  if (japaneseVoice === null) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(reading);
  utterance.voice = japaneseVoice;
  utterance.lang = japaneseVoice.lang;
  utterance.rate = 0.9;
  speechSynthesis.speak(utterance);
}
