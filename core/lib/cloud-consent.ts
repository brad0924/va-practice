/**
 * 這台裝置要不要接回雲端備份。答過一次就不再問。
 *
 * 為什麼需要它：iOS 上密碼存在 Keychain 並同步到 iCloud 鑰匙圈（spec 決定十），
 * 第二台裝置因此一裝好就已經是登入狀態——票 06 真機驗證時發現，那台裝置問都沒問
 * 就把整份雲端資料拉了下來。密碼自動跟著走是要的，同意自動跟著走不是。訂正後的規則是
 * **密碼跟著走，同意不跟著走**：每一台新裝置各答一次，答過就不再問（票 14）。
 *
 * 答案記在本機獨立的一格，與 `gemini-key.ts` 的金鑰、`daily-reminder.ts` 的提醒開關
 * 同一個定位：這是「這台裝置要不要接」的偏好，不是使用者的資料，因此不進 `AppData`、
 * 不上雲端、不進匯出檔。
 *
 * 拒絕**不刪 Keychain 裡那一筆**：那個項目是可同步的，`SecItemDelete` 會把刪除同步到
 * 使用者所有的裝置——拿「這台不要接」當理由去刪一筆全域的密碼，代價完全不成比例。
 * 因此拒絕只做兩件事：這次不 `begin()`、在本機記下來不再問。
 *
 * **問的方式一律是非同步的。** 網頁版那條支線用 `confirm()`，它在 WKWebView 裡會擋住
 * 整條執行緒，答案當場就有；React Native 上沒有這種對話框，`Alert.alert` 是 callback。
 * 遷就比較慢的那一邊：`ask()` 與 `wantsPull()` 都回 `Promise`，`confirm()` 那端包一層
 * `Promise.resolve()` 就接得上（票 `17`）。反過來在手機那端自己組一套 callback 的話，
 * 「該不該問」的判斷會被重寫第二份，兩份日後各自漂走。
 *
 * 本模組不碰畫面：怎麼問由呼叫端遞進來，與 `keychain.ts` 同一個立場。
 * 接上實際那個對話框的接線在 `mobile/lib/cloud-consent-native.ts`。網頁版完全沒有這條支線——
 * 那裡沒有 Keychain，密碼不會憑空出現在一台新裝置上。
 */
import type { StorageLike } from './storage';

/**
 * 記著這台裝置答過什麼的地方。與 `va-practice:cloud`（暱稱與密碼）互不相干：
 * 那一格會跟著 iCloud 鑰匙圈走，這一格不會，兩件事分開正是這張票的重點。
 */
const CONSENT_STORAGE_KEY = 'va-practice:cloud-consent';

/**
 * 兩個答案都要存得下來，不能只記「拒絕過」——**沒有這一格代表「還沒問過」**，
 * 那是第三種狀態，也是唯一會讓對話框跳出來的那一種。
 */
const GRANTED = 'granted';
const DECLINED = 'declined';

export interface CloudConsent {
  /** 這台裝置拒絕過。「資料」畫面據此長出那條反悔的路。 */
  declined(): boolean;
  /**
   * 這台裝置要接。除了對話框按「接回來」，**在這台裝置上親手登入成功也算**——
   * 使用者剛剛才打完密碼，下次開 app 再問一次是在羞辱他。
   */
  grant(): void;
  /**
   * 這一次啟動要不要接回雲端。還沒答過就在這裡問一次並記下答案，答過的直接回上次那個。
   *
   * 呼叫端拿回傳值決定叫不叫 `cloud.begin()`，因此這一步必須早於它——
   * 反過來就是先拉再問，問了也沒用。
   *
   * @param nickname 本機記著的那個暱稱（`cloud.nickname()`），null 代表這台沒登入過。
   * @param syncedBefore 這台裝置的本機資料曾經與雲端往返過。**這種裝置一律不問**：
   *   密碼是使用者自己在這台打進去的，本來就沒有「沒被問過」這回事。走這條的是
   *   升級到本版本之前就已經登入著的裝置——它們本機不是空的，問了反而危險，
   *   一按取消就從此靜默停止備份，而票 14「沒有資料會因此毀掉」講的是全新安裝那條路。
   */
  wantsPull(nickname: string | null, syncedBefore: boolean): Promise<boolean>;
}

export interface CloudConsentHooks {
  storage: StorageLike;
  /**
   * 問使用者這一句，回答「要接」為 true。只有「還沒答過、而且真的記著一組暱稱」
   * 這一種情況會叫到它，因此暱稱一定有值，講得出是哪一個帳號。
   */
  ask(nickname: string): Promise<boolean>;
}

export function createCloudConsent(hooks: CloudConsentHooks): CloudConsent {
  function remember(answer: string): void {
    hooks.storage.setItem(CONSENT_STORAGE_KEY, answer);
  }

  return {
    declined() {
      return hooks.storage.getItem(CONSENT_STORAGE_KEY) === DECLINED;
    },

    grant() {
      remember(GRANTED);
    },

    async wantsPull(nickname, syncedBefore) {
      // 沒記著暱稱就是這台沒登入過，沒有東西可接。不問，也刻意不記下任何答案：
      // 密碼日後才從鑰匙圈同步過來的話，那時才輪得到問；使用者自己親手登入的話，
      // 那一次登入就算同意（接線在 `data-view.ts`）。
      if (nickname === null) return false;

      const answered = hooks.storage.getItem(CONSENT_STORAGE_KEY);
      if (answered === GRANTED) return true;
      if (answered === DECLINED) return false;

      // 這台早就在和雲端往返了，同意是它自己在更早以前表示過的。答案照樣記下來，
      // 之後就走上面那條——日後匯進一份舊備份把時間戳蓋掉，也不會讓它突然被問。
      if (syncedBefore) {
        remember(GRANTED);
        return true;
      }

      // 認不得的值（例如被別的東西寫壞了）與「沒有這一格」同路：重新問一次。
      // 誤問一次的代價是一句話，猜錯的代價是又一次沒被問過就同步。
      const wanted = await hooks.ask(nickname);
      remember(wanted ? GRANTED : DECLINED);
      return wanted;
    },
  };
}
