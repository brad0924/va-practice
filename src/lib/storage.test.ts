import { describe, it, expect } from 'vitest';
import { createStore, type BuiltinDeck, type StorageLike } from './storage';
import { DEFAULT_EASE } from './review';

/** 一台裝置的本機儲存。同一個 storage 傳給不同的 store，等同重開 App。 */
function fakeStorage(initial?: string): StorageLike & { raw(): string | null } {
  let value = initial ?? null;
  return {
    getItem: () => value,
    setItem: (_key, next) => {
      value = next;
    },
    raw: () => value,
  };
}

function deck(...entries: [string, string][]): BuiltinDeck {
  return { cards: entries.map(([id, meaning]) => ({ id, text: id, meaning })) };
}

const BUILTIN = deck(['焦がす', '燒焦'], ['拝む', '拜']);

describe('首次啟動', () => {
  it('把內建牌組整份複製進來，全部是新卡', () => {
    const store = createStore(fakeStorage(), BUILTIN);
    const data = store.load();
    expect(data.cards).toHaveLength(2);
    expect(data.cards[0]).toEqual({
      id: '焦がす',
      text: '焦がす',
      meaning: '燒焦',
      interval: null,
      ease: DEFAULT_EASE,
      due: null,
    });
  });

  it('重開之後拿到的是同一份資料，不會重跑初始化', () => {
    const storage = fakeStorage();
    const first = createStore(storage, BUILTIN).load();
    first.cards[0]!.interval = 9;
    createStore(storage, BUILTIN).save(first);

    expect(createStore(storage, BUILTIN).load()).toEqual(first);
  });
});

describe('單向合併', () => {
  it('新版本追加的內建卡會被補進來', () => {
    const storage = fakeStorage();
    createStore(storage, BUILTIN).load();

    const enlarged = deck(['焦がす', '燒焦'], ['拝む', '拜'], ['崖', '懸崖']);
    const data = createStore(storage, enlarged).load();
    expect(data.cards.map((c) => c.id)).toEqual(['焦がす', '拝む', '崖']);
  });

  it('已存在的卡一律不動，使用者的修改與進度都保留', () => {
    const storage = fakeStorage();
    const store = createStore(storage, BUILTIN);
    const data = store.load();
    data.cards[0]!.meaning = '我自己改的釋義';
    data.cards[0]!.interval = 30;
    data.cards[0]!.due = '2026-09-01';
    store.save(data);

    const reloaded = createStore(storage, deck(['焦がす', '燒焦'], ['拝む', '拜'], ['崖', '懸崖'])).load();
    const edited = reloaded.cards.find((c) => c.id === '焦がす')!;
    expect(edited.meaning).toBe('我自己改的釋義');
    expect(edited.interval).toBe(30);
    expect(edited.due).toBe('2026-09-01');
  });

  it('使用者刪掉的內建卡不會被補回來', () => {
    const storage = fakeStorage();
    const store = createStore(storage, BUILTIN);
    const data = store.load();
    store.save({ ...data, cards: data.cards.filter((c) => c.id !== '拝む') });

    const reloaded = createStore(storage, BUILTIN).load();
    expect(reloaded.cards.map((c) => c.id)).toEqual(['焦がす']);
  });

  it('刪掉既有的卡之後，新版本追加的卡仍然補得進來', () => {
    const storage = fakeStorage();
    const store = createStore(storage, BUILTIN);
    const data = store.load();
    store.save({ ...data, cards: data.cards.filter((c) => c.id !== '拝む') });

    const reloaded = createStore(storage, deck(['焦がす', '燒焦'], ['拝む', '拜'], ['崖', '懸崖'])).load();
    expect(reloaded.cards.map((c) => c.id)).toEqual(['焦がす', '崖']);
  });

  it('反覆載入不會重複加入同一張卡', () => {
    const storage = fakeStorage();
    for (let i = 0; i < 3; i += 1) createStore(storage, BUILTIN).load();
    expect(createStore(storage, BUILTIN).load().cards).toHaveLength(2);
  });

  it('使用者自己加過的詞，日後被收進內建牌組時不會變成兩張', () => {
    const storage = fakeStorage();
    const store = createStore(storage, BUILTIN);
    const data = store.load();
    store.save({
      ...data,
      cards: [
        ...data.cards,
        { id: 'mine', text: '崖[がけ]', meaning: '我自己加的', interval: 4, ease: 2.5, due: '2026-08-01' },
      ],
    });

    const reloaded = createStore(storage, deck(['焦がす', '燒焦'], ['拝む', '拜'], ['崖', '懸崖'])).load();
    expect(reloaded.cards.filter((c) => c.text.startsWith('崖'))).toHaveLength(1);
    expect(reloaded.cards.find((c) => c.id === 'mine')!.meaning).toBe('我自己加的');
  });

  it('使用者新增的卡不受內建牌組影響', () => {
    const storage = fakeStorage();
    const store = createStore(storage, BUILTIN);
    const data = store.load();
    store.save({
      ...data,
      cards: [...data.cards, { id: 'mine', text: '猫', meaning: '貓', interval: null, ease: 2.5, due: null }],
    });
    expect(createStore(storage, BUILTIN).load().cards.map((c) => c.id)).toEqual(['焦がす', '拝む', 'mine']);
  });
});

