/**
 * 「app 回到前景了」這條訊號接上原生那一端的接線。所有 Capacitor 的東西都只出現在這裡，
 * `app.ts` 因此不必知道自己跑在哪個平台上。
 *
 * 原生實作是 app 自己那支插件（`ios/App/App/ForegroundPlugin.swift`），
 * 不是 `@capacitor/app`：與其餘五支插件同一個立場——原生實作留在自己的 repo 裡，
 * 且不必為了一個事件多牽一條 npm 依賴。
 *
 * 網頁那一側另有一條訊號（`document` 的可見性變化事件，掛在 `app.ts`）。
 * 兩條打到的是同一支檢查，而那支檢查是冪等的，因此這裡不必知道另一條存在。
 *
 * 本模組不寫自動測試：原生插件在 node 環境下不存在，硬要測就得造一整套假物件，
 * 測到的只是自己寫的假貨。行為改由真機的手動驗收清單守住。
 */
import { Capacitor, registerPlugin } from '@capacitor/core';

/** 原生那一端只送事件，一支方法都沒有。事件本身不帶內容，跳到前景這件事就是全部。 */
interface ForegroundPlugin {
  addListener(eventName: 'foreground', listener: () => void): Promise<unknown>;
}

const plugin = registerPlugin<ForegroundPlugin>('Foreground');

/**
 * app 從背景回到前景時叫一次 `handler`。**網頁版什麼都不做**——那裡沒有這條訊號，
 * 呼叫端照樣直接呼叫，不必自己判斷平台。
 *
 * 只掛不解除：這條訊號與 app 同生共死，沒有天然的解除時機。
 */
export function onNativeForeground(handler: () => void): void {
  if (!Capacitor.isNativePlatform()) return;

  // 不等它掛好：註冊在 app 剛啟動時發生，而第一次跳到前景至少是使用者切走再切回來之後。
  // 失敗也吞掉——網頁那條可見性訊號仍在，而且使用者對這件事無事可做。
  void plugin.addListener('foreground', handler).catch(() => {});
}
