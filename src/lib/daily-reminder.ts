/**
 * 每日提醒：每天早上把「今天有幾張到期」送到使用者的鎖定畫面上。
 *
 * 排程的數字不在這裡算——那是 `reminders.ts` 的職責（純函式、當前時間注入）。
 * 本模組只做三件事：把那份預估翻成一批要登記的通知、記住這台裝置有沒有開提醒、
 * 以及在資料變動時把整批重排出去。
 *
 * 不碰任何原生 API：通知怎麼登記一律由呼叫端遞進來，與 `safety-copy.ts`、
 * `keychain.ts` 同一個立場。接上 Capacitor 那一端的接線在 `daily-reminder-native.ts`。
 * 網頁版完全沒有這條支線。
 */
import { forecastDueCounts } from './reminders';
import type { StorageLike } from './storage';
import type { Card } from './types';

/** 提醒時間：固定每天早上 6:00，不做設定畫面（見 spec 決定二十二）。 */
export const REMINDER_HOUR = 6;
const REMINDER_MINUTE = 0;

/**
 * 這台裝置要不要被叫。與 `gemini-key.ts` 的金鑰同一個定位：這是偏好不是資料，
 * 因此自己占一格 localStorage——不進 `AppData`、不上雲端、不進匯出檔。
 */
const REMINDER_STORAGE_KEY = 'va-practice:reminder';

/** 存進去的那個值。只有「開著」需要記，關著就把整格拿掉。 */
const ENABLED = 'on';

/** 通知的標題。四則七則都是同一句，變動的只有底下那行張數。 */
const REMINDER_TITLE = '該複習了';

