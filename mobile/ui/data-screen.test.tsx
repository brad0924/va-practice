// 這一支是 mobile/ 自己新寫的，所以直接寫 Jest。`core/` 那批仍寫著 `from 'vitest'`
// 並靠 `../test/vitest-shim.ts` 轉接——那個包袱只屬於搬過來的舊測試（票 `02`）。
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { Alert, AppState } from 'react-native';
import { act, render, fireEvent, waitFor } from '@testing-library/react-native';
import { t } from '@core/i18n';
import { APP_NAME } from '@core/lib/app-name';
import type { CloudBackup } from '@core/lib/cloud-backup';
import type { CloudConsent } from '@core/lib/cloud-consent';
import type { DailyReminder } from '@core/lib/daily-reminder';
import { DEFAULT_EASE } from '@core/lib/review';
import { createStore, type StorageLike } from '@core/lib/storage';
import type { AppData } from '@core/lib/types';
import { createReviewSession, type ReviewSession } from '../lib/review-session';
import { DataScreen } from './data-screen';
import { LanguageScreen } from './language-screen';

/**
 * 資料頁的畫面測試。守的是票 `18` 驗收裡**這台機器看得到的那幾條**：四種雲端狀態各長出
 * 哪幾列、停止同步問不問、匯出交出去的內容與檔名、匯入的確認與跳頁、語言那一頁的打勾。
 *
 * **真機那幾條不在這裡**：分享單長什麼樣、iOS「設定」裡有沒有長出語言項目、tab bar 捲動
 * 縮不縮、並排目測。那四件事在這台機器上全是假的，測到的只會是假貨自己的行為。
 *
 * 雲端備份本身也不在這裡：`cloud` 是一份假的，這支測試看的是**畫面有沒有把手指翻成正確的
 * 指令**，不是那條指令送出去之後發生什麼事（那一層由 `core/lib/cloud-backup.ts` 守）。
 */

/**
 * `expo-router` 的 `Stack.Screen` 在這台機器上沒有原生導覽列可掛，換成什麼都不畫。
 * 標題置中與返回鈕那幾件事本來就不歸這台機器管，留給真機驗收。
 */
jest.mock('expo-router', () => ({ Stack: { Screen: () => null } }));

/** 選檔底下是原生的。下一次 `pickFileAsync()` 要回什麼，由這一格決定。 */
let mockPicked: unknown = { canceled: true, result: null };

jest.mock('expo-file-system', () => ({
  File: { pickFileAsync: () => Promise.resolve(mockPicked) },
}));

/**
 * 時間膠囊底下是 iOS 自己的 `UIDatePicker`，Node 裡沒有那一半。
 *
 * 換成一顆按得動的東西：顯示現在是幾點幾分，按下去就把時刻換成 `MOCK_PICKED_TIME`。
 * **這支測試看得到的只有「畫面有沒有把手指翻成正確的指令」**——滾輪長什麼樣、
 * 跟不跟得上系統的 12／24 小時制，那兩件事在這台機器上全是假的，留給真機驗收。
 */
const MOCK_PICKED_TIME = { hour: 21, minute: 5 };

jest.mock('@react-native-community/datetimepicker', () => {
  const { Pressable, Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    __esModule: true,
    default: ({
      value,
      onValueChange,
    }: {
      value: Date;
      onValueChange(event: unknown, date: Date): void;
    }) => {
      const picked = new Date(value);
      picked.setHours(MOCK_PICKED_TIME.hour, MOCK_PICKED_TIME.minute, 0, 0);
      return (
        <Pressable onPress={() => onValueChange({}, picked)}>
          <Text>{`${value.getHours()}:${value.getMinutes()}`}</Text>
        </Pressable>
      );
    },
  };
});

function fakeStorage(): StorageLike {
  const cells = new Map<string, string>();
  return {
    getItem: (key) => cells.get(key) ?? null,
    setItem: (key, value) => {
      cells.set(key, value);
    },
    removeItem: (key) => {
      cells.delete(key);
    },
  };
}

