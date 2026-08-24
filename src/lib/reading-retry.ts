/**
 * iOS 那條路的重試迴圈：純邏輯，**一行執行期的 firebase 都不 import**。
 *
 * 單獨一支檔案而不是併進 `gemini-reading-native.ts`，理由與 `ai-logic-error.ts` 相同：
 * 那支 import 了 Capacitor 外掛與 firebase 執行期程式碼，在 node 底下載不起來、測不到。
 * 迴圈只收一個「做一次事」的 callback，它不知道底下是 SDK 還是假貨，因此測得動（票 09）。
 *
 * 網頁版的 `askReading()` 有自己一套已經上線的重試，**刻意不共用**：兩邊的碼表機制不同
 * （網頁版一顆 `AbortController` 包住整支，iOS 是每次把剩餘毫秒交給 SDK），硬併會把一個
 * 能動的東西拆開重接。
 */
import { AppError } from './app-error';
import { TIMEOUT_MS, TRANSIENT } from './gemini-reading';

/**
 * 值得再問一次的那一種。判斷放在 `toReadingError()` 翻譯**之後**（票 09 決定三）：
 * 那支已經把非 2xx 收斂成帶 `status` 參數的 `AppError`，狀態碼從參數挖得回來，
 * 不必在 iOS 那條路上把「怎麼從 SDK 錯誤挖出 status」再抄一份。
 *
 * 挖不到 `status` 的一律不重試——429 被翻成 `gemini.quotaExhausted`、根本沒有參數，
 * 而額度用完再問只會燒更快。
 */
function isTransient(error: unknown): error is AppError {
  if (!(error instanceof AppError)) return false;
  const status = error.params?.status;
  return typeof status === 'number' && TRANSIENT.has(status);
}

/** 預算燒完的那一種。SDK 丟 `AbortError`，`toReadingError()` 已經把它翻成這條 key。 */
function isTimeout(error: unknown): boolean {
  return error instanceof AppError && error.key === 'gemini.timeout';
}

/**
 * 撞到 5xx 就自動再問，**次數不設上限、中間不停頓**，問到成功或預算用完為止。
 * 沒裝次數煞車是刻意的，理由與要量的兩個數字記在票 07。
 *
 * 整輪共吃一份 `TIMEOUT_MS`，重試沒有自己的預算——像微波爐轉 10 分鐘的旋鈕，中途換一盤
 * 菜進去，旋鈕不會回到 10 分。iOS 上這件事要自己算：碼表不是我們按的，是把「還剩幾毫秒」
 * 交給 SDK 當 `RequestOptions.timeout`，它每次 `generateContent()` 自己開一顆新的。
 * 不遞減的話多問一次就是多送一份 10 秒（票 09 決定二）。
 *
 * 時鐘直接用 `Date.now()`，不從外面 inject：`vi.useFakeTimers()` 預設連 `Date` 一起假造，
 * 多一個參數只是把測試的方便寫進上線的介面。
 *
 * `runOnce` 收到的是還剩幾毫秒；回傳值型別是 `unknown`，這一層不看內容——形狀由 schema
 * 保證，內容信不信是 `acceptPrefill` 的事。名字刻意不叫 `attempt`：那個字在這裡是
 * 「第幾次」，與網頁版 `askReading()` 的迴圈計數同一個意思，讓給計數用。
 * `onAttempt` 選填：開始第 N 次之前叫一聲，N 從 2 起算，與網頁版同一份契約。
 */
export async function withRetry(
  runOnce: (budgetMs: number) => Promise<unknown>,
  onAttempt?: (attempt: number) => void,
): Promise<unknown> {
  const deadline = Date.now() + TIMEOUT_MS;
  /** 這一輪最後收到的那個 5xx。預算用完時要丟它，理由見底下 catch。 */
  let lastTransient: AppError | null = null;

  for (let attempt = 1; ; attempt++) {
    const budgetMs = deadline - Date.now();
    // 預算見底就收手：撞過 5xx 就講 5xx，單純是慢才講逾時。
    if (budgetMs <= 0) {
      throw lastTransient ?? new AppError('gemini.timeout', { seconds: TIMEOUT_MS / 1000 });
    }
    if (attempt > 1) onAttempt?.(attempt);

    try {
      return await runOnce(budgetMs);
    } catch (error) {
      // 預算是交給 SDK 的，用完時它丟 AbortError → 翻成 gemini.timeout。
      // 撞過 5xx 的話，使用者真正撞到的是 503，講成「等太久」跟事實對不上（票 07）。
      if (lastTransient !== null && isTimeout(error)) throw lastTransient;
      if (!isTransient(error)) throw error;
      lastTransient = error;
    }
  }
}
