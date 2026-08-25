import { describe, it, expect } from 'vitest';
import { CLOUD_PAYLOAD_LIMIT } from './cloud-backup';
import { CRYPTO_VECTORS, checkVector, expand } from './cloud-crypto-vectors';

/**
 * 標答表的對拷測試。**這一支綠燈不代表 React Native 那一半是對的**——
 * 它跑在 Node 上，用的是 Node 內建的加解密，跟手機上那份 quick-crypto 不是同一個東西。
 *
 * 它守的是另一件事：**標準答案不准漂**。有人動到 `cloud-crypto.ts` 的演算法、參數或格式，
 * 這裡當場紅燈。手機那一半由 `mobile/lib/crypto-self-check.ts` 在真的裝置上驗。
 *
 * 超時放寬到 60 秒：最後那一筆明文有 4 MB，加密、解密、base64 各跑一趟，
 * 而 PBKDF2 每一列都要跑滿 20 萬次迭代。這個慢是刻意的（慢才擋得住暴力猜密碼）。
 */
const TIMEOUT_MS = 60_000;

describe('雲端備份的標答表', () => {
  it('票 05 點名的五種明文都在表裡', () => {
    // 少了哪一種，就有一整類的錯沒人守著。名字被改掉也會在這裡停下來。
    expect(CRYPTO_VECTORS.map((vector) => vector.name)).toEqual(
      expect.arrayContaining([
        'ascii-short',
        'japanese-mixed',
        'reading-markup',
        'emoji',
        'huge-backup',
      ]),
    );
  });

  it('超大那一筆貼著 Firebase 安全規則的上限，但沒有超過', () => {
    const huge = CRYPTO_VECTORS.find((vector) => vector.name === 'huge-backup');
    expect(huge).toBeDefined();
    // **量的是密文的字數，不是明文的位元組數。** `cloud-backup.ts` 擋的是
    // `payload.length`，量錯尺的話這一列會變成一份這支 app 根本不會送出去的備份——
    // 看起來有在守，實際上驗的是一個不存在的情況。
    expect(huge!.payloadChars).toBeLessThanOrEqual(CLOUD_PAYLOAD_LIMIT);
    // 「接近」也要守住，不然哪天配方改小了會靜靜地退化成一筆普通大小的標答。
    expect(huge!.payloadChars).toBeGreaterThan(CLOUD_PAYLOAD_LIMIT - 1024);
  });

  it('展開的明文長度與表裡記的位元組數一致', () => {
    for (const vector of CRYPTO_VECTORS) {
      // 展開規則若與產生腳本走鐘，後面每一項比對都會錯得莫名其妙。先在這裡擋住。
      expect(new TextEncoder().encode(expand(vector)).length).toBe(vector.plaintextBytes);
    }
  });
});

describe.each(CRYPTO_VECTORS.map((vector) => [vector.name, vector] as const))(
  '標答 %s',
  (_name, vector) => {
    it(
      vector.why,
      async () => {
        const result = await checkVector(vector);
        // 比對接起來的字串而不是陣列：陣列不相等時測試只印得出「長度 1」，
        // 而票 05 要的是「差在哪個位元組」——那句話得真的出現在畫面上才有用。
        expect(result.failures.join('\n')).toBe('');
        expect(result.passed).toBe(true);
      },
      TIMEOUT_MS,
    );
  },
);