/** 匯出的檔名照這一天算。 */
const NOW = new Date(2026, 7, 25);

const 一本一張: AppData = {
  version: 3,
  books: [{ id: 'A', name: '甲本' }],
  cards: [
    {
      id: 'c-1',
      bookId: 'A',
      text: '焦[こ]がす',
      meaning: '燒焦',
      interval: null,
      ease: DEFAULT_EASE,
      due: null,
    },
  ],
  scopes: { review: ['A'], list: ['A'], stats: ['A'] },
  updatedAt: 0,
};

function buildSession(data: AppData = 一本一張): ReviewSession {
  const store = createStore(fakeStorage());
  store.save(data);
  return createReviewSession({
    store,
    now: () => NOW,
    random: () => 0.999999,
    onChange: () => {},
    haptic: () => {},
  });
}

/**
 * 假的雲端備份。每一支都記下有沒有被叫到——這支測試要看的就是那件事。
 *
 * **`signOut()` 真的會把暱稱忘掉**，與真貨一致（它清的是 Keychain 那一筆）。
 * 假貨若讓 `nickname()` 一直答得出名字，「停了之後那一區畫回未登入」這條就永遠測不到。
 */
function fakeCloud(initialNickname: string | null) {
  let nickname = initialNickname;
  const calls = {
    begin: jest.fn(),
    signOut: jest.fn(() => {
      nickname = null;
    }),
    push: jest.fn(),
  };
  const cloud: CloudBackup = {
    nickname: () => nickname,
    begin: calls.begin as unknown as CloudBackup['begin'],
    // `true` 代表真的登入了（`ADR-0020` 之後 `signIn()` 也答得出「使用者按了取消」）。
    // 這支測試沒有一條走到登入，答什麼都行，給成功那一個比較不會誤導人。
    signIn: () => Promise.resolve(true),
    changePassword: () => Promise.resolve(),
    signOut: calls.signOut as unknown as CloudBackup['signOut'],
    push: calls.push as unknown as CloudBackup['push'],
    retry: () => {},
  };
  return { cloud, calls };
}

/**
 * 假的每日提醒。**它真的記著開關與時刻**，與 `createDailyReminder()` 一致——
 * 假貨若讓 `enabled()` 一直答同一個答案，「被拒絕時開關彈回去」這條就永遠測不到。
 *
 * `enable()` 與 `verify()` 的答案由外面決定：這支測試要驗的是**畫面怎麼反應**，
 * 不是那三支方法自己怎麼判斷（那一層由 `core/lib/daily-reminder.ts` 自己的測試守）。
 */
function fakeReminder(options: { enabled?: boolean; granted?: boolean; live?: boolean } = {}) {
  let on = options.enabled ?? false;
  let time = '08:00';
  // 這兩格中途換得掉：使用者去系統設定把通知開回來或關掉，就是它們在動。
  let granted = options.granted ?? true;
  let live = options.live ?? true;
  const calls = {
    enable: jest.fn(),
    disable: jest.fn(),
    verify: jest.fn(),
    setTime: jest.fn(),
    refresh: jest.fn(),
  };
  const reminder: DailyReminder = {
    enabled: () => on,
    time: () => time,
    setTime: (next: string) => {
      calls.setTime(next);
      time = next;
    },
    enable: () => {
      calls.enable();
      on = granted;
      return Promise.resolve(on);
    },
    verify: () => {
      calls.verify();
      // 真貨在權限被收回時會就地把開關關掉，假貨也要，否則「彈回去」測到的是畫面自己
      // 記著的一份，不是它與提醒那台機器對得上。
      if (!live) on = false;
      return Promise.resolve(live);
    },
    disable: () => {
      calls.disable();
      on = false;
    },
    refresh: calls.refresh as unknown as DailyReminder['refresh'],
  };
  return {
    reminder,
    calls,
    /** 使用者去了一趟系統設定，把通知打開或關掉。 */
    setGranted: (next: boolean) => {
      granted = next;
    },
    /** 已經開著的提醒，權限在系統設定裡被收回了。 */
    setLive: (next: boolean) => {
      live = next;
    },
  };
}

