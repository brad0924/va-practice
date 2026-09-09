/**
 * 磚要排成幾欄幾列。**吃三個數字，吐兩個數字，完全不碰 DOM**（票 08 決定 3）——
 * 場地多寬多高由呼叫端量了遞進來。
 *
 * 這樣切是為了測得動：jsdom 沒有排版，量不出磚有沒有排得下（`ADR-0014`），
 * 但「這麼寬這麼高的場地該排幾欄」是一道算術，離開瀏覽器照樣成立。
 *
 * 磚實際擺在哪、大小多少不在這裡：位置由 `spelling-view.ts` 照這裡吐的欄列算，
 * 大小由 `styles.css` 的 `min()` 夾住。這一支只回答形狀。
 */

/**
 * 這一堆磚在這塊場地上該排成幾欄幾列。
 *
 * 式子是 `ceil(sqrt(磚數 × 長寬比))`。原本寫的是 `ceil(sqrt(磚數))`，那條假設場地是正方形；
 * 手機橫著拿、畫面切成左右兩欄之後，右半邊變成又高又窄，同樣十二塊磚該是三欄四列而不是
 * 四欄三列（票 08 的起點）。把長寬比乘進根號裡，欄數就會跟著場地的形狀走。
 *
 * **場地是正方形時整條式子縮回原本那一條**，一個字都不差。直握的排法因此不是「重新算出
 * 同樣的答案」，是根本沒踏進新的分支——票 08 驗收那條「直握一個像素都沒變」靠這件事成立。
 *
 * 量不到場地時（還沒排版，兩個邊都是 0）長寬比取 1，也就是退回正方形的算法。
 * 不擋的話除出來是 Infinity 或 NaN，灌進 CSS 變數會讓整片磚消失。
 */
export function tileGrid(count: number, width: number, height: number): { cols: number; rows: number } {
  if (count <= 0) return { cols: 1, rows: 1 };
  const ratio = width > 0 && height > 0 ? width / height : 1;
  // 夾在 1 與磚數之間：欄數比磚數還多的話最後幾欄是空的，格線的中心點就全部偏了。
  const cols = Math.min(count, Math.max(1, Math.ceil(Math.sqrt(count * ratio))));
  return { cols, rows: Math.ceil(count / cols) };
}
