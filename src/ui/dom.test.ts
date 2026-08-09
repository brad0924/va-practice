// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { download } from './dom';

/**
 * 這個檔案只守一件事：**網頁版的匯出行為不因為 iOS 而改變**（見 issue 12）。
 * `download()` 從此有兩條路，原生那條在 node 環境下不存在、也不該在這裡假造；
 * 這裡測的是沒有原生存檔手段時走的那條，也就是網頁版唯一會走的那條。
 *
 * 需要 jsdom（見檔頂那行）：整件事就是在造一個真的 `<a>` 並按它。
 * `URL.createObjectURL` jsdom 沒有實作，只能自己接上去。
 */
describe('download（網頁版）', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(URL, 'createObjectURL');
    Reflect.deleteProperty(URL, 'revokeObjectURL');
  });

  it('造一個帶 download 檔名的隱形連結，按下去之後把網址收回，而且從不丟錯', async () => {
    const blobs: Blob[] = [];
    const revoked: string[] = [];
    URL.createObjectURL = (blob: Blob) => {
      blobs.push(blob);
      return 'blob:fake-url';
    };
    URL.revokeObjectURL = (url: string) => {
      revoked.push(url);
    };

    const clicked: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this);
    });

    // 走得到 resolve 就是「網頁版不報失敗」那條前提成立：
    // 隱形連結按下去之後成敗如何，瀏覽器不告訴任何人。
    await expect(
      download('{"version":3}', 'jlpt-cards-2026-08-07.json', 'application/json'),
    ).resolves.toBeUndefined();

    expect(clicked).toHaveLength(1);
    expect(clicked[0].getAttribute('download')).toBe('jlpt-cards-2026-08-07.json');
    expect(clicked[0].getAttribute('href')).toBe('blob:fake-url');
    expect(revoked).toEqual(['blob:fake-url']);

    expect(blobs).toHaveLength(1);
    expect(blobs[0].type).toBe('application/json');
    await expect(blobs[0].text()).resolves.toBe('{"version":3}');
  });
});
