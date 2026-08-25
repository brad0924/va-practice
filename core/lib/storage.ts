/**
 * 資料存取：畫面只需要載入與儲存兩項操作，首次初始化是內部細節。
 * 匯入同樣由本模組負責，因為必須驗證格式並整份覆蓋，因此也開在介面上；
 * 匯出只是把畫面手上現有的資料序列化，交給畫面層直接做即可。
 *
 * 單字本的操作（新增、改名、刪除、範圍變更）與兩道約束（名稱不重複、詞條全域唯一）
 * 也收在這裡，形式是吃一份 AppData、吐一份新的純函式——寫檔與推上雲端仍走
 * app.ts 的 persist()，這裡不自己碰 storage，否則雲端那一份會漏掉。
 *
 * 舊格式的相容也在這裡，且只在這裡：本機 localStorage、匯入備份檔、
 * 雲端拉下來的那一份走的都是 parseAppData()，改一處三條路都涵蓋到。
 *
 * 底下那一格由呼叫端遞進來，兩邊各遞各的（見 ADR-0002）：網頁版與 Capacitor 版遞
 * 瀏覽器的 `localStorage`，React Native 版遞 MMKV（`mobile/lib/storage-mmkv.ts`）。
 * 本模組完全不知道差別——兩者都是同步的，這個介面因此一字未改。
 */
import type { AppData, Book, BookScopes, Card } from './types';
import { DEFAULT_EASE, isDateKey } from './review';
import { toPlainText } from './reading';
import { AppError, toMessage } from './app-error';
import { t } from '../i18n';

export const STORAGE_KEY = 'va-practice:data';
export const DATA_VERSION = 3;

/**
 * 沒有歸屬的卡被收攏進去的那一本，在還沒有介面語言那個年代叫的名字。
 *
 * **只拿來認舊資料**：那些裝置上已經存著這個名字，換一套認法就會多長一本。
 * 新產生的那本走 `t('books.homeName')`——名字在產生的當下用當下的介面語言，
 * 之後它就是使用者資料，切語言不會跟著變（見 spec 決定十二）。
 */
export const HOME_BOOK_NAME = '我的單字';

/** 一格本機儲存的最小介面。三支方法全同步，測試時可換成假的實作。 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** 匯入單字時被跳過的一筆：那個詞已經有卡了。 */
export interface ImportSkip {
  /** 去掉讀音標記後的詞條原文，直接顯示給使用者。 */
  term: string;
  /** 這個詞目前所在的單字本；來源檔案內部重複時為目標本。 */
  bookId: string;
}

/** 一次匯入單字的結果。 */
export interface ImportResult {
  /** 匯入之後的整份資料，已經寫回本機。 */
  data: AppData;
  /** 實際新增的張數。加上 `skipped` 的長度等於來源檔案的卡片總數。 */
  imported: number;
  /** 因為詞條已經有卡而被跳過的每一筆。 */
  skipped: ImportSkip[];
}

export interface Store {
  load(): AppData;
  save(data: AppData): void;
  importJson(json: string): AppData;
  /**
   * 把 json 裡的卡加進 bookId 那一本，複習進度原封搬過來。整份寫回並回傳結果。
   * 與 importJson() 是兩個相反的操作：那個把整台裝置換成別台的樣子，這個往某一本裡加料。
   */
  importWords(json: string, bookId: string): ImportResult;
}

/**
 * 解析使用者交進來的檔案內容。兩條匯入都用它。
 *
 * 壞掉時丟的是帶 key 的 `AppError`，畫面層走 `toMessage()` 查表才變成字。
 * 內層那個 `reason` 是瀏覽器丟的 `SyntaxError`，沒有 key，因此仍是它自己的語言——
 * 這一層消除不了，記在這裡，不是 bug（見 ADR-0013）。
 */
function parseJson(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch (error) {
    throw new AppError('storage.invalidJson', { reason: toMessage(error) });
  }
}