function fakeConsent(declined: boolean) {
  const grant = jest.fn();
  const consent: CloudConsent = {
    declined: () => declined,
    grant: grant as unknown as CloudConsent['grant'],
    wantsPull: () => Promise.resolve(false),
  };
  return { consent, grant };
}

/**
 * 接住 `Alert.alert()`。**Node 底下沒有真的警示窗**，這裡記下它被端出來的內容，
 * 並提供一支「按下某個樣式的按鈕」。
 *
 * 這是這支測試唯一能驗到「按下去之前有沒有先問」的方式，而那正是破壞性動作最重要的一環。
 */
interface AlertButton {
  text?: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}
const alerts: { title: string; message?: string; buttons: AlertButton[] }[] = [];

/**
 * 接住 app 進出前景那個事件。**Node 底下沒有背景與前景**，這裡留下畫面掛上去的那支處理器，
 * 測試就能自己演一次「使用者去了一趟系統設定又回來」。
 */
let appStateHandler: ((state: string) => void) | null = null;

jest.spyOn(AppState, 'addEventListener').mockImplementation(((
  type: string,
  handler: (state: string) => void,
) => {
  if (type === 'change') appStateHandler = handler;
  return { remove: () => {} };
}) as unknown as typeof AppState.addEventListener);

/** app 回到前景。 */
async function backToForeground(): Promise<void> {
  if (appStateHandler === null) throw new Error('沒有人在聽 app 進出前景');
  await act(async () => {
    appStateHandler?.('active');
  });
}

jest.spyOn(Alert, 'alert').mockImplementation((title, message, buttons) => {
  alerts.push({ title, message, buttons: (buttons ?? []) as AlertButton[] });
});

/**
 * 按下最後一張警示窗上某個樣式的那顆。找不到就當場說清楚，不要靜靜地什麼都沒發生。
 *
 * 包一層 `act()`：那顆鈕的處理器會改畫面狀態，而它不是經由 `fireEvent` 觸發的
 * （`fireEvent` 自己會包）。不包的話 React 會印一整段 `not wrapped in act(...)`，
 * 而且那一輪重畫不保證在斷言之前跑完。
 */
/**
 * 等那張警示窗真的被端出來。
 *
 * 按下「匯入備份」不會當場跳窗——中間隔著一次非同步的選檔。等它出現而不是自己數
 * `await`，數 `await` 是在賭 Promise 的排程，多一輪少一輪都會讓測試變成偶爾紅。
 */
async function waitForAlert(): Promise<void> {
  await waitFor(() => {
    expect(alerts.length).toBeGreaterThan(0);
  });
}

/**
 * 把排隊中的 Promise 全放完。
 *
 * **只給「證明什麼都沒發生」的那幾條用**——那種斷言等不到東西出現，只能讓所有非同步的
 * 路都跑完之後再看一次。`act()` 順便把 React 那一輪重畫也收乾淨。
 */
async function settle(): Promise<void> {
  await act(async () => {});
}

async function pressAlertButton(style: 'cancel' | 'destructive'): Promise<void> {
  const last = alerts.at(-1);
  if (last === undefined) throw new Error('沒有任何警示窗被端出來');
  const button = last.buttons.find((entry) => entry.style === style);
  if (button === undefined) throw new Error(`那張警示窗上沒有 ${style} 那一顆`);
  await act(async () => {
    button.onPress?.();
  });
}

interface MountOptions {
  session?: ReviewSession;
  nickname?: string | null;
  declined?: boolean;
  cloudStatus?: string;
  shareFile?: (content: string, filename: string) => Promise<void>;
  reminder?: { enabled?: boolean; granted?: boolean; live?: boolean };
}

