import builtin from './data/cards.json';
import { createStore, type Store } from './lib/storage';
import { buildQueue, type Queue } from './lib/review';
import type { AppData, Card } from './lib/types';
import { initSpeech } from './ui/speech';
import { reviewView } from './ui/review-view';
import { listView } from './ui/list-view';
import { editorView } from './ui/editor-view';

/**
 * 畫面層的共用狀態與導覽。
 * 當前時間與亂數在這裡才第一次接觸真實世界，三個核心模組仍然是純的。
 */
export interface App {
  readonly data: AppData;
  readonly queue: Queue;
  readonly store: Store;
  /** 目前卡片是否已掀開答案。放在這裡，重畫畫面時才不會把答案蓋回去。 */
  readonly revealed: boolean;
  now(): Date;
  random(): number;
  reveal(): void;
  /** 記錄評分結果並前進到下一張。 */
  advance(queue: Queue, card: Card): void;
  /** 新增或更新一張卡，同時反映到當日佇列上。 */
  upsert(card: Card): void;
  remove(id: string): void;
  /** 匯入後整份資料被換掉，佇列需要重建。 */
  reload(): void;
  showReview(): void;
  showList(): void;
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
    store,
    now,
    random,

    reveal() {
      revealed = true;
    },

    advance(nextQueue, card) {
      queue = nextQueue;
      revealed = false;
      replaceInData(card);
      store.save(data);
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
      store.save(data);
    },

    remove(id) {
      data.cards = data.cards.filter((card) => card.id !== id);
      queue = queue.filter((card) => card.id !== id);
      // 刪掉的若是目前這張，下一張會遞補上來，不能沿用已掀開的狀態。
      revealed = false;
      store.save(data);
    },

    reload() {
      data = store.load();
      queue = buildQueue(data.cards, now(), random);
      revealed = false;
    },

    showReview() {
      render = () => mount(() => reviewView(app));
      render();
    },
    showList() {
      render = () => mount(() => listView(app));
      render();
    },
    showEditor(card, back) {
      render = () => mount(() => editorView(app, card, back));
      render();
    },

    keyHandler: null,
  };

  function replaceInData(card: Card): void {
    data.cards = data.cards.map((existing) => (existing.id === card.id ? card : existing));
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
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}
