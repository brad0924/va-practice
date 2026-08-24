import { describe, it, expect, vi } from 'vitest';
import { askReading, remoteOrDefault, TIMEOUT_MS } from './gemini-reading';
import type { Key } from '../i18n';

const KEY = '我的金鑰';
const TERM = '焦がす';

/**
 * 一個丟出來的錯該長什麼樣：比對的是 key 與參數，**沒有任何一種語言的文字**（票 05）。
 * 唯一帶文字的參數是 Gemini 自己回的那句原因，那是它給的字，語言不歸我們管。
 */
function failure(key: Key, params?: Record<string, string | number>) {
  return expect.objectContaining(params === undefined ? { key } : { key, params });
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

/** 503 時 Google 真的回的那句話（`reading-prefill` 票 07 的病灶）。 */
const HIGH_DEMAND = 'This model is currently experiencing high demand.';

/** 伺服器那端出事時 Google 回的那一份，狀態碼與那句原因都照它的樣子。 */
function serverError(status: number, message = HIGH_DEMAND): Response {
  return json({ error: { message } }, status);
}

/**
 * 排好順序的假 fetch：第 N 次呼叫回第 N 份，排完之後一直回最後那份。
 * 重試那一組全靠它——「第一次壞、第二次好」就是這一串的頭兩格。
 * `calls()` 數呼叫次數，那是「到底有沒有再問一次」唯一數得出來的證據。
 */
function inTurn(...makers: Array<() => Response>) {
  let calls = 0;
  const doFetch: typeof fetch = async () => {
    const make = makers[Math.min(calls, makers.length - 1)]!;
    calls += 1;
    return make();
  };
  return { doFetch, calls: () => calls };
}

describe('問 Gemini 讀音', () => {
  it('成功：把模型那份 JSON 解析後原封不動回傳', async () => {
    const value = await askReading(
      KEY,
      TERM,
      responds(() => reply('{"termKana":"こがす","runs":[{"splittable":true,"cells":[{"kanji":"焦","reading":"こ"}]}]}')),
    );

    expect(value).toEqual({
      termKana: 'こがす',
      runs: [{ splittable: true, cells: [{ kanji: '焦', reading: 'こ' }] }],
    });
  });

  it('等太久沒回覆：訊息講的是秒數，不是換算前的毫秒', async () => {
    // 用假時鐘而不是改傳一個很短的逾時進去：秒數是模組拿自己的常數算的，
    // 傳短的測反而沒人守著上線那句話。重試那一組另外有兩條也用假時鐘，理由同上。
    vi.useFakeTimers();
    try {
      // 被取消就 reject，這正是真 fetch 的行為——訊息要對，signal 必須真的被 abort。
      const neverResponds: typeof fetch = (_url, init) =>
        new Promise((_, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        });

      const asking = askReading(KEY, TERM, neverResponds);
      const settled = expect(asking).rejects.toThrow(failure('gemini.timeout', { seconds: 10 }));
      await vi.advanceTimersByTimeAsync(10_000);
      await settled;
    } finally {
      vi.useRealTimers();
    }
  });

  it('連不上：不是被我們取消的失敗，就講連不上', async () => {
    const offline: typeof fetch = () => Promise.reject(new TypeError('Failed to fetch'));

    await expect(askReading(KEY, TERM, offline)).rejects.toThrow(failure('gemini.offline'));
  });

  it('非 2xx 且挖得到原因：狀態碼與那句原因一起帶出來', async () => {
    const doFetch = responds(() => json({ error: { message: 'Quota exceeded' } }, 429));

    await expect(askReading(KEY, TERM, doFetch)).rejects.toThrow(
      failure('gemini.httpError', { status: 429, reason: 'Quota exceeded' }),
    );
  });

  it('非 2xx 但挖不到原因：換一條 key，狀態碼仍要留著，不被蓋掉', async () => {
    const doFetch = responds(() => new Response('<html>Not Found</html>', { status: 404 }));

    await expect(askReading(KEY, TERM, doFetch)).rejects.toThrow(
      failure('gemini.httpErrorNoReason', { status: 404 }),
    );
  });

  it('回應根本不是 JSON：讀不懂', async () => {
    const doFetch = responds(() => new Response('這不是 JSON', { status: 200 }));

    await expect(askReading(KEY, TERM, doFetch)).rejects.toThrow(failure('gemini.unreadable'));
  });

  it('是 JSON 但挖不到那段文字：沒有回覆內容', async () => {
    const doFetch = responds(() => json({ candidates: [] }));

    await expect(askReading(KEY, TERM, doFetch)).rejects.toThrow(failure('gemini.emptyReply'));
  });

  it('挖到文字但它不是 JSON：模型答非所問', async () => {
    const doFetch = responds(() => reply('這個詞我不會'));

    await expect(askReading(KEY, TERM, doFetch)).rejects.toThrow(failure('gemini.notJson'));
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

describe('伺服器那端出事時自動再問一次', () => {
  const OK = () => reply('{"termKana":"こがす","runs":[{"splittable":true,"cells":[{"kanji":"焦","reading":"こ"}]}]}');
  const PARSED = {
    termKana: 'こがす',
    runs: [{ splittable: true, cells: [{ kanji: '焦', reading: 'こ' }] }],
  };

  // 500／502／503／504 都是「再送一次會成功」的那一種，Google 自己叫你等一下再試。
  for (const status of [500, 502, 503, 504]) {
    it(`${status}：再問一次就好，使用者看不到錯誤`, async () => {
      const { doFetch, calls } = inTurn(() => serverError(status), OK);

      await expect(askReading(KEY, TERM, doFetch)).resolves.toEqual(PARSED);
      expect(calls()).toBe(2);
    });
  }

  // 金鑰不對、模型叫不動、額度用完——再送一百次都一樣，429 重試還會把額度燒更快。
  for (const status of [400, 403, 404, 429]) {
    it(`${status}：不會自己變對，問一次就放棄`, async () => {
      const { doFetch, calls } = inTurn(() => serverError(status), OK);

      await expect(askReading(KEY, TERM, doFetch)).rejects.toThrow(
        failure('gemini.httpError', { status, reason: HIGH_DEMAND }),
      );
      expect(calls()).toBe(1);
    });
  }

  it('連不上：多半是使用者自己的網路，重試沒有意義', async () => {
    let calls = 0;
    const offline: typeof fetch = () => {
      calls += 1;
      return Promise.reject(new TypeError('Failed to fetch'));
    };

    await expect(askReading(KEY, TERM, offline)).rejects.toThrow(failure('gemini.offline'));
    expect(calls).toBe(1);
  });

  it('一直撞 503 撞到碼表到期：講的是 503，不是逾時', async () => {
    // 重試與第一次共用同一顆碼表，撞久了一定會被 abort 砍掉。那一刻使用者真正撞到的是
    // 503，不是「等太久」——原因要跟事實對得上（票 07）。
    vi.useFakeTimers();
    try {
      let calls = 0;
      const doFetch: typeof fetch = async () => {
        calls += 1;
        // 第三次回覆的同時把碼表撥到底，模擬「一直撞、撞到預算用完」。
        if (calls === 3) vi.advanceTimersByTime(TIMEOUT_MS);
        return serverError(503);
      };

      await expect(askReading(KEY, TERM, doFetch)).rejects.toThrow(
        failure('gemini.httpError', { status: 503, reason: HIGH_DEMAND }),
      );
      expect(calls).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('撞過 503 之後那次 fetch 飛在半空被砍掉：講的還是 503', async () => {
    // 跟上一條走的是不同的分支。上一條在迴圈頂端就發現碼表到期，這一條是碼表在等回覆的
    // 途中到期、`controller.abort()` 把那次 fetch 砍掉——票 07 描述的正是這一種。
    vi.useFakeTimers();
    try {
      let calls = 0;
      const doFetch: typeof fetch = (_url, init) => {
        calls += 1;
        if (calls === 1) return Promise.resolve(serverError(503));
        // 第二次一去不回，等著被 abort，這正是真 fetch 被取消時的行為。
        return new Promise((_, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        });
      };

      const asking = askReading(KEY, TERM, doFetch);
      const settled = expect(asking).rejects.toThrow(
        failure('gemini.httpError', { status: 503, reason: HIGH_DEMAND }),
      );
      await vi.advanceTimersByTimeAsync(TIMEOUT_MS);
      await settled;
      expect(calls).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('回報的次數從 2 起算，逐次遞增', async () => {
    // 第一次不回報：畫面上那句「詢問中…」講的就是第一次，不必換字。
    const { doFetch } = inTurn(
      () => serverError(503),
      () => serverError(503),
      OK,
    );
    const attempts: number[] = [];

    await askReading(KEY, TERM, doFetch, (attempt) => attempts.push(attempt));

    expect(attempts).toEqual([2, 3]);
  });
});

describe('遠端調過的值與程式碼裡的預設值', () => {
  it('遠端有值就用遠端那份', () => {
    expect(remoteOrDefault('gemini-3.7-flash', 'gemini-3.6-flash')).toBe('gemini-3.7-flash');
  });

  it('遠端是空的或只有空白：當成沒調過，用預設值', () => {
    // 主控台上把值清成空白是手滑，不是「請你送出一句空的判準」。
    expect(remoteOrDefault('', 'gemini-3.6-flash')).toBe('gemini-3.6-flash');
    expect(remoteOrDefault('  \n ', 'gemini-3.6-flash')).toBe('gemini-3.6-flash');
  });

  it('遠端那份前後帶空白：去掉再用', () => {
    // 模型名字前後多一個換行就會變成 404，而判準那一段去頭尾空白不影響任何事。
    expect(remoteOrDefault('\n gemini-3.7-flash \n', 'gemini-3.6-flash')).toBe('gemini-3.7-flash');
  });
});