async function mount(options: MountOptions = {}) {
  const session = options.session ?? buildSession();
  const { cloud, calls } = fakeCloud(options.nickname ?? null);
  const { consent, grant } = fakeConsent(options.declined ?? false);
  const { reminder, calls: reminderCalls, setGranted, setLive } = fakeReminder(options.reminder);
  const shareFile = jest.fn(options.shareFile ?? (() => Promise.resolve()));
  const onOpenLanguage = jest.fn();
  const onOpenSignIn = jest.fn();
  const onOpenPassword = jest.fn();
  const onImported = jest.fn();

  const view = await render(
    <DataScreen
      session={session}
      cloud={cloud}
      cloudConsent={consent}
      reminder={reminder}
      cloudStatus={options.cloudStatus ?? ''}
      now={() => NOW}
      shareFile={shareFile as unknown as (content: string, filename: string) => Promise<void>}
      onOpenLanguage={onOpenLanguage}
      onOpenSignIn={onOpenSignIn}
      onOpenPassword={onOpenPassword}
      onImported={onImported}
    />,
  );

  return {
    view,
    session,
    calls,
    reminder,
    reminderCalls,
    setReminderGranted: setGranted,
    setReminderLive: setLive,
    grant,
    shareFile,
    onOpenLanguage,
    onOpenSignIn,
    onOpenPassword,
    onImported,
  };
}

beforeEach(() => {
  alerts.length = 0;
  mockPicked = { canceled: true, result: null };
});

describe('雲端備份那一區的四種狀態', () => {
  it('未登入：只有一列「登入」，點下去進登入子畫面', async () => {
    const app = await mount({ nickname: null });

    expect(app.view.queryByText(t('data.signIn'))).not.toBeNull();
    // 沒登入就不該長出這三列——它們講的是一組還不存在的暱稱密碼。
    expect(app.view.queryByText(t('data.changePasswordTitle'))).toBeNull();
    expect(app.view.queryByText(t('data.stopBackup'))).toBeNull();
    expect(app.view.queryByText(t('data.switchNickname'))).toBeNull();

    await fireEvent.press(app.view.getByText(t('data.signIn')));
    expect(app.onOpenSignIn).toHaveBeenCalledTimes(1);
  });

  it('已登入：暱稱、換密碼、停止同步三列', async () => {
    const app = await mount({ nickname: '阿貓' });

    expect(app.view.queryByText('阿貓')).not.toBeNull();
    expect(app.view.queryByText(t('data.changePasswordTitle'))).not.toBeNull();
    expect(app.view.queryByText(t('data.stopBackup'))).not.toBeNull();
    // 正在同步的裝置不該看到那條反悔的路。
    expect(app.view.queryByText(t('data.pullNow', { nickname: '阿貓' }))).toBeNull();

    await fireEvent.press(app.view.getByText(t('data.changePasswordTitle')));
    expect(app.onOpenPassword).toHaveBeenCalledTimes(1);
  });

  it('這台停了：長出「接回雲端備份」與「改用別的暱稱」', async () => {
    const app = await mount({ nickname: '阿貓', declined: true });

    expect(app.view.queryByText(t('data.pullNow', { nickname: '阿貓' }))).not.toBeNull();
    expect(app.view.queryByText(t('data.switchNickname'))).not.toBeNull();
    // 這台沒在同步，「停止同步」與「換密碼」都沒有意義。
    expect(app.view.queryByText(t('data.stopBackup'))).toBeNull();
    expect(app.view.queryByText(t('data.changePasswordTitle'))).toBeNull();
    // 為什麼現在沒在備份，要講清楚，不然那顆鈕看不懂。
    expect(app.view.queryByText(t('data.declinedHint'))).not.toBeNull();
  });

  it('「改用別的暱稱」走的是同一頁登入子畫面', async () => {
    const app = await mount({ nickname: '阿貓', declined: true });

    await fireEvent.press(app.view.getByText(t('data.switchNickname')));
    expect(app.onOpenSignIn).toHaveBeenCalledTimes(1);
  });

  it('連不上時那行狀態字照實說', async () => {
    const app = await mount({ nickname: '阿貓', cloudStatus: '進度還沒送出去，連線恢復後會自動補上' });

    expect(app.view.queryByText('進度還沒送出去，連線恢復後會自動補上')).not.toBeNull();
  });
});

