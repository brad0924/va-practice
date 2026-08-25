// 這一支是 mobile/ 自己新寫的，所以直接寫 Jest。`core/` 那批仍寫著 `from 'vitest'`
// 並靠 `../test/vitest-shim.ts` 轉接——那個包袱只屬於搬過來的舊測試（票 `02`）。
import { describe, it, expect } from '@jest/globals';
import { pickJapaneseVoice, SPEECH_RATE, type VoiceLike } from './japanese-voice';

function voice(identifier: string, language: string, quality: 'Default' | 'Enhanced'): VoiceLike {
  return { identifier, language, quality };
}

describe('挑日文語音', () => {
  it('只看日文的那幾顆', () => {
    const picked = pickJapaneseVoice([
      voice('en', 'en-US', 'Enhanced'),
      voice('ja', 'ja-JP', 'Default'),
      voice('zh', 'zh-TW', 'Enhanced'),
    ]);
    expect(picked?.identifier).toBe('ja');
  });

  it('同樣是日文時挑品質最好的那顆', () => {
    const picked = pickJapaneseVoice([
      voice('compact', 'ja-JP', 'Default'),
      voice('enhanced', 'ja-JP', 'Enhanced'),
    ]);
    expect(picked?.identifier).toBe('enhanced');
  });

  it('品質一樣時挑系統排在最前面的那顆', () => {
    const picked = pickJapaneseVoice([voice('first', 'ja-JP', 'Default'), voice('second', 'ja-JP', 'Default')]);
    expect(picked?.identifier).toBe('first');
  });

  it('語言碼只比主碼，`ja` 與 `ja-JP` 都算', () => {
    expect(pickJapaneseVoice([voice('bare', 'ja', 'Default')])?.identifier).toBe('bare');
  });

  it('一顆日文語音都沒有時交回 null，按鈕就不該出現', () => {
    expect(pickJapaneseVoice([voice('en', 'en-US', 'Enhanced')])).toBeNull();
  });

  it('空清單也不當掉', () => {
    expect(pickJapaneseVoice([])).toBeNull();
  });
});

describe('語速', () => {
  /**
   * `expo-speech` 的 iOS 那一端算的是 `utterance.rate = rate × AVSpeechUtteranceDefaultSpeechRate`
   * （`node_modules/expo-speech/ios/SpeechModule.swift`），而 `ios/App/App/SpeechPlugin.swift`
   * 寫的是 `AVSpeechUtteranceDefaultSpeechRate * 0.9`。同一個算式，所以填 0.9 就對得起來。
   */
  it('與 Capacitor 版同一個數字', () => {
    expect(SPEECH_RATE).toBe(0.9);
  });
});
