/**
 * 讀音預填要用的 Gemini API（Application Programming Interface，應用程式介面）金鑰。
 *
 * 這裡刻意不寫進 `AppData`：金鑰一旦進了那份資料，就同時從 localStorage、
 * 雲端備份、匯出檔三個出口流出去，其中匯出檔是明文的。因此比照
 * `cloud-backup.ts` 的暱稱密碼，自己占一格 localStorage，既不上雲也不進匯出檔。
 * 代價是金鑰不跨裝置同步，每台裝置各設定一次（見 issue 01 決定 1、2）。
 */
import type { StorageLike } from './storage';

/** 記住金鑰的地方。與 `va-practice:data`、`va-practice:cloud` 互不相干。 */
const GEMINI_STORAGE_KEY = 'va-practice:gemini';

export interface GeminiKey {
  /** 目前存著的金鑰，未設定為 null。 */
  read(): string | null;
  /** 寫入金鑰。傳 null 或只有空白的字串代表清除。 */
  write(key: string | null): void;
}

export function createGeminiKey(storage: StorageLike): GeminiKey {
  return {
    read() {
      return storage.getItem(GEMINI_STORAGE_KEY);
    },

    write(key) {
      // 金鑰是複製貼上來的，前後常黏著空白或換行。去掉之後如果什麼都不剩，
      // 那就是要清除——不留一格空字串，否則 read() 得回一把「空金鑰」。
      const trimmed = key?.trim() ?? '';
      if (trimmed === '') {
        storage.removeItem(GEMINI_STORAGE_KEY);
        return;
      }
      storage.setItem(GEMINI_STORAGE_KEY, trimmed);
    },
  };
}