/** 全新裝置的那一份：零本零卡。卡片只來自使用者新增或匯入單字，沒有隨程式發佈的來源。 */
function blank(): AppData {
  return {
    version: DATA_VERSION,
    books: [],
    cards: [],
    scopes: { review: [], list: [], stats: [] },
    updatedAt: 0,
  };
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
      throw new AppError('storage.corrupted', { reason: toMessage(error) });
    }
  }

  return {
    load() {
      const data = read() ?? blank();
      // 一律寫回，讓儲存的內容永遠是遷移後的形式，
      // 否則舊格式的資料每次載入都要重跑一次遷移。
      write(data);
      return data;
    },

    save(data) {
      write({ ...data, version: DATA_VERSION });
    },

    importJson(json) {
      // 整份覆蓋，不與現有資料合併。先驗證再寫入，壞檔案不會弄壞既有資料。
      const data = parseAppData(parseJson(json));
      write(data);
      return data;
    },

    importWords(json, bookId) {
      // 沿用整份匯入的「先驗證再寫入」順序：驗證與收攏都做完了才動既有資料。
      // 來源若是新格式（含多本），它的單字本結構到此為止，底下只取卡片。
      const incoming = parseAppData(parseJson(json));
      const current = read() ?? blank();
      if (!current.books.some((book) => book.id === bookId)) {
        throw new AppError('books.importTargetGone');
      }

      const cards = [...current.cards];
      // 撞號時換一個新的識別碼，否則來源那張會在畫面上與既有那張混為一談。
      const taken = new Set(cards.map((card) => card.id));
      const skipped: ImportSkip[] = [];

      for (const card of incoming.cards) {
        // 比對對象是已經收下的全部（含這一輪剛加進去的），
        // 因此來源檔案自己內部的重複也走同一條路，回報的本自然是目標本。
        const conflict = findTermConflict(cards, card.text);
        if (conflict !== null) {
          skipped.push({ term: toPlainText(card.text), bookId: conflict.bookId });
          continue;
        }
        const id = taken.has(card.id) ? crypto.randomUUID() : card.id;
        taken.add(id);
        // interval／ease／due 一律原封不動，只換識別碼與歸屬。
        cards.push({ ...card, id, bookId });
      }

      const data = { ...current, cards };
      write(data);
      return { data, imported: cards.length - current.cards.length, skipped };
    },
  };
}

// ── 單字本的新增、改名、刪除 ──────────────────────────────────────

/**
 * 比對用的名稱：全形半形、大小寫、前後空白、中間連續空白一律歸一。
 * 只用於比對——`Book.name` 存的永遠是使用者原本輸入的字串，畫面顯示的也是它。
 */
