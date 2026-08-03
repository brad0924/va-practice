/**
 * 資料存取：畫面只需要載入與儲存兩項操作，首次初始化是內部細節。
 * 匯入同樣由本模組負責，因為必須驗證格式並整份覆蓋，因此也開在介面上；
 * 匯出只是把畫面手上現有的資料序列化，交給畫面層直接做即可。
 *
 * 舊格式的相容也在這裡，且只在這裡：本機 localStorage、匯入備份檔、
 * 雲端拉下來的那一份走的都是 parseAppData()，改一處三條路都涵蓋到。
 *
 * 目前實作為瀏覽器本機儲存；日後若改接雲端服務，僅需替換此模組內部（見 ADR-0002）。
 */
import type { AppData, Book, BookScopes, Card } from './types';
import { DEFAULT_EASE, isDateKey } from './review';

export const STORAGE_KEY = 'va-practice:data';
export const DATA_VERSION = 3;

/** 沒有歸屬的卡被收攏進去的那一本。使用者之後可以改名或刪除。 */
export const HOME_BOOK_NAME = '我的單字';

/** localStorage 的最小介面，測試時可換成假的實作。 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface Store {
  load(): AppData;
  save(data: AppData): void;
  importJson(json: string): AppData;
}

export function createStore(storage: StorageLike): Store {
  function write(data: AppData): void {
    storage.setItem(STORAGE_KEY, JSON.stringify(data, null, 2));
  }

  function read(): AppData | null {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    try {
      return parseAppData(JSON.parse(raw));
    } catch (error) {
      throw new Error(`本機儲存的資料已毀損，無法讀取：${toMessage(error)}`);
    }
  }

  return {
    load() {
      const stored = read();
      // 全新裝置是零本零卡：卡片只來自使用者新增或匯入單字，沒有隨程式發佈的來源。
      const data =
        stored ?? {
          version: DATA_VERSION,
          books: [],
          cards: [],
          scopes: { review: [], list: [], stats: [] },
          updatedAt: 0,
        };
      // 一律寫回，讓儲存的內容永遠是遷移後的形式，
      // 否則舊格式的資料每次載入都要重跑一次遷移。
      write(data);
      return data;
    },

    save(data) {
      write({ ...data, version: DATA_VERSION });
    },

    importJson(json) {
      let raw: unknown;
      try {
        raw = JSON.parse(json);
      } catch (error) {
        throw new Error(`這不是有效的 JSON 檔：${toMessage(error)}`);
      }
      // 整份覆蓋，不與現有資料合併。先驗證再寫入，壞檔案不會弄壞既有資料。
      const data = parseAppData(raw);
      write(data);
      return data;
    },
  };
}

function parseAppData(raw: unknown): AppData {
  if (typeof raw !== 'object' || raw === null) throw new Error('內容不是一個物件');
  const source = raw as Record<string, unknown>;
  if (!Array.isArray(source.cards)) throw new Error('找不到卡片清單');

  // version 2 以前沒有 books 也沒有 bookId，兩者一起交給 adopt() 收攏。
  const adopted = adopt(
    Array.isArray(source.books) ? source.books.map(parseBook) : [],
    source.cards.map(parseCard),
  );

  return {
    // 解析的產物一律是當前格式，版本號跟著標上——舊格式讀進來的那一刻就已經被遷移完了。
    version: DATA_VERSION,
    books: adopted.books,
    cards: adopted.cards,
    scopes: normalizeScopes(parseScopes(source.scopes), adopted.books, adopted.home),
    // version 1 的資料沒有這個欄位，視為最舊，開 app 時會被雲端那份蓋掉。
    updatedAt: typeof source.updatedAt === 'number' ? source.updatedAt : 0,
  };
}

/**
 * 把 `bookId` 指不到任何一本的卡收進「我的單字」，該本不存在就順便建立。
 * 舊格式（完全沒有 bookId）與手改壞的檔案因此走同一條路。
 * 每張卡都有家時什麼都不做（`home` 為 null），
 * 所以已是新格式的資料反覆載入不會多長一本。
 */
