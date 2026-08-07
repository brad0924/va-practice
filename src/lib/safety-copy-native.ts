/**
 * 保險副本接上原生那一端的接線。所有 Capacitor 的東西都只出現在這裡，
 * `safety-copy.ts` 因此維持可以在 vitest 裡測的純度。
 *
 * 原生實作是 app 自己那支插件（`ios/App/App/SafetyCopyPlugin.swift`），
 * 不是 `@capacitor/preferences`——官方那支的 `group` 參數只是加在 key 前面的字首，
 * 底層一律寫進 app 私有的 `UserDefaults.standard`，第二版的 Widget 讀不到
 * （見 spec 決定九）。
 *
 * 本模組不寫自動測試：原生插件在 node 環境下不存在，硬要測就得造一整套假物件，
 * 測到的只是自己寫的假貨。行為改由真機的手動驗收清單守住。
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import { createSafetyCopy, restoreSafetyCopy, type SafetyCopy } from './safety-copy';
import type { StorageLike } from './storage';

/** 原生那一端的兩支方法。App Group 由原生那邊指定，這裡不必知道它叫什麼。 */
interface SafetyCopyPlugin {
  /** 還沒有副本時不帶 `value` 回來。 */
  read(): Promise<{ value?: string }>;
  write(options: { value: string }): Promise<void>;
}

const plugin = registerPlugin<SafetyCopyPlugin>('SafetyCopy');

/**
 * 跑在原生殼裡而不是瀏覽器裡。網頁版恆為 false。
 * `main.ts` 需要它是因為那裡的分支是同步與非同步兩條路，不是有沒有副本。
 */
export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * 每存一次本機就會被叫一次的那個東西。
 * 網頁版拿到的是一個什麼都不做的，接線那一側因此不必自己判斷平台。
 */
export function createNativeSafetyCopy(): SafetyCopy {
  if (!isNative()) return { push() {} };

  return createSafetyCopy(async (value) => {
    await plugin.write({ value });
  });
}

/** 啟動前的還原。只有 iOS 會走到，呼叫端負責判斷（見 `main.ts`）。 */
export function restoreFromNative(storage: StorageLike): Promise<void> {
  return restoreSafetyCopy(storage, async () => (await plugin.read()).value ?? null);
}
