import { describe, it, expect } from 'vitest';
import { createStore, HOME_BOOK_NAME, type StorageLike } from './storage';
import { DEFAULT_EASE } from './review';
import type { AppData } from './types';

/** 一台裝置的本機儲存。同一個 storage 傳給不同的 store，等同重開 App。 */
function fakeStorage(initial?: string): StorageLike & { raw(): string | null } {
  let value = initial ?? null;
  return {
    getItem: () => value,
    setItem: (_key, next) => {
      value = next;
    },
    removeItem: () => {
      value = null;
    },
    raw: () => value,
  };
}

/** version 2 的一份資料：沒有單字本、沒有 bookId、帶著使用者累積的進度。 */
const LEGACY = JSON.stringify({
  version: 2,
  knownBuiltinIds: ['焦がす', '拝む'],
  cards: [
    { id: '焦がす', text: '焦[こ]がす', meaning: '燒焦', interval: 12, ease: 2.15, due: '2026-08-01' },
    { id: '拝む', text: '拝[おが]む', meaning: '拜', interval: null, ease: DEFAULT_EASE, due: null },
  ],
  updatedAt: 1784852211282,
});

/** 一份已經是新格式的資料，供「不重複遷移」與範圍正規化的情境取用。 */
function modern(overrides: Partial<AppData> = {}): AppData {
  return {
    version: 3,
    books: [{ id: 'book-n2', name: 'JLPT N2' }],
    cards: [
      { id: '焦がす', bookId: 'book-n2', text: '焦[こ]がす', meaning: '燒焦', interval: 12, ease: 2.15, due: '2026-08-01' },
    ],
    scopes: { review: ['book-n2'], list: ['book-n2'], stats: ['book-n2'] },
    updatedAt: 0,
    ...overrides,
  };
}

describe('首次啟動', () => {
  it('全新裝置拿到零本零卡，不自動塞任何卡', () => {
    const data = createStore(fakeStorage()).load();
    expect(data.books).toEqual([]);
    expect(data.cards).toEqual([]);
    expect(data.scopes).toEqual({ review: [], list: [], stats: [] });
  });

  it('零本零卡是合法狀態，重開之後仍然讀得回來且不丟例外', () => {
    const storage = fakeStorage();
    createStore(storage).load();
    expect(() => createStore(storage).load()).not.toThrow();
    expect(createStore(storage).load().books).toEqual([]);
  });

  it('重開之後拿到的是同一份資料，不會重跑初始化', () => {
    const storage = fakeStorage();
    const store = createStore(storage);
    store.save(modern());

    expect(createStore(storage).load()).toEqual(modern());
  });
});