/** 一則要登記的提醒。 */
export interface ScheduledReminder {
  /** 只需在同一批裡不重複：整批重排時是先全清再登記，跨批不必對得起來。 */
  id: number;
  title: string;
  /** 寫明當天的到期張數——使用者不必打開 app 就知道今天的份量。 */
  body: string;
  year: number;
  /** 1–12。刻意不沿用 `Date` 的 0–11：這個數字要交給原生那側直接用。 */
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/** 通知權限的三種狀態。`prompt` 是還沒問過。 */
export type ReminderPermission = 'granted' | 'denied' | 'prompt';

/** 原生那一端的三支方法。 */
export interface ReminderNative {
  /** 目前的通知權限。不會跳任何對話框。 */
  permission(): Promise<ReminderPermission>;
  /** 跳系統對話框問一次，回傳使用者的選擇。 */
  request(): Promise<ReminderPermission>;
  /**
   * 先清掉全部已登記的提醒，再登記這一批。空陣列即為全部清掉。
   *
   * 併成一支而不是清空與登記各一支：整批重排是一件事，拆兩支的話中間那個
   * 「已經清空但還沒登記」的狀態會變成呼叫端要管的東西。
   */
  replaceAll(reminders: readonly ScheduledReminder[]): Promise<void>;
}

export interface DailyReminderHooks {
  native: ReminderNative;
  storage: StorageLike;
  /**
   * 現在該登記哪幾則。每次重排時重新問一次——本模組不持有卡片，
   * 「哪一批卡算數」由呼叫端決定（必須與 `buildQueue()` 同一批）。
   */
  plan(): readonly ScheduledReminder[];
}

export interface DailyReminder {
  /** 這台裝置有沒有開每日提醒。 */
  enabled(): boolean;
  /**
   * 開啟。沒問過權限的話請求一次；被拒絕就回 false 且開關維持關閉——
   * 不重複請求，也不呈現「提醒已開啟」的假象（見 spec 決定二十四）。
   */
  enable(): Promise<boolean>;
  /**
   * 提醒現在是不是真的在運作：開關開著、而且通知權限還在。
   *
   * 使用者可能在系統設定裡把通知關掉，此時 `enabled()` 還是真的——那正是決定二十四
   * 禁止的假象。畫面在畫出開關時問一次，拿到 false 就把勾彈回去並說明原因。
   * 順手把開關關掉並清空已登記的，兩邊因此不會各說各話。
   */
  verify(): Promise<boolean>;
  /** 關閉，並清掉全部已登記的提醒。 */
  disable(): void;
  /** 資料變了，整批重排。關著時什麼都不做。 */
  refresh(): void;
}

/**
 * 把未來各天的到期預估翻成一批要登記的通知，每一則排在當天早上 6:00。
 *
 * 哪幾天要排、各幾張，全部來自 `forecastDueCounts()`：張數為 0 的日子在那一層
 * 就已經被濾掉，因此「今天一張都沒到期就不要吵我」這條規則這裡不必再寫一次。
 *
 * 年月日拆開帶出去而不是交一個日期字串：讓原生那側直接組出當地時間的觸發時刻，
 * 中間不多一層解析，也就不多一層時區的疑慮。
 */
export function planReminders(cards: readonly Card[], now: Date): ScheduledReminder[] {
  return forecastDueCounts(cards, now).map((day, index) => {
    const [year, month, dayOfMonth] = day.date.split('-').map(Number);
    return {
      id: index + 1,
      title: REMINDER_TITLE,
      body: `今天有 ${day.count} 張到期`,
      year,
      month,
      day: dayOfMonth,
      hour: REMINDER_HOUR,
      minute: REMINDER_MINUTE,
    };
  });
}

export function createDailyReminder({ native, storage, plan }: DailyReminderHooks): DailyReminder {
  /**
   * 沿用 `safety-copy.ts` 的「一份待辦 ＋ 一個進行中」模式，不用計時器：同時只排一批，
   * 重排期間進來的變動一律覆蓋成「待排的最新那一批」，上一趟回來後若 `pending`
   * 已換人就再排一次。送出去的永遠是整批，被合併掉的中間那幾批沒有任何意義。
   *
   * 這道閘門刻意與保險副本各自一份：兩者寫的是不同的原生 API，共用一道閘門會讓
   * 其中一邊變慢時卡住另一邊（見 spec 決定二十一）。
   */
  let pending: readonly ScheduledReminder[] | null = null;
  let scheduling = false;

  async function flush(): Promise<void> {
    if (scheduling || pending === null) return;
    scheduling = true;
    try {
      while (pending !== null) {
        const latest: readonly ScheduledReminder[] = pending;
        await native.replaceAll(latest);
        // 重排期間又有新變動的話 pending 已經換人，這一批不能清掉。
        if (pending === latest) pending = null;
      }
    } catch {
      // 少幾則提醒不值得打斷複習，與雲端推送、保險副本同一個立場。
      // 待排的那批留著，下次資料變動會再排一趟。
    } finally {
      scheduling = false;
    }
  }

  function push(reminders: readonly ScheduledReminder[]): void {
    pending = reminders;
    void flush();
  }

  function readEnabled(): boolean {
    return storage.getItem(REMINDER_STORAGE_KEY) === ENABLED;
  }

  function writeEnabled(on: boolean): void {
    if (on) storage.setItem(REMINDER_STORAGE_KEY, ENABLED);
    else storage.removeItem(REMINDER_STORAGE_KEY);
  }

  /**
   * 提醒是不是真的還在運作，**並在權限被收回時就地把開關關掉、清空已登記的**。
   *
   * 「開關要誠實」只在這一支實現，重排與畫面兩條路共用它——分開寫的話，
   * 兩邊對「現在到底開著沒」會給出不同的答案。
   */
  async function stillGranted(): Promise<boolean> {
    if (!readEnabled()) return false;
    if ((await native.permission()) === 'granted') return true;
    writeEnabled(false);
    push([]);
    return false;
  }

  return {
    enabled: readEnabled,

    async enable() {
      try {
        const current = await native.permission();
        // 已經被拒絕過就不再問第二次——系統也不會再跳，只會靜靜地回同一個答案。
        const settled = current === 'prompt' ? await native.request() : current;
        if (settled !== 'granted') {
          writeEnabled(false);
          return false;
        }
      } catch {
        // 問不出權限就當作開不起來。寧可讓開關彈回去，也不要讓使用者以為提醒在運作。
        writeEnabled(false);
        return false;
      }
      writeEnabled(true);
      push(plan());
      return true;
    },

    verify() {
      // 問不出權限就沿用記著的狀態：把開關關掉是很吵的一件事，不該由一次失敗的
      // 查詢觸發。下次資料變動或下次打開這一頁會再問一次。
      return stillGranted().catch(() => readEnabled());
    },

    disable() {
      writeEnabled(false);
      push([]);
    },

    refresh() {
      if (!readEnabled()) return;
      void stillGranted()
        .then((granted) => {
          if (granted) push(plan());
        })
        .catch(() => {
          // 問不出權限就這一趟不排，不動開關：下次資料變動會再問一次。
        });
    },
  };
}
