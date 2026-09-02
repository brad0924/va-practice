// 這一支是 mobile/ 自己新寫的，所以直接寫 Jest。`core/` 那批仍寫著 `from 'vitest'`
// 並靠 `../test/vitest-shim.ts` 轉接——那個包袱只屬於搬過來的舊測試（票 `02`）。
import { describe, it, expect, jest } from '@jest/globals';
import { createStore, type StorageLike } from '@core/lib/storage';
import { DEFAULT_EASE } from '@core/lib/review';
import type { AppData, Card } from '@core/lib/types';
import { createReviewSession } from './review-session';

/** 記憶體裡的一格儲存。真正的 `createStore()` 吃得下它，驗證路徑因此是真的那一條。 */
function fakeStorage(): StorageLike {
  const cells = new Map<string, string>();
  return {
    getItem: (key) => cells.get(key) ?? null,
    setItem: (key, value) => {
      cells.set(key, value);
    },
    removeItem: (key) => {
      cells.delete(key);
    },
  };
}

function card(id: string, bookId: string, due: string | null): Card {
  return { id, bookId, text: id, meaning: `${id} 的意思`, interval: null, ease: DEFAULT_EASE, due };
}

const TODAY = new Date(2026, 7, 25);
const TOMORROW = new Date(2026, 7, 26);

/**
 * 兩本、四張卡的一份資料。`a1`／`a2` 在甲本且今天到期，`b1` 在乙本且今天到期，
 * `a3` 在甲本但排到明天——它不該進今天的佇列。
 */
function seed(): AppData {
  return {
    version: 3,
    books: [
      { id: 'A', name: '甲本' },
      { id: 'B', name: '乙本' },
    ],
    cards: [card('a1', 'A', null), card('a2', 'A', '2026-08-25'), card('b1', 'B', null), card('a3', 'A', '2026-08-26')],
    scopes: { review: ['A', 'B'], list: ['A', 'B'], stats: ['A', 'B'] },
    updatedAt: 0,
  };
}

/**
 * 洗牌與抖動都吃這個亂數。固定回一個逼近 1 的值讓順序可預期：`buildQueue()` 的
 * Fisher–Yates 算的是 `j = floor(random × (i+1))`，這個值讓每一步都 `j === i`，
 * 也就是每張卡都跟自己交換，佇列因此就是卡片原本的順序。
 *
 * **不能用 0。** 那會讓每一步都跟第 0 張交換，整串被輪轉過，順序反而更難預期。
 */
const NO_SHUFFLE = () => 0.999999;


function session(
  options: {
    now?: () => Date;
    onChange?: () => void;
    onPersisted?: (data: AppData) => void;
    haptic?: () => void;
  } = {},
) {
  const storage = fakeStorage();
  const store = createStore(storage);
  store.save(seed());
  return createReviewSession({
    store,
    now: options.now ?? (() => TODAY),
    random: NO_SHUFFLE,
    onChange: options.onChange ?? (() => {}),
    onPersisted: options.onPersisted,
    haptic: options.haptic ?? (() => {}),
  });
}

describe('開場', () => {
  it('佇列只收複習範圍內、今天到期的卡', () => {
    const ids = session()
      .snapshot()
      .queue.map((entry) => entry.id);
    expect(ids).toEqual(['a1', 'a2', 'b1']);
  });

  it('一開始答案是蓋著的', () => {
    expect(session().snapshot().revealed).toBe(false);
  });
});

