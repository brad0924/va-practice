/**
 * 複習流程：排程演算法、抖動、佇列排序、「再次」重排全部收在這裡。
 *
 * 當前時間與亂數一律以參數注入，模組內不取用系統時鐘或全域亂數，
 * 否則排程與抖動無法測試。
 */
import type { Card, Rating } from './types';

export const DEFAULT_EASE = 2.5;
export const MIN_EASE = 1.3;

/** 抖動幅度：間隔滿此天數者，套用 ±FUZZ_RATIO 的隨機偏移。 */
const FUZZ_THRESHOLD_DAYS = 7;
const FUZZ_RATIO = 0.15;

/** 「再次」重排時，剩餘卡片少於此數則改排至佇列末端。 */
const MIN_CARDS_FOR_RANDOM_REINSERT = 4;

/** 當日的複習佇列，第一張即為目前卡片。 */
export type Queue = readonly Card[];

/** 四個評分各自對新間隔與成長倍數的影響。 */
const RATINGS: Record<Rating, { interval: (days: number, ease: number) => number; easeDelta: number }> = {
  again: { interval: () => 1, easeDelta: -0.2 },
  hard: { interval: (days) => days * 1.2, easeDelta: -0.15 },
  good: { interval: (days, ease) => days * ease, easeDelta: 0 },
  easy: { interval: (days, ease) => days * ease * 1.3, easeDelta: 0.15 },
};

export function newCard(id: string, bookId: string, text: string, meaning: string): Card {
  return { id, bookId, text, meaning, interval: null, ease: DEFAULT_EASE, due: null };
}

/** 當地時區的 `YYYY-MM-DD`。到期只看日期不看時間，早上打開就能看到當天全部的卡。 */
export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 是否為 `toDateKey()` 產生的格式。只驗格式、不驗日期是否真的存在：
 * `2026-02-30` 不會讓 `overdueDays()` 算出 NaN，`sortByDue()` 也仍然排得對。
 */
export function isDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function addDays(date: Date, days: number): string {
  return toDateKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() + days));
}

/** 新卡（尚無到期日）視為已到期。傳入未來的日期即可問「那天為止到期了沒」。 */
export function isDue(card: Card, now: Date): boolean {
  return card.due === null || card.due <= toDateKey(now);
}

/**
 * 一張卡拖了幾天：正數為逾期天數，0 為今日到期，負數為尚未到期。
 * 新卡沒有到期日，回傳 null。
 */
export function overdueDays(card: Card, now: Date): number | null {
  if (card.due === null) return null;
  const [year, month, day] = card.due.split('-').map(Number);
  const due = new Date(year!, month! - 1, day!);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today.getTime() - due.getTime()) / 86_400_000);
}

/** 到期排序的方向：`asc` 由舊到新，`desc` 由新到舊。 */
export type SortDirection = 'asc' | 'desc';

/**
 * 依到期日排序。`asc` 是最急的在最前面，`desc` 整個反過來。
 * 新卡沒有到期日，一律視為最早到期，因此 `asc` 排最前、`desc` 沉到最底。
 * `YYYY-MM-DD` 的字典序即日期序，故不需要注入時間。
 *
 * 只有日期的比較被反轉，同一組（同一天到期、或同為新卡）內部維持原本順序，
 * 兩個方向下都一樣。
 */
export function sortByDue(cards: readonly Card[], direction: SortDirection = 'asc'): Card[] {
  const flip = direction === 'asc' ? 1 : -1;
  return [...cards].sort((a, b) => {
    if (a.due === b.due) return 0;
    if (a.due === null) return -flip;
    if (b.due === null) return flip;
    return (a.due < b.due ? -1 : 1) * flip;
  });
}

/** 取出當日已到期的卡片，以隨機順序排列。 */
export function buildQueue(cards: readonly Card[], now: Date, random: () => number): Queue {
  const due = cards.filter((card) => isDue(card, now));
  for (let i = due.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [due[i], due[j]] = [due[j]!, due[i]!];
  }
  return due;
}

/**
 * 換一批卡之後的佇列。正在看的那張若仍然到期，就留在最前面，
 * 其餘照常洗牌——換單字本範圍時不打斷手上這張。
 *
 * 留下的是 `cards` 裡的那一份而非傳進來的 `current`：後者可能是舊資料裡的那張。
 */
export function rebuildQueue(
  cards: readonly Card[],
  current: Card | undefined,
  now: Date,
  random: () => number,
): Queue {
  const rebuilt = buildQueue(cards, now, random);
  const kept = current && rebuilt.find((card) => card.id === current.id);
  if (!kept) return rebuilt;
  return [kept, ...rebuilt.filter((card) => card.id !== kept.id)];
}

export function currentCard(queue: Queue): Card | undefined {
  return queue[0];
}

/** 佇列清空即為當日完成。 */
export function isComplete(queue: Queue): boolean {
  return queue.length === 0;
}

/**
 * 對目前卡片評分，回傳更新後的卡片狀態與剩餘的複習佇列。
 * 「再次」會把該卡插回佇列後半段，當天稍後再出現一次。
 */
export function rate(
  queue: Queue,
  rating: Rating,
  now: Date,
  random: () => number,
): { queue: Queue; card: Card } {
  const target = queue[0];
  if (!target) throw new Error('複習佇列已清空，沒有可評分的卡片');

  const { interval, easeDelta } = RATINGS[rating];
  const days = applyFuzz(interval(target.interval ?? 1, target.ease), random);
  const updated: Card = {
    ...target,
    interval: days,
    ease: Math.max(MIN_EASE, target.ease + easeDelta),
    // 「再次」到期日設為當天而非 now + interval：重排回佇列只存在記憶體裡，
    // 到期日排到明天會讓這張卡在重整後被 buildQueue() 濾掉。間隔不受影響，
    // 仍是下次正式評分的長期排程基準。
    due: rating === 'again' ? toDateKey(now) : addDays(now, days),
  };

  const rest = queue.slice(1);
  return {
    card: updated,
    queue: rating === 'again' ? reinsert(rest, updated, random) : rest,
  };
}

/** 避免大量卡片的到期日聚集在同一天。未滿門檻的短間隔不抖動。 */
function applyFuzz(days: number, random: () => number): number {
  const fuzzed = days >= FUZZ_THRESHOLD_DAYS ? days * (1 + (random() * 2 - 1) * FUZZ_RATIO) : days;
  return Math.max(1, Math.round(fuzzed));
}

function reinsert(rest: readonly Card[], card: Card, random: () => number): Queue {
  if (rest.length < MIN_CARDS_FOR_RANDOM_REINSERT) return [...rest, card];
  const half = Math.floor(rest.length / 2);
  const index = half + Math.floor(random() * (rest.length - half + 1));
  return [...rest.slice(0, index), card, ...rest.slice(index)];
}
