/**
 * 整支 app 共用的那一份：儲存、複習流程、雲端備份。
 *
 * **四個畫面拿到的必須是同一份。** 這三樣彼此接線（雲端拉下來要重建複習佇列、每次評分
 * 存完要推上去），任何一頁自己再建一份就是兩套實作在寫同一批資料——`spec.md`
 * 〈程式碼怎麼擺〉把「邏輯層分岔」列為這條路上最不能踩的線。
 *
 * 這一支原本是 `App.tsx`。票 `09` 換上導覽列之後那支檔沒有了（進入點交給
 * `expo-router/entry`），內容搬到這裡，畫面那一半留在 `app/_layout.tsx`。
 */
import { getLocales } from 'expo-localization';
import { createContext, useContext, useEffect, useReducer, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { initI18n, setLang as switchLang, type LangChoice } from '@core/i18n';
import { createStore, type StorageLike, type Store } from '@core/lib/storage';
import { createCloudBackup, type CloudBackup } from '@core/lib/cloud-backup';
import type { CloudConsent } from '@core/lib/cloud-consent';
import type { AppData } from '@core/lib/types';
import { createNativeCloudConsent } from './cloud-consent-native';
import { isSelfCheckRequested, reportCryptoSelfCheck } from './crypto-self-check';
import { rateHaptic } from './haptics';
import { loadNativeCloudStorage } from './keychain-native';
import { createReviewSession, type ReviewSession } from './review-session';
import { createMmkvStorage } from './storage-mmkv';

/**
 * 這台裝置那一格儲存，開一次就好。
 *
 * 三行的順序不能換：`storage.ts` 與 `app-error.ts` 都會查介面字串表，接上之前叫到就丟例外。
 *
 * **語言跟著裝置走**，與網頁版 `src/app.ts` 遞 `navigator.language` 是同一件事
 * （`ADR-0013`）。`getLocales()` 是同步的，畫面出來之前就答得出來。
 */
const storage = createMmkvStorage();
initI18n(storage, getLocales()[0]?.languageTag ?? 'en');
const store = createStore(storage);

/**
 * 這台裝置對「要不要接回雲端」的答案。**記在 MMKV，不是 Keychain**——
 * 密碼跟著 iCloud 鑰匙圈走，同意不跟著走，兩件事分開正是 `cloud-consent.ts` 的重點。
 * 與提醒開關、Gemini 金鑰同一類：只管這一台裝置，不進 `AppData`，不上雲也不進匯出檔。
 */
const cloudConsent = createNativeCloudConsent(storage);

/**
 * 雲端備份與複習流程接起來。
 *
 * 兩個方向都要接，因此在同一個閉包裡建：雲端拉下一份新資料時複習佇列要重建
 * （`onData` → `session.reload()`），而每一次評分存完之後要推上去
 * （`onPersisted` → `cloud.push()`）。
 *
 * **推送這一步不是票 `06` 表上列的東西，但少了它會掉資料。** 雲端備份是整份覆蓋、
 * 較新的一份勝出（見 `CONTEXT.md`）；手機上評的分若不讓 `updatedAt` 往前走，
 * 電腦那邊一推，手機這幾天的複習就整批被蓋掉。網頁版 `src/app.ts` 的 `persist()`
 * 把推送接在同一個位置。
 */
function createWiring(
  cloudStorage: StorageLike,
  onChange: () => void,
  onStatus: (message: string) => void,
) {
  let session: ReviewSession;
  /**
   * 雲端備份本體。**`cloud-backup.ts` 一個字沒改**，遞進去的東西與網頁版 `src/app.ts`
   * 對應的那一段一樣。
   *
   * > 這一段本來住在 `./cloud-probe.ts`。那支檔是丟棄式的，檔頭寫著「資料頁那張票動工時
   * > 整支刪掉」——票 `18` 就是那張票，於是它連同探針畫面一起沒了。搬來這裡不是換地方，
   * > 是回到它本來就該在的位置：這個閉包本來就在建它。
   */
  const cloud = createCloudBackup({
    // **暱稱與密碼那一格是 Keychain，不是 MMKV**（票 `17`）：那一筆標記為可同步，
    // 換新 iPhone 時跟著 iCloud 鑰匙圈走（見 `./keychain-native.ts` 與 `ADR-0019`）。
    storage: cloudStorage,
    // bind 不可省：`fetch` 被拆下來單獨呼叫時會丟 Illegal invocation，
    // 與網頁版 `src/app.ts` 綁 window 是同一件事。
    fetch: fetch.bind(globalThis),

    /**
     * 雲端那份比較新，整份換掉。走一次匯入的驗證路徑，與網頁版同一條——壞掉的雲端資料
     * 弄不壞本機這份。
     */
    onPulled(json, updatedAt) {
      const pulled: AppData = { ...store.importJson(json), updatedAt };
      store.save(pulled);
      // 拉下來是「整份資料被換掉了」，複習佇列要跟著重建。
      session.reload();
    },

    /**
     * 推上去了，伺服器蓋了一個新的時間戳。**資料內容一個字沒變**，只有這一格要記下來。
     *
     * 與 `onPulled` 分成兩支，是因為兩邊該做的事相反：那邊要重讀、要重建佇列，
     * 這邊什麼都不能動——評完一張卡等伺服器回覆的那一瞬間重洗佇列的話，
     * 使用者會看到手上那張卡憑空換人（理由的正本在 `./review-session.ts`）。
     */
    onPushed(updatedAt) {
      session.noteCloudTimestamp(updatedAt);
    },

    /**
     * 那一行狀態字。**這兩支自己一句話都不說**，與網頁版 `src/app.ts` 一致——
     * 講話的是 `cloud-backup.ts`，而它說的每一句都查表（`cloud.offlineNote`、
     * `cloud.tooLarge` 那幾條）。
     *
     * > 探針時代這裡多接了兩句寫死的中文（「雲端比較新，拉下來了：N 本 · M 張卡」）。
     * > 那是診斷，不是介面文字，因此沒進翻譯檔；票 `18` 明訂資料頁上不留任何診斷，
     * > 兩句跟著探針一起走。
     */
    onStatus,
  });

  session = createReviewSession({
    store,
    now: () => new Date(),
    random: Math.random,
    onChange,
    /**
     * **評分存完就直接推。**中間沒有閘門了。
     *
     * 票 `13` 之前這裡隔著一道：標答比對會把**全域**亂數來源換成表裡那個固定的初始向量，
     * 那幾秒內推備份上去的話，那一份會用一個公開在版控裡的初始向量加密。
     * 比對搬出使用者的啟動路徑之後沒有人再鎖亂數來源，閘門就沒有存在的理由。
     */
    onPersisted: (data) => cloud.push(data),
    haptic: rateHaptic,
  });

  return { cloud, session };
}

export interface AppShared {
  store: Store;
  cloud: CloudBackup;
  /** 這台裝置要不要接雲端。畫面那一端用它記下「親手登入成功也算同意」。 */
  cloudConsent: CloudConsent;
  session: ReviewSession;
  cloudStatus: string;
  setCloudStatus(message: string): void;
  /**
   * 換介面語言，並把整支 app 重畫一次（票 `18`）。網頁版 `src/app.ts` 的 `setLang()`
   * 是同一支：`switchLang()` 只負責存，重畫那一步一直是接線層的事。
   *
   * **重畫非做不可**：`t()` 是在畫的那一刻查表的，不重畫的話換完語言畫面一個字都不會變。
   * 走這條而不是讓語言子畫面自己叫 `setLang()`，是因為要換的不只那一頁——底下四個 tab
   * 的字也要跟著換，而那一排住在 `../app/_layout.tsx`（見該檔的 `Shell`）。
   */
  setLang(choice: LangChoice): void;
}

const AppContext = createContext<AppShared | null>(null);

/** 拿共用的那一份。沒有被 `AppProvider` 包住時當場說清楚，不要交回一個假的空殼。 */
export function useApp(): AppShared {
  const shared = useContext(AppContext);
  if (shared === null) throw new Error('useApp() 只能在 <AppProvider> 底下叫');
  return shared;
}

export function AppProvider({ children }: { children: ReactNode }) {
  /**
   * 這支 app 的畫面本來就是整片重畫的，狀態機自己記著資料，React 這一側只要知道
   * 「有東西變了」。與網頁版不引入 signal／store／observer 是同一個理由（票 `02`）。
   *
   * **那個數字沒有人讀，往前走一格只是為了讓這個元件重畫。** 重畫一次底下那個
   * `value` 就是一個新物件，四個畫面身上的 `useApp()` 因此跟著重畫——context 是看
   * 物件是不是同一個，不是看內容有沒有變。
   */
  const [, redraw] = useReducer((count: number) => count + 1, 0);
  const [cloudStatus, setCloudStatus] = useState('');
  /**
   * **Keychain 讀完之前這裡是 null，底下什麼都不畫。**
   *
   * 暱稱與密碼住在 Keychain，而讀它是非同步的（`core/lib/keychain.ts` 的中間人先把那一筆
   * 讀進記憶體，此後才同步作答）。雲端備份問「登入了沒」的方式是同步的，因此它非得等到
   * 那一筆到手才建得起來——早一步建的話，它會認定這台沒登入，`push()` 第一行就返回，
   * 這台裝置從此一次都推不上去。
   *
   * 代價是啟動畫面多留幾毫秒。四個畫面一行都不必改：它們拿到 `useApp()` 的時候，
   * 手上那一份已經是完整的。
   */
  const [wiring, setWiring] = useState<ReturnType<typeof createWiring> | null>(null);

  /**
   * 開機那一趟爆掉時接住的東西。**包在一層物件裡**：`setState` 看到函式會當成
   * 「用舊值算新值」的更新器，而例外可以是任何東西。
   */
  const [failure, setFailure] = useState<{ error: unknown } | null>(null);

  /**
   * 開機第一步：把 Keychain 那一筆讀出來，再拿它建整份共用的東西。
   *
   * 只跑一次。空的相依陣列是刻意的——這是冷啟動的動作。
   *
   * **那個 `.catch` 不能省。** 這一段以前住在 `useState(() => …)` 裡，爆掉就當場是一片
   * 紅畫面，看得見；搬進 Promise 之後同一個例外會被默默丟掉，而 `wiring` 永遠是 null，
   * 畫面永遠什麼都不畫——**開機白畫面，一句話都不說**。接住之後在下面重新丟出去，
   * 讓它回到 React 那條看得見的路上。
   */
  useEffect(() => {
    void loadNativeCloudStorage(storage)
      .then((cloudStorage) => {
        setWiring(createWiring(cloudStorage, redraw, setCloudStatus));
      })
      .catch((error: unknown) => setFailure({ error }));
  }, []);

  /**
   * 開 app 就把雲端登入狀態接回來（票 `10`）。
   *
   * **少了這一句，手機上評的分一次都推不上去。** `push()` 第一行就是「沒登入就不做事」
   * （`if (account === null) return;`），而那個狀態只有這一支與登入流程會設。不叫它的話
   * 這台裝置冷啟動之後永遠是未登入，`updatedAt` 一動也不動，於是在「誰比較新」的比較裡
   * 永遠是舊的那一方——另一台裝置推一次，手機這幾天的複習就整批被蓋掉。
   *
   * 不必先問「登入過沒」：`begin()` 自己會先看本機有沒有記著暱稱密碼，沒有就當場返回，
   * 一個網路請求都不發。記著的話它會比兩邊的 `updatedAt`，決定拉下來還是把本機這份推上去；
   * 拉下來那條會走 `onPulled` → `session.reload()`，複習佇列跟著重建（見上面 `createWiring`）。
   *
   * **它跟標答比對碰不到頭，靠的是兩個事實，不是先後順序。** 比對期間會把**全域**的亂數
   * 來源換成表裡那個公開的固定值，那幾秒內加密出去的備份都會用到那個初始向量。擋住這件事的
   * 是：使用者那台根本跑不到比對（沒有觸發檔），而 CI 那台是全新安裝、沒存過暱稱密碼，
   * `begin()` 第一行就返回。**排在比對前面幫不上忙**——`begin()` 自己是同步返回的，加密丟在
   * 背景跑，兩個 `useEffect` 同一輪就走完，先宣告不等於先做完。CI 那台哪天開始存暱稱密碼，
   * 這一段就要重新想過。
   *
   * 只叫一次。空的相依陣列是刻意的：這是冷啟動的動作，每次重畫都重來一遍等於每畫一次
   * 就跟雲端對一次帳。從背景切回前景走的是底下那個 `AppState`，不會再進來這裡。
   */
  useEffect(() => {
    if (wiring === null) return;
    const cloud = wiring.cloud;
    /**
     * **先問，答「要」才接**（票 `17`）。順序不能反——反過來就是先拉再問，問了也沒用。
     *
     * 問的是這一台，不是這個帳號：密碼跟著 iCloud 鑰匙圈走到新裝置，同意不跟著走
     * （見 `core/lib/cloud-consent.ts`）。答過一次就不再問，沒登入過的裝置根本不問。
     *
     * `updatedAt` 非 0 代表這份資料曾經與雲端往返過——那台裝置早就在同步了，不必問。
     * 遞給 `begin()` 的那一份在答完之後才重讀：警示窗擋著的期間本機不會變，
     * 但重讀一次比留著一份跨越等待的舊資料誠實。
     */
    void cloudConsent.wantsPull(cloud.nickname(), store.load().updatedAt > 0).then((pull) => {
      if (pull) cloud.begin(store.load());
    });
  }, [wiring]);

  /**
   * 標答比對：**只有 CI 塞了觸發檔的時候才跑**，使用者那台問完那一句就走。
   *
   * 那一句是同步的（`exists` 是布林值），所以擺在這個 `useEffect` 的第一行就問得出來，
   * 不必先開一個 Promise 才知道要不要跑。使用者那台走到這裡就 return，一列標答都不碰。
   *
   * **它掛在這裡而不是「資料」那一頁，是刻意的。** CI 只是把 app 開起來然後等結論寫成檔案
   * （`.github/workflows/mobile-crypto.yml`），改成進頁才跑的話那支流程會永遠等不到。
   *
   * 結論不交回畫面：FAIL 的唯一去處是 CI 紅燈（票 `13` 拍板）。
   *
   * 只跑一次。空的相依陣列是刻意的：這張表不會因為畫面重畫而改變答案。
   */
  useEffect(() => {
    if (!isSelfCheckRequested()) return;
    void reportCryptoSelfCheck();
  }, []);

  /**
   * 回到前景時檢查一次有沒有跨過午夜。網頁版靠 `visibilitychange` 加一個原生事件兩條訊號，
   * React Native 上 `AppState` 就是那件事。檢查本身是冪等的，多叫幾次不會出事。
   */
  useEffect(() => {
    if (wiring === null) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') wiring.session.refreshDay();
    });
    return () => subscription.remove();
  }, [wiring]);

  // 這兩行要排在所有 hook 底下：hook 的呼叫順序每一輪都必須一樣。
  if (failure !== null) throw failure.error;
  if (wiring === null) return null;

  return (
    <AppContext.Provider
      value={{
        store,
        cloud: wiring.cloud,
        cloudConsent,
        session: wiring.session,
        cloudStatus,
        setCloudStatus,
        setLang(choice) {
          switchLang(choice);
          redraw();
        },
      }}
    >
      {children}
    </AppContext.Provider>
  );
}