describe('掀開與評分', () => {
  it('掀開之後 revealed 為真', () => {
    const it_ = session();
    it_.reveal();
    expect(it_.snapshot().revealed).toBe(true);
  });

  it('評分會前進到下一張，答案蓋回去', () => {
    const it_ = session();
    it_.reveal();
    it_.rate('good');
    const after = it_.snapshot();
    expect(after.queue.map((entry) => entry.id)).toEqual(['a2', 'b1']);
    expect(after.revealed).toBe(false);
  });

  it('評分真的改到排程，而且存回儲存', () => {
    const it_ = session();
    it_.rate('easy');
    const saved = it_.snapshot().data.cards.find((entry) => entry.id === 'a1')!;
    expect(saved.interval).not.toBeNull();
    expect(saved.due).not.toBeNull();
    expect(saved.ease).toBeGreaterThan(DEFAULT_EASE);
  });

  it('評「再次」的那張當天還會再出現一次', () => {
    const it_ = session();
    it_.rate('again');
    expect(it_.snapshot().queue.map((entry) => entry.id)).toContain('a1');
  });

  it('佇列清空即為當日完成', () => {
    const it_ = session();
    it_.rate('good');
    it_.rate('good');
    it_.rate('good');
    expect(it_.snapshot().queue).toHaveLength(0);
  });

  it('每一次本機寫入都通知一次呼叫端', () => {
    // 型別要標上去：`jest.fn()` 不標的話參數是 `unknown`，底下讀 `.cards` 就過不了型別檢查。
    const onPersisted = jest.fn<(data: AppData) => void>();
    const it_ = session({ onPersisted });
    it_.rate('good');
    expect(onPersisted).toHaveBeenCalledTimes(1);
    expect(onPersisted.mock.calls[0]![0].cards).toHaveLength(4);
  });
});

describe('評分的觸覺回饋', () => {
  it('四顆評分鈕都震，每次一下', () => {
    for (const rating of ['again', 'hard', 'good', 'easy'] as const) {
      const haptic = jest.fn();
      session({ haptic }).rate(rating);
      expect(haptic).toHaveBeenCalledTimes(1);
    }
  });

  it('震的那一下在存檔之前，手指不等本機寫完', () => {
    // 驗收第五條。存檔之後還接著雲端推送，順序寫反的話手指要等的就不只是本機那一步。
    const trace: string[] = [];
    const cells = fakeStorage();
    const store = createStore({
      getItem: cells.getItem,
      setItem: (key, value) => {
        trace.push('存檔');
        cells.setItem(key, value);
      },
      removeItem: cells.removeItem,
    });
    store.save(seed());
    const it_ = createReviewSession({
      store,
      now: () => TODAY,
      random: NO_SHUFFLE,
      onChange: () => {},
      haptic: () => trace.push('震'),
    });
    trace.length = 0;

    it_.rate('good');

    expect(trace).toEqual(['震', '存檔']);
  });

  it('掀開答案不震', () => {
    const haptic = jest.fn();
    session({ haptic }).reveal();
    expect(haptic).not.toHaveBeenCalled();
  });

  it('切單字本不震', () => {
    const haptic = jest.fn();
    session({ haptic }).setReviewScope(['A']);
    expect(haptic).not.toHaveBeenCalled();
  });
});

describe('複習範圍', () => {
  it('切掉一本，佇列跟著重建', () => {
    const it_ = session();
    it_.setReviewScope(['A']);
    expect(it_.snapshot().queue.map((entry) => entry.id)).toEqual(['a1', 'a2']);
  });

  it('正在看的那張若仍在範圍內，留在最前面、答案維持掀開', () => {
    const it_ = session();
    it_.reveal();
    it_.setReviewScope(['A']);
    const after = it_.snapshot();
    expect(after.queue[0]!.id).toBe('a1');
    expect(after.revealed).toBe(true);
  });

  it('正在看的那張被切出範圍時換下一張，答案蓋回去', () => {
    const it_ = session();
    it_.reveal();
    it_.setReviewScope(['B']);
    const after = it_.snapshot();
    expect(after.queue[0]!.id).toBe('b1');
    expect(after.revealed).toBe(false);
  });

  it('範圍存進資料裡，下次讀得回來', () => {
    const it_ = session();
    it_.setReviewScope(['A']);
    expect(it_.snapshot().data.scopes.review).toEqual(['A']);
  });

  /**
   * 與網頁版 `src/app.ts` 的 `applyData()` 同一道閘門：比的是**卡**不是「勾了哪幾本」。
   * 勾掉一本空的單字本雖然改了範圍，卻沒有一張卡因此改變，正在進行的複習不該被打斷——
   * 重建會重洗一次順序，也會把評為「再次」而排回去的那幾張一起丟掉。
   */
  it('勾一本沒有卡的單字本不重建，「再次」排回去的那幾張留著', () => {
    const storage = fakeStorage();
    const store = createStore(storage);
    const data = seed();
    data.books.push({ id: 'C', name: '空本' });
    store.save(data);
    const it_ = createReviewSession({ store, now: () => TODAY, random: NO_SHUFFLE, onChange: () => {}, haptic: () => {} });

    it_.rate('again');
    const before = it_.snapshot().queue.map((entry) => entry.id);
    it_.setReviewScope(['A', 'B', 'C']);

    expect(it_.snapshot().queue.map((entry) => entry.id)).toEqual(before);
  });
});

