import { describe, it, expect, vi } from 'vitest';
import { withRetry } from './reading-retry';
import { TIMEOUT_MS } from './gemini-reading';
import { AppError, SilentError } from './app-error';
import type { Key } from '../i18n';

/** 比對的是 key 與參數，**沒有任何一種語言的文字**（票 05），與網頁版那組測試同一套手法。 */
function failure(key: Key, params?: Record<string, string | number>) {
  return expect.objectContaining(params === undefined ? { key } : { key, params });
}

/** 503 時 Google 真的回的那句話，`toReadingError()` 會把它剪進 `reason` 參數。 */
const HIGH_DEMAND = 'This model is currently experiencing high demand.';

/**
 * `toReadingError()` 翻完之後的樣子——本模組看到的**只有**這一種形狀（決定三）。
 * 從 `params.status` 讀得回狀態碼，這正是重試判斷的依據。
 */
function translated(status: number): AppError {
  return new AppError('gemini.httpError', { status, reason: HIGH_DEMAND });
}

/** 成功那一次的回傳值。是 `unknown`，這一層不看內容。 */
const PARSED = { termKana: 'こがす' };

/**
 * 排好順序的假 `attempt`：第 N 次丟／回第 N 份，排完之後一直用最後那份。
 * `calls()` 數呼叫次數，那是「到底有沒有再問一次」唯一數得出來的證據。
 */
function inTurn(...outcomes: Array<() => unknown>) {
  let calls = 0;
  const attempt = async () => {
    const outcome = outcomes[Math.min(calls, outcomes.length - 1)]!;
    calls += 1;
    return outcome();
  };
  return { attempt, calls: () => calls };
}

/** 丟東西用的：寫在 `inTurn` 的清單裡讀起來跟「回一份」對稱。 */
function throws(error: unknown): () => never {
  return () => {
    throw error;
  };
}

describe('伺服器那端出事時自動再問一次', () => {
  // 500／502／503／504 都是「再送一次會成功」的那一種，Google 自己叫你等一下再試。
  for (const status of [500, 502, 503, 504]) {
    it(`${status}：再問一次就好，使用者看不到錯誤`, async () => {
      const { attempt, calls } = inTurn(throws(translated(status)), () => PARSED);

      await expect(withRetry(attempt)).resolves.toEqual(PARSED);
      expect(calls()).toBe(2);
    });
  }

  // 金鑰不對、模型叫不動——再送一百次都一樣。
  for (const status of [400, 403, 404]) {
    it(`${status}：不會自己變對，問一次就放棄`, async () => {
      const { attempt, calls } = inTurn(throws(translated(status)), () => PARSED);

      await expect(withRetry(attempt)).rejects.toThrow(
        failure('gemini.httpError', { status, reason: HIGH_DEMAND }),
      );
      expect(calls()).toBe(1);
    });
  }

  it('額度用完：翻譯過後根本沒有 status 那一格，挖不到就不重試', async () => {
    // 429 走的是 `gemini.quotaExhausted`，`toReadingError()` 不給它 params。
    // 這一條順帶釘住「params 裡挖不到 status 的一律不重試」。
    const { attempt, calls } = inTurn(throws(new AppError('gemini.quotaExhausted')), () => PARSED);

    await expect(withRetry(attempt)).rejects.toThrow(failure('gemini.quotaExhausted'));
    expect(calls()).toBe(1);
  });

  // 連不上是使用者自己的網路，另外兩種是模型回了但回得不能用——重試都沒有意義。
  for (const key of ['gemini.offline', 'gemini.notJson', 'gemini.emptyReply'] as const) {
    it(`${key}：問一次就放棄`, async () => {
      const { attempt, calls } = inTurn(throws(new AppError(key)), () => PARSED);

      await expect(withRetry(attempt)).rejects.toThrow(failure(key));
      expect(calls()).toBe(1);
    });
  }

  it('說不出口的那一種：原樣往上丟，不被當成暫時性失敗', async () => {
    const { attempt, calls } = inTurn(throws(new SilentError()), () => PARSED);

    await expect(withRetry(attempt)).rejects.toBeInstanceOf(SilentError);
    expect(calls()).toBe(1);
  });

  it('回報的次數從 2 起算，逐次遞增', async () => {
    // 第一次不回報：畫面上那句「詢問中…」講的就是第一次，不必換字。
    const { attempt } = inTurn(throws(translated(503)), throws(translated(503)), () => PARSED);
    const attempts: number[] = [];

    await withRetry(attempt, (n) => attempts.push(n));

    expect(attempts).toEqual([2, 3]);
  });
});

describe('一份預算從頭吃到尾', () => {
  it('交給 attempt 的是「還剩幾毫秒」，逐次遞減', async () => {
    // iOS 的碼表不是我們按的，是把剩餘毫秒交給 SDK，它每次自己開一顆。
    // 不遞減的話重試就等於多送一份 10 秒，使用者的等待上限會被偷偷加長（決定二）。
    vi.useFakeTimers();
    try {
      const budgets: number[] = [];
      const spent = [3_000, 2_000];
      let calls = 0;
      const attempt = async (budgetMs: number) => {
        budgets.push(budgetMs);
        const cost = spent[calls];
        calls += 1;
        if (cost === undefined) return PARSED;
        vi.advanceTimersByTime(cost);
        throw translated(503);
      };

      await expect(withRetry(attempt)).resolves.toEqual(PARSED);
      expect(budgets).toEqual([TIMEOUT_MS, 7_000, 5_000]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('一直撞 503 撞到預算用完：講的是 503，不是逾時', async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      const attempt = async () => {
        calls += 1;
        // 第三次把碼表撥到底，模擬「一直撞、撞到預算用完」。
        if (calls === 3) vi.advanceTimersByTime(TIMEOUT_MS);
        throw translated(503);
      };

      await expect(withRetry(attempt)).rejects.toThrow(
        failure('gemini.httpError', { status: 503, reason: HIGH_DEMAND }),
      );
      expect(calls).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('撞過 503 之後 SDK 把預算用完丟 AbortError：講的還是 503', async () => {
    // 跟上一條走的是不同的分支。上一條在迴圈頂端就發現預算見底，這一條是預算交給了 SDK、
    // 它自己燒完丟出中止錯誤，`toReadingError()` 已經把它翻成 `gemini.timeout`。
    // 使用者真正撞到的是 503，講成「等太久」跟事實對不上（票 07）。
    const { attempt } = inTurn(
      throws(translated(503)),
      throws(new AppError('gemini.timeout', { seconds: TIMEOUT_MS / 1000 })),
    );

    await expect(withRetry(attempt)).rejects.toThrow(
      failure('gemini.httpError', { status: 503, reason: HIGH_DEMAND }),
    );
  });

  it('一次 5xx 都沒撞過就用完預算：那句逾時原樣往上丟，秒數沒變樣', async () => {
    const { attempt, calls } = inTurn(
      throws(new AppError('gemini.timeout', { seconds: TIMEOUT_MS / 1000 })),
    );

    await expect(withRetry(attempt)).rejects.toThrow(
      failure('gemini.timeout', { seconds: TIMEOUT_MS / 1000 }),
    );
    expect(calls()).toBe(1);
  });

  it('第一次就撞 503 又剛好燒光預算：下一圈頂端收手，講的是 503', async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      const attempt = async () => {
        calls += 1;
        vi.advanceTimersByTime(TIMEOUT_MS);
        throw translated(503);
      };

      await expect(withRetry(attempt)).rejects.toThrow(
        failure('gemini.httpError', { status: 503, reason: HIGH_DEMAND }),
      );
      expect(calls).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
