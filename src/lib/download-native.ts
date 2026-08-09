/**
 * 把檔案交給使用者，原生殼那一端的接線。所有 Capacitor 的東西都只出現在這裡，
 * `src/ui/dom.ts` 因此不必知道「這台裝置是什麼」，只問「有沒有原生的存檔手段」。
 * 立場與 `safety-copy-native.ts` 相同。
 *
 * iOS 上沒有「下載」這回事：WKWebView 不認 `<a download>`，按了完全沒有反應
 * （見 issue 12）。改成寫進暫存檔再叫出系統分享單——使用者可以存到「檔案」、
 * AirDrop、傳給自己，比原本的下載更貼近 iOS 的習慣。
 *
 * 碰插件的那一段不寫自動測試：`@capacitor/filesystem` 與 `@capacitor/share`
 * 在 node 環境下沒有原生那一半，硬要測就得造一整套假物件，測到的只是自己寫的假貨
 * （spec 決定：原生橋接層一律改由真機的手動驗收守住）。
 * **但 `isCancelled()` 不算橋接層**——它是一個看字串的純函式，測得到就該測。
 */
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/**
 * 交檔案給使用者的那個動作。內容與檔名一字不改地沿用網頁版那一份。
 *
 * 不收網頁版那個 `type`：iOS 認的是副檔名，分享單靠 `.json` 就知道這是什麼，
 * 沒有地方擺得下一個 MIME 字串。收一個永遠用不到的參數比不收更難懂。
 */
export type SaveFile = (content: string, filename: string) => Promise<void>;

/**
 * 原生殼裡的存檔手段。**網頁版恆為 `null`**，呼叫端因此沿用既有的隱形連結，
 * 一行都不必為 iOS 改寫。
 */
export function createNativeSaveFile(): SaveFile | null {
  if (!Capacitor.isNativePlatform()) return null;

  return async (content, filename) => {
    // 暫存區：這只是遞給分享單的中繼站，使用者要留哪一份由分享單決定。
    const { uri } = await Filesystem.writeFile({
      path: filename,
      data: content,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });

    try {
      await Share.share({ files: [uri] });
    } catch (error) {
      // 使用者把分享單滑掉是正常操作，不是失敗。插件在這個情況下只丟一句
      // 訊息、沒有錯誤代碼可認（`SharePlugin.swift` 的 `call.reject("Share canceled")`），
      // 因此只能認這個字；認錯了頂多是少報一次，不會誤報成功。
      if (isCancelled(error)) return;
      throw error;
    }
  };
}

/**
 * 使用者把分享單滑掉了嗎？
 *
 * 這是整條路上唯一沒有原生依賴、也唯一分辨得出「取消」與「真的壞了」的地方，
 * 因此它 export 出來是為了被測到，不是有第二個呼叫端。
 */
export function isCancelled(error: unknown): boolean {
  return error instanceof Error && /cancel/i.test(error.message);
}
