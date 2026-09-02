/**
 * 探針畫面那塊雲端備份的接線（票 `05` 驗收第 4 條）。
 *
 * **這是丟棄式的。** 資料頁那張票動工時整支刪掉——真正的雲端備份介面屬於資料頁，
 * 排在複習畫面、卡片列表、編輯畫面之後。這裡只要回答一個問題：
 * **電腦上存的備份，手機真的拉得下來嗎？反過來呢？**
 *
 * 標答表（`crypto-self-check.ts`）證明的是「兩把鎖一模一樣」，證明不了「東西真的推得上去、
 * 拉得回來」。中間還隔著網路、Firebase 的安全規則、還有 `cloud-backup.ts` 那一層。
 * 這張票排在所有畫面之前就是要讓最高的風險早點曝出來，那就不該等到第四頁畫面才驗。
 *
 * **`cloud-backup.ts` 一個字沒改**，遞進去的東西與網頁版 `src/app.ts` 對應的那一段一樣。
 *
 * > 這裡本來有一段警語：暱稱與密碼存在 MMKV 不是 Keychain，那一版不要送到任何人手上。
 * > 票 `17` 把那一筆搬進了 Keychain，警語跟著撤掉——`storage` 現在由
 * > `app-context.tsx` 遞 `keychain-native.ts` 交出來的那一個（見 `ADR-0019`）。
 */
import { createCloudBackup, type CloudBackup } from '@core/lib/cloud-backup';
import type { StorageLike, Store } from '@core/lib/storage';
import type { AppData } from '@core/lib/types';

export interface CloudProbeHooks {
  /** 暱稱與密碼那一格。**這一格是 Keychain，不是 MMKV**（票 `17`）。 */
  storage: StorageLike;
  store: Store;
  /** 雲端那份比較新，整份換掉了。呼叫端要重讀。 */
  onPulled(data: AppData): void;
  /**
   * 推上去了，伺服器蓋了一個新的時間戳。**資料內容一個字沒變**，只有這一格要記下來。
   *
   * 與 `onPulled` 分成兩支，是因為兩邊該做的事相反：那邊要重讀、要重建佇列，
   * 這邊什麼都不能動——評完一張卡等伺服器回覆的那一瞬間重洗佇列的話，
   * 使用者會看到手上那張卡憑空換人。存檔由呼叫端做，見 `review-session.ts`。
   */
  onPushed(updatedAt: number): void;
  /** 一行狀態字。空字串代表沒事發生。 */
  onStatus(message: string): void;
}

function describe(data: AppData): string {
  return `${data.books.length} 本 · ${data.cards.length} 張卡`;
}

export function createCloudProbe(hooks: CloudProbeHooks): CloudBackup {
  return createCloudBackup({
    storage: hooks.storage,
    // bind 不可省：`fetch` 被拆下來單獨呼叫時會丟 Illegal invocation，
    // 與網頁版 `src/app.ts` 綁 window 是同一件事。
    fetch: fetch.bind(globalThis),

    onPulled(json, updatedAt) {
      // 走一次匯入的驗證路徑，與網頁版同一條——壞掉的雲端資料弄不壞本機這份。
      const pulled: AppData = { ...hooks.store.importJson(json), updatedAt };
      hooks.store.save(pulled);
      hooks.onPulled(pulled);
      hooks.onStatus(`雲端比較新，拉下來了：${describe(pulled)}`);
    },

    onPushed(updatedAt) {
      // 時間戳是伺服器蓋的，本機要記下來，下次開 app 才比得出新舊。
      // **這裡不自己讀寫儲存**：呼叫端手上那份才是最新的，繞過它去 load 一次，
      // 會把它還沒存完的東西讀成舊的。存檔由呼叫端做，見上面 `onPushed` 的說明。
      hooks.onPushed(updatedAt);
      hooks.onStatus('本機比較新，推上去了');
    },

    onStatus: hooks.onStatus,
  });
}
