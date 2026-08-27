import { describe, it, expect } from 'vitest';
import { deriveKeys, encrypt, decrypt, isRemoteNewer } from './cloud-crypto';

const HEX_64 = /^[0-9a-f]{64}$/;

describe('由密碼派生指紋與金鑰', () => {
  it('指紋是 64 位十六進位字元，安全規則據此驗證長度', async () => {
    const keys = await deriveKeys('bradtest', 'hunter2');
    expect(keys.fingerprint).toMatch(HEX_64);
  });

  it('路徑是暱稱的雜湊，不含暱稱原文', async () => {
    const keys = await deriveKeys('bradtest', 'hunter2');
    expect(keys.path).toMatch(HEX_64);
    expect(keys.path).not.toContain('bradtest');
  });

  it('同一組暱稱密碼永遠派生出同一個指紋，換裝置才對得上', async () => {
    const first = await deriveKeys('bradtest', 'hunter2');
    const second = await deriveKeys('bradtest', 'hunter2');
    expect(second.fingerprint).toBe(first.fingerprint);
    expect(second.path).toBe(first.path);
  });

  it('密碼不同就派生出不同指紋，別人因此覆寫不了', async () => {
    const mine = await deriveKeys('bradtest', 'hunter2');
    const theirs = await deriveKeys('bradtest', 'guess');
    expect(theirs.path).toBe(mine.path);
    expect(theirs.fingerprint).not.toBe(mine.fingerprint);
  });

  it('暱稱當 salt，同一組密碼在不同暱稱下派生出的指紋不同', async () => {
    const bradtest = await deriveKeys('bradtest', 'hunter2');
    const other = await deriveKeys('someone', 'hunter2');
    expect(other.fingerprint).not.toBe(bradtest.fingerprint);
  });
});

describe('加密與解密', () => {
  const PLAINTEXT = JSON.stringify({ version: 2, cards: [{ id: '焦がす', meaning: '燒焦' }] });

  it('加密後再解密拿回一模一樣的內容', async () => {
    const { key } = await deriveKeys('bradtest', 'hunter2');
    expect(await decrypt(key, await encrypt(key, PLAINTEXT))).toBe(PLAINTEXT);
  });

  it('密文不含明文片段，直接查看雲端讀不出卡片', async () => {
    const { key } = await deriveKeys('bradtest', 'hunter2');
    const payload = await encrypt(key, PLAINTEXT);
    expect(payload).not.toContain('焦がす');
    expect(payload).not.toContain('燒焦');
  });

  it('同一份內容加密兩次得到不同密文，看不出兩次備份是否一樣', async () => {
    const { key } = await deriveKeys('bradtest', 'hunter2');
    expect(await encrypt(key, PLAINTEXT)).not.toBe(await encrypt(key, PLAINTEXT));
  });

  it('密碼不對時解密拋錯，而不是解出亂碼', async () => {
    const mine = await deriveKeys('bradtest', 'hunter2');
    const theirs = await deriveKeys('bradtest', 'guess');
    const payload = await encrypt(mine.key, PLAINTEXT);
    await expect(decrypt(theirs.key, payload)).rejects.toThrow();
  });

  it('密文被竄改時解密拋錯', async () => {
    const { key } = await deriveKeys('bradtest', 'hunter2');
    const payload = await encrypt(key, PLAINTEXT);
    const tampered = `${payload.slice(0, -8)}AAAAAAA=`;
    await expect(decrypt(key, tampered)).rejects.toThrow();
  });

  it('中日文與表情符號都能原樣還原', async () => {
    const { key } = await deriveKeys('bradtest', 'hunter2');
    const text = '拝む／ざるを得ない 🍜';
    expect(await decrypt(key, await encrypt(key, text))).toBe(text);
  });
});

describe('換密碼', () => {
  it('新指紋與舊指紋不同，還記著舊密碼的裝置因此被規則擋下來', async () => {
    const before = await deriveKeys('bradtest', 'hunter2');
    const after = await deriveKeys('bradtest', 'hunter3');
    expect(after.fingerprint).not.toBe(before.fingerprint);
  });

  it('換的仍是同一個雲端路徑，暱稱沒變就是同一筆備份', async () => {
    const before = await deriveKeys('bradtest', 'hunter2');
    const after = await deriveKeys('bradtest', 'hunter3');
    expect(after.path).toBe(before.path);
  });

  it('換密碼後的內容，舊密碼再也解不開——其他裝置必須重新輸入新密碼', async () => {
    const before = await deriveKeys('bradtest', 'hunter2');
    const after = await deriveKeys('bradtest', 'hunter3');
    const payload = await encrypt(after.key, JSON.stringify({ version: 2, cards: [] }));
    await expect(decrypt(before.key, payload)).rejects.toThrow();
  });
});

describe('比較新舊', () => {
  it('雲端時間戳比較大就是雲端新', () => {
    expect(isRemoteNewer(200, 100)).toBe(true);
  });

  it('時間戳相等時算本機贏，本機還沒推上去的變動才不會被蓋掉', () => {
    expect(isRemoteNewer(100, 100)).toBe(false);
  });

  it('本機時間戳比較大就是本機新', () => {
    expect(isRemoteNewer(100, 200)).toBe(false);
  });

  it('沒推過雲端的本機資料（時間戳 0）視為最舊', () => {
    expect(isRemoteNewer(1, 0)).toBe(true);
  });
});
