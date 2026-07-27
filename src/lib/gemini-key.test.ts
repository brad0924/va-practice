import { describe, it, expect } from 'vitest';
import { createGeminiKey } from './gemini-key';
import type { StorageLike } from './storage';

/** 一台裝置的本機儲存。記得每一格，才驗得出這個模組只碰自己那一格。 */
function fakeStorage(): StorageLike & { keys(): string[] } {
  const cells = new Map<string, string>();
  return {
    getItem: (key) => cells.get(key) ?? null,
    setItem: (key, value) => {
      cells.set(key, value);
    },
    removeItem: (key) => {
      cells.delete(key);
    },
    keys: () => [...cells.keys()],
  };
}

describe('讀取', () => {
  it('沒設定過就是 null', () => {
    expect(createGeminiKey(fakeStorage()).read()).toBeNull();
  });

  it('存進去的金鑰讀得回來', () => {
    const storage = fakeStorage();
    createGeminiKey(storage).write('AIzaSyExample');
    expect(createGeminiKey(storage).read()).toBe('AIzaSyExample');
  });

  it('貼上時常跟著的前後空白與換行會去掉', () => {
    const storage = fakeStorage();
    createGeminiKey(storage).write('  AIzaSyExample\n');
    expect(createGeminiKey(storage).read()).toBe('AIzaSyExample');
  });
});

describe('清除', () => {
  it('清除後回到未設定，那一格也從本機儲存消失', () => {
    const storage = fakeStorage();
    const gemini = createGeminiKey(storage);
    gemini.write('AIzaSyExample');
    gemini.write(null);

    expect(gemini.read()).toBeNull();
    expect(storage.keys()).toEqual([]);
  });

  it('只剩空白的輸入等同清除，不會留下一格空的金鑰', () => {
    const storage = fakeStorage();
    const gemini = createGeminiKey(storage);
    gemini.write('   ');

    expect(gemini.read()).toBeNull();
    expect(storage.keys()).toEqual([]);
  });
});

describe('與其他儲存格的關係', () => {
  it('只碰 va-practice:gemini 這一格，不動資料與雲端那兩格', () => {
    const storage = fakeStorage();
    storage.setItem('va-practice:data', '{}');
    storage.setItem('va-practice:cloud', '{}');

    const gemini = createGeminiKey(storage);
    gemini.write('AIzaSyExample');
    expect(storage.keys()).toContain('va-practice:gemini');

    gemini.write(null);
    expect(storage.keys()).toEqual(['va-practice:data', 'va-practice:cloud']);
  });
});
