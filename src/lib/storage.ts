/**
 * 資料存取：畫面只需要載入與儲存兩項操作，
 * 首次初始化與單向合併是內部細節。匯出與匯入同樣由本模組負責，
 * 只是必須由使用者觸發，因此也開在介面上。
 *
 * 目前實作為瀏覽器本機儲存；日後若改接雲端服務，僅需替換此模組內部（見 ADR-0002）。
 */
import type { AppData, Card } from './types';
import { toPlainText } from './reading';
import { DEFAULT_EASE, isDateKey, newCard } from './review';

export const STORAGE_KEY = 'va-practice:data';
export const DATA_VERSION = 2;

/** localStorage 的最小介面，測試時可換成假的實作。 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** 隨程式發佈的內建牌組（`src/data/cards.json`）。 */
export interface BuiltinDeck {
  cards: { id: string; text: string; meaning: string }[];
}

export interface Store {
  load(): AppData;
  save(data: AppData): void;
  exportJson(): string;
  importJson(json: string): AppData;
}

export function createStore(storage: StorageLike, builtin: BuiltinDeck): Store {
  const builtinIds = builtin.cards.map((entry) => entry.id);

  function write(data: AppData): void {
    storage.setItem(STORAGE_KEY, JSON.stringify(data, null, 2));
  }

  function read(): AppData | null {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    try {
      return parseAppData(JSON.parse(raw), builtinIds);
    } catch (error) {
      throw new Error(`本機儲存的資料已毀損，無法讀取：${toMessage(error)}`);
    }
  }

  function load(): AppData {
    const stored = read();
    if (stored === null) {
      const initial: AppData = {
        version: DATA_VERSION,
        cards: builtin.cards.map((entry) => newCard(entry.id, entry.text, entry.meaning)),
        knownBuiltinIds: builtinIds,
        updatedAt: 0,
      };
      write(initial);
      return initial;
    }

    // 單向合併：只補入這台裝置沒見過的內建卡，已存在與已刪除的一律不動。
    // 詞條也要比對，否則使用者自己加過的詞，日後被收進內建牌組時會變成兩張一樣的卡。
    const seen = new Set([
      ...stored.knownBuiltinIds,
      ...stored.cards.map((card) => card.id),
      ...stored.cards.map((card) => toPlainText(card.text)),
    ]);
    const added = builtin.cards
      .filter((entry) => !seen.has(entry.id) && !seen.has(toPlainText(entry.text)))
      .map((entry) => newCard(entry.id, entry.text, entry.meaning));

    const merged: AppData = {
      version: DATA_VERSION,
      cards: [...stored.cards, ...added],
      knownBuiltinIds: [...new Set([...stored.knownBuiltinIds, ...builtinIds])],
      // 補內建卡不算「這份資料被推上雲端過」，時間戳原封不動。
      updatedAt: stored.updatedAt,
    };
    // 一律寫回，讓儲存的內容永遠是正規化後的形式。
    // 否則舊格式的資料會一直缺少內建卡名單，下次發佈追加卡片時就補不進來。
    write(merged);
    return merged;
  }

  return {
    load,

    save(data) {
      write({ ...data, version: DATA_VERSION });
    },

    exportJson() {
      return JSON.stringify(load(), null, 2);
    },

    importJson(json) {
      let raw: unknown;
      try {
        raw = JSON.parse(json);
      } catch (error) {
        throw new Error(`這不是有效的 JSON 檔：${toMessage(error)}`);
      }
      // 整份覆蓋，不與現有資料合併。先驗證再寫入，壞檔案不會弄壞既有資料。
      const data = parseAppData(raw, builtinIds);
      write(data);
      return data;
    },
  };
}

function parseAppData(raw: unknown, builtinIds: string[]): AppData {
  if (typeof raw !== 'object' || raw === null) throw new Error('內容不是一個物件');
  const source = raw as Record<string, unknown>;
  if (!Array.isArray(source.cards)) throw new Error('找不到卡片清單');

  return {
    version: typeof source.version === 'number' ? source.version : DATA_VERSION,
    cards: source.cards.map(parseCard),
    // 舊備份可能沒有這份名單。此時採用目前的內建卡識別碼，
    // 以免備份中被刪掉的卡在下次載入時整批被補回來。
    knownBuiltinIds: Array.isArray(source.knownBuiltinIds)
      ? source.knownBuiltinIds.filter((id): id is string => typeof id === 'string')
      : builtinIds,
    // version 1 的資料沒有這個欄位，視為最舊，開 app 時會被雲端那份蓋掉。
    updatedAt: typeof source.updatedAt === 'number' ? source.updatedAt : 0,
  };
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