describe('舊格式遷移', () => {
  it('沒有單字本的資料被收進「我的單字」，一張卡都不少', () => {
    const data = createStore(fakeStorage(LEGACY)).load();
    expect(data.books).toHaveLength(1);
    expect(data.books[0]!.name).toBe(HOME_BOOK_NAME);
    expect(data.cards).toHaveLength(2);
    expect(data.cards.every((card) => card.bookId === data.books[0]!.id)).toBe(true);
  });

  it('複習進度一字不差地留著', () => {
    const data = createStore(fakeStorage(LEGACY)).load();
    expect(data.cards[0]).toMatchObject({ interval: 12, ease: 2.15, due: '2026-08-01' });
    expect(data.cards[1]).toMatchObject({ interval: null, ease: DEFAULT_EASE, due: null });
  });

  it('三組範圍都含收出來的那一本', () => {
    const data = createStore(fakeStorage(LEGACY)).load();
    const id = data.books[0]!.id;
    expect(data.scopes).toEqual({ review: [id], list: [id], stats: [id] });
  });

  it('遷移後版本號升到 3，且 knownBuiltinIds 不再寫回儲存', () => {
    const storage = fakeStorage(LEGACY);
    expect(createStore(storage).load().version).toBe(3);
    expect(storage.raw()).not.toContain('knownBuiltinIds');
  });

  it('遷移不算把這份資料推上雲端，時間戳原封不動', () => {
    expect(createStore(fakeStorage(LEGACY)).load().updatedAt).toBe(1784852211282);
  });

  it('連續載入兩次不會多長一本「我的單字」', () => {
    const storage = fakeStorage(LEGACY);
    const first = createStore(storage).load();
    const second = createStore(storage).load();
    expect(second.books).toHaveLength(1);
    expect(second.books[0]!.id).toBe(first.books[0]!.id);
  });

  it('已是新格式的資料反覆載入，單字本長度不變', () => {
    const storage = fakeStorage(JSON.stringify(modern()));
    for (let i = 0; i < 3; i += 1) createStore(storage).load();
    expect(createStore(storage).load().books).toEqual([{ id: 'book-n2', name: 'JLPT N2' }]);
  });

  it('bookId 指向不存在的單字本時，那張卡被收進「我的單字」', () => {
    const storage = fakeStorage(
      JSON.stringify(
        modern({
          cards: [
            { id: '焦がす', bookId: 'book-n2', text: '焦がす', meaning: '燒焦', interval: 12, ease: 2.15, due: '2026-08-01' },
            { id: '迷子', bookId: '早就被刪掉的本', text: '迷子', meaning: '走失', interval: 5, ease: 2.5, due: '2026-09-01' },
          ],
        }),
      ),
    );
    const data = createStore(storage).load();
    const home = data.books.find((book) => book.name === HOME_BOOK_NAME)!;
    expect(home).toBeDefined();
    expect(data.cards.find((card) => card.id === '迷子')!.bookId).toBe(home.id);
    // 原本有家的那張卡不受影響。
    expect(data.cards.find((card) => card.id === '焦がす')!.bookId).toBe('book-n2');
  });

  it('收攏出來的那一本會進三組範圍，否則被救回來的卡三個畫面都看不到', () => {
    // 原有的範圍是完整且合法的，剔除那一步不會清空任何一組，
    // 新建的「我的單字」因此得靠另一條規則才進得去。
    const storage = fakeStorage(
      JSON.stringify(
        modern({
          cards: [{ id: '迷子', bookId: '早就被刪掉的本', text: '迷子', meaning: '走失', interval: null, ease: 2.5, due: null }],
        }),
      ),
    );
    const data = createStore(storage).load();
    const home = data.books.find((book) => book.name === HOME_BOOK_NAME)!;
    expect(data.scopes.review).toContain(home.id);
    expect(data.scopes.list).toContain(home.id);
    expect(data.scopes.stats).toContain(home.id);
    // 原本就在範圍裡的那一本沒有被擠掉。
    expect(data.scopes.review).toContain('book-n2');
  });

  it('收攏無效 bookId 時，進度同樣一字不差', () => {
    const storage = fakeStorage(
      JSON.stringify(modern({ cards: [{ id: '迷子', bookId: '不存在', text: '迷子', meaning: '走失', interval: 5, ease: 2.35, due: '2026-09-01' }] })),
    );
    expect(createStore(storage).load().cards[0]).toMatchObject({ interval: 5, ease: 2.35, due: '2026-09-01' });
  });

  it('已經有一本叫「我的單字」時，收攏用的是它而不是再建一本', () => {
    const storage = fakeStorage(
      JSON.stringify(
        modern({
          books: [{ id: 'book-mine', name: HOME_BOOK_NAME }],
          cards: [{ id: '迷子', bookId: '不存在', text: '迷子', meaning: '走失', interval: null, ease: 2.5, due: null }],
          scopes: { review: ['book-mine'], list: ['book-mine'], stats: ['book-mine'] },
        }),
      ),
    );
    const data = createStore(storage).load();
    expect(data.books).toHaveLength(1);
    expect(data.cards[0]!.bookId).toBe('book-mine');
  });

  it('零卡的舊格式資料不會憑空生出一本單字本', () => {
    const data = createStore(fakeStorage(JSON.stringify({ version: 2, cards: [] }))).load();
    expect(data.books).toEqual([]);
    expect(data.scopes).toEqual({ review: [], list: [], stats: [] });
  });

  it('匯入舊格式的備份檔，與載入舊格式的本機資料結果一致', () => {
    const loaded = createStore(fakeStorage(LEGACY)).load();
    const imported = createStore(fakeStorage()).importJson(LEGACY);

    // 單字本的識別碼是當場生成的，兩條路不會相同，比對的是結構與歸屬。
    expect(imported.books.map((book) => book.name)).toEqual(loaded.books.map((book) => book.name));
    expect(imported.cards.map(({ bookId: _bookId, ...rest }) => rest)).toEqual(
      loaded.cards.map(({ bookId: _bookId, ...rest }) => rest),
    );
    expect(imported.cards.every((card) => card.bookId === imported.books[0]!.id)).toBe(true);
    expect(imported.scopes.review).toEqual([imported.books[0]!.id]);
  });
});

