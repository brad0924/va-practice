import { describe, it, expect } from 'vitest';
import { isCancelled } from './download-native';

/**
 * 只測 `isCancelled()`：這條路上其餘每一段都要原生插件才跑得起來，
 * 假造它們只會測到自己寫的假貨（見模組檔頭）。
 *
 * 但這一段非測不可——「按取消不跳錯誤」整條驗收就靠它，
 * 而它認的是一句沒有錯誤代碼可搭的英文訊息。
 */
describe('isCancelled', () => {
  it('認得插件在使用者滑掉分享單時丟的那一句', () => {
    // 一字不差地取自 @capacitor/share 的 iOS 實作：
    // ios/Sources/SharePlugin/SharePlugin.swift 的 call.reject("Share canceled")
    expect(isCancelled(new Error('Share canceled'))).toBe(true);
  });

  it('真的失敗不會被當成取消吞掉', () => {
    expect(isCancelled(new Error('Error sharing item'))).toBe(false);
    expect(isCancelled(new Error("Can't share while sharing is in progress"))).toBe(false);
    // 寫暫存檔失敗走的是 Filesystem 那一支，訊息長什麼樣都不該被認成取消。
    expect(isCancelled(new Error('Unable to write file'))).toBe(false);
  });

  it('不是 Error 的東西一律不算取消——寧可多報一次，不可把失敗說成沒事', () => {
    expect(isCancelled('canceled')).toBe(false);
    expect(isCancelled(undefined)).toBe(false);
    expect(isCancelled(null)).toBe(false);
  });
});
