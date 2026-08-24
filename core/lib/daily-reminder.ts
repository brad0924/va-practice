/**
 * 每日提醒：每天在使用者設定的時刻，把「今天有幾張到期」送到他的鎖定畫面上。
 *
 * 排程的數字不在這裡算——那是 `reminders.ts` 的職責（純函式、當前時間注入）。
 * 本模組只做三件事：把那份預估翻成一批要登記的通知、記住這台裝置有沒有開提醒、
 * 以及在資料變動時把整批重排出去。
 *
 * 不碰任何原生 API：通知怎麼登記一律由呼叫端遞進來，與 `safety-copy.ts`、
 * `keychain.ts` 同一個立場。接上 Capacitor 那一端的接線在 `daily-reminder-native.ts`。
 * 網頁版完全沒有這條支線。
 */
import { t } from '../i18n';
import { dueCountToday, forecastDueCounts, type DueForecast } from './reminders';
import { toDateKey } from './review';
import type { StorageLike } from './storage';
import type { Card } from './types';

/**
 * 沒設過時幾點叫。**只對「時間那一格從來沒被設過」的裝置生效**——設過的人
 * 讀到的是自己那個值，改這裡動不到他。
 */
export const DEFAULT_REMINDER_TIME = '08:00';

/** `HH:MM`，24 小時制。`<input type="time">` 給出來的正是這個形狀。 */
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * 這台裝置要不要被叫。與 `gemini-key.ts` 的金鑰同一個定位：這是偏好不是資料，
 * 因此自己占一格 localStorage——不進 `AppData`、不上雲端、不進匯出檔。
 */
const REMINDER_STORAGE_KEY = 'va-practice:reminder';

/**
 * 幾點叫。**與開關分開兩格**：關掉開關往往只是暫時的（出門幾天、這週不想被吵），
 * 把設好的時間一起洗掉、回來得重設一次很怪（見票 18 的訂正）。
 *
 * 分開的另一個好處是相容處理變成零行：票 09 留下的裝置上開關那一格仍是 `'on'`，
 * 時間那一格不存在，讀不到就用預設值。（那些裝置因此跟著預設值走——票 18 把預設
 * 改回 08:00 時，它們也一起從 06:00 變成 08:00。這是刻意的，見票 18 的訂正。）
 */
const REMINDER_TIME_KEY = 'va-practice:reminder-time';

/** 存進去的那個值。只有「開著」需要記，關著就把整格拿掉。 */
const ENABLED = 'on';

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
   *
   * 設定的時間由本模組遞出去而不是讓呼叫端自己去讀：那一格是本模組的東西，
   * 兩邊各讀各的就會有機會讀到不一樣的答案。
   */
  plan(time: string): readonly ScheduledReminder[];
}

export interface DailyReminder {
  /** 這台裝置有沒有開每日提醒。 */
  enabled(): boolean;
  /** 幾點叫，`HH:MM`。沒設過時是 `DEFAULT_REMINDER_TIME`。 */
  time(): string;
  /**
   * 改成幾點叫，並依新時間整批重排。關著時只記下來，不白跑一趟原生。
   * 不是 `HH:MM` 的東西當沒發生——那一格只裝得下時刻。
   */
  setTime(time: string): void;
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
 * `'22:30'` 拆成時與分。**形狀由呼叫端保證**——提醒那條路上是 `readTime()` 守著的，
 * 讀到壞掉的東西就退回預設值，因此走到這裡的一定是 `HH:MM`。
 */
function parseTime(time: string): { hour: number; minute: number } {
  const [hour, minute] = time.split(':').map(Number);
  return { hour, minute };
}

/** 排程這一刻，今天的提醒時間到了沒。到了或過了就不排今天那一則。 */
function beforeReminderTime(now: Date, time: string): boolean {
  const { hour, minute } = parseTime(time);
  return now.getHours() * 60 + now.getMinutes() < hour * 60 + minute;
}

/**
 * 把各天的到期預估翻成一批要登記的通知，每一則排在當天的 `time`（`HH:MM`）。
 *
 * **今天那一則有兩道閘門**，兩者缺一都不排：提醒時間還沒到（排一個已經過去的時刻
 * 沒有意義），且今天還有卡沒複習完。後者是免費的——複習完的卡到期日被推到未來，
 * `dueCountToday()` 自然就數不到它，歸零的日子本來就不登記。
 *
 * 這兩道閘門把「該叫」與「不該叫」分了開來：提醒時間之前打開 app 但沒複習，
 * 那則提醒仍然會響；複習完了才不響。舊版無條件不排今天，兩者一律不響——
 * 前者是漏叫，而且從外面看跟後者一模一樣（見 spec 決定二十的訂正）。
 *
 * 未來那幾天的張數為 0 時同樣不排，那一層在 `forecastDueCounts()` 就濾掉了。
 *
 * 年月日拆開帶出去而不是交一個日期字串：讓原生那側直接組出當地時間的觸發時刻，
 * 中間不多一層解析，也就不多一層時區的疑慮。
 */
export function planReminders(cards: readonly Card[], now: Date, time: string): ScheduledReminder[] {
  const days: DueForecast[] = [];
  if (beforeReminderTime(now, time)) {
    const today = dueCountToday(cards, now);
    if (today > 0) days.push({ date: toDateKey(now), count: today });
  }
  days.push(...forecastDueCounts(cards, now));

  const { hour, minute } = parseTime(time);
  return days.map((day, index) => {
    const [year, month, dayOfMonth] = day.date.split('-').map(Number);
    return {
      id: index + 1,
      // 四則七則都是同一句標題，變動的只有底下那行張數。
      title: t('reminder.title'),
      body: t('reminder.body', { count: day.count }),
      year,
      month,
      day: dayOfMonth,
      hour,
      minute,
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
   * 幾點叫。沒設過、或存進去的東西壞掉時退回預設值——排出一個看不懂的時刻比不排更糟，
   * 而使用者從畫面上完全看不出哪裡不對。
   *
   * 寫入端已經擋掉不成形的值，因此這一道守的是**別人留下的東西**：更早的版本、
   * 手改過的 localStorage。兩道各守各的，不是同一件事做兩次。
   */
  function readTime(): string {
    const stored = storage.getItem(REMINDER_TIME_KEY);
    return stored !== null && TIME_PATTERN.test(stored) ? stored : DEFAULT_REMINDER_TIME;
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

  function refresh(): void {
    if (!readEnabled()) return;
    void stillGranted()
      .then((granted) => {
        if (granted) push(plan(readTime()));
      })
      .catch(() => {
        // 問不出權限就這一趟不排，不動開關：下次資料變動會再問一次。
      });
  }

  return {
    enabled: readEnabled,
    time: readTime,

    setTime(time) {
      // 不成形的東西進不了那一格。放它進去的話 `time()` 讀出來會退回預設值，
      // 而畫面上顯示的是使用者剛送進來的那個——看到的與排出去的從此各說各話。
      if (!TIME_PATTERN.test(time)) return;
      storage.setItem(REMINDER_TIME_KEY, time);
      // 沿用既有的那條路：時間也是「排出來的那一批會不一樣」的一種變動。
      // 關著的時候 refresh() 自己就什麼都不做，這裡不必再問一次。
      refresh();
    },

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
      push(plan(readTime()));
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

    refresh,
  };
}