describe('接回雲端備份', () => {
  it('按下去就同意並接回來，一個字都不必打', async () => {
    const app = await mount({ nickname: '阿貓', declined: true });

    await fireEvent.press(app.view.getByText(t('data.pullNow', { nickname: '阿貓' })));

    expect(app.grant).toHaveBeenCalledTimes(1);
    // 遞進去的必須是這台裝置現在那一份：`begin()` 拿它跟雲端比 `updatedAt`。
    expect(app.calls.begin).toHaveBeenCalledWith(app.session.snapshot().data);
  });
});

describe('停止同步', () => {
  it('先問，而且問的是手機版那一條——它講明密碼會一起刪掉', async () => {
    const app = await mount({ nickname: '阿貓' });

    await fireEvent.press(app.view.getByText(t('data.stopBackup')));

    // 問完之前一個字都不准動。
    expect(app.calls.signOut).not.toHaveBeenCalled();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].message).toBe(t('data.stopConfirmNative'));
    // 網頁版那一條沒講 Keychain 那一半，用錯就是騙人（票 `18`，2026-09-02 拍板照隱私權政策走）。
    expect(alerts[0].message).not.toBe(t('data.stopConfirm'));
  });

  it('確認之後真的停了，那一區畫回「登入」', async () => {
    const app = await mount({ nickname: '阿貓' });

    await fireEvent.press(app.view.getByText(t('data.stopBackup')));
    await pressAlertButton('destructive');

    expect(app.calls.signOut).toHaveBeenCalledTimes(1);
    // 密碼沒了，`nickname()` 就答不出來，這一區跟著畫回「未登入」的樣子。
    // 不驗這一段的話，「按了之後畫面沒反應」會靜靜地過關。
    expect(app.view.queryByText(t('data.stopBackup'))).toBeNull();
    expect(app.view.queryByText(t('data.signIn'))).not.toBeNull();
  });

  it('按取消什麼都不發生', async () => {
    const app = await mount({ nickname: '阿貓' });

    await fireEvent.press(app.view.getByText(t('data.stopBackup')));
    await pressAlertButton('cancel');

    expect(app.calls.signOut).not.toHaveBeenCalled();
  });

  it('那顆是破壞性樣式，而且不是預設選項（HIG B-06）', async () => {
    const app = await mount({ nickname: '阿貓' });

    await fireEvent.press(app.view.getByText(t('data.stopBackup')));

    // 取消排在前面，停止那顆帶 destructive。順序與樣式一起驗——只驗樣式的話，
    // 哪天有人把它排到第一個、變成手滑就按到的那顆，這條仍然會綠。
    expect(alerts[0].buttons[0].style).toBe('cancel');
    expect(alerts[0].buttons[1].style).toBe('destructive');
  });
});

describe('匯出', () => {
  it('交出去的是完整的 JSON，檔名帶今天的日期', async () => {
    const app = await mount();

    await fireEvent.press(app.view.getByText(t('data.exportButton')));
    // 分享那一步是非同步的。用 `waitFor` 等到它真的被叫，不要自己數幾個 `await`——
    // 數 `await` 是在賭 React 與 Promise 的排程，多一輪少一輪都會讓這條變成偶爾紅。
    await waitFor(() => {
      expect(app.shareFile).toHaveBeenCalledTimes(1);
    });
    const [content, filename] = app.shareFile.mock.calls[0] as [string, string];
    // 檔名沿用網頁版那一個，跨版本匯入才對得上。
    expect(filename).toBe('jlpt-cards-2026-08-25.json');
    // 內容是整份資料，不是摘要——這是不依賴任何人的後路。
    expect(JSON.parse(content)).toEqual(一本一張);
  });

  it('失敗時說出原因，不是安靜地什麼都沒發生', async () => {
    const app = await mount({ shareFile: () => Promise.reject(new Error('磁碟滿了')) });

    await fireEvent.press(app.view.getByText(t('data.exportButton')));

    await waitFor(() => {
      expect(app.view.queryByText(t('data.exportFailed', { reason: '磁碟滿了' }))).not.toBeNull();
    });
  });
});

