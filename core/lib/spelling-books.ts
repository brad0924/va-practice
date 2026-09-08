/**
 * 拼字要練哪幾本單字本。**只留在這台裝置**：不進 `AppData`、不隨備份走、不上雲端。
 *
 * 因此手機挑的與電腦挑的可以不一樣，那是想要的行為（票 04 決定 4）。理由與代價見
 * `ADR-0021` 的 Considered Options 最後一條——開成第四組範圍的話，`BookScopes` 多一格，
 * `parseScopes()`、備份、雲端、舊檔相容全部要跟著動，而拼字挑書這件事本來就適合各裝置不同。
 *
 * 形狀比照 `gemini-key.ts`：自己占一格 localStorage，底下那一格由呼叫端遞進來（`ADR-0002`）。
 */
import type { StorageLike } from './storage';
import type { Book } from './types';

/** 記住挑了哪幾本的地方。與 `va-practice:data`、`va-practice:gemini` 互不相干。 */
export const SPELLING_BOOKS_KEY = 'va-practice:spelling-books';

export interface SpellingBooks {
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

export function createSpellingBooks(storage: StorageLike): SpellingBooks {
  return {
    read(books) {
      const stored = new Set(parse(storage.getItem(SPELLING_BOOKS_KEY)));
      const kept = books.filter((book) => stored.has(book.id));
      return (kept.length > 0 ? kept : books).map((book) => book.id);
    },

    write(bookIds) {
      storage.setItem(SPELLING_BOOKS_KEY, JSON.stringify(bookIds));
    },
  };
}

/**
 * 讀那一格存的東西。**壞成什麼樣都只回空陣列**，一律不丟。
 *
 * 這一格不是使用者的資料，只是一個偏好；讀壞了退回預設（全選）就好，
 * 沒有理由讓拼字進不去。`storage.ts` 那一格相反，讀壞了要出聲。
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
