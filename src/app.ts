import { cardsInBooks, createStore, type ImportResult, type StorageLike } from '@core/lib/storage';
import { createCloudBackup, type CloudBackup } from '@core/lib/cloud-backup';
import { createNativeCloudConsent } from './lib/cloud-consent-native';
import type { CloudConsent } from '@core/lib/cloud-consent';
import { createGeminiKey, type GeminiKey } from '@core/lib/gemini-key';
import { withSafetyCopy } from '@core/lib/safety-copy';
import { createNativeSafetyCopy } from './lib/safety-copy-native';
import { createNativeHaptic } from './lib/haptics-native';
import { planReminders, type DailyReminder } from '@core/lib/daily-reminder';
import { createNativeDailyReminder } from './lib/daily-reminder-native';
import { currentCard, rebuildQueue, rate as rateCard, toDateKey, type Queue } from '@core/lib/review';
import { onNativeForeground } from './lib/foreground-native';
import type { AppData, Card, Rating } from '@core/lib/types';
import { initI18n, setLang as switchLang, type LangChoice } from '@core/i18n';
import { initSpeech } from './ui/speech';
import { createSyncStatus } from './ui/sync-status';
import { reviewView } from './ui/review-view';
import { listView } from './ui/list-view';
import { dataView } from './ui/data-view';
import { statsView } from './ui/stats-view';
import { editorView } from './ui/editor-view';

/**
 * 畫面層的共用狀態與導覽。
 * 當前時間與亂數在這裡才第一次接觸真實世界，三個核心模組仍然是純的。
 */
export interface App {
  readonly data: AppData;
  readonly queue: Queue;
  /** 雲端備份。未登入時所有操作都是靜默的，一個網路請求都不發。 */
  readonly cloud: CloudBackup;
  /** 使用者自備的 Gemini 金鑰。只留在這台裝置，不上雲也不進匯出檔。 */
  readonly gemini: GeminiKey;
  /**
   * 這台裝置要不要接回雲端備份。**網頁版為 null**——那裡沒有 Keychain，密碼不會憑空
   * 出現在一台新裝置上，這一問完全不必發生（見票 14）。
   */
  readonly cloudConsent: CloudConsent | null;
  /**
   * 每日提醒。**網頁版為 null**——那裡沒有系統通知這條支線，
   * 「資料」畫面因此連這個開關都不會長出來。
   */
  readonly reminder: DailyReminder | null;
  /** 目前卡片是否已掀開答案。放在這裡，重畫畫面時才不會把答案蓋回去。 */
  readonly revealed: boolean;
  now(): Date;
  reveal(): void;
  /** 對目前卡片評分並前進到下一張。 */
  rate(rating: Rating): void;
  /** 新增或更新一張卡，同時反映到當日佇列上。新卡屬於複習範圍外的本時不進佇列。 */
  upsert(card: Card): void;
  remove(id: string): void;
  /**
   * 換上一份改過的資料並存檔、推上雲端。給單字本那幾支純函式
   * （`addBook` / `renameBook` / `deleteBook` / `setScope`）的產物用。
   */
  applyData(next: AppData): void;
  /** 整份覆蓋本機資料並推上雲端。格式不對時直接丟例外，由畫面接住。 */
  importBackup(text: string): void;
  /**
   * 把一份備份檔的卡加進某一本並推上雲端，重複的跳過。
   * 格式不對或那一本不在了時直接丟例外，由畫面接住。
   */
  importWords(text: string, bookId: string): ImportResult;
  /** 目前這份資料的備份內容，交給畫面決定檔名與怎麼存。 */
  exportBackup(): string;
  showReview(): void;
  showList(): void;
  /** 只有卡片頁能進來，回去的目的地固定，不必傳 back。 */
  showData(): void;
  /** 只有資料頁能進來，回去的目的地固定，不必傳 back。 */
  showStats(): void;
  showEditor(card: Card | null, back: () => void): void;
  /**
   * 換介面語言並立刻重畫當前畫面。這個 app 的畫面本來就是整片重畫的，
   * 因此 i18n 不必引入 signal、store、observer 之類的響應式機制（見票 02）。
   */
  setLang(choice: LangChoice): void;
  /** 目前畫面的鍵盤處理器，離開畫面時自動解除。 */
  keyHandler: ((event: KeyboardEvent) => void) | null;
}

/**
 * `cloudStorage` 是雲端備份記暱稱與密碼的地方。網頁版遞的是 localStorage，
 * iOS 遞的是 Keychain 撐起來的那一個（見 `main.ts`）——雲端備份自己不必知道差別。
 */