describe('匯入', () => {
  /** 一份合法的備份檔，內容與畫面上那份不同——換掉了才看得出真的換過。 */
  const 別人那一份: AppData = {
    ...一本一張,
    books: [{ id: 'B', name: '乙本' }],
    cards: [],
    scopes: { review: ['B'], list: ['B'], stats: ['B'] },
  };

  function pickFile(json: string): void {
    mockPicked = { canceled: false, result: { text: () => Promise.resolve(json) } };
  }

  it('滑掉選檔畫面就什麼都不發生，也不報錯', async () => {
    const app = await mount();
    mockPicked = { canceled: true, result: null };

    await fireEvent.press(app.view.getByText(t('data.importButton')));
    await settle();

    expect(alerts).toHaveLength(0);
    expect(app.onImported).not.toHaveBeenCalled();
    expect(app.view.queryByText(t('data.importConfirm'))).toBeNull();
  });

  it('覆蓋之前先擋一次，用的是破壞性樣式', async () => {
    const app = await mount();
    pickFile(JSON.stringify(別人那一份));

    await fireEvent.press(app.view.getByText(t('data.importButton')));
    await waitForAlert();

    expect(alerts).toHaveLength(1);
    expect(alerts[0].message).toBe(t('data.importConfirm'));
    expect(alerts[0].buttons[0].style).toBe('cancel');
    expect(alerts[0].buttons[1].style).toBe('destructive');
    // 問完之前本機一個字都不准動。
    expect(app.session.snapshot().data.books).toEqual(一本一張.books);
  });

  it('確認之後整份換掉，並跳回卡片列表', async () => {
    const app = await mount();
    pickFile(JSON.stringify(別人那一份));

    await fireEvent.press(app.view.getByText(t('data.importButton')));
    await waitForAlert();
    await pressAlertButton('destructive');

    // 讀檔那一步是非同步的，等它跑完。
    await waitFor(() => {
      expect(app.onImported).toHaveBeenCalledTimes(1);
    });
    expect(app.session.snapshot().data.books).toEqual(別人那一份.books);
  });

  it('按取消就不動本機那一份', async () => {
    const app = await mount();
    pickFile(JSON.stringify(別人那一份));

    await fireEvent.press(app.view.getByText(t('data.importButton')));
    await waitForAlert();
    await pressAlertButton('cancel');
    await settle();

    expect(app.session.snapshot().data.books).toEqual(一本一張.books);
    expect(app.onImported).not.toHaveBeenCalled();
  });

  it('檔案壞掉時說出原因，本機那一份原封不動', async () => {
    const app = await mount();
    pickFile('這不是 JSON');

    await fireEvent.press(app.view.getByText(t('data.importButton')));
    await waitForAlert();
    await pressAlertButton('destructive');

    // 讀檔、丟例外、把訊息寫上畫面，中間隔著好幾輪 Promise。等到它出現為止。
    await waitFor(() => {
      // **整句都查表**（`ADR-0013` 明確否決過在測試裡寫死中文：文案改一個字就假紅燈，
      // 那是在教人忽略紅燈）。外層是畫面給的殼，`{reason}` 是 `store` 那一層丟的錯，
      // 而 `JSON.parse` 的原文各家引擎不同，因此只釘那句話的開頭。
      const prefix = t('data.importFailed', { reason: '' });
      expect(app.view.queryByText(new RegExp(`^${prefix}`))).not.toBeNull();
    });
    expect(app.session.snapshot().data.books).toEqual(一本一張.books);
    expect(app.onImported).not.toHaveBeenCalled();
  });
});

