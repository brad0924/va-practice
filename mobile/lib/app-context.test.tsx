// 這一支是 mobile/ 自己新寫的，所以直接寫 Jest（與 `../ui/review-screen.test.tsx` 同一個規矩）。
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, act } from '@testing-library/react-native';
import { Text } from 'react-native';
import { DEFAULT_EASE } from '@core/lib/review';
import type { AppData } from '@core/lib/types';

/**
 * 開機那一段的接線（票 `13`）。
 *
 * 守的是這張票最重要的那條分界：**標答比對只在 CI 塞了觸發檔的時候才跑。**
 * 使用者手上沒有那個檔，冷啟動一列標答都不該碰。
 *
 * 為什麼驗「結論檔有沒有被寫出來」，而不是驗「`checkAllVectors()` 有沒有被叫到」：
 * 執行環境缺了 `crypto.subtle` 之類的東西時，比對會在跑標答之前就收工，那一趟一列都沒跑，
 * 結論檔照樣寫。**寫檔是「這一趟到底有沒有發生」唯一不受環境影響的訊號**，
 * 而 `mobile-crypto.yml` 判定看的也正是那個檔。
 */

/**
 * 假的檔案系統。`expo-file-system` 底下是原生的，Node 裡沒有那一半。
 *
 * 只做這支測試會碰到的三件事：問存不存在、開檔、寫內容。兩處刻意與真的那一支對齊：
 * `exists` 是同步的布林值（開機那句「觸發檔在不在」正是靠這一點才不必先進非同步區），
 * 而 `create()` 吃 `{ overwrite }`——假貨的簽章比真貨鬆的話，正式碼哪天少遞那個參數也不會紅燈。
 */
const mockDisk = new Map<string, string>();

jest.mock('expo-file-system', () => ({
  Paths: { document: 'documents' },
  File: class {
    readonly path: string;
    constructor(directory: string, name: string) {
      this.path = `${directory}/${name}`;
    }
    get exists(): boolean {
      return mockDisk.has(this.path);
    }
    create(options?: { overwrite?: boolean }): void {
      if (this.exists && options?.overwrite !== true) throw new Error(`檔案已經在了：${this.path}`);
      mockDisk.set(this.path, '');
    }
    write(text: string): void {
      mockDisk.set(this.path, text);
    }
  },
}));

/** 真的跑六列標答要好幾秒（最後一筆明文有 4 MB），這支測試要的只是「有沒有跑這一趟」。 */
jest.mock('@core/lib/cloud-crypto-vectors', () => ({
  checkAllVectors: () => Promise.resolve([{ name: '假的一列', passed: true, failures: [] }]),
}));

/** 雲端那一端換成假貨：這支測試要看的是**有沒有推**，不是推上去之後發生什麼事。 */
const mockPush = jest.fn();

jest.mock('./cloud-probe', () => ({
  createCloudProbe: () => ({
    nickname: () => null,
    begin: () => {},
    signIn: () => Promise.resolve(),
    changePassword: () => Promise.resolve(),
    signOut: () => {},
    push: mockPush,
    retry: () => {},
  }),
}));

// 這兩行排在 jest.mock 底下：app-context 一被 import 就會去開那格儲存、接介面字串表、
// 建雲端那一端，假貨要先就位。（babel 會把 jest.mock 提到最前面，順序是寫給人看的。）
import { AppProvider, useApp, type AppShared } from './app-context';
import { MARKER, TRIGGER_FILE, RESULT_FILE } from './crypto-self-check';

const TRIGGER_PATH = `documents/${TRIGGER_FILE}`;
const RESULT_PATH = `documents/${RESULT_FILE}`;

function seed(): AppData {
  const bookId = 'book-1';
  return {
    version: 3,
    books: [{ id: bookId, name: '第一本' }],
    cards: [
      {
        id: 'card-1',
        bookId,
        text: '探[たん]針[しん]',
        meaning: '第 1 張',
        interval: null,
        ease: DEFAULT_EASE,
        due: null,
      },
    ],
    scopes: { review: [bookId], list: [bookId], stats: [bookId] },
    updatedAt: 0,
  };
}

/**
 * 掛起 `AppProvider`，把共用的那一份交出來。
 *
 * 畫一次就包在 `await act(async …)` 裡：開機那個 `useEffect` 裡的比對是個 Promise，
 * 不等它跑完的話，「結論檔有沒有被寫出來」的斷言會早一步跑，兩種結果都會是空的。
 */
async function mount(): Promise<AppShared> {
  let shared: AppShared | null = null;
  function Probe() {
    shared = useApp();
    return <Text>掛好了</Text>;
  }
  await act(async () => {
    render(
      <AppProvider>
        <Probe />
      </AppProvider>,
    );
  });
  if (shared === null) throw new Error('AppProvider 沒有把共用的那一份交出來');
  return shared;
}

beforeEach(() => {
  mockDisk.clear();
  mockPush.mockClear();
});

describe('開機時的標答比對', () => {
  it('沒有觸發檔就整趟不跑，結論檔也不會被寫出來', async () => {
    await mount();
    expect(mockDisk.has(RESULT_PATH)).toBe(false);
  });

  it('CI 塞了觸發檔就照跑，結論照樣寫進結論檔', async () => {
    mockDisk.set(TRIGGER_PATH, '');
    await mount();
    expect(mockDisk.get(RESULT_PATH)).toContain(MARKER);
  });
});

describe('雲端推送', () => {
  it('評分之後直接推上去，沒有閘門擋在中間', async () => {
    const shared = await mount();
    act(() => {
      shared.store.save(seed());
      shared.session.reload();
    });

    act(() => {
      shared.session.rate('good');
    });

    expect(mockPush).toHaveBeenCalledTimes(1);
  });
});
