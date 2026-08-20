import { describe, it, expect } from 'vitest';
import { toReadingError } from './ai-logic-error';
import { AppError, SilentError } from './app-error';

/**
 * 這一支守的是「Firebase 那條路的失敗也落回同一組 key」。網頁版的同一件事由
 * `gemini-reading.test.ts` 守著，兩邊的斷言形狀刻意長得一樣。
 *
 * 樣本訊息不是編的，是照 SDK 實際的組法抄下來的：
 * `AI: Error fetching from <網址>: [<狀態> <狀態字>] <原因> (AI/<代號>)`。
 * 其中 401 那一句是票 01 在真 iPhone 上實際收到的。
 */
const ENDPOINT = 'https://firebasevertexai.googleapis.com/v1beta/projects/va-practice/models/gemini-3.6-flash:generateContent';

/** SDK 丟出來的那種錯：訊息、代號、外加一格結構化的狀態碼。 */
function sdkError(message: string, code: string, status?: number): Error {
  const error = new Error(`AI: ${message} (AI/${code})`);
  Object.assign(error, { code });
  if (status !== undefined) Object.assign(error, { customErrorData: { status } });
  return error;
}

describe('Firebase AI Logic 的失敗翻回同一組 key', () => {
  it('等太久：秒數是模組自己的常數算的，不是硬填的 10', () => {
    const aborted = new Error('Timeout has expired');
    aborted.name = 'AbortError';

    expect(toReadingError(aborted)).toEqual(
      expect.objectContaining({ key: 'gemini.timeout', params: { seconds: 10 } }),
    );
  });

  it('App Check 沒過：完全不出聲，連一條 key 都不給', () => {
    const rejected = sdkError(
      `Error fetching from ${ENDPOINT}: [401 Unauthorized] Firebase App Check token is invalid.`,
      'fetch-error',
      401,
    );

    expect(toReadingError(rejected)).toBeInstanceOf(SilentError);
  });

  it('額度用完：狀態碼與 Google 那句原因一起帶出去', () => {
    const exhausted = sdkError(
      `Error fetching from ${ENDPOINT}: [429 Too Many Requests] Resource has been exhausted (e.g. check quota).`,
      'fetch-error',
      429,
    );

    expect(toReadingError(exhausted)).toEqual(
      expect.objectContaining({
        key: 'gemini.httpError',
        // 原因裡那組括號不可以被當成尾巴那個 (AI/fetch-error) 一起剪掉。
        params: { status: 429, reason: 'Resource has been exhausted (e.g. check quota).' },
      }),
    );
  });

  it('挖不到原因：換一條 key，不要自己補一句話上去', () => {
    // SDK 對「API 沒開」另外組了一段話，那一句裡沒有 [狀態 狀態字] 那個方括號。
    const notEnabled = sdkError(
      'The Firebase AI SDK requires the Firebase AI API to be enabled in your Firebase project.',
      'api-not-enabled',
      403,
    );

    expect(toReadingError(notEnabled)).toEqual(
      expect.objectContaining({ key: 'gemini.httpErrorNoReason', params: { status: 403 } }),
    );
  });

  it('連不上：沒有狀態碼的失敗一律當離線', () => {
    const offline = sdkError(`Error fetching from ${ENDPOINT}: Load failed`, 'error');

    expect(toReadingError(offline)).toEqual(expect.objectContaining({ key: 'gemini.offline' }));
  });

  it('回覆被擋下來：當成沒有回覆內容，與網頁版同一條 key', () => {
    const blocked = sdkError('Text not available. Response was blocked due to SAFETY', 'response-error');

    expect(toReadingError(blocked)).toEqual(expect.objectContaining({ key: 'gemini.emptyReply' }));
  });

  it('連 Error 都不是的東西：仍然回一個帶 key 的錯，不要漏出去', () => {
    expect(toReadingError('壞掉了')).toBeInstanceOf(AppError);
  });
});
