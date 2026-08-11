/**
 * 每日提醒接上原生那一端的接線。所有 Capacitor 的東西都只出現在這裡，
 * `daily-reminder.ts` 因此維持可以在 vitest 裡測的純度。
 *
 * 原生實作是 app 自己那支插件（`ios/App/App/DailyReminderPlugin.swift`），
 * 不是 `@capacitor/local-notifications`：與其餘四支插件同一個立場——原生實作留在
 * 自己的 repo 裡，且不必為了四支方法多牽一條 npm 依賴。
 *
 * 本模組不寫自動測試：原生插件在 node 環境下不存在，硬要測就得造一整套假物件，
 * 測到的只是自己寫的假貨。行為改由真機的手動驗收清單守住。
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import {
  createDailyReminder,
  type DailyReminder,
  type ReminderPermission,
  type ScheduledReminder,
} from './daily-reminder';
import type { StorageLike } from './storage';

/**
 * 原生那一端的三支方法。Capacitor 的橋只收得下物件，因此權限的答案包在 `state` 裡、
 * 那一批提醒包在 `reminders` 裡——底下立刻把這層包裝拆掉，純模組看到的仍是乾淨的形狀。
 */
interface DailyReminderPlugin {
  permission(): Promise<{ state: ReminderPermission }>;
  request(): Promise<{ state: ReminderPermission }>;
  replaceAll(options: { reminders: ScheduledReminder[] }): Promise<void>;
}

const plugin = registerPlugin<DailyReminderPlugin>('DailyReminder');

/**
 * 這台裝置的每日提醒。**網頁版回 null**——那裡沒有系統通知這條支線，
 * 「資料」畫面因此連這個開關都不會長出來。
 */
export function createNativeDailyReminder(
  storage: StorageLike,
  plan: () => readonly ScheduledReminder[],
): DailyReminder | null {
  if (!Capacitor.isNativePlatform()) return null;

  return createDailyReminder({
    storage,
    plan,
    native: {
      permission: async () => (await plugin.permission()).state,
      request: async () => (await plugin.request()).state,
      replaceAll: (reminders) => plugin.replaceAll({ reminders: [...reminders] }),
    },
  });
}