describe('範圍的正規化', () => {
  it('指向不存在的單字本的 id 被剔除', () => {
    const storage = fakeStorage(
      JSON.stringify(modern({ scopes: { review: ['book-n2', '不存在'], list: ['book-n2'], stats: ['book-n2'] } })),
    );
    expect(createStore(storage).load().scopes.review).toEqual(['book-n2']);
  });

  it('剔除後為空的那一組被補成全選', () => {
    const storage = fakeStorage(
      JSON.stringify(
        modern({
          books: [
            { id: 'book-n2', name: 'JLPT N2' },
            { id: 'book-work', name: '工作用' },
          ],
          scopes: { review: ['早就被刪掉的本'], list: ['book-work'], stats: ['book-n2'] },
        }),
      ),
    );
    const scopes = createStore(storage).load().scopes;
    expect(scopes.review).toEqual(['book-n2', 'book-work']);
    // 其餘兩組不受影響。
    expect(scopes.list).toEqual(['book-work']);
    expect(scopes.stats).toEqual(['book-n2']);
  });

  it('缺少 scopes 欄位時三組都補成全選', () => {
    const storage = fakeStorage(
      JSON.stringify({
        version: 3,
        books: [{ id: 'book-n2', name: 'JLPT N2' }],
        cards: [{ id: '焦がす', bookId: 'book-n2', text: '焦がす', meaning: '燒焦', interval: null, ease: 2.5, due: null }],
      }),
    );
    expect(createStore(storage).load().scopes).toEqual({
      review: ['book-n2'],
      list: ['book-n2'],
      stats: ['book-n2'],
    });
  });

  it('零本時三組皆為空陣列，不補成全選', () => {
    const storage = fakeStorage(
      JSON.stringify({ version: 3, books: [], cards: [], scopes: { review: ['幽靈'], list: [], stats: [] } }),
    );
    expect(createStore(storage).load().scopes).toEqual({ review: [], list: [], stats: [] });
  });
});

describe('儲存', () => {
  it('存進去的內容讀得回來', () => {
    const storage = fakeStorage();
    const store = createStore(storage);
    const data = modern();
    data.cards[0]!.interval = 7;
    store.save(data);
    expect(createStore(storage).load().cards[0]!.interval).toBe(7);
  });

  it('單字本存進去讀得回來', () => {
    const storage = fakeStorage();
    createStore(storage).save(
      modern({
        books: [
          { id: 'book-n2', name: 'JLPT N2' },
          { id: 'book-work', name: '工作用' },
        ],
        scopes: { review: ['book-n2'], list: ['book-n2', 'book-work'], stats: ['book-work'] },
      }),
    );
    const data = createStore(storage).load();
    expect(data.books.map((book) => book.name)).toEqual(['JLPT N2', '工作用']);
    expect(data.scopes.list).toEqual(['book-n2', 'book-work']);
  });

  it('首次啟動的資料還沒推上雲端，時間戳是最舊的 0', () => {
    expect(createStore(fakeStorage()).load().updatedAt).toBe(0);
  });

  it('推上雲端後記下的時間戳讀得回來', () => {
    const storage = fakeStorage();
    createStore(storage).save(modern({ updatedAt: 1784852211282 }));
    expect(createStore(storage).load().updatedAt).toBe(1784852211282);
  });

  it('version 1 的舊資料沒有時間戳，視為最舊', () => {
    const storage = fakeStorage(
      JSON.stringify({
        version: 1,
        knownBuiltinIds: ['焦がす'],
        cards: [{ id: '焦がす', text: '焦がす', meaning: '燒焦', interval: 3, ease: 2.5, due: '2026-08-01' }],
      }),
    );
    expect(createStore(storage).load().updatedAt).toBe(0);
  });

  it('儲存內容毀損時拋出明確錯誤，而不是靜靜清空資料', () => {
    const store = createStore(fakeStorage('{ 這不是 JSON'));
    expect(() => store.load()).toThrow(/毀損/);
  });
});

