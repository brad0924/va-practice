// 這一支是 mobile/ 自己新寫的，所以直接寫 Jest（與 `../ui/review-screen.test.tsx` 同一個規矩）。
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, act } from '@testing-library/react-native';
import { Text } from 'react-native';
import { currentCard, DEFAULT_EASE } from '@core/lib/review';
import type { AppData } from '@core/lib/types';

/**
 * 開機那一段的接線：標答比對（票 `13`）、評分推上雲端（票 `06`）、接回雲端登入狀態（票 `10`）。
 *
 * 票 `13` 那部分守的是這張票最重要的那條分界：**標答比對只在 CI 塞了觸發檔的時候才跑。**
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

/**
 * 雲端那一端換成假貨：這支測試要看的是**有沒有推、有沒有接回登入**，不是接上之後發生什麼事。
 *
 * 遞進去的那組回呼留一份（`mockProbeHooks`）。票 `10` 驗收有一條是「雲端拉下來時複習佇列
 * 要跟著重建」，而那條接線就住在這支檔裡（`onPulled` → `session.reload()`）——
 * 手上有那組回呼，才驗得到它真的接上了，不必去碰真正的雲端備份。
 */
const mockPush = jest.fn();
const mockBegin = jest.fn();
let mockProbeHooks: CloudProbeHooks | null = null;

jest.mock('./cloud-probe', () => ({
  createCloudProbe: (hooks: CloudProbeHooks) => {
    mockProbeHooks = hooks;
    return {
      nickname: () => null,
      begin: mockBegin,
      signIn: () => Promise.resolve(),
      changePassword: () => Promise.resolve(),
      signOut: () => {},
      push: mockPush,
      retry: () => {},
    };
  },
}));

// 這兩行排在 jest.mock 底下：app-context 一被 import 就會去開那格儲存、接介面字串表、
// 建雲端那一端，假貨要先就位。（babel 會把 jest.mock 提到最前面，順序是寫給人看的。）
import { AppProvider, useApp, type AppShared } from './app-context';
import type { CloudProbeHooks } from './cloud-probe';
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
 *
 * **這支檔裡每一個 `act()` 都要這樣等。** `act()` 交回來的是個 thenable，不等它的話
 * React 那邊的待辦佇列不會收乾淨，下一支測試 `render()` 出來的東西就永遠不會上畫面——
 * 症狀是 `useApp()` 一個字都沒交出來，而錯誤訊息完全不會提到 `act`。
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
  mockBegin.mockClear();
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
    await act(async () => {
      shared.store.save(seed());
      shared.session.reload();
    });

    await act(async () => {
      shared.session.rate('good');
    });

    expect(mockPush).toHaveBeenCalledTimes(1);
  });
});

describe('開機時接回雲端登入狀態', () => {
  it('冷啟動就把本機那份遞進 begin()，不必先進任何畫面', async () => {
    const shared = await mount();

    expect(mockBegin).toHaveBeenCalledTimes(1);
    // 遞進去的必須是這台裝置現在存著的那一份：`begin()` 拿它跟雲端比 `updatedAt`，
    // 比錯邊的後果是把比較新的那一份蓋掉。
    expect(mockBegin).toHaveBeenCalledWith(shared.store.load());
  });

  it('畫面重畫不會再接一次', async () => {
    const shared = await mount();
    await act(async () => {
      shared.store.save(seed());
      shared.session.reload();
    });

    // 評分會讓整個 provider 重畫一次（`redraw`），相依陣列沒空著的話這裡就會變成兩次。
    await act(async () => {
      shared.session.rate('good');
    });

    expect(mockBegin).toHaveBeenCalledTimes(1);
  });

  it('雲端拉下來一份新的，複習佇列跟著重建', async () => {
    const shared = await mount();
    // 綁成區域常數再用：守衛過了還寫 `?.` 的話，「回呼根本沒接上」會被默默吞掉，
    // 這支測試就變成永遠不會紅。
    const probe = mockProbeHooks;
    if (probe === null) throw new Error('雲端那一端沒有拿到接線');

    // 真的雲端備份會先把拉下來那份寫進儲存，再叫 `onPulled`。這裡照著那個順序演一次。
    // 卡片編號刻意換過：只斷言「佇列裡有一張卡」的話，掛載時本來就在的那份也會讓它綠——
    // 要看的是**拉下來的那張**有沒有進到佇列裡。
    const local = seed();
    const pulled: AppData = { ...local, cards: [{ ...local.cards[0], id: 'card-拉下來的' }] };
    await act(async () => {
      shared.store.save(pulled);
      probe.onPulled(pulled);
    });

    expect(currentCard(shared.session.snapshot().queue)?.id).toBe('card-拉下來的');
  });
});