export function start(root: HTMLElement, cloudStorage: StorageLike): void {
  // 介面語言要在任何一個字被畫出來之前決定好，因此擺在最前面。選擇存在
  // localStorage 的獨立一格，跟資料與雲端備份無關；沒選過就看裝置語言。
  initI18n(localStorage, navigator.language);
  // iOS 上的保險副本夾在 store 與 localStorage 之間，跟上每一次本機寫入。
  // 網頁版拿到的是個什麼都不做的東西，這條路完全不發生。
  const store = createStore(withSafetyCopy(localStorage, createNativeSafetyCopy()));
  // 評分時震的那一下。網頁版拿到的是空的，因此底下 rate() 不必問「這是不是 iPhone」。
  const haptic = createNativeHaptic();
  const now = () => new Date();
  const random = Math.random;

  let data = store.load();
  // 佇列只吃複習範圍內的卡，過濾在底下的 rebuild() 裡——review.ts 那幾支因此
  // 完全不必知道單字本存在。開機這一次也走它，「這份佇列是依哪一天建的」才不會漏記。
  let queue: Queue = [];
  let queueDate = '';
  rebuild();
  let revealed = false;
  let render: () => void = () => {};

  // 每日提醒。吃的必須與 buildQueue() 同一批卡（複習範圍內的那些），否則通知上的
  // 數字與使用者打開 app 看到的對不起來——因此這裡刻意與上面那一行並排。
  // 網頁版拿到的是 null，底下每一個呼叫點都是 `reminder?.`，那條路完全不發生。
  // 幾點叫由提醒自己記著並遞進來，這裡不去讀那一格——兩邊各讀各的就有機會讀到不一樣的答案。
  const reminder = createNativeDailyReminder(localStorage, (time) =>
    planReminders(cardsInBooks(data.cards, data.scopes.review), now(), time),
  );

  const cloud = createCloudBackup({
    storage: cloudStorage,
    // bind 不可省：fetch 被拆下來單獨呼叫時瀏覽器會丟 Illegal invocation。
    fetch: fetch.bind(window),
    onPulled(json, updatedAt) {
      // 走一次匯入的驗證路徑，壞掉的雲端資料不會弄壞本機這份。
      store.save({ ...store.importJson(json), updatedAt });
      reload();
      render();
    },
    onPushed(updatedAt) {
      data.updatedAt = updatedAt;
      store.save(data);
    },
    onStatus: createSyncStatus(document.body),
  });

  // 這台裝置對「要不要接回雲端」的答案。記在 localStorage 的獨立一格，與提醒開關、
  // Gemini 金鑰同一類：只管這一台裝置，不進 AppData，因此不上雲也不進匯出檔。
  // 網頁版拿到的是 null，底下每一個用到它的地方都是 `cloudConsent?.`，那條路完全不發生。
  const cloudConsent = createNativeCloudConsent(localStorage);

  // 離線時累積下來的那一份，恢復連線就補上去。
  window.addEventListener('online', () => cloud.retry());

  const app: App = {
    get data() {
      return data;
    },
    get queue() {
      return queue;
    },
    get revealed() {
      return revealed;
    },
    cloud,
    gemini: createGeminiKey(localStorage),
    cloudConsent,
    reminder,
    now,

    reveal() {
      revealed = true;
    },

    rate(rating) {
      // 觸覺接在這裡而不是按鈕上：滑鼠與鍵盤兩條路都經過這支，行為因此一致，
      // 而畫面層一個字都不必為觸覺改（見 spec 決定二十五）。
      // 擺在最前面是為了立刻震——存檔與推雲端慢不慢，跟手指的回饋無關。
      haptic();
      // 整晚開著 app、早上直接評分的那條路：頁內動作不會觸發可見性變化事件，
      // 因此先在這裡把佇列換成今天這份，這一下才是評在當日的佇列上。
      // 必須早於 rateCard()。手上那張卡尚未評分、到期日停在昨天或更早，重建後
      // 仍是隊首（見 review.ts 的 rebuildQueue()），使用者評的還是同一張。
      rebuildIfNewDay();
      const result = rateCard(queue, rating, now(), random);
      queue = result.queue;
      revealed = false;
      replaceInData(result.card);
      persist();
    },

    upsert(card) {
      const index = data.cards.findIndex((existing) => existing.id === card.id);
      if (index === -1) {
        data.cards.push(card);
        // 加進複習範圍外的本時不進佇列，否則今天就會被問到一張「不在練的那本」的字。
        if (data.scopes.review.includes(card.bookId)) queue = [...queue, card];
      } else {
        replaceInData(card);
        // 搬家搬出複習範圍時同樣要離開佇列，理由與上面新增那條一樣。
        // 反向搬進範圍內則不補回去：那張卡未必今天到期，補進來等於憑空多出一張。
        if (data.scopes.review.includes(card.bookId)) {
          queue = queue.map((queued) => (queued.id === card.id ? card : queued));
        } else {
          const kept = queue.filter((queued) => queued.id !== card.id);
          // 搬走的若是目前這張，下一張會遞補上來，不能沿用已掀開的狀態——與 remove() 同一個理由。
          if (kept.length !== queue.length) revealed = false;
          queue = kept;
        }
      }
      persist();
    },

    remove(id) {
      data.cards = data.cards.filter((card) => card.id !== id);
      queue = queue.filter((card) => card.id !== id);
      // 刪掉的若是目前這張，下一張會遞補上來，不能沿用已掀開的狀態。
      revealed = false;
      persist();
    },

    applyData(next) {
      // 佇列的來源是「複習範圍內的那幾張卡」，那批人變了才重建——資料頁改完，
      // 回到複習畫面看到的就是新的範圍；刪掉一本會連它的卡一起消失，也走同一條。
      //
      // 比對的是卡而不是「勾了哪幾本」：新增一本空的單字本雖然會自動進三組範圍，
      // 但沒有一張卡因此改變，正在進行的複習不該被打斷——重建會重洗一次順序，
      // 也會把評為「再次」而排回去的那幾張一起丟掉。
      const before = cardsInBooks(data.cards, data.scopes.review);
      data = next;
      const after = cardsInBooks(data.cards, data.scopes.review);
      if (!sameCards(before, after)) rebuildKeepingCurrent();
      persist();
    },

    // 不是換掉整份資料的唯一入口：雲端拉下來那條路（onPulled）另外走，
    // 時間戳來源、推不推雲端、重不重畫三件事都相反，刻意沒有合併。
    importBackup(text) {
      store.importJson(text);
      reload();
      // 匯入也是一次本機資料變動。不推上去的話，下次開 app 會被雲端那份蓋回去。
      cloud.push(data);
    },

    // 與 importBackup 同一條路：store 已經寫回本機，這裡補上重讀與推雲端兩步。
    // 差別只在它加料而非覆蓋，因此還帶回一份給畫面顯示跳過了哪些詞。
    importWords(text, bookId) {
      const result = store.importWords(text, bookId);
      reload();
      cloud.push(data);
      return result;
    },

    exportBackup() {
      return JSON.stringify(data, null, 2);
    },

    showReview() {
      render = () => mount(() => reviewView(app));
      render();
    },
    showList() {
      render = () => mount(() => listView(app));
      render();
    },
    showData() {
      render = () => mount(() => dataView(app));
      render();
    },
    showStats() {
      render = () => mount(() => statsView(app));
      render();
    },
    showEditor(card, back) {
      render = () => mount(() => editorView(app, card, back));
      render();
    },

    setLang(choice) {
      switchLang(choice);
      render();
    },

    keyHandler: null,
  };

  /**
   * 依現在的複習範圍與今天的日期重建佇列，並記下這份佇列是依哪一天建的。
   *
   * 兩件事永遠一起發生，因此綁成同一個動作：分開寫的話，漏記日期的那條路
   * 會讓跨日檢查以為佇列還停在前一天，隔天第一個動作就白重建一次。
   * 記的形式與卡片到期日同一種日期字串（只到日），與判定到期用的是同一把尺。
   *
   * `current` 是使用者正在看的那張，它若仍到期就留在最前面（見 review.ts 的 rebuildQueue()）。
   */
  function rebuild(current?: Card): void {
    const at = now();
    queue = rebuildQueue(cardsInBooks(data.cards, data.scopes.review), current, at, random);
    queueDate = toDateKey(at);
  }

  /**
   * 重建，並在隊首真的換人了才蓋回答案：目前這張仍在的話連掀開狀態一起留住，
   * 換掉的話下一張會遞補上來，不能沿用——與 remove() 同一個理由。
   */
  function rebuildKeepingCurrent(): void {
    const current = currentCard(queue);
    rebuild(current);
    if (currentCard(queue)?.id !== current?.id) revealed = false;
  }

  /**
   * 跨過午夜就把佇列換成今天這份，回傳有沒有真的換——呼叫端據此決定要不要重畫。
   *
   * 冪等：日期沒變時一件事都不做，順序不重洗、掀開狀態不動。兩條訊號同時到達
   * 與只到一條因此結果相同。
   *
   * 不重用 reload()：那條的語義是「整份資料被換掉了」，會重讀本機、清掉掀開狀態、
   * 重排提醒。跨日是「資料沒變，判定基準變了」，那三件事都不必做，
   * 而清掉掀開狀態會直接打斷正在看答案的使用者。
   */
  function rebuildIfNewDay(): boolean {
    if (queueDate === toDateKey(now())) return false;
    rebuildKeepingCurrent();
    return true;
  }

  // 整份資料被換掉之後，佇列與已掀開的狀態都要重建。
  function reload(): void {
    data = store.load();
    rebuild();
    revealed = false;
    // 整份資料被換掉也是一次資料變動。這條路（匯入單字、整份匯入、雲端拉下來）
    // 不經過 persist()，漏掉的話「匯入一批單字後數字立刻正確」就不成立。
    reminder?.refresh();
  }

  function replaceInData(card: Card): void {
    data.cards = data.cards.map((existing) => (existing.id === card.id ? card : existing));
  }

  // 本機仍然是唯一的資料來源，先存好；雲端那一步失敗與否都不影響這裡。
  function persist(): void {
    store.save(data);
    cloud.push(data);
    // 資料一變就整批重排：先清掉全部已登記的，再依最新資料重新登記。
    // 「複習完就不再被叫」與「改了複習範圍數字跟著改」因此走的是同一條路徑，
    // 不需要任何個別取消的邏輯。
    reminder?.refresh();
  }

  // 先解除上一個畫面的鍵盤處理器，再建立新畫面——順序反過來的話，
  // 新畫面剛註冊的處理器會立刻被清掉。
  function mount(build: () => HTMLElement): void {
    app.keyHandler = null;
    root.replaceChildren(build());
  }

  document.addEventListener('keydown', (event) => {
    if (isTyping(event.target)) return;
    app.keyHandler?.(event);
  });

  // 跨日檢查的兩條訊號，都打到同一支 rebuildIfNewDay()。
  //
  // 兩條一起接的理由是成本：可見性事件在 iOS 的 WKWebView 裡可靠不可靠，
  // 本專案沒有驗過，而驗一次要跑完一輪 TestFlight。兩條都接上，第一版就會動。
  // 檢查本身是冪等的，因此兩條都送到與只送一條，結果相同。
  //
  // 這兩個監聽器與 app 同生共死，沒有天然的解除時機，因此不走 ADR-0011 的元件那一套；
  // 立場與上面那個 'online' 相同。可見性事件掛在 document 上，window 上沒有這個事件。
  const backToForeground = () => {
    if (rebuildIfNewDay()) render();
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') backToForeground();
  });
  onNativeForeground(backToForeground);

  // 語音清單可能稍後才載入，屆時重畫目前畫面讓朗讀按鈕出現。
  initSpeech(() => render());

  // 這台裝置要不要接回雲端，答過一次就不再問（票 14）。網頁版拿到的是 null，
  // 這一問完全不發生，`cloud.begin()` 照舊每次都叫。
  //
  // 必須早於 cloud.begin()：那一支就是把整份雲端資料拉下來的動作，晚一步就變成
  // 先拉再問，問了也沒用。也刻意早於 app.showReview()——代價是對話框會蓋在空白畫面上，
  // 但那一刻本機也真的還沒有任何東西，空白畫面不是假象。
  //
  // `updatedAt` 是伺服器蓋的時間戳，非 0 代表這份資料曾經與雲端往返過（見 types.ts）——
  // 那台裝置早就在同步了，不必問，理由見 cloud-consent.ts 的 wantsPull()。
  //
  // `wantsPull()` 從票 `17` 起回的是 Promise——那是為了 React Native 那一端
  // （`Alert.alert` 是 callback），不是為了這裡。開機的最後三步因此收進一支函式，
  // 彼此的先後完全照舊。
  //
  // **網頁版整條路一個 Promise 都不碰**：底下那個 if 直接同步叫它。這支刻意不寫成
  // `async`——寫成 async 的話，`showReview()` 丟出來的例外會變成一個沒人接的
  // rejected promise，開機失敗從此靜悄悄，而它現在照舊從 `start()` 同步冒出去。
  function finishBoot(pull: boolean): void {
    app.showReview();

    // 畫面先出來，雲端在背後追。沒登入的話這一步什麼都不做。
    // 這台裝置拒絕過的話連叫都不叫，一個網路請求都不發。
    if (pull) cloud.begin(data);

    // 排的是未來 7 天，因此每開一次 app 就把窗口往前推一次——只靠資料變動觸發的話，
    // 一個「開了 app 卻沒複習」的人會在第 8 天之後完全收不到提醒。沒開提醒時不做事。
    reminder?.refresh();
  }

  // 網頁版沒有這條支線，一步都不繞。Capacitor 版問完才走，而它的 `confirm()` 仍然是
  // 當場作答的——差別只有一個 microtask，落在 `start()` 回傳之後（`main.ts` 那邊沒有
  // 接著要做的事）。
  if (cloudConsent === null) finishBoot(true);
  else void cloudConsent.wantsPull(cloud.nickname(), data.updatedAt > 0).then(finishBoot);
}

/** 兩份卡片是不是同一批。順序不算：洗牌與勾選的先後都不是內容的改變。 */
function sameCards(before: readonly Card[], after: readonly Card[]): boolean {
  if (before.length !== after.length) return false;
  const ids = new Set(before.map((card) => card.id));
  return after.every((card) => ids.has(card.id));
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}