describe('跨過午夜', () => {
  it('同一天不做事', () => {
    const it_ = session();
    it_.reveal();
    it_.refreshDay();
    expect(it_.snapshot().revealed).toBe(true);
  });

  it('換一天就重建佇列', () => {
    let today = TODAY;
    const it_ = session({ now: () => today });
    it_.rate('good');
    today = TOMORROW;
    it_.refreshDay();
    // a1 被排到明天以後，a3 明天到期——今天沒進佇列的那張現在進來了。
    expect(it_.snapshot().queue.map((entry) => entry.id)).toContain('a3');
  });

  it('評分之前會先跨日，那一下評在今天的佇列上', () => {
    let today = TODAY;
    const it_ = session({ now: () => today });
    today = TOMORROW;
    it_.rate('good');
    // 手上那張尚未評分、到期日停在昨天，重建後仍是隊首，評到的還是同一張。
    expect(it_.snapshot().data.cards.find((entry) => entry.id === 'a1')!.due).not.toBeNull();
  });
});

describe('雲端推上去之後', () => {
  it('只換時間戳，佇列與掀開狀態都不動', () => {
    const it_ = session();
    it_.reveal();
    const before = it_.snapshot().queue.map((entry) => entry.id);

    it_.noteCloudTimestamp(1_700_000_000_000);

    const after = it_.snapshot();
    expect(after.data.updatedAt).toBe(1_700_000_000_000);
    expect(after.queue.map((entry) => entry.id)).toEqual(before);
    expect(after.revealed).toBe(true);
  });

  it('時間戳存回去，下一次評分不會把它寫回舊值', () => {
    const it_ = session();
    it_.noteCloudTimestamp(1_700_000_000_000);
    it_.rate('good');
    expect(it_.snapshot().data.updatedAt).toBe(1_700_000_000_000);
  });
});

describe('整份資料被換掉', () => {
  it('重讀之後佇列與掀開狀態一起重來', () => {
    const it_ = session();
    it_.reveal();
    it_.reload();
    expect(it_.snapshot().revealed).toBe(false);
    expect(it_.snapshot().queue).toHaveLength(3);
  });
});

/**
 * 卡片列表頁改單字本用的那道接縫（票 `15`）。網頁版對應的是 `src/app.ts` 的 `applyData()`。
 *
 * **它存在的理由是「一份資料只能有一個主人」。** 這台機器手上握著 `data`，畫面若自己
 * 去 `store.save()`，這台機器手上那份就過時了——在複習頁評幾張再切去卡片頁建一本，
 * 存下去的是舊快照，中間評的分整批被蓋掉。探針畫面（票 `18` 已刪）踩過同一個坑。
 */
