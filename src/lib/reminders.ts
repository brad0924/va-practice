/**
 * 每日提醒的排程來源：哪一天會積到幾張到期卡。
 *
 * 兩支：`dueCountToday()` 回答今天還剩幾張，`forecastDueCounts()` 回答未來各天。
 * 拆成兩支而不是一支吃一個天數範圍——今天要不要提醒多一道「時間過了沒」的閘門，
 * 那是呼叫端的事（見 `daily-reminder.ts`），本模組一律只回答數字。
 *
 * 與 `review.ts` 同樣的紀律——不取用系統時鐘、不碰任何原生 API，
 * 當前時間一律以參數注入。登記系統通知是呼叫端的事。
 */
import { isDue, toDateKey } from './review';
import type { Card } from './types';

/** 排未來幾天。遠低於 iOS 同時登記 64 則的上限，留有充裕餘裕。 */
const FORECAST_DAYS = 7;

/** 某一天的預估：到當天為止累積了幾張到期卡。 */
export interface DueForecast {
  /** 當地時區的 `YYYY-MM-DD`，與 `Card.due` 同格式。 */
  date: string;
  /** 該日的累積張數，恆大於 0。 */
  count: number;
}

function addDays(now: Date, days: number): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
}

/**
 * 今天還剩幾張到期。與複習佇列是同一批卡——`buildQueue()` 也是拿 `isDue()` 篩的，
 * 差別只在它會洗牌而這裡只數個數。因此「複習完了」在這裡天然地就是 0：
 * 評完分那張卡的到期日被推到未來，下次再問就不算它了。
 *
 * 吃的必須是與 `buildQueue()` 同一批卡（複習範圍內的），範圍過濾由呼叫端負責。
 */
export function dueCountToday(cards: readonly Card[], now: Date): number {
  return cards.filter((card) => isDue(card, now)).length;
}

/**
 * 未來 7 天各天的累積到期張數，不含今天——排程當下今天的提醒時間可能已經過去，
 * 且使用者此刻正拿著 app。
 *
 * 張數是累積的而非當天新增的：沒複習的卡不會消失，第 N 天的張數是「所有到期日
 * 在第 N 天或更早的卡」，因此結果天然地只增不減。新卡從第一天起就計入——這條規則
 * 不在這裡重寫，直接借 `buildQueue()` 用的那支 `isDue()`，兩邊的認定不會走鐘。
 *
 * 張數為 0 的日子直接不出現在結果裡（「一張都沒到期就不要吵我」），呼叫端不必再過濾。
 *
 * 吃的必須是與 `buildQueue()` 同一批卡（複習範圍內的），否則通知上的數字與使用者
 * 打開 app 看到的對不起來。範圍的過濾由呼叫端負責。
 */
export function forecastDueCounts(cards: readonly Card[], now: Date): DueForecast[] {
  const forecast: DueForecast[] = [];
  for (let day = 1; day <= FORECAST_DAYS; day += 1) {
    const date = addDays(now, day);
    const count = cards.filter((card) => isDue(card, date)).length;
    if (count > 0) forecast.push({ date: toDateKey(date), count });
  }
  return forecast;
}
