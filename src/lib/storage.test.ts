import { describe, it, expect } from 'vitest';
import {
  addBook,
  assertTermAvailable,
  cardsInBooks,
  createStore,
  deleteBook,
  findTermConflict,
  HOME_BOOK_NAME,
  renameBook,
  setScope,
  type StorageLike,
} from './storage';
import { DEFAULT_EASE } from './review';
import type { AppData, Card } from './types';

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

/** 一張新卡。識別碼預設用詞條本身，只有歸屬與詞條要緊的情境用這個。 */
function card(text: string, bookId: string, overrides: Partial<Card> = {}): Card {
  return {
    id: text,
    bookId,
    text,
    meaning: '釋義',
    interval: null,
    ease: DEFAULT_EASE,
    due: null,
    ...overrides,
  };
}

/** 兩本各一張卡，三組範圍刻意各不相同，藉此看出操作有沒有波及不該動的那幾組。 */
function twoBooks(): AppData {
  return modern({
    books: [
      { id: 'book-n2', name: 'JLPT N2' },
      { id: 'book-work', name: '工作用' },
    ],
    cards: [card('焦[こ]がす', 'book-n2'), card('会議', 'book-work')],
    scopes: { review: ['book-n2', 'book-work'], list: ['book-n2'], stats: ['book-work'] },
  });
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

  it('刪掉一張卡再重開，那張卡不會被補回來', () => {
    const storage = fakeStorage();
    const store = createStore(storage);
    store.save(
      modern({
        cards: [
          ...modern().cards,
          { id: '拝む', bookId: 'book-n2', text: '拝[おが]む', meaning: '拜', interval: null, ease: DEFAULT_EASE, due: null },
        ],
      }),
    );

    const kept = store.load().cards.filter((card) => card.id !== '拝む');
    store.save(modern({ cards: kept }));

    expect(createStore(storage).load().cards.map((card) => card.id)).toEqual(['焦がす']);
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

describe('新增單字本', () => {
  it('出現在清單末端，且三組範圍都含它', () => {
    const data = addBook(twoBooks(), '文法句型');
    expect(data.books.map((book) => book.name)).toEqual(['JLPT N2', '工作用', '文法句型']);

    const id = data.books.at(-1)!.id;
    expect(data.scopes.review).toContain(id);
    expect(data.scopes.list).toContain(id);
    expect(data.scopes.stats).toContain(id);
  });

  it('原本就在範圍裡的本沒有被擠掉', () => {
    const data = addBook(twoBooks(), '文法句型');
    expect(data.scopes.list).toContain('book-n2');
    expect(data.scopes.stats).toContain('book-work');
  });

  it('存的是使用者原本輸入的字，只去掉前後空白', () => {
    const data = addBook(twoBooks(), '  JLPT  N1  ');
    expect(data.books.at(-1)!.name).toBe('JLPT  N1');
  });

  it.each([
    ['前後空白', 'JLPT N2 '],
    ['中間連續空白', 'JLPT  N2'],
    ['大小寫', 'jlpt n2'],
    ['全形半形', 'ＪＬＰＴ　Ｎ２'],
  ])('與既有的本只差在%s時算重名，被拒且訊息指得出撞到誰', (_label, name) => {
    expect(() => addBook(twoBooks(), name)).toThrow(/JLPT N2/);
  });

  it.each([
    ['空字串', ''],
    ['只有半形空白', '   '],
    ['只有全形空白', '　'],
  ])('名字是%s時被拒', (_label, name) => {
    expect(() => addBook(twoBooks(), name)).toThrow(/名字/);
  });

  it('被拒時原本那份資料一個字都沒動', () => {
    const before = twoBooks();
    expect(() => addBook(before, 'jlpt n2')).toThrow();
    expect(before.books).toHaveLength(2);
  });
});

describe('單字本改名', () => {
  it('名字變了，該本的卡一張都沒動', () => {
    const before = twoBooks();
    const data = renameBook(before, 'book-n2', '日檢 N2');
    expect(data.books.find((book) => book.id === 'book-n2')!.name).toBe('日檢 N2');
    expect(data.cards).toEqual(before.cards);
  });

  it('三組範圍不受影響', () => {
    const data = renameBook(twoBooks(), 'book-n2', '日檢 N2');
    expect(data.scopes).toEqual(twoBooks().scopes);
  });

  it('改成自己原本名字的另一種寫法會成功', () => {
    const data = renameBook(twoBooks(), 'book-n2', 'ＪＬＰＴ　Ｎ２');
    expect(data.books[0]!.name).toBe('ＪＬＰＴ　Ｎ２');
  });

  it('撞到別本的名字被拒', () => {
    expect(() => renameBook(twoBooks(), 'book-n2', '工作用')).toThrow(/工作用/);
  });

  it('改名一樣走正規化比對，不是只擋一字不差的重名', () => {
    const data = modern({
      books: [
        { id: 'book-n2', name: 'JLPT N2' },
        { id: 'book-n1', name: 'JLPT N1' },
      ],
      cards: [],
      scopes: { review: ['book-n2', 'book-n1'], list: ['book-n2'], stats: ['book-n1'] },
    });
    expect(() => renameBook(data, 'book-n1', 'ｊｌｐｔ　ｎ２')).toThrow(/JLPT N2/);
  });

  it('改成空白被拒', () => {
    expect(() => renameBook(twoBooks(), 'book-n2', '   ')).toThrow(/名字/);
  });
});

describe('刪除單字本', () => {
  it('該本、它的卡、三組範圍裡的它一起消失', () => {
    const data = deleteBook(twoBooks(), 'book-n2');
    expect(data.books.map((book) => book.id)).toEqual(['book-work']);
    expect(data.cards.map((entry) => entry.id)).toEqual(['会議']);
    expect(data.scopes.review).not.toContain('book-n2');
    expect(data.scopes.list).not.toContain('book-n2');
    expect(data.scopes.stats).not.toContain('book-n2');
  });

  it('刪掉某一組唯一的那一本時，該組補成全選而不是空的', () => {
    // twoBooks() 的 list 原本只有 book-n2，刪掉它會把那一組清空。
    expect(deleteBook(twoBooks(), 'book-n2').scopes.list).toEqual(['book-work']);
  });

  it('刪到剩零本時三組皆為空陣列', () => {
    const data = deleteBook(deleteBook(twoBooks(), 'book-n2'), 'book-work');
    expect(data.books).toEqual([]);
    expect(data.cards).toEqual([]);
    expect(data.scopes).toEqual({ review: [], list: [], stats: [] });
  });
});

describe('範圍的變更', () => {
  it('把某一組設成空陣列會被拒', () => {
    expect(() => setScope(twoBooks(), 'review', [])).toThrow(/至少/);
  });

  it('改一組不動另外兩組', () => {
    const data = setScope(twoBooks(), 'review', ['book-work']);
    expect(data.scopes.review).toEqual(['book-work']);
    expect(data.scopes.list).toEqual(['book-n2']);
    expect(data.scopes.stats).toEqual(['book-work']);
  });
});

describe('詞條全域唯一', () => {
  /** 打ち合わせ 在 A 本，会議 在 B 本。 */
  function crossBooks(): AppData {
    return modern({
      books: [
        { id: 'book-a', name: 'A 本' },
        { id: 'book-b', name: 'B 本' },
      ],
      cards: [
        card('打[う]ち合[あ]わせ', 'book-a', { id: 'card-a' }),
        card('会議', 'book-b', { id: 'card-b' }),
      ],
      scopes: { review: ['book-a', 'book-b'], list: ['book-a', 'book-b'], stats: ['book-a', 'book-b'] },
    });
  }

  it('往另一本新增同一個詞被拒，訊息說得出它在哪一本', () => {
    expect(() => assertTermAvailable(crossBooks(), '打ち合わせ')).toThrow(/A 本/);
  });

  it('撞到的那張卡帶得出所在的單字本', () => {
    expect(findTermConflict(crossBooks().cards, '打ち合わせ')!.bookId).toBe('book-a');
  });

  it('讀音標記不同、詞條相同一樣算撞到', () => {
    expect(findTermConflict(crossBooks().cards, '打[うちあ]ち合わせ')).not.toBeNull();
  });

  it('沒撞到時回 null 且不丟例外', () => {
    expect(findTermConflict(crossBooks().cards, '約束')).toBeNull();
    expect(() => assertTermAvailable(crossBooks(), '約束')).not.toThrow();
  });

  it('編輯別本的卡、把詞條改成該詞同樣被拒', () => {
    expect(() => assertTermAvailable(crossBooks(), '打ち合わせ', 'card-b')).toThrow(/A 本/);
  });

  it('把一張卡的詞條改成它自己不算撞到', () => {
    expect(() => assertTermAvailable(crossBooks(), '打ち合わせ', 'card-a')).not.toThrow();
    expect(findTermConflict(crossBooks().cards, '打ち合わせ', 'card-a')).toBeNull();
  });

  it('釋義不參與比對', () => {
    const cards = [card('会議', 'book-b', { meaning: '會議' })];
    expect(findTermConflict(cards, '会議')).not.toBeNull();
  });
});

describe('匯入單字', () => {
  /** A 本有一張帶讀音標記的 打ち合わせ，B 本是空的。匯入一律以 B 本為目標。 */
  function twoBooksOneCard(): AppData {
    return modern({
      books: [
        { id: 'book-a', name: 'A 本' },
        { id: 'book-b', name: 'B 本' },
      ],
      cards: [card('打[う]ち合[あ]わせ', 'book-a', { id: 'card-a' })],
      scopes: { review: ['book-a', 'book-b'], list: ['book-a'], stats: ['book-b'] },
    });
  }

  /** 一台已經有 A、B 兩本的裝置。 */
  function device(data: AppData = twoBooksOneCard()) {
    const storage = fakeStorage();
    const store = createStore(storage);
    store.save(data);
    return { storage, store };
  }

  /** 把幾張卡包成一份舊格式（沒有單字本）的備份檔。 */
  function backup(...cards: Partial<Card>[]): string {
    return JSON.stringify({
      version: 2,
      cards: cards.map((overrides, index) => ({
        id: `來源-${index}`,
        text: '詞',
        meaning: '釋義',
        interval: null,
        ease: DEFAULT_EASE,
        due: null,
        ...overrides,
      })),
    });
  }

  /** 三張卡的舊格式備份檔，各自帶著不同的進度。 */
  const THREE_WORDS = backup(
    { text: '約束', meaning: '約定', interval: 12, ease: 2.15, due: '2026-08-01' },
    { text: '会議', meaning: '會議', interval: 3, ease: 2.5, due: '2026-09-01' },
    { text: '焦[こ]がす', meaning: '燒焦' },
  );

  /** 目標本裡的卡，順序沿用結果中的順序。 */
  function inTarget(data: AppData): Card[] {
    return data.cards.filter((entry) => entry.bookId === 'book-b');
  }

  it('三張卡全部進了目標那一本', () => {
    const { store } = device();
    const result = store.importWords(THREE_WORDS, 'book-b');
    expect(inTarget(result.data).map((entry) => entry.text)).toEqual(['約束', '会議', '焦[こ]がす']);
    expect(result.imported).toBe(3);
    expect(result.skipped).toEqual([]);
  });

  it('複習進度一字不差地搬過來', () => {
    const { store } = device();
    const result = store.importWords(THREE_WORDS, 'book-b');
    expect(inTarget(result.data).map(({ interval, ease, due }) => ({ interval, ease, due }))).toEqual([
      { interval: 12, ease: 2.15, due: '2026-08-01' },
      { interval: 3, ease: 2.5, due: '2026-09-01' },
      { interval: null, ease: DEFAULT_EASE, due: null },
    ]);
  });

  it('既有的卡與單字本清單、三組範圍都不受影響', () => {
    const { store } = device();
    const result = store.importWords(THREE_WORDS, 'book-b');
    expect(result.data.cards.find((entry) => entry.id === 'card-a')).toEqual(twoBooksOneCard().cards[0]);
    expect(result.data.books).toEqual(twoBooksOneCard().books);
    expect(result.data.scopes).toEqual(twoBooksOneCard().scopes);
  });

  it('結果整份寫回儲存，重開就在那裡', () => {
    const { storage, store } = device();
    store.importWords(THREE_WORDS, 'book-b');
    expect(createStore(storage).load().cards).toHaveLength(4);
  });

  it('全 app 已有的詞被跳過，回報的是它現在所在的那一本', () => {
    const { store } = device();
    const result = store.importWords(
      backup({ text: '打ち合わせ', meaning: '碰頭', interval: 5, ease: 2.4, due: '2026-08-05' }, { text: '約束' }),
      'book-b',
    );
    expect(result.skipped).toEqual([{ term: '打ち合わせ', bookId: 'book-a' }]);
    expect(result.imported).toBe(1);
    expect(inTarget(result.data).map((entry) => entry.text)).toEqual(['約束']);
  });

  it('跳過重複的並不影響既有那張卡的進度', () => {
    const { store } = device();
    const result = store.importWords(
      backup({ text: '打ち合わせ', meaning: '碰頭', interval: 5, ease: 2.4, due: '2026-08-05' }),
      'book-b',
    );
    expect(result.data.cards.find((entry) => entry.id === 'card-a')).toEqual(twoBooksOneCard().cards[0]);
  });

  it.each([
    ['來源帶讀音標記、既有的沒有', '焚がす', '焚[こ]がす'],
    ['既有的帶讀音標記、來源沒有', '焚[こ]がす', '焚がす'],
  ])('%s時判為重複', (_label, existing, incoming) => {
    const { store } = device(
      modern({
        books: [
          { id: 'book-a', name: 'A 本' },
          { id: 'book-b', name: 'B 本' },
        ],
        cards: [card(existing, 'book-a', { id: 'card-a' })],
        scopes: { review: ['book-a', 'book-b'], list: ['book-a'], stats: ['book-b'] },
      }),
    );
    const result = store.importWords(backup({ text: incoming }), 'book-b');
    expect(result.imported).toBe(0);
    expect(result.skipped).toEqual([{ term: '焚がす', bookId: 'book-a' }]);
  });

  it('同一份檔裡的兩張同詞，第一張進去、第二張列進跳過清單且指向目標本', () => {
    const { store } = device();
    const result = store.importWords(
      backup(
        { text: '約束', meaning: '約定', interval: 12, ease: 2.15, due: '2026-08-01' },
        { text: '約[やく]束[そく]', meaning: '約定（重複的那張）', interval: 1, ease: 2.5, due: '2026-08-02' },
      ),
      'book-b',
    );
    expect(result.imported).toBe(1);
    expect(result.skipped).toEqual([{ term: '約束', bookId: 'book-b' }]);
    expect(inTarget(result.data)[0]).toMatchObject({ meaning: '約定', due: '2026-08-01' });
  });

  it('imported 與實際新增張數一致，加上跳過的等於來源總數', () => {
    const { store } = device();
    const before = twoBooksOneCard().cards.length;
    const result = store.importWords(
      backup({ text: '打ち合わせ' }, { text: '約束' }, { text: '約束' }, { text: '会議' }),
      'book-b',
    );
    expect(result.imported).toBe(result.data.cards.length - before);
    expect(result.imported + result.skipped.length).toBe(4);
  });

  it('新格式的兩本共 5 張全部壓進目標那一本，來源的單字本不還原', () => {
    const { store } = device();
    const source = JSON.stringify(
      modern({
        books: [
          { id: 'src-1', name: '來源第一本' },
          { id: 'src-2', name: '來源第二本' },
        ],
        cards: [
          card('約束', 'src-1'),
          card('会議', 'src-1'),
          card('焦[こ]がす', 'src-2'),
          card('拝[おが]む', 'src-2'),
          card('迷子', 'src-2'),
        ],
        scopes: { review: ['src-1'], list: ['src-2'], stats: ['src-1'] },
      }),
    );

    const result = store.importWords(source, 'book-b');
    expect(result.imported).toBe(5);
    expect(inTarget(result.data)).toHaveLength(5);
    expect(result.data.books.map((book) => book.name)).toEqual(['A 本', 'B 本']);
  });

  it('來源的卡片識別碼與既有卡撞號時換一個新的，既有那張不被蓋掉', () => {
    const { store } = device();
    const result = store.importWords(
      backup({ id: 'card-a', text: '約束', interval: 7, ease: 2.4, due: '2026-08-01' }),
      'book-b',
    );
    expect(result.data.cards).toHaveLength(2);
    expect(result.data.cards.find((entry) => entry.id === 'card-a')!.text).toBe('打[う]ち合[あ]わせ');
    expect(inTarget(result.data)[0]).toMatchObject({ interval: 7, ease: 2.4, due: '2026-08-01' });
    expect(inTarget(result.data)[0]!.id).not.toBe('card-a');
  });

  it('識別碼沒撞到時沿用來源檔案裡的', () => {
    const { store } = device();
    const result = store.importWords(backup({ id: '來自來源的識別碼', text: '約束' }), 'book-b');
    expect(inTarget(result.data)[0]!.id).toBe('來自來源的識別碼');
  });

  it('同一份檔裡兩張卡撞同一個號時，兩張都留得下來', () => {
    const { store } = device();
    const result = store.importWords(
      backup({ id: '同號', text: '約束' }, { id: '同號', text: '会議' }),
      'book-b',
    );
    expect(result.imported).toBe(2);
    expect(new Set(inTarget(result.data).map((entry) => entry.id)).size).toBe(2);
  });

  it.each([
    ['不是 JSON 的內容', '隨便貼的一段字'],
    ['沒有卡片清單', '{"version":2}'],
    ['卡片缺少必要欄位', '{"version":2,"cards":[{"id":"x"}]}'],
  ])('%s會丟例外，且既有資料一個字都沒動', (_label, json) => {
    const { storage, store } = device();
    const before = storage.raw();
    expect(() => store.importWords(json, 'book-b')).toThrow();
    expect(storage.raw()).toBe(before);
  });

  it('目標單字本不存在時丟例外，且不自動建立', () => {
    const { storage, store } = device();
    const before = storage.raw();
    expect(() => store.importWords(THREE_WORDS, '早就被刪掉的本')).toThrow(/單字本/);
    expect(storage.raw()).toBe(before);
  });
});

describe('範圍過濾', () => {
  const cards = [
    card('焦がす', 'book-n2'),
    card('会議', 'book-work'),
    card('約束', 'book-grammar'),
  ];

  it('單本只拿到那本的卡', () => {
    expect(cardsInBooks(cards, ['book-work']).map((entry) => entry.id)).toEqual(['会議']);
  });

  it('多本一起拿，順序沿用卡片原本的順序', () => {
    expect(cardsInBooks(cards, ['book-grammar', 'book-n2']).map((entry) => entry.id)).toEqual([
      '焦がす',
      '約束',
    ]);
  });

  it('全選拿到全部', () => {
    expect(cardsInBooks(cards, ['book-n2', 'book-work', 'book-grammar'])).toEqual(cards);
  });

  it('bookIds 為空時回傳空陣列', () => {
    expect(cardsInBooks(cards, [])).toEqual([]);
  });

  it('卡的 bookId 不在清單裡就不會被拿出來', () => {
    expect(cardsInBooks(cards, ['早就被刪掉的本'])).toEqual([]);
  });
});
