import { describe, it, expect } from 'vitest';
import { toReadingError } from './ai-logic-error';
import { AppError, SilentError } from './app-error';

/**
 * 這一支守的是「Firebase 那條路的失敗也落回同一組 key」。網頁版的同一件事由
 * `gemini-reading.test.ts` 守著，兩邊的斷言形狀刻意長得一樣。
 *
 * 樣本訊息不是編的。401 那一組是 2026-08-20 對真的 Firebase AI Logic 端點餵一個亂寫的
 * App Check 權杖、把回來的錯誤原樣抄下來的（見 `fixed-gemini-key` 票 02 的 Comments）。
 * 組法是 `AI: Error fetching from <網址>: [<狀態> <狀態字>] <原因> (AI/<代號>)`，而實測
 * **`<狀態字>` 是空的**——所以方括號裡長的是 `[401 ]`，不是 `[401 Unauthorized]`。這一點
 * 直接決定挖原因那段字串處理對不對，樣本因此照實際的寫。
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
      `Error fetching from ${ENDPOINT}: [401 ] Firebase App Check token is invalid.`,
      'fetch-error',
      401,
    );

    expect(toReadingError(rejected)).toBeInstanceOf(SilentError);
  });

  it('額度用完：自己一條 key，狀態碼與 Google 那句原因都不帶出去', () => {
    const exhausted = sdkError(
      `Error fetching from ${ENDPOINT}: [429 ] Resource has been exhausted (e.g. check quota).`,
      'fetch-error',
      429,
    );

    const error = toReadingError(exhausted);

    expect(error).toEqual(expect.objectContaining({ key: 'gemini.quotaExhausted' }));
    // `params` 必須是空的。這一條不只是「湊巧沒用到」——429 走的是不解釋那條路，
    // 狀態碼或 Google 那句原因只要漏進 params，日後有人把它代進句子裡就破功了
    // （spec 決定十三）。
    expect((error as AppError).params).toBeUndefined();
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
