/**
 * 複習畫面背後那台機器：持有資料、當日佇列、答案掀開了沒，並在每一次變動之後存檔。
 *
 * 網頁版把這些擺在 `src/app.ts` 的 `start()` 裡，與另外四個畫面的導覽、雲端備份、
 * 每日提醒混在一起。這裡拆出來是為了**測得動**——`ADR-0014` 那 1,319 行 jsdom 畫面測試
 * 在 React Native 上作廢（見 `.scratch/rn-rewrite/spec.md` 的〈測試決定〉），複習流程若也
 * 只活在 JSX 裡，這張票就沒有任何自動測試守得住它。
 *
 * **這裡沒有 React。** 當前時間與亂數一律由外面遞進來，跟 `core/lib/review.ts` 同一個規矩。
 *
 * 它不做的事：導覽（路由表在 `../app/`）、每日提醒。
 * 名單的正本在票 `06` 的〈這張票不做的事〉。**觸覺已經不在名單上**——票 `08` 接上了，
 * 走的是外面遞進來的 `haptic`。**保險副本也不在名單上**——票 `07` 拍板整個
 * React Native 版都不接，票 `06` 正文是已收的票、不改，這件事以 `../../CONTEXT.md`
 * 與 `ADR-0002` 為準。
 */
import { cardsInBooks, setScope, type ImportResult, type Store } from '@core/lib/storage';
import { currentCard, rate as rateCard, rebuildQueue, toDateKey, type Queue } from '@core/lib/review';
import type { AppData, Card, Rating } from '@core/lib/types';
import type { Haptic } from './haptics';

export interface ReviewSessionHooks {
  store: Store;
  now(): Date;
  random(): number;
  /**
   * 評分時震的那一下。**永遠可以呼叫**，因此底下 `rate()` 不問「這台機器震得動嗎」——
   * 那個判斷屬於 `./haptics.ts`，不屬於這台機器（理由的正本在該檔）。
   *
   * 它是遞進來的而不是直接 import：原生模組在 Node 裡不存在，這支檔一沾上就整批測不動。
   * 與當前時間、亂數同一個規矩。
   */
  haptic: Haptic;
  /** 資料、佇列或掀開狀態變了。畫面靠它重畫。 */
  onChange(): void;
  /**
   * 本機剛寫入一份新的資料。
   *
   * **網頁版 `src/app.ts` 的 `persist()` 把雲端推送接在同一個位置**，這裡留同一個接縫。
   * 不接的話手機上評的分永遠不會讓 `updatedAt` 往前走，電腦那邊一推，手機這幾天的
   * 複習就整批被蓋掉——雲端備份是整份覆蓋、較新的一份勝出（見 `CONTEXT.md`）。
   */
  onPersisted?(data: AppData): void;
}

/** 畫面每次重畫時讀的那一份。三樣東西一起換，才不會畫出「佇列已經走了、答案還掀著」。 */
export interface ReviewSnapshot {
  data: AppData;
  queue: Queue;
  revealed: boolean;
}

export interface ReviewSession {
  snapshot(): ReviewSnapshot;
  reveal(): void;
  /** 對目前卡片評分並前進到下一張。 */
  rate(rating: Rating): void;
  /** 換一組複習範圍。存進資料裡，佇列跟著重建。 */
  setReviewScope(bookIds: readonly string[]): void;
  /**
   * 換上一份新的資料：存回本機、推上雲端，複習範圍內的卡真的變了才重建佇列。
   *
   * **卡片列表頁改單字本走的是這一條**（票 `15`）。它與 `setReviewScope()` 共用同一道
   * 閘門，因為理由一樣：新增一本空的單字本雖然會自動進三組範圍，卻沒有一張卡因此改變，
   * 正在進行的複習不該被打斷。網頁版 `src/app.ts` 的 `applyData()` 是同一支。
   *
   * **畫面不准自己去 `store.save()`。** 這台機器手上握著 `data`，繞過它寫檔的話這裡就
   * 停在舊快照，下一次評分會把中間的改動整批蓋掉。
   */
  applyData(next: AppData): void;
  /**
   * 新增或改掉一張卡：寫回本機、推上雲端，並把佇列上那一張同步過去。
   *
   * **刻意不走 `applyData()`。** 那一支的閘門比的是「複習範圍內的卡是不是同一批」，
   * 而這裡兩種情況都會被它判錯：改內容時 id 集合沒變，佇列因此不重建，手上那張會停在
   * 舊的字；新增一張時集合變了，整個佇列重洗一次，評成「再次」排回去的那幾張一起消失。
   * 網頁版 `src/app.ts` 的 `upsert()` 是同一支，這裡照著它做針對性的增補。
   *
   * 編輯畫面存卡走的就是這一條（票 `16`）。
   */
  upsertCard(card: Card): void;
  /** 刪掉一張卡：資料與佇列一起拿掉，答案蓋回去。網頁版 `src/app.ts` 的 `remove()`。 */
  removeCard(id: string): void;
  /**
   * 把一份備份檔的卡加進某一本：寫回本機、重讀、推上雲端，並交回這次匯入的結果。
   *
   * 與 `applyData()` 分成兩支是因為寫檔那一步在 `store` 裡面（它要驗格式並判斷哪些詞
   * 重複），這裡只補上重讀與推雲端。那一本不在了或格式不對時直接丟例外，由畫面接住。
   * 網頁版 `src/app.ts` 的 `importWords()` 是同一支。
   */
  importWords(json: string, bookId: string): ImportResult;
  /**
   * 跨過午夜就把佇列換成今天這份。回到前景時叫一次，評分之前也會自己叫一次。
   * 日期沒變時一件事都不做。
   */
  refreshDay(): void;
  /**
   * 推上雲端成功，伺服器蓋了一個新的時間戳。**只換那一格**，佇列與掀開狀態都不動。
   *
   * 與 `reload()` 刻意分成兩支：那一支的語義是「整份資料被換掉了」，會重洗佇列——
   * 而推上去只是換了時間戳，資料內容一個字沒變。混用的話，評完一張卡等伺服器回覆的
   * 那一瞬間，複習佇列會在使用者眼前重洗一次，評「再次」排回去的那幾張也會一起消失。
   * 網頁版 `src/app.ts` 的 `onPushed` 同樣只動這一格。
   */
  noteCloudTimestamp(updatedAt: number): void;

