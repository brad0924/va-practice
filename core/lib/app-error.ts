/**
 * 我們自己丟的錯：只帶 key 與參數，**不帶任何語言的文字**（見 ADR-0013）。
 *
 * 理由是時間差。訊息若在丟出的當下就查好表，語言就在那一刻被凍住了，
 * 而錯誤可能在使用者切換語言之後才被顯示。帶 key 的物件從頭到尾與語言無關，
 * 顯示的那一刻（`toMessage()`）才決定用哪一種語言。
 *
 * 獨立一支檔案而不是塞進 `storage.ts`：雲端備份、Gemini、複習佇列、讀音編輯器
 * 都會用到它，收在 storage 裡會讓那支變成所有人都要 import 的雜物櫃。
 *
 * 有訊息的錯只有一種類別，不分 `ValidationError`／`NetworkError` 之類的階層——
 * 沒有任何一處程式碼需要按那種類別分流，接住的地方一律只做同一件事：顯示它。
 *
 * 底下的 `SilentError` 是唯一的例外，而它分的不是「哪一種錯」而是「說不說得出口」：
 * 接住它的地方要做的是**不顯示**。這是後來加的，加的時候檢查過上面那一條仍然成立。
 */
import { t, type Key } from '../i18n';

export class AppError extends Error {
  /** 翻譯檔裡的那一條。查表在顯示的當下才做。 */
  readonly key: Key;
  /** 代進 `{name}` 那種佔位符的值。沒有佔位符時不用給。 */
  readonly params?: Record<string, string | number>;

  constructor(key: Key, params?: Record<string, string | number>) {
    // 給 Error 的是 key 本身而不是查好的文字：這串只會出現在堆疊追蹤與主控台，
    // 那兩處要的正是「哪一條」，而不是使用者看到的那句話。
    super(key);
    this.name = 'AppError';
    this.key = key;
    this.params = params;
  }
}

/**
 * 說不出口的失敗：問不成，但畫面上一個字都不出。
 *
 * 只有一種用途——iOS 的讀音預填拿不到 App Check 憑證、或憑證被 Google 退回。
 * 那條錯誤使用者一點辦法都沒有（他連金鑰設定都看不到），看了只會焦慮，因此讀音格
 * 單純留空，與網頁版「沒設金鑰就什麼都不發生」一致（spec 決定十一）。
 *
 * 刻意不做成 `AppError` 的一條 key：它不帶訊息，接住它的地方要做的是**不顯示**，
 * 而不是顯示另一句話。用型別分開，接的人就不會不小心把它印出來。
 */
export class SilentError extends Error {
  constructor() {
    // 這串只會出現在堆疊追蹤裡，永遠不會到使用者眼前，因此不進翻譯檔。
    super('silent');
    this.name = 'SilentError';
  }
}

/**
 * 把攔到的例外轉成可以直接顯示給使用者的一句話。畫面層顯示錯誤一律走這裡。
 *
 * **fallback 不能拿掉**：有些錯不是我們丟的——`JSON.parse` 的 `SyntaxError`、
 * `fetch` 的網路錯誤、瀏覽器 API 的例外。那些沒有 key，只能照原樣顯示，
 * 它們的語言是瀏覽器給的，這一層消除不了。
 */
export function toMessage(error: unknown): string {
  if (error instanceof AppError) return t(error.key, error.params);
  return error instanceof Error ? error.message : String(error);
}
