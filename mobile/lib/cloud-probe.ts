/**
 * 探針畫面那塊雲端備份的接線（票 `05` 驗收第 4 條）。
 *
 * **這是丟棄式的。** 票 `06` 換掉 `App.tsx` 時整支刪掉——真正的雲端備份介面屬於資料頁，
 * 排在複習畫面、卡片列表、編輯畫面之後。這裡只要回答一個問題：
 * **電腦上存的備份，手機真的拉得下來嗎？反過來呢？**
 *
 * 標答表（`crypto-self-check.ts`）證明的是「兩把鎖一模一樣」，證明不了「東西真的推得上去、
 * 拉得回來」。中間還隔著網路、Firebase 的安全規則、還有 `cloud-backup.ts` 那一層。
 * 這張票排在所有畫面之前就是要讓最高的風險早點曝出來，那就不該等到第四頁畫面才驗。
 *
 * **`cloud-backup.ts` 一個字沒改**，遞進去的東西與網頁版 `src/app.ts` 對應的那一段一樣。
 *
 * > **暱稱與密碼會存在 MMKV，不是 Keychain。** 網頁版存 `localStorage`，這裡照搬。
 * > 隱私權政策寫的「iOS 版存在系統的 Keychain 裡」講的是 Capacitor 版；React Native 版
 * > 的金鑰搬遷是另一張票（票 `05` 明寫「不做金鑰搬遷」）。**這一版不要送到任何人手上。**
 */
import { createCloudBackup, type CloudBackup } from '@core/lib/cloud-backup';
import type { StorageLike, Store } from '@core/lib/storage';
import type { AppData } from '@core/lib/types';

export interface CloudProbeHooks {
  storage: StorageLike;
  store: Store;
  /** 整份資料換人了——拉下來一份，或推上去之後時間戳變了。 */
  onData(data: AppData): void;
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
      hooks.onData(pulled);
      hooks.onStatus(`雲端比較新，拉下來了：${describe(pulled)}`);
    },

    onPushed(updatedAt) {
      // 時間戳是伺服器蓋的，本機要記下來，下次開 app 才比得出新舊。
      const pushed: AppData = { ...hooks.store.load(), updatedAt };
      hooks.store.save(pushed);
      hooks.onData(pushed);
      hooks.onStatus(`本機比較新，推上去了：${describe(pushed)}`);
    },

    onStatus: hooks.onStatus,
  });
}