describe('每日提醒（票 19）', () => {
  const denied = () => t('data.reminderDenied', { app: APP_NAME.short });

  it('那一組排在「雲端備份」與「手動備份」之間', async () => {
    const app = await mount();

    // 比的是三個群組標頭在畫面樹裡的先後。只驗「有沒有長出來」的話，
    // 哪天有人把它接到最底下，這條仍然會綠。
    const tree = JSON.stringify(app.view.toJSON());
    expect(tree.indexOf(t('data.cloudTitle'))).toBeLessThan(tree.indexOf(t('data.reminderTitle')));
    expect(tree.indexOf(t('data.reminderTitle'))).toBeLessThan(tree.indexOf(t('data.fileTitle')));
  });

  it('關著時只有開關那一列，時間那一列不長出來', async () => {
    const app = await mount({ reminder: { enabled: false } });

    expect(app.view.queryByText(t('data.reminderSwitch'))).not.toBeNull();
    // 關著的時候那一格沒有意義，長在那裡只會讓人以為關著也會叫（票 18 的立場）。
    expect(app.view.queryByText(t('data.reminderWhen'))).toBeNull();
    // 沒開就不必問權限，一次都不要問。
    expect(app.reminderCalls.verify).not.toHaveBeenCalled();
  });

  it('打開開關會請求權限，允許之後長出時間那一列', async () => {
    const app = await mount({ reminder: { enabled: false, granted: true } });

    await fireEvent(app.view.getByLabelText(t('data.reminderSwitch')), 'valueChange', true);

    await waitFor(() => {
      expect(app.view.queryByText(t('data.reminderWhen'))).not.toBeNull();
    });
    expect(app.reminderCalls.enable).toHaveBeenCalledTimes(1);
    expect(app.view.queryByText(denied())).toBeNull();
  });

  it('被拒絕時開關彈回關閉，群組底下說出原因', async () => {
    const app = await mount({ reminder: { enabled: false, granted: false } });

    await fireEvent(app.view.getByLabelText(t('data.reminderSwitch')), 'valueChange', true);

    await waitFor(() => {
      expect(app.view.queryByText(denied())).not.toBeNull();
    });
    // 寧可讓開關彈回去，也不要讓使用者以為提醒在運作卻永遠收不到（spec 決定二十四）。
    expect(app.view.getByLabelText(t('data.reminderSwitch')).props.value).toBe(false);
    expect(app.view.queryByText(t('data.reminderWhen'))).toBeNull();
  });

  it('畫出來時問一次權限還在不在，被收回就彈回去', async () => {
    // 使用者剛從系統設定把通知關掉：記著的狀態仍是「開著」，但它已經不是真的。
    const app = await mount({ reminder: { enabled: true, live: false } });

    await waitFor(() => {
      expect(app.view.queryByText(denied())).not.toBeNull();
    });
    expect(app.reminderCalls.verify).toHaveBeenCalledTimes(1);
    expect(app.view.getByLabelText(t('data.reminderSwitch')).props.value).toBe(false);
    expect(app.view.queryByText(t('data.reminderWhen'))).toBeNull();
  });

  it('去系統設定把通知關掉，回到 app 就彈回去——這一頁不會重新掛載', async () => {
    const app = await mount({ reminder: { enabled: true, live: true } });
    await settle();
    expect(app.view.getByLabelText(t('data.reminderSwitch')).props.value).toBe(true);

    // 使用者去了一趟「設定 → JP Vocab → 通知」，把通知關掉，然後切回來。
    app.setReminderLive(false);
    await backToForeground();

    // 少了回到前景那條訊號，開關會一直亮著——四個 tab 底下是 UITabBarController，
    // 畫面掛上去之後不會卸載，`useEffect` 那一次不會再跑。
    expect(app.view.queryByText(denied())).not.toBeNull();
    expect(app.view.getByLabelText(t('data.reminderSwitch')).props.value).toBe(false);
    expect(app.view.queryByText(t('data.reminderWhen'))).toBeNull();
  });

  it('回到前景時提醒是關著的，就一次權限都不問', async () => {
    const app = await mount({ reminder: { enabled: false } });

    await backToForeground();

    // 沒開的提醒沒有「還成不成立」可言，問它只是白跑一趟原生。
    expect(app.reminderCalls.verify).not.toHaveBeenCalled();
  });

  it('權限還在就照記著的狀態畫，什麼都不說', async () => {
    const app = await mount({ reminder: { enabled: true, live: true } });

    await settle();

    expect(app.view.getByLabelText(t('data.reminderSwitch')).props.value).toBe(true);
    expect(app.view.queryByText(t('data.reminderWhen'))).not.toBeNull();
    expect(app.view.queryByText(denied())).toBeNull();
  });

  it('關掉開關就清掉已排的，時間那一列跟著收起來', async () => {
    const app = await mount({ reminder: { enabled: true, live: true } });
    await settle();

    await fireEvent(app.view.getByLabelText(t('data.reminderSwitch')), 'valueChange', false);

    expect(app.reminderCalls.disable).toHaveBeenCalledTimes(1);
    expect(app.view.queryByText(t('data.reminderWhen'))).toBeNull();
  });

  it('改時間交出去的是 HH:MM，畫面跟著換', async () => {
    const app = await mount({ reminder: { enabled: true, live: true } });
    await settle();

    await fireEvent.press(app.view.getByText('8:0'));

    // 個位數要補零，那一格只裝得下這個形狀（`TIME_PATTERN`）。
    expect(app.reminderCalls.setTime).toHaveBeenCalledWith('21:05');
    // 畫面讀的是提醒那台機器記著的值，不是自己另存一份——兩邊各記各的就會各說各話。
    expect(app.view.queryByText('21:5')).not.toBeNull();
  });

  it('拒絕過、去系統設定開回來，再打開一次就成立，那段字收掉', async () => {
    const app = await mount({ reminder: { enabled: false, granted: false } });
    const toggle = app.view.getByLabelText(t('data.reminderSwitch'));

    await fireEvent(toggle, 'valueChange', true);
    await waitFor(() => {
      expect(app.view.queryByText(denied())).not.toBeNull();
    });

    // 使用者去了一趟「設定 → JP Vocab → 通知」，把它打開了。
    app.setReminderGranted(true);
    await fireEvent(toggle, 'valueChange', true);

    await waitFor(() => {
      expect(app.view.queryByText(t('data.reminderWhen'))).not.toBeNull();
    });
    // 上一次那段錯誤訊息不能留在畫面上，它已經不是真的了。
    expect(app.view.queryByText(denied())).toBeNull();
    expect(app.reminderCalls.enable).toHaveBeenCalledTimes(2);
  });
});

