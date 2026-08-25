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


function session(options: { now?: () => Date; onChange?: () => void; onPersisted?: (data: AppData) => void } = {}) {
  const storage = fakeStorage();
  const store = createStore(storage);
  store.save(seed());
  return createReviewSession({
    store,
    now: options.now ?? (() => TODAY),
    random: NO_SHUFFLE,
    onChange: options.onChange ?? (() => {}),
    onPersisted: options.onPersisted,
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
    const it_ = createReviewSession({ store, now: () => TODAY, random: NO_SHUFFLE, onChange: () => {} });

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

describe('零本', () => {
  it('一本都沒有時佇列是空的，而且不會誤判成今日份完成', () => {
    const storage = fakeStorage();
    const store = createStore(storage);
    const it_ = createReviewSession({ store, now: () => TODAY, random: NO_SHUFFLE, onChange: () => {} });
    const snapshot = it_.snapshot();
    expect(snapshot.data.books).toHaveLength(0);
    expect(snapshot.queue).toHaveLength(0);
  });
});
