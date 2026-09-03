/**
 * `without-push-entitlement` 的測試。
 *
 * 這支外掛平常只在 macOS 上的 `expo prebuild` 跑得到，本機與 CI 的 Node 測試都碰不到它。
 * 它又剛好是「寫錯了會安靜地沒有效果」的那一種——沒效果的下場是十分鐘後 Archive 才倒
 * （2026-09-03 真的倒過一次）。所以這裡把它的兩個行為釘住。
 *
 * 測法是直接把 mod 鏈叫起來。`withEntitlementsPlist` 註冊的東西掛在
 * `config.mods.ios.entitlements` 上，餵它一份 `modResults` 就等於模擬
 * 「前面的外掛已經寫好 entitlements，輪到我們了」。
 */
import { describe, expect, it } from '@jest/globals';

const withoutPushEntitlement = require('./without-push-entitlement');

/** 跑一次 entitlements 那條 mod 鏈，回傳跑完之後的 entitlements。 */
async function runMod(entitlements: Record<string, unknown>): Promise<Record<string, unknown>> {
  let config: any = { name: 'test', slug: 'test', mods: {} };
  config = withoutPushEntitlement(config);
  const result = await config.mods.ios.entitlements({
    ...config,
    modRequest: {},
    modResults: entitlements,
  });
  return result.modResults;
}

describe('without-push-entitlement', () => {
  it('把 aps-environment 拿掉，其他 entitlement 一格都不動', async () => {
    const after = await runMod({
      'aps-environment': 'development',
      'com.apple.developer.devicecheck.appattest-environment': 'production',
    });

    expect(after).toEqual({
      'com.apple.developer.devicecheck.appattest-environment': 'production',
    });
  });

  it('本來就沒有 aps-environment 時當場丟例外，不安靜地跳過', async () => {
    // 安靜跳過的兩種成因分不出來：可能是 expo-notifications 不再加它（外掛可以刪了），
    // 也可能是這支外掛跑在它前面（順序壞了，包照樣會帶著推播權限）。
    // 後者要等 Archive 才發現，所以在這裡就擋下來。
    await expect(runMod({ 'com.apple.developer.devicecheck.appattest-environment': 'production' }))
      .rejects.toThrow(/aps-environment/);
  });
});