function normalizeBookName(name: string): string {
  return name.normalize('NFKC').toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * 檢查名稱收不收，收的話回傳要存進 `Book.name` 的顯示值。
 * `exceptId` 是改名時的自己：不與自己比對，「JLPT N2」改成「JLPT　N2」才會成功。
 */
function acceptBookName(books: readonly Book[], name: string, exceptId?: string): string {
  const normalized = normalizeBookName(name);
  if (normalized === '') throw new AppError('books.nameBlank');

  const taken = books.find(
    (book) => book.id !== exceptId && normalizeBookName(book.name) === normalized,
  );
  if (taken) throw new AppError('books.nameTaken', { name: taken.name });

  return name.trim();
}

/**
 * 新增一本，放在清單末端，並自動加進三組範圍——
 * 剛建好的本沒進任何一組的話，往裡面加的卡三個畫面都看不到。
 */
export function addBook(data: AppData, name: string): AppData {
  const book: Book = { id: crypto.randomUUID(), name: acceptBookName(data.books, name) };
  return {
    ...data,
    books: [...data.books, book],
    scopes: mapScopes(data.scopes, (ids) => [...ids, book.id]),
  };
}

/** 改名。只動名字：卡片與三組範圍都不受影響。 */
export function renameBook(data: AppData, id: string, name: string): AppData {
  const accepted = acceptBookName(data.books, name, id);
  return {
    ...data,
    books: data.books.map((book) => (book.id === id ? { ...book, name: accepted } : book)),
  };
}

/**
 * 刪除一本，連同它的卡一起。確認對話由畫面負責，這一層直接刪。
 * 三組範圍走與載入時同一支正規化：移除它、被移空的那一組補成全選；
 * 刪到零本時三組皆為空陣列，此時空狀態才是對的。
 */
export function deleteBook(data: AppData, id: string): AppData {
  const books = data.books.filter((book) => book.id !== id);
  return {
    ...data,
    books,
    cards: data.cards.filter((card) => card.bookId !== id),
    // 第三個參數是「要一併補進三組的那一本」，刪除不涉及收攏，故為 null。
    scopes: normalizeScopes(data.scopes, books, null),
  };
}

/**
 * 設定其中一組範圍。會把該組清空的變更一律拒絕——畫面另外負責在只剩一本時
 * 把勾選框設為 disabled，這裡是繞過去之後的最後一道。
 * 零本時三組本來就是空的，不在此列。
 */
export function setScope(data: AppData, group: keyof BookScopes, bookIds: readonly string[]): AppData {
  if (bookIds.length === 0 && data.books.length > 0) throw new AppError('books.scopeEmpty');
  return { ...data, scopes: { ...data.scopes, [group]: [...bookIds] } };
}

// ── 詞條全域唯一 ──────────────────────────────────────────────

/**
 * 這個詞條是否已經被某張卡佔走，回傳撞到的那張卡（沒撞到是 null）。
 * 比對基準是去掉讀音標記後的原文，`焦[こ]がす` 與 `焦がす` 因此算同一個詞；釋義不參與。
 * `exceptCardId` 是編輯既有卡時的自己：不與自己比對。
 */
export function findTermConflict(
  cards: readonly Card[],
  text: string,
  exceptCardId?: string,
): Card | null {
  const term = toPlainText(text);
  return cards.find((card) => card.id !== exceptCardId && toPlainText(card.text) === term) ?? null;
}

/** 同上，但撞到時丟出例外，那條 key 說得出那個詞現在在哪一本。 */
export function assertTermAvailable(data: AppData, text: string, exceptCardId?: string): void {
  const conflict = findTermConflict(data.cards, text, exceptCardId);
  if (conflict === null) return;

  const book = data.books.find((candidate) => candidate.id === conflict.bookId);
  // 兩句各自完整，不把「在哪一本」那一段拼進去——其他語言的語序不同，拼起來會不通。
  const term = toPlainText(conflict.text);
  throw book
    ? new AppError('books.termTakenIn', { term, book: book.name })
    : new AppError('books.termTaken', { term });
}

/** 取出屬於這幾本的卡，順序沿用卡片原本的。`bookIds` 為空時回傳空陣列。 */
export function cardsInBooks(cards: readonly Card[], bookIds: readonly string[]): Card[] {
  const wanted = new Set(bookIds);
  return cards.filter((card) => wanted.has(card.bookId));
}

function parseAppData(raw: unknown): AppData {
  if (typeof raw !== 'object' || raw === null) throw new AppError('storage.notObject');
  const source = raw as Record<string, unknown>;
  if (!Array.isArray(source.cards)) throw new AppError('storage.noCards');

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

  // 找的是舊名字，生的是當下介面語言的名字：舊裝置上已經有的那本認得出來，
  // 新長出來的那本則跟著使用者現在看的語言（spec 決定十二）。
  const home = books.find((book) => book.name === HOME_BOOK_NAME) ?? {
    id: crypto.randomUUID(),
    name: t('books.homeName'),
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
  return mapScopes(scopes, fix);
}

/** 對三組範圍各做同一件事。三組永遠一起變，把「三組」這件事只寫一次。 */
function mapScopes(scopes: BookScopes, fn: (ids: string[]) => string[]): BookScopes {
  return { review: fn(scopes.review), list: fn(scopes.list), stats: fn(scopes.stats) };
}

function parseScopes(raw: unknown): BookScopes {
  const source = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const group = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
  return { review: group(source.review), list: group(source.list), stats: group(source.stats) };
}

function parseBook(raw: unknown, index: number): Book {
  if (typeof raw !== 'object' || raw === null) {
    throw new AppError('storage.bookNotObject', { index: index + 1 });
  }
  const source = raw as Record<string, unknown>;
  for (const field of ['id', 'name'] as const) {
    if (typeof source[field] !== 'string') {
      throw new AppError('storage.bookMissingField', { index: index + 1, field });
    }
  }
  return { id: source.id as string, name: source.name as string };
}

function parseCard(raw: unknown, index: number): Card {
  if (typeof raw !== 'object' || raw === null) {
    throw new AppError('storage.cardNotObject', { index: index + 1 });
  }
  const source = raw as Record<string, unknown>;
  for (const field of ['id', 'text', 'meaning'] as const) {
    if (typeof source[field] !== 'string') {
      throw new AppError('storage.cardMissingField', { index: index + 1, field });
    }
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