  /** 整份資料被別人換掉了（探針畫面加了卡、雲端拉下來一份），重讀。 */
  reload(): void;
}

export function createReviewSession(hooks: ReviewSessionHooks): ReviewSession {
  const { store, now, random, haptic, onChange, onPersisted } = hooks;

  let data = store.load();
  let queue: Queue = [];
  /** 這份佇列是依哪一天建的。與卡片到期日同一種日期字串，判定到期用的是同一把尺。 */
  let queueDate = '';
  let revealed = false;

  rebuild();

  /**
   * 依現在的複習範圍與今天的日期重建佇列，並記下這份佇列屬於哪一天。
   *
   * 兩件事永遠一起發生，因此綁成同一個動作——漏記日期的話，跨日檢查會以為佇列還停在
   * 前一天，隔天第一個動作就白重建一次。理由與網頁版 `src/app.ts` 的 `rebuild()` 相同。
   */
  function rebuild(current?: Card): void {
    const at = now();
    queue = rebuildQueue(cardsInBooks(data.cards, data.scopes.review), current, at, random);
    queueDate = toDateKey(at);
  }

  /**
   * 重建，並在隊首真的換人了才把答案蓋回去：目前這張仍在的話連掀開狀態一起留住，
   * 換掉的話下一張會遞補上來，不能沿用別人的答案。
   */
  function rebuildKeepingCurrent(): void {
    const before = currentCard(queue);
    rebuild(before);
    if (currentCard(queue)?.id !== before?.id) revealed = false;
  }

  /** 本機仍然是唯一的資料來源，先存好；`onPersisted` 那一步失敗與否都不影響這裡。 */
  function persist(): void {
    store.save(data);
    onPersisted?.(data);
  }

  /**
   * 換上一份新資料，存回本機並推上雲端；複習範圍內的卡真的變了才重建佇列。
   *
   * **比的是卡，不是「勾了哪幾本」，也不是「資料物件換了沒」。** 勾一本空的單字本、
   * 替一本改名，都會產生一份新的資料，卻沒有一張卡因此改變，正在進行的複習不該被打斷——
   * 重建會重洗一次順序，也會把評為「再次」而排回去的那幾張一起丟掉。
   *
   * 換範圍與卡片列表頁改單字本走的是同一支，因為那道閘門只該有一份。
   * 與網頁版 `src/app.ts` 的 `applyData()` 相同。
   */
  function swap(next: AppData): void {
    const before = cardsInBooks(data.cards, data.scopes.review);
    data = next;
    const after = cardsInBooks(data.cards, data.scopes.review);
    if (!sameCards(before, after)) rebuildKeepingCurrent();
    persist();
  }

  /**
   * 跨過午夜就把佇列換成今天這份。
   *
   * 冪等：日期沒變時一件事都不做，順序不重洗、掀開狀態不動。回到前景與評分兩條訊號
   * 同時到達與只到一條，結果因此相同。名字與網頁版 `src/app.ts` 那一支一致。
   */
  function rebuildIfNewDay(): void {
    if (queueDate === toDateKey(now())) return;
    rebuildKeepingCurrent();
  }

  return {
    snapshot: () => ({ data, queue, revealed }),

    reveal() {
      revealed = true;
      onChange();
    },

    rate(rating) {
      // 擺在最前面是為了立刻震——存檔與推雲端慢不慢，跟手指的回饋無關。
      // 接在這支而不是接在按鈕上：四顆評分鈕走的是同一條路，行為因此一致，
      // 而畫面層一個字都不必為觸覺改（`review-screen.tsx` 不知道觸覺存在）。
      // 位置與網頁版 `src/app.ts` 的 rate() 第一行相同。
      haptic();
      // 整晚開著 app、早上直接評分的那條路：先把佇列換成今天這份，這一下才是評在
      // 當日的佇列上。必須早於 rateCard()——手上那張卡尚未評分、到期日停在昨天或更早，
      // 重建後仍是隊首（見 `review.ts` 的 `rebuildQueue()`），使用者評的還是同一張。
      rebuildIfNewDay();
      const result = rateCard(queue, rating, now(), random);
      queue = result.queue;
      revealed = false;
      data = { ...data, cards: data.cards.map((card) => (card.id === result.card.id ? result.card : card)) };
      persist();
      onChange();
    },

    setReviewScope(bookIds) {
      swap(setScope(data, 'review', bookIds));
      onChange();
    },

    applyData(next) {
      swap(next);
      onChange();
    },

    upsertCard(card) {
      const index = data.cards.findIndex((existing) => existing.id === card.id);
      const inReviewScope = data.scopes.review.includes(card.bookId);
      if (index === -1) {
        data = { ...data, cards: [...data.cards, card] };
        // 加進複習範圍外的本時不進佇列，否則今天就會被問到一張「不在練的那本」的字。
        if (inReviewScope) queue = [...queue, card];
      } else {
        data = { ...data, cards: data.cards.map((existing) => (existing.id === card.id ? card : existing)) };
        if (inReviewScope) {
          // 同一張換上新內容。順序不動——改個釋義不該讓今天的複習重排。
          queue = queue.map((queued) => (queued.id === card.id ? card : queued));
        } else {
          // 搬家搬出複習範圍時要離開佇列，理由與上面新增那條一樣。
          // 反向搬進範圍內則不補回去：那張卡未必今天到期，補進來等於憑空多出一張。
          const kept = queue.filter((queued) => queued.id !== card.id);
          // 搬走的若是手上這張，下一張會遞補上來，不能沿用已掀開的狀態——與 removeCard() 同一個理由。
          if (kept.length !== queue.length) revealed = false;
          queue = kept;
        }
      }
      persist();
      onChange();
    },

    removeCard(id) {
      data = { ...data, cards: data.cards.filter((card) => card.id !== id) };
      queue = queue.filter((card) => card.id !== id);
      // 刪掉的若是手上這張，下一張會遞補上來，不能沿用已掀開的狀態。
      revealed = false;
      persist();
      onChange();
    },

    importWords(json, bookId) {
      // `store` 這一步自己會驗格式、判斷哪些詞重複，並把整份寫回本機。
      // 它丟例外時（那一本不在了、檔案壞了）底下三行都不會發生，本機因此一個字沒變。
      const result = store.importWords(json, bookId);
      // 一次匯入可能帶進上百張卡，其中到期的那些今天就該複習得到，因此整個重建。
      // `reload()` 順手把答案蓋回去，那是對的：手上那張很可能已經不在隊首了。
      data = store.load();
      rebuild();
      revealed = false;
      // 本機已經被 `store` 寫過了，這裡只補推雲端那一步——不推的話下次開 app
      // 會被雲端那份蓋回去。與網頁版 `src/app.ts` 的 `importWords()` 同一個位置。
      onPersisted?.(data);
      onChange();
      return result;
    },

    refreshDay() {
      rebuildIfNewDay();
      onChange();
    },

    noteCloudTimestamp(updatedAt) {
      data = { ...data, updatedAt };
      // 只存檔，不叫 onPersisted——那會再推一次，而這一格正是上一次推回來的結果。
      store.save(data);
    },

    reload() {
      data = store.load();
      rebuild();
      revealed = false;
      onChange();
    },
  };
}

/**
 * 兩份卡片是不是同一批。順序不算：洗牌與勾選的先後都不是內容的改變。
 *
 * 與網頁版 `src/app.ts` 底下那一支同一份。沒有抽成共用的東西：它住在網頁版自己的
 * 畫面編排裡，而共用的那條線（`spec.md` 的〈邏輯層不准分岔〉）畫在儲存與加解密上，
 * 不是畫在這五行上。兩邊哪天要改，改的也不會是同一個理由。
 */
function sameCards(before: readonly Card[], after: readonly Card[]): boolean {
  if (before.length !== after.length) return false;
  const ids = new Set(before.map((card) => card.id));
  return after.every((card) => ids.has(card.id));
}