describe('介面語言', () => {
  it('資料頁那一列顯示目前選的是哪一個，點下去進子畫面', async () => {
    const app = await mount();

    // 測試環境沒有存過選擇，因此是「系統預設」（見 `core/test-setup.ts`）。
    expect(app.view.queryByText(t('data.langSystem'))).not.toBeNull();

    await fireEvent.press(app.view.getByText(t('data.langTitle')));
    expect(app.onOpenLanguage).toHaveBeenCalledTimes(1);
  });

  it('子畫面四列都在，三個具體語言用自己的自稱', async () => {
    const view = await render(<LanguageScreen onPick={() => {}} />);

    expect(view.queryByText(t('data.langSystem'))).not.toBeNull();
    // **不隨介面語言變**：手滑切到看不懂的語言時，這三個字還認得出來（spec 決定十）。
    expect(view.queryByText('繁體中文')).not.toBeNull();
    expect(view.queryByText('English')).not.toBeNull();
    expect(view.queryByText('日本語')).not.toBeNull();
  });

  it('選一種語言就交給外面那一支，這一頁自己不存', async () => {
    const onPick = jest.fn();
    const view = await render(<LanguageScreen onPick={onPick} />);

    await fireEvent.press(view.getByText('日本語'));

    expect(onPick).toHaveBeenCalledWith('ja');
  });
});
