/**
 * Firebase AI Logic 那條路的純邏輯：把 SDK 丟出來的錯翻回**與網頁版同一組** key。
 *
 * 單獨一支檔案而不是併進 `mobile/lib/gemini-reading-native.ts`，理由只有一個：那支檔案
 * import 了原生模組與 firebase 執行期程式碼，在 node 底下根本載不起來，測不到。這裡一行
 * 執行期的 firebase 都不 import，因此 `ai-logic-error.test.ts` 跑得動——而「各種失敗
 * 變成一條說得出原因的 key」正是兩條路徑最需要被守住的地方（spec 測試決定）。
 */
import { AppError, SilentError } from './app-error';
import { TIMEOUT_MS } from './gemini-reading';

/**
 * SDK 丟出來的東西，只認我們用得到的那幾格。
 *
 * 刻意不用 `instanceof AIError`：那要 import firebase 的執行期程式碼，這支檔案就測不動了。
 * 認的三格都是 SDK 公開介面的一部分，不是挖它的內部實作。
 */
interface AiLogicError {
  name?: unknown;
  code?: unknown;
  message?: unknown;
  customErrorData?: { status?: unknown };
}

/**
 * 從 SDK 那句組好的訊息裡挖回 Google 原本說的原因。
 *
 * SDK 把非 2xx 的失敗組成 `AI: Error fetching from <網址>: [<狀態> <狀態字>] <原因> (AI/<代號>)`，
 * 沒有另外留一格給那句原因，只能從訊息裡剪。尾巴那個 `(AI/…)` 用 `$` 錨在最後面剪，
 * 否則原因本身帶括號時（`Resource has been exhausted (e.g. check quota).`）會剪錯地方。
 *
 * 剪不出來時回 null，**不在這裡補上「沒有附原因」那句話**——理由與 `gemini-reading.ts`
 * 的 `reason()` 相同：那是我們自己的字，在這裡查表等於把語言凍在丟出錯誤的那一刻。
 */
function reasonIn(message: string): string | null {
  const found = /\[\d+[^\]]*\]\s([\s\S]+?)\s*\(AI\/[^)]+\)\s*$/.exec(message);
  const reason = found?.[1].trim() ?? '';
  return reason === '' ? null : reason;
}

/**
 * 把 SDK 的錯翻成畫面接得住的那一種。
 *
 * 回傳而不是丟出：呼叫端接到的是同一顆錯誤物件的替身，`throw toReadingError(error)`
 * 讀起來就知道這裡只做翻譯、不決定要不要中止。
 */
export function toReadingError(error: unknown): Error {
  const seen: AiLogicError = typeof error === 'object' && error !== null ? error : {};

  // 逾時是我們自己設的預算（`requestOptions.timeout`）到了，SDK 原樣丟回瀏覽器的中止錯誤。
  if (seen.name === 'AbortError') {
    return new AppError('gemini.timeout', { seconds: TIMEOUT_MS / 1000 });
  }

  const status = seen.customErrorData?.status;

  // App Check 沒過就是 401，而這條錯誤使用者一點辦法都沒有——iOS 上他連金鑰設定都看不到。
  // 讀音格單純留空，畫面上一個字都不出（spec 決定十一）。
  if (status === 401) return new SilentError();

  // 額度用完就是 429。**這條 key 的字面上不提額度、不提狀態碼**——iOS 使用者用的是共用的
  // 那一桶，他沒有自己的額度可看、也沒有金鑰設定可改，講清楚成因只是讓他知道自己無能為力
  // （spec 決定十三）。key 仍照成因命名，程式裡誠實記錄、畫面上刻意不講，是兩件事。
  //
  // 不比照 401 走完全靜默：App Check 失敗的人從頭到尾不知道有讀音預填，靜默不會讓他困惑；
  // 額度用完的人已經看過讀音自己填好，這次沒填要給一句交代。
  if (status === 429) return new AppError('gemini.quotaExhausted');

  if (typeof status === 'number') {
    const why = typeof seen.message === 'string' ? reasonIn(seen.message) : null;
    return why === null
      ? new AppError('gemini.httpErrorNoReason', { status })
      : new AppError('gemini.httpError', { status, reason: why });
  }

  // 模型有回，但內容被安全機制擋掉，`response.text()` 當場丟這一種。
  if (seen.code === 'response-error') return new AppError('gemini.emptyReply');

  // 兜底。剩下的都沒有狀態碼，實務上幾乎都是連線根本沒建立起來——SDK 把 fetch 丟出來的
  // 東西原樣包一層就轉手了，分不出更細的原因。
  //
  // **這不是一條站得住的推論**：SDK 自己攔下來的設定錯誤（`request-error`、`unsupported`）
  // 同樣沒有狀態碼，會被說成離線。接受這個誤導，是因為那幾種錯要嘛在開發時就炸了、
  // 要嘛是伺服器擋下來的（那時候帶得回狀態碼），而多開一條 key 只是把維護者的問題
  // 寫進使用者的畫面——他一樣無事可做。
  return new AppError('gemini.offline');
}
