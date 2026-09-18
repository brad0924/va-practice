/**
 * 拼字與問答各自要練哪幾本單字本。**只留在這台裝置**：不進 `AppData`、不隨備份走、不上雲端。
 *
 * 因此手機挑的與電腦挑的可以不一樣，那是想要的行為（票 04 決定 4）。理由與代價見
 * `ADR-0021` 的 Considered Options 最後一條——開成第四組範圍的話，`BookScopes` 多一格，
 * `parseScopes()`、備份、雲端、舊檔相容全部要跟著動，而挑書這件事本來就適合各裝置不同。
 *
 * 形狀比照 `gemini-key.ts`：自己占一格 localStorage，底下那一格由呼叫端遞進來（`ADR-0002`）。
 */
import type { StorageLike } from './storage';
import type { Book } from './types';

/**
 * 拼字記住挑了哪幾本的地方。與 `va-practice:data`、`va-practice:gemini` 互不相干。
 *
 * **這個名字一個字都不能改**：改了，使用者已經存著的選擇會全部讀不回來（問答票 04）。
 */
export const SPELLING_BOOKS_KEY = 'va-practice:spelling-books';

/** 問答記住挑了哪幾本的地方。與拼字那一格分開：拼字練 N3、問答練 N2 時互不干擾（問答 spec 決定六）。 */
export const QUIZ_BOOKS_KEY = 'va-practice:quiz-books';

export interface BookPicks {
  /**
   * 目前挑到的那幾本，順序照 `books`。
   *
   * **存下來的 id 未必還指得到東西**：那本被刪了，或這根本是另一台裝置。指不到的濾掉，
   * 濾完全空就當成沒挑過，把每一本都勾起來（票 04 決定 6、7）——比「一本都沒勾、
   * 按鈕是暗的」好，使用者按一下就開始得了。
   */
  read(books: readonly Book[]): string[];
  /** 記下挑到的那幾本。 */
  write(bookIds: readonly string[]): void;
}

/**
 * 存在 `key` 那一格的挑書紀錄。拼字與問答的行為一模一樣，只差存在哪一格，
 * 因此收同一支、各傳自己那一格，不另抄一支（問答 spec 決定六）。
 */
export function createBookPicks(storage: StorageLike, key: string): BookPicks {
  return {
    read(books) {
      const stored = new Set(parse(storage.getItem(key)));
      const kept = books.filter((book) => stored.has(book.id));
      return (kept.length > 0 ? kept : books).map((book) => book.id);
    },

    write(bookIds) {
      storage.setItem(key, JSON.stringify(bookIds));
    },
  };
}

/** 拼字那一格。留著這一支，拼字原有的測試與呼叫端一行都不必改。 */
export function createSpellingBooks(storage: StorageLike): BookPicks {
  return createBookPicks(storage, SPELLING_BOOKS_KEY);
}

/**
 * 讀那一格存的東西。**壞成什麼樣都只回空陣列**，一律不丟。
 *
 * 這一格不是使用者的資料，只是一個偏好；讀壞了退回預設（全選）就好，
 * 沒有理由讓拼字或問答進不去。`storage.ts` 那一格相反，讀壞了要出聲。
 */
function parse(raw: string | null): string[] {
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string');
  } catch {
    return [];
  }
}
