import { describe, it, expect, vi } from 'vitest';
import { askReading } from './gemini-reading';
import zhHant from '../i18n/zh-Hant';

const KEY = '我的金鑰';
const TERM = '焦がす';

/** 非 2xx 那句話。狀態碼與原因兩個參數各代各的，測試不自己拼字串。 */
function httpError(status: string, reason: string): string {
  return zhHant['gemini.httpError'].replace('{status}', status).replace('{reason}', reason);
}

/** 回真的 `Response`：`response.json()` 遇到爛內容自己 reject 的行為要是真的，測試才守得住。 */
function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Gemini 成功時的回覆外殼，`text` 就是模型塞在裡面的那份 JSON 字串。 */
function reply(text: string): Response {
  return json({ candidates: [{ content: { parts: [{ text }] } }] });
}

/** 一支假的 fetch：不記任何東西，每次都回同一份預備好的回應。 */
function responds(make: () => Response): typeof fetch {
  return async () => make();
}

describe('問 Gemini 讀音', () => {
  it('成功：把模型那份 JSON 解析後原封不動回傳', async () => {
    const value = await askReading(
      KEY,
      TERM,
      responds(() => reply('[{"splittable":true,"cells":[{"kanji":"焦","reading":"こ"}]}]')),
    );

    expect(value).toEqual([{ splittable: true, cells: [{ kanji: '焦', reading: 'こ' }] }]);
  });

  it('等太久沒回覆：訊息講的是秒數，不是換算前的毫秒', async () => {
    // 全檔只有這一條用假時鐘：秒數是模組拿自己的常數算的，
    // 改傳一個很短的逾時進去測，反而沒人守著上線那句話。
    vi.useFakeTimers();
    try {
      // 被取消就 reject，這正是真 fetch 的行為——訊息要對，signal 必須真的被 abort。
      const neverResponds: typeof fetch = (_url, init) =>
        new Promise((_, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        });

      const asking = askReading(KEY, TERM, neverResponds);
      const settled = expect(asking).rejects.toThrow(zhHant['gemini.timeout'].replace('{seconds}', '10'));
      await vi.advanceTimersByTimeAsync(10_000);
      await settled;
    } finally {
      vi.useRealTimers();
    }
  });

  it('連不上：不是被我們取消的失敗，就講連不上', async () => {
    const offline: typeof fetch = () => Promise.reject(new TypeError('Failed to fetch'));

    await expect(askReading(KEY, TERM, offline)).rejects.toThrow(zhHant['gemini.offline']);
  });

  it('非 2xx 且挖得到原因：狀態碼與那句原因一起帶出來', async () => {
    const doFetch = responds(() => json({ error: { message: 'Quota exceeded' } }, 429));

    await expect(askReading(KEY, TERM, doFetch)).rejects.toThrow(httpError('429', 'Quota exceeded'));
  });

  it('非 2xx 但挖不到原因：狀態碼仍要留著，不被蓋掉', async () => {
    const doFetch = responds(() => new Response('<html>Not Found</html>', { status: 404 }));

    await expect(askReading(KEY, TERM, doFetch)).rejects.toThrow(
      httpError('404', zhHant['gemini.noReason']),
    );
  });

  it('回應根本不是 JSON：讀不懂', async () => {
    const doFetch = responds(() => new Response('這不是 JSON', { status: 200 }));

    await expect(askReading(KEY, TERM, doFetch)).rejects.toThrow(zhHant['gemini.unreadable']);
  });

  it('是 JSON 但挖不到那段文字：沒有回覆內容', async () => {
    const doFetch = responds(() => json({ candidates: [] }));

    await expect(askReading(KEY, TERM, doFetch)).rejects.toThrow(zhHant['gemini.emptyReply']);
  });

  it('挖到文字但它不是 JSON：模型答非所問', async () => {
    const doFetch = responds(() => reply('這個詞我不會'));

    await expect(askReading(KEY, TERM, doFetch)).rejects.toThrow(zhHant['gemini.notJson']);
  });

  it('送出去的請求：金鑰在 header 上，詞條在 body 裡', async () => {
    // 只認金鑰與詞條。提示詞與結構化輸出的形狀是會反覆調整的東西，
    // 比對全文的測試只會在每次微調時無辜變紅，然後被人習慣性地改掉。
    let sent: RequestInit | undefined;
    const doFetch: typeof fetch = async (_url, init) => {
      sent = init;
      return reply('[]');
    };

    await askReading(KEY, TERM, doFetch);

    expect((sent?.headers as Record<string, string>)['x-goog-api-key']).toBe(KEY);
    expect(String(sent?.body)).toContain(TERM);
  });
});
