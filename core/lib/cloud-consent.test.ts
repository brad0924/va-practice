import { describe, it, expect } from 'vitest';
import { createCloudConsent, type CloudConsent } from './cloud-consent';
import type { StorageLike } from './storage';

/**
 * 一台裝置：記著答案的那一格，加上「問了幾次、每次顯示哪個暱稱」。
 *
 * `answer` 可以中途換人——「拒絕之後按了反悔那顆鈕」要驗的正是同一台裝置上前後兩個答案。
 */
function device(answer = true) {
  const cells = new Map<string, string>();
  const asked: string[] = [];

  const storage: StorageLike = {
    getItem: (key) => cells.get(key) ?? null,
    setItem: (key, value) => {
      cells.set(key, value);
    },
    removeItem: (key) => {
      cells.delete(key);
    },
  };

  return {
    cells,
    /** 被問過的那幾次，各帶著當時顯示的暱稱。 */
    asked,
    answer,
    /**
     * 這台裝置上的一次開機。每次都新建一個，等同 app 重開——狀態只能靠那一格留下來。
     */
    boot(): CloudConsent {
      return createCloudConsent({
        storage,
        ask: (nickname) => {
          asked.push(nickname);
          return Promise.resolve(this.answer);
        },
      });
    },
    /**
     * 開一次機並問到答案：接還是不接。
     *
     * `synced` 預設 false ＝ 全新安裝、本機那份從沒與雲端往返過，正是這張票要防的那條路。
     */
    open(nickname: string | null = 'brad', synced = false): Promise<boolean> {
      return this.boot().wantsPull(nickname, synced);
    },
  };
}

describe('第一次接雲端之前先問一句', () => {
  it('記著暱稱又還沒答過，就問，答「要」就接', async () => {
    const iphone = device(true);

    expect(await iphone.open()).toBe(true);
    expect(iphone.asked).toEqual(['brad']);
  });

  it('答「不要」就不接', async () => {
    const iphone = device(false);

    expect(await iphone.open()).toBe(false);
  });

  it('沒記著暱稱的裝置不問——根本沒有東西可接', async () => {
    const iphone = device();

    expect(await iphone.open(null)).toBe(false);
    expect(iphone.asked).toEqual([]);
  });

  it('沒記著暱稱那一次不留下任何答案，之後密碼真的到了才輪到問', async () => {
    const iphone = device(true);

    await iphone.open(null);

    expect(await iphone.open()).toBe(true);
    expect(iphone.asked).toEqual(['brad']);
  });
});

describe('答過就不再問', () => {
  it('同意過的裝置再開 app 直接接，不問第二次', async () => {
    const iphone = device(true);
    await iphone.open();

    expect(await iphone.open()).toBe(true);
    expect(iphone.asked).toEqual(['brad']);
  });

  it('拒絕過的裝置再開 app 仍然不接，也不再問——共用的 iPad 不會被問到天荒地老', async () => {
    const iphone = device(false);
    await iphone.open();

    expect(await iphone.open()).toBe(false);
    expect(iphone.asked).toEqual(['brad']);
  });

  it('在這台親手登入成功也算同意，下次開 app 不會被問', async () => {
    const iphone = device(true);

    iphone.boot().grant();

    expect(await iphone.open()).toBe(true);
    expect(iphone.asked).toEqual([]);
  });
});

describe('升級前就已經在同步的裝置', () => {
  it('本機這份與雲端往返過就不問——它的同意早就表示過了', async () => {
    const iphone = device(false);

    expect(await iphone.open('brad', true)).toBe(true);
    expect(iphone.asked).toEqual([]);
  });

  it('答案記下來，之後匯進一份沒與雲端往返過的舊備份也不會突然被問', async () => {
    const iphone = device(false);
    await iphone.open('brad', true);

    expect(await iphone.open('brad', false)).toBe(true);
    expect(iphone.asked).toEqual([]);
  });

  it('已經拒絕過的裝置不受影響，仍然不接', async () => {
    const iphone = device(false);
    await iphone.open();

    expect(await iphone.open('brad', true)).toBe(false);
  });
});

describe('拒絕之後那條反悔的路', () => {
  it('拒絕過才認得出來', async () => {
    const iphone = device(false);
    expect(iphone.boot().declined()).toBe(false);

    await iphone.open();

    expect(iphone.boot().declined()).toBe(true);
  });

  it('同意過的裝置不算拒絕過，那條路不長出來', async () => {
    const iphone = device(true);
    await iphone.open();

    expect(iphone.boot().declined()).toBe(false);
  });

  it('按下反悔那顆鈕之後就接，而且不再被問', async () => {
    const iphone = device(false);
    await iphone.open();

    iphone.boot().grant();

    const next = iphone.boot();
    expect(next.declined()).toBe(false);
    expect(await next.wantsPull('brad', false)).toBe(true);
    expect(iphone.asked).toEqual(['brad']);
  });
});

describe('答案記在哪一格', () => {
  it('自己占一格，不碰暱稱密碼那一格', async () => {
    const iphone = device(true);

    await iphone.open();

    expect([...iphone.cells.keys()]).toEqual(['va-practice:cloud-consent']);
  });

  it('那一格被塞了認不得的值時當作沒答過，重新問一次', async () => {
    const iphone = device(true);
    iphone.cells.set('va-practice:cloud-consent', 'maybe');

    expect(await iphone.open()).toBe(true);
    expect(iphone.asked).toEqual(['brad']);
  });
});