describe('改資料（單字本管理走這條）', () => {
  it('新的那份存回儲存，下次讀得回來', () => {
    const it_ = session();
    const next = { ...it_.snapshot().data, books: [{ id: 'A', name: '改過名的甲本' }, { id: 'B', name: '乙本' }] };
    it_.applyData(next);
    expect(it_.snapshot().data.books[0]!.name).toBe('改過名的甲本');
  });

  it('推上雲端——少了這一步，手機上的改動會被別台裝置蓋掉', () => {
    const pushed: AppData[] = [];
    const it_ = session({ onPersisted: (data) => pushed.push(data) });
    it_.applyData({ ...it_.snapshot().data, books: [] });
    expect(pushed).toHaveLength(1);
  });

  it('通知畫面重畫', () => {
    let changes = 0;
    const it_ = session({ onChange: () => (changes += 1) });
    it_.applyData({ ...it_.snapshot().data, books: [] });
    expect(changes).toBe(1);
  });

  it('複習範圍裡的卡變了就重建佇列——刪掉一本，它的卡跟著離開佇列', () => {
    const it_ = session();
    const data = it_.snapshot().data;
    it_.applyData({
      ...data,
      books: data.books.filter((book) => book.id !== 'B'),
      cards: data.cards.filter((card) => card.bookId !== 'B'),
      scopes: { review: ['A'], list: ['A'], stats: ['A'] },
    });
    expect(it_.snapshot().queue.map((entry) => entry.id)).toEqual(['a1', 'a2']);
  });

  /** 與 `setReviewScope()` 同一道閘門：比的是**卡**，不是「資料物件換了沒」。 */
  it('只是加了一本空的單字本就不重建，「再次」排回去的那幾張留著', () => {
    const it_ = session();
    it_.rate('again');
    const before = it_.snapshot().queue.map((entry) => entry.id);

    const data = it_.snapshot().data;
    it_.applyData({ ...data, books: [...data.books, { id: 'C', name: '空本' }] });

    expect(it_.snapshot().queue.map((entry) => entry.id)).toEqual(before);
  });
});

describe('匯入單字', () => {
  /** 一份最小的備份檔，兩張卡進甲本。`a1` 那個詞已經有卡了，應該被跳過。 */
  const incoming = JSON.stringify({
    version: 3,
    books: [{ id: 'X', name: '來源' }],
    cards: [
      { id: 'x1', bookId: 'X', text: '新詞', meaning: '新的', interval: null, ease: DEFAULT_EASE, due: null },
      { id: 'x2', bookId: 'X', text: 'a1', meaning: '撞名', interval: null, ease: DEFAULT_EASE, due: null },
    ],
    scopes: { review: ['X'], list: ['X'], stats: ['X'] },
    updatedAt: 0,
  });

  it('卡加進指定的那一本，撞到的詞跳過並說得出是哪一個', () => {
    const it_ = session();
    const result = it_.importWords(incoming, 'A');
    expect(result.imported).toBe(1);
    expect(result.skipped.map((skip) => skip.term)).toEqual(['a1']);
    expect(it_.snapshot().data.cards.filter((card) => card.text === '新詞')).toHaveLength(1);
  });

  it('新卡進得了今天的佇列——匯完不必重開 app 才看得到', () => {
    const it_ = session();
    it_.importWords(incoming, 'A');
    expect(it_.snapshot().queue.map((entry) => entry.text)).toContain('新詞');
  });

  it('推上雲端', () => {
    const pushed: AppData[] = [];
    const it_ = session({ onPersisted: (data) => pushed.push(data) });
    it_.importWords(incoming, 'A');
    expect(pushed).toHaveLength(1);
  });

  it('那一本已經不在時丟例外，本機資料一個字沒變', () => {
    const it_ = session();
    const before = it_.snapshot().data.cards.length;
    expect(() => it_.importWords(incoming, '不存在的本')).toThrow();
    expect(it_.snapshot().data.cards).toHaveLength(before);
  });
});

describe('零本', () => {
  it('一本都沒有時佇列是空的，而且不會誤判成今日份完成', () => {
    const storage = fakeStorage();
    const store = createStore(storage);
    const it_ = createReviewSession({ store, now: () => TODAY, random: NO_SHUFFLE, onChange: () => {}, haptic: () => {} });
    const snapshot = it_.snapshot();
    expect(snapshot.data.books).toHaveLength(0);
    expect(snapshot.queue).toHaveLength(0);
  });
});

