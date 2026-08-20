/**
 * 探針：把讀音預填每一段花了幾秒印在畫面上。
 *
 * **這整支檔案是丟棄品。** 量到數字、逾時的原因定案之後，連同 `gemini-reading-native.ts`
 * 裡那幾個 `record()` 呼叫一起刪掉。
 *
 * 為什麼非得畫在畫面上：維護者的開發機是 Windows，看不到 Safari 的除錯器，主控台的
 * 日誌在 iPhone 上一行都讀不到。真機上唯一讀得到的東西就是畫面本身。
 *
 * 幾個平常不會這樣寫的地方，都是「丟棄品」這個理由：
 *
 * - **`lib/` 反過來 import `ui/`。** 正常的方向是 `ui/` 用 `lib/`。這裡倒過來，是因為
 *   拆除時要能一眼看完——一支檔案加幾個呼叫點，而不是散在三層裡。
 * - 樣式寫在行內，不進 `styles.css`。動了那個檔，網頁版的 CSS 產物就跟著變。
 * - 文字寫死，不進 `i18n/`。只有維護者會看到這幾行字。
 *
 * 只有 iOS build 會載入：唯一 import 它的是 `gemini-reading-native.ts`，而那支是由
 * `editor-view.ts` 在 `import.meta.env.MODE === 'ios'` 底下動態載入的。
 */

/** 畫面右下角那個框。第一次 `record()` 時才長出來。 */
let box: HTMLElement | null = null;

/** 留幾行。多了會蓋住編輯畫面。 */
const KEEP = 6;

function ensureBox(): HTMLElement {
  if (box !== null) return box;

  const created = document.createElement('pre');
  created.style.position = 'fixed';
  created.style.left = '0.5rem';
  created.style.right = '0.5rem';
  created.style.bottom = '0.5rem';
  created.style.zIndex = '9999';
  created.style.margin = '0';
  created.style.padding = '0.4rem 0.5rem';
  created.style.background = 'rgba(0, 0, 0, 0.75)';
  created.style.color = '#9fe8b0';
  created.style.fontSize = '0.7rem';
  created.style.lineHeight = '1.35';
  created.style.whiteSpace = 'pre-wrap';
  created.style.wordBreak = 'break-all';
  created.style.borderRadius = '0.35rem';
  // 只是拿來看的，不要擋住底下的按鈕。
  created.style.pointerEvents = 'none';
  document.body.append(created);

  box = created;
  return created;
}

/**
 * 記一行。`seconds` 省略代表這一行只是說一件事發生了，沒有時間可報。
 *
 * 靜默的失敗最需要這支：畫面上什麼都不會出現，不印在這裡就等於沒發生過。
 */
export function record(label: string, seconds?: number): void {
  const clock = new Date().toTimeString().slice(0, 8);
  const took = seconds === undefined ? '' : ` ${seconds.toFixed(1)}s`;
  const shown = ensureBox();
  const lines = [...shown.textContent!.split('\n').filter((line) => line !== ''), `${clock} ${label}${took}`];
  shown.textContent = lines.slice(-KEEP).join('\n');
}

/** 量一段非同步工作花了多久，成敗都記。回傳原本那顆 promise 的結果。 */
export async function timed<T>(label: string, work: Promise<T>): Promise<T> {
  const started = Date.now();
  try {
    const value = await work;
    record(label, (Date.now() - started) / 1000);
    return value;
  } catch (error) {
    record(`${label} ✗`, (Date.now() - started) / 1000);
    throw error;
  }
}