describe('匯出與匯入', () => {
  // 匯出本身（序列化目前資料）現在是畫面層（App.exportBackup）的職責，
  // 這裡驗證的是 load() 回傳的資料本身帶有版本號，序列化後仍是可讀的 JSON。
  it('load() 的結果序列化後仍是可讀的 JSON，含版本號', () => {
    const storage = fakeStorage();
    createStore(storage).save(modern());
    const parsed = JSON.parse(JSON.stringify(createStore(storage).load(), null, 2));
    expect(parsed.version).toBe(3);
    expect(parsed.books).toHaveLength(1);
  });

  it('匯出再匯入回來，資料完全一致', () => {
    const source = fakeStorage();
    const store = createStore(source);
    const data = modern({ updatedAt: 42 });
    store.save(data);
    const exported = JSON.stringify(data, null, 2);

    const target = createStore(fakeStorage());
    target.importJson(exported);
    expect(target.load()).toEqual(data);
  });

  it('匯入是整份覆蓋，不與現有資料合併', () => {
    const storage = fakeStorage();
    const store = createStore(storage);
    store.save(
      modern({
        cards: [
          ...modern().cards,
          { id: 'mine', bookId: 'book-n2', text: '猫', meaning: '貓', interval: null, ease: 2.5, due: null },
        ],
      }),
    );

    store.importJson(JSON.stringify(modern()));
    expect(store.load().cards.map((card) => card.id)).toEqual(['焦がす']);
  });

  it('匯入的單字本整份覆蓋掉原本的單字本', () => {
    const storage = fakeStorage();
    const store = createStore(storage);
    store.save(modern());

    store.importJson(
      JSON.stringify(
        modern({
          books: [{ id: 'book-work', name: '工作用' }],
          cards: [{ id: '会議', bookId: 'book-work', text: '会議', meaning: '會議', interval: null, ease: 2.5, due: null }],
          scopes: { review: ['book-work'], list: ['book-work'], stats: ['book-work'] },
        }),
      ),
    );
    expect(store.load().books).toEqual([{ id: 'book-work', name: '工作用' }]);
  });

  it('匯入不是 JSON 的內容會拋錯，且不動到現有資料', () => {
    const storage = fakeStorage();
    const store = createStore(storage);
    store.load();
    const before = storage.raw();
    expect(() => store.importJson('隨便貼的一段字')).toThrow();
    expect(storage.raw()).toBe(before);
  });

  it('匯入缺少卡片欄位的 JSON 會拋錯', () => {
    const store = createStore(fakeStorage());
    store.load();
    expect(() => store.importJson('{"version":1}')).toThrow(/卡片/);
  });

  it('匯入的卡片缺少必要欄位會拋錯', () => {
    const store = createStore(fakeStorage());
    store.load();
    expect(() => store.importJson('{"version":1,"cards":[{"id":"x"}]}')).toThrow();
  });

  it('匯入的單字本缺少必要欄位會拋錯', () => {
    const store = createStore(fakeStorage());
    store.load();
    expect(() => store.importJson('{"version":3,"books":[{"id":"x"}],"cards":[]}')).toThrow(/單字本/);
  });

  it('匯入的 due 格式不合就當成新卡，其餘卡片照常匯入', () => {
    const store = createStore(fakeStorage());
    const data = store.importJson(
      JSON.stringify({
        version: 2,
        cards: [
          { id: '焦がす', text: '焦がす', meaning: '燒焦', interval: 3, ease: 2.15, due: '2026-7-3' },
          { id: '拝む', text: '拝む', meaning: '拜', interval: 5, ease: 2.5, due: '2026-08-01' },
        ],
      }),
    );

    expect(data.cards[0]).toMatchObject({
      id: '焦がす',
      text: '焦がす',
      meaning: '燒焦',
      interval: null,
      ease: 2.15,
      due: null,
    });
    expect(data.cards[1]!.due).toBe('2026-08-01');
    expect(data.cards[1]!.interval).toBe(5);
  });

  // 匯入的卡固定帶 interval: 3。到期日不合法者連間隔一起清掉，才是真正的新卡；
  // 到期日本來就沒有的（欄位不存在）不在此列，間隔照舊。
  it.each<[string, unknown, string | null, number | null]>([
    ['看不懂的字串', 'tomorrow', null, null],
    ['空字串', '', null, null],
    ['帶時刻的 ISO 格式', '2026-08-01T00:00:00Z', null, null],
    ['型別不對', 42, null, null],
    ['格式正確但日期不存在', '2026-02-30', '2026-02-30', 3],
    ['沒有 due 欄位', undefined, null, 3],
    ['合法的到期日', '2026-08-01', '2026-08-01', 3],
  ])('匯入 %s 的 due', (_label, due, expectedDue, expectedInterval) => {
    const store = createStore(fakeStorage());
    const data = store.importJson(
      JSON.stringify({
        version: 2,
        cards: [{ id: '焦がす', text: '焦がす', meaning: '燒焦', interval: 3, ease: 2.5, due }],
      }),
    );
    expect(data.cards[0]!.due).toBe(expectedDue);
    expect(data.cards[0]!.interval).toBe(expectedInterval);
  });
});