/**
 * 新增／編輯／刪除單張卡（票 `16`）。
 *
 * **這一組刻意不走 `applyData()`。** 那一支的閘門是「複習範圍內的卡是不是同一批」，
 * 比的是 id 集合——改一張卡的內容集合沒變，佇列因此不重建，手上那張會停在舊的字；
 * 而新增一張卡集合變了，整個佇列會重洗一次，評成「再次」排回去的那幾張一起消失。
 * 兩種都不是使用者要的，所以照網頁版 `src/app.ts` 的 `upsert()`／`remove()` 各給一支。
 */
describe('新增與編輯單張卡', () => {
  const 新卡 = (id: string, bookId: string) => card(id, bookId, null);

  it('新增一張複習範圍內的卡：接在佇列尾端，前面的順序不動', () => {
    const it_ = session();
    it_.upsertCard(新卡('a9', 'A'));
    expect(it_.snapshot().queue.map((entry) => entry.id)).toEqual(['a1', 'a2', 'b1', 'a9']);
  });

  it('新增的那一本不在複習範圍內：卡進得了資料，進不了佇列', () => {
    const it_ = session();
    it_.setReviewScope(['A']);
    it_.upsertCard(新卡('b9', 'B'));
    expect(it_.snapshot().data.cards.map((entry) => entry.id)).toContain('b9');
    expect(it_.snapshot().queue.map((entry) => entry.id)).not.toContain('b9');
  });

  it('改既有那張的內容：佇列上那一張跟著換成新的字', () => {
    const it_ = session();
    it_.upsertCard({ ...card('a1', 'A', null), text: '改過的' });
    expect(it_.snapshot().queue[0]?.text).toBe('改過的');
  });

  it('改單字本等於搬家：排程那三格一個都不動', () => {
    const it_ = session();
    const before = it_.snapshot().data.cards.find((entry) => entry.id === 'a2')!;
    it_.upsertCard({ ...before, bookId: 'B' });
    const after = it_.snapshot().data.cards.find((entry) => entry.id === 'a2')!;
    expect(after.bookId).toBe('B');
    expect({ interval: after.interval, ease: after.ease, due: after.due }).toEqual({
      interval: before.interval,
      ease: before.ease,
      due: before.due,
    });
  });

  it('搬到複習範圍外的本：那張卡離開佇列', () => {
    const it_ = session();
    it_.setReviewScope(['A']);
    const a2 = it_.snapshot().data.cards.find((entry) => entry.id === 'a2')!;
    it_.upsertCard({ ...a2, bookId: 'B' });
    expect(it_.snapshot().queue.map((entry) => entry.id)).not.toContain('a2');
  });

  it('搬走的若是手上這張，答案蓋回去——遞補上來的是別人', () => {
    const it_ = session();
    it_.setReviewScope(['A']);
    it_.reveal();
    const a1 = it_.snapshot().data.cards.find((entry) => entry.id === 'a1')!;
    it_.upsertCard({ ...a1, bookId: 'B' });
    expect(it_.snapshot().revealed).toBe(false);
  });

  it('存完就推上雲端', () => {
    const pushed: AppData[] = [];
    const it_ = session({ onPersisted: (data) => pushed.push(data) });
    it_.upsertCard(新卡('a9', 'A'));
    expect(pushed).toHaveLength(1);
  });

  it('畫面收得到通知', () => {
    const changes = jest.fn();
    const it_ = session({ onChange: changes });
    it_.upsertCard(新卡('a9', 'A'));
    expect(changes).toHaveBeenCalled();
  });
});

describe('刪除單張卡', () => {
  it('資料與佇列一起消失', () => {
    const it_ = session();
    it_.removeCard('a1');
    expect(it_.snapshot().data.cards.map((entry) => entry.id)).not.toContain('a1');
    expect(it_.snapshot().queue.map((entry) => entry.id)).not.toContain('a1');
  });

  it('刪掉的若是手上這張，答案蓋回去', () => {
    const it_ = session();
    it_.reveal();
    it_.removeCard('a1');
    expect(it_.snapshot().revealed).toBe(false);
  });

  it('存完就推上雲端', () => {
    const pushed: AppData[] = [];
    const it_ = session({ onPersisted: (data) => pushed.push(data) });
    it_.removeCard('a1');
    expect(pushed).toHaveLength(1);
  });
});