function adopt(books: Book[], cards: Card[]): { books: Book[]; cards: Card[]; home: Book | null } {
  const known = new Set(books.map((book) => book.id));
  if (cards.every((card) => known.has(card.bookId))) return { books, cards, home: null };

  const home = books.find((book) => book.name === HOME_BOOK_NAME) ?? {
    id: crypto.randomUUID(),
    name: HOME_BOOK_NAME,
  };
  return {
    books: known.has(home.id) ? books : [...books, home],
    // interval／ease／due 一律原封不動，只換歸屬。
    cards: cards.map((card) => (known.has(card.bookId) ? card : { ...card, bookId: home.id })),
    home,
  };
}

/**
 * 剔除指向不存在單字本的 id；剔除後為空的那一組補成全選——
 * 一組範圍空掉等於畫面上什麼都看不到，那不是使用者要的結果。
 * 零本時三組皆為空陣列，此時空狀態才是對的。
 *
 * 收攏卡片的那一本一律補進三組：這些卡剛被救回來，
 * 若沒進任何範圍，複習、列表、統計三個畫面就全都看不到它們。
 */
function normalizeScopes(scopes: BookScopes, books: Book[], home: Book | null): BookScopes {
  const known = new Set(books.map((book) => book.id));
  const all = books.map((book) => book.id);
  const fix = (ids: string[]): string[] => {
    if (books.length === 0) return [];
    const kept = ids.filter((id) => known.has(id));
    if (kept.length === 0) return all;
    return home !== null && !kept.includes(home.id) ? [...kept, home.id] : kept;
  };
  return { review: fix(scopes.review), list: fix(scopes.list), stats: fix(scopes.stats) };
}

function parseScopes(raw: unknown): BookScopes {
  const source = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const group = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
  return { review: group(source.review), list: group(source.list), stats: group(source.stats) };
}

function parseBook(raw: unknown, index: number): Book {
  if (typeof raw !== 'object' || raw === null) throw new Error(`第 ${index + 1} 本單字本不是一個物件`);
  const source = raw as Record<string, unknown>;
  for (const field of ['id', 'name'] as const) {
    if (typeof source[field] !== 'string') throw new Error(`第 ${index + 1} 本單字本缺少 ${field} 欄位`);
  }
  return { id: source.id as string, name: source.name as string };
}

function parseCard(raw: unknown, index: number): Card {
  if (typeof raw !== 'object' || raw === null) throw new Error(`第 ${index + 1} 張卡不是一個物件`);
  const source = raw as Record<string, unknown>;
  for (const field of ['id', 'text', 'meaning'] as const) {
    if (typeof source[field] !== 'string') throw new Error(`第 ${index + 1} 張卡缺少 ${field} 欄位`);
  }
  // 有值但格式不合的到期日一律當成沒有，這張卡退回新卡。
  // 新卡的定義是「尚無間隔與到期日」，故間隔也要一併清掉，
  // 否則列表顯示新卡、評分時卻仍沿用舊間隔。成長倍數不受影響。
  const due = typeof source.due === 'string' && isDateKey(source.due) ? source.due : null;
  const dueWasInvalid = source.due !== undefined && source.due !== null && due === null;
  const interval = typeof source.interval === 'number' ? source.interval : null;
  return {
    id: source.id as string,
    // 舊格式沒有這個欄位，空字串指不到任何一本，adopt() 會把它收攏。
    bookId: typeof source.bookId === 'string' ? source.bookId : '',
    text: source.text as string,
    meaning: source.meaning as string,
    interval: dueWasInvalid ? null : interval,
    ease: typeof source.ease === 'number' ? source.ease : DEFAULT_EASE,
    due,
  };
}

/** 把攔到的例外轉成可以直接顯示給使用者的一句話。 */
export function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
