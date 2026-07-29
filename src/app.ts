import builtin from './data/cards.json';
import { createStore } from './lib/storage';
import { createCloudBackup, type CloudBackup } from './lib/cloud-backup';
import { createGeminiKey, type GeminiKey } from './lib/gemini-key';
import { buildQueue, rate as rateCard, type Queue } from './lib/review';
import type { AppData, Card, Rating } from './lib/types';
import { initSpeech } from './ui/speech';
import { createSyncStatus } from './ui/sync-status';
import { reviewView } from './ui/review-view';
import { listView } from './ui/list-view';
import { dataView } from './ui/data-view';
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
  /** 新增或更新一張卡，同時反映到當日佇列上。 */
  upsert(card: Card): void;
  remove(id: string): void;
  /** 整份覆蓋本機資料並推上雲端。格式不對時直接丟例外，由畫面接住。 */
  importBackup(text: string): void;
  /** 目前這份資料的備份內容，交給畫面決定檔名與怎麼存。 */
  exportBackup(): string;
  showReview(): void;
  showList(): void;
  /** 只有卡片頁能進來，回去的目的地固定，不必傳 back。 */
  showData(): void;
  showEditor(card: Card | null, back: () => void): void;
  /** 目前畫面的鍵盤處理器，離開畫面時自動解除。 */
  keyHandler: ((event: KeyboardEvent) => void) | null;
}

export function start(root: HTMLElement): void {
  const store = createStore(localStorage, builtin);
  const now = () => new Date();
  const random = Math.random;

  let data = store.load();
  let queue = buildQueue(data.cards, now(), random);
  let revealed = false;
  let render: () => void = () => {};

  const cloud = createCloudBackup({
    storage: localStorage,
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
        queue = [...queue, card];
      } else {
        replaceInData(card);
        queue = queue.map((queued) => (queued.id === card.id ? card : queued));
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

    // 不是換掉整份資料的唯一入口：雲端拉下來那條路（onPulled）另外走，
    // 時間戳來源、推不推雲端、重不重畫三件事都相反，刻意沒有合併。
    importBackup(text) {
      store.importJson(text);
      reload();
      // 匯入也是一次本機資料變動。不推上去的話，下次開 app 會被雲端那份蓋回去。
      cloud.push(data);
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
    showEditor(card, back) {
      render = () => mount(() => editorView(app, card, back));
      render();
    },

    keyHandler: null,
  };

  // 整份資料被換掉之後，佇列與已掀開的狀態都要重建。
  function reload(): void {
    data = store.load();
    queue = buildQueue(data.cards, now(), random);
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

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}