describe('儲存', () => {
  it('存進去的內容讀得回來', () => {
    const storage = fakeStorage();
    const store = createStore(storage, BUILTIN);
    const data = store.load();
    data.cards[1]!.interval = 7;
    store.save(data);
    expect(createStore(storage, BUILTIN).load().cards[1]!.interval).toBe(7);
  });

  it('載入時把儲存內容正規化寫回，舊格式資料下次才補得進新的內建卡', () => {
    const storage = fakeStorage(
      JSON.stringify({
        version: 1,
        cards: [{ id: '焦がす', text: '焦がす', meaning: '燒焦', interval: 3, ease: 2.5, due: '2026-08-01' }],
      }),
    );
    createStore(storage, BUILTIN).load();

    const reloaded = createStore(storage, deck(['焦がす', '燒焦'], ['拝む', '拜'], ['崖', '懸崖'])).load();
    expect(reloaded.cards.map((c) => c.id)).toEqual(['焦がす', '崖']);
  });

  it('儲存內容毀損時拋出明確錯誤，而不是靜靜清空資料', () => {
    const store = createStore(fakeStorage('{ 這不是 JSON'), BUILTIN);
    expect(() => store.load()).toThrow(/毀損/);
  });
});

describe('匯出與匯入', () => {
  it('匯出的是可讀的 JSON，含版本號', () => {
    const store = createStore(fakeStorage(), BUILTIN);
    store.load();
    const parsed = JSON.parse(store.exportJson());
    expect(parsed.version).toBe(1);
    expect(parsed.cards).toHaveLength(2);
  });

  it('匯出再匯入回來，資料完全一致', () => {
    const source = fakeStorage();
    const store = createStore(source, BUILTIN);
    const data = store.load();
    data.cards[0]!.interval = 12;
    data.cards[0]!.ease = 2.15;
    data.cards[0]!.due = '2026-08-04';
    store.save(data);
    const exported = store.exportJson();

    const target = createStore(fakeStorage(), BUILTIN);
    target.importJson(exported);
    expect(target.load()).toEqual(data);
  });

  it('匯入是整份覆蓋，不與現有資料合併', () => {
    const storage = fakeStorage();
    const store = createStore(storage, BUILTIN);
    const data = store.load();
    store.save({
      ...data,
      cards: [...data.cards, { id: 'mine', text: '猫', meaning: '貓', interval: null, ease: 2.5, due: null }],
    });

    const incoming = JSON.stringify({
      version: 1,
      knownBuiltinIds: ['焦がす', '拝む'],
      cards: [{ id: '焦がす', text: '焦がす', meaning: '燒焦', interval: 3, ease: 2.5, due: '2026-08-01' }],
    });
    store.importJson(incoming);
    expect(store.load().cards.map((c) => c.id)).toEqual(['焦がす']);
  });

  it('匯入不是 JSON 的內容會拋錯，且不動到現有資料', () => {
    const storage = fakeStorage();
    const store = createStore(storage, BUILTIN);
    store.load();
    const before = storage.raw();
    expect(() => store.importJson('隨便貼的一段字')).toThrow();
    expect(storage.raw()).toBe(before);
  });

  it('匯入缺少卡片欄位的 JSON 會拋錯', () => {
    const store = createStore(fakeStorage(), BUILTIN);
    store.load();
    expect(() => store.importJson('{"version":1}')).toThrow(/卡片/);
  });

  it('匯入的卡片缺少必要欄位會拋錯', () => {
    const store = createStore(fakeStorage(), BUILTIN);
    store.load();
    expect(() => store.importJson('{"version":1,"cards":[{"id":"x"}]}')).toThrow();
  });

  it('匯入舊備份缺少內建卡名單時，不會把整副內建牌組重灌回去', () => {
    const storage = fakeStorage();
    const store = createStore(storage, BUILTIN);
    store.importJson(
      JSON.stringify({
        version: 1,
        cards: [{ id: '焦がす', text: '焦がす', meaning: '燒焦', interval: 3, ease: 2.5, due: '2026-08-01' }],
      }),
    );
    expect(store.load().cards.map((c) => c.id)).toEqual(['焦がす']);
  });
});
