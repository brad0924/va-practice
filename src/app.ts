import { cardsInBooks, createStore, type ImportResult } from './lib/storage';
import { createCloudBackup, type CloudBackup } from './lib/cloud-backup';
import { createGeminiKey, type GeminiKey } from './lib/gemini-key';
import { withSafetyCopy } from './lib/safety-copy';
import { createNativeSafetyCopy } from './lib/safety-copy-native';
import { buildQueue, currentCard, rebuildQueue, rate as rateCard, type Queue } from './lib/review';
import type { AppData, Card, Rating } from './lib/types';
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
  /** 目前畫面的鍵盤處理器，離開畫面時自動解除。 */
  keyHandler: ((event: KeyboardEvent) => void) | null;
}

export function start(root: HTMLElement): void {
  // iOS 上的保險副本夾在 store 與 localStorage 之間，跟上每一次本機寫入。
  // 網頁版拿到的是個什麼都不做的東西，這條路完全不發生。
  const store = createStore(withSafetyCopy(localStorage, createNativeSafetyCopy()));
  const now = () => new Date();
  const random = Math.random;

  let data = store.load();
  // 佇列只吃複習範圍內的卡。buildQueue() 因此完全不必知道單字本存在。
  let queue = buildQueue(cardsInBooks(data.cards, data.scopes.review), now(), random);
  let revealed = false;
  let render: () => void = () => {};

  const cloud = createCloudBackup({
    storage: localStorage,
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
    now,

    reveal() {
      revealed = true;
    },

    rate(rating) {
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
      const current = currentCard(queue);
      data = next;
      const after = cardsInBooks(data.cards, data.scopes.review);
      if (!sameCards(before, after)) {
        queue = rebuildQueue(after, current, now(), random);
        // 隊首真的換人了才蓋回答案：目前這張仍在範圍內時連掀開狀態一起留住，
        // 換掉的話下一張會遞補上來，不能沿用——與 remove() 同一個理由。
        if (currentCard(queue)?.id !== current?.id) revealed = false;
      }
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

    keyHandler: null,
  };

  // 整份資料被換掉之後，佇列與已掀開的狀態都要重建。
  function reload(): void {
    data = store.load();
    queue = buildQueue(cardsInBooks(data.cards, data.scopes.review), now(), random);
    revealed = false;
  }

  function replaceInData(card: Card): void {
    data.cards = data.cards.map((existing) => (existing.id === card.id ? card : existing));
  }

  // 本機仍然是唯一的資料來源，先存好；雲端那一步失敗與否都不影響這裡。
  function persist(): void {
    store.save(data);
    cloud.push(data);
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

  // 語音清單可能稍後才載入，屆時重畫目前畫面讓朗讀按鈕出現。
  initSpeech(() => render());

  app.showReview();

  // 畫面先出來，雲端在背後追。沒登入的話這一步什麼都不做。
  cloud.begin(data);
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
