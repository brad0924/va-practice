import { describe, it, expect } from 'vitest';
import {
  createDailyReminder,
  planReminders,
  DEFAULT_REMINDER_TIME,
  type ReminderPermission,
  type ScheduledReminder,
} from './daily-reminder';
import { DEFAULT_EASE, toDateKey } from './review';
import type { StorageLike } from './storage';
import type { Card } from './types';

const NOW = new Date('2026-07-23T09:00:00');

function card(id: string, overrides: Partial<Card> = {}): Card {
  return { id, bookId: 'book', text: id, meaning: id, interval: null, ease: DEFAULT_EASE, due: null, ...overrides };
}

/** 到期日在今天之後第 n 天的一張卡。期望值仍寫死日期字串，才不會與受測程式共用同一個錯。 */
function dueIn(days: number, now = NOW): Card {
  const due = toDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + days));
  return card(`+${days}`, { interval: 3, due });
}

/** 一台裝置的本機儲存。只存一個鍵，不必分辨。 */
function fakeStorage(): StorageLike {
  const kept = new Map<string, string>();
  return {
    getItem: (key) => kept.get(key) ?? null,
    setItem: (key, value) => {
      kept.set(key, value);
    },
    removeItem: (key) => {
      kept.delete(key);
    },
  };
}

/**
 * 原生那一端，但每一趟重排什麼時候完成由測試自己決定——
 * 「重排期間又有新變動」這件事非得能停在半路才測得到。
 */
function fakeNative(permission: ReminderPermission = 'prompt') {
  const waiting: { reminders: readonly ScheduledReminder[]; resolve: () => void; reject: (error: unknown) => void }[] =
    [];
  /** 真的落地的每一批，依落地順序。 */
  const applied: ScheduledReminder[][] = [];
  let state = permission;
  let asked = 0;
  let answer: ReminderPermission = 'granted';

  /** 讓已經排好的 promise 全部跑完，flush 的下一圈才會真的開始。 */
  const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

  function pick(): (typeof waiting)[number] {
    const next = waiting.shift();
    if (next === undefined) throw new Error('現在沒有正在等的重排');
    return next;
  }

  return {
    applied,
    /** 請求過幾次權限。決定二十四要的是「不重複請求」，因此這個數字本身就是斷言對象。 */
    asked: () => asked,
    /** 還沒回來的重排趟數。 */
    outstanding: () => waiting.length,
    /** 使用者會怎麼回答那個系統對話框。 */
    willAnswer(next: ReminderPermission) {
      answer = next;
    },
    /** 使用者稍後跑去系統設定改了權限。 */
    revoke() {
      state = 'denied';
    },
    permission: () => Promise.resolve(state),
    request: () => {
      asked += 1;
      state = answer;
      return Promise.resolve(answer);
    },
    replaceAll(reminders: readonly ScheduledReminder[]): Promise<void> {
      return new Promise((resolve, reject) => {
        waiting.push({ reminders, resolve, reject });
      });
    },
    /** 放行目前這一趟。 */
    async finish(): Promise<void> {
      const next = pick();
      applied.push([...next.reminders]);
      next.resolve();
      await settle();
    },
    /** 讓目前這一趟失敗，例如通知登記不進去。 */
    async fail(): Promise<void> {
      pick().reject(new Error('登記不進系統通知'));
      await settle();
    },
    settle,
  };
}

/** 受測物與它的假原生端。`plan` 用一個可以隨時換掉的來源，資料變動才模擬得出來。 */
function setup(permission: ReminderPermission = 'prompt', cards: Card[] = [card('新卡')]) {
  const native = fakeNative(permission);
  const storage = fakeStorage();
  let source = cards;
  const reminder = createDailyReminder({
    native,
    storage,
    plan: (time) => planReminders(source, NOW, time),
  });
  return {
    native,
    storage,
    reminder,
    /** 使用者改了資料（匯入、複習完、改複習範圍都走這條）。 */
    setCards(next: Card[]) {
      source = next;
    },
  };
}

describe('planReminders', () => {
  it('一張都不會到期時回空——沒有任何一則要登記', () => {
    expect(planReminders([], NOW, DEFAULT_REMINDER_TIME)).toEqual([]);
  });

  it('每一則都排在當天早上 8:00', () => {
    const plan = planReminders([card('新卡')], NOW, DEFAULT_REMINDER_TIME);

    expect(plan).toHaveLength(7);
    expect(plan.map((one) => one.hour)).toEqual([8, 8, 8, 8, 8, 8, 8]);
    expect(plan.map((one) => one.minute)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it('年月日拆開帶出去，月份是 1–12 而不是 0–11', () => {
    const plan = planReminders([card('新卡')], NOW, DEFAULT_REMINDER_TIME);

    expect(plan[0]).toMatchObject({ year: 2026, month: 7, day: 24 });
    expect(plan[6]).toMatchObject({ year: 2026, month: 7, day: 30 });
  });

  it('跨月與跨年的日期推進正確', () => {
    const across = planReminders([card('新卡')], new Date('2026-12-29T09:00:00'), DEFAULT_REMINDER_TIME);

    expect(across.map((one) => [one.year, one.month, one.day])).toEqual([
      [2026, 12, 30],
      [2026, 12, 31],
      [2027, 1, 1],
      [2027, 1, 2],
      [2027, 1, 3],
      [2027, 1, 4],
      [2027, 1, 5],
    ]);
  });

  it('內文寫明當天的到期張數', () => {
    const plan = planReminders([card('新卡'), dueIn(3), dueIn(4)], NOW, DEFAULT_REMINDER_TIME);

    expect(plan.map((one) => one.body)).toEqual([
      '今天有 1 張到期',
      '今天有 1 張到期',
      '今天有 2 張到期',
      '今天有 3 張到期',
      '今天有 3 張到期',
      '今天有 3 張到期',
      '今天有 3 張到期',
    ]);
  });

  it('一張都沒到期的日子不登記，有卡的那幾天才排', () => {
    const plan = planReminders([dueIn(5)], NOW, DEFAULT_REMINDER_TIME);

    expect(plan.map((one) => [one.month, one.day])).toEqual([
      [7, 28],
      [7, 29],
      [7, 30],
    ]);
  });

  it('同一批裡的識別碼不重複', () => {
    const plan = planReminders([card('新卡')], NOW, DEFAULT_REMINDER_TIME);

    expect(new Set(plan.map((one) => one.id)).size).toBe(plan.length);
  });
});

/**
 * 今天那一則的兩道閘門。這幾條分開的是「該叫」與「不該叫」——
 * 舊版無條件不排今天，因此「開了 app 但沒複習」與「複習完了」從外面看一模一樣。
 */
describe('今天那一則', () => {
  /** 同一天的早上 5:00，提醒時間之前。 */
  const BEFORE = new Date('2026-07-23T05:00:00');
  /** 同一天的早上 9:00，提醒時間之後。 */
  const AFTER = new Date('2026-07-23T09:00:00');

  it('提醒時間還沒到、今天還有卡沒複習完時，今天那一則排得出來', () => {
    const plan = planReminders([card('新卡')], BEFORE, DEFAULT_REMINDER_TIME);

    expect(plan[0]).toMatchObject({ year: 2026, month: 7, day: 23, hour: 8, body: '今天有 1 張到期' });
    // 今天多一則，加上未來 7 天。
    expect(plan).toHaveLength(8);
  });

  it('今天的卡複習完了就不排——那才是「複習完了」該有的樣子', () => {
    // 今天一張都不到期，最快的一張是明天。
    const plan = planReminders([dueIn(1, BEFORE)], BEFORE, DEFAULT_REMINDER_TIME);

    expect(plan[0]).toMatchObject({ month: 7, day: 24 });
    expect(plan).toHaveLength(7);
  });

  it('提醒時間已經過了就不排，即使今天還有卡——排一個過去的時刻沒有意義', () => {
    const plan = planReminders([card('新卡')], AFTER, DEFAULT_REMINDER_TIME);

    expect(plan[0]).toMatchObject({ month: 7, day: 24 });
    expect(plan).toHaveLength(7);
  });

  it('剛好卡在 8:00 那一刻算已經過了，不排今天', () => {
    const plan = planReminders([card('新卡')], new Date('2026-07-23T08:00:00'), DEFAULT_REMINDER_TIME);

    expect(plan[0]).toMatchObject({ month: 7, day: 24 });
  });

  it('7:59 還算沒到，排得出來', () => {
    const plan = planReminders([card('新卡')], new Date('2026-07-23T07:59:00'), DEFAULT_REMINDER_TIME);

    expect(plan[0]).toMatchObject({ month: 7, day: 23 });
  });

  it('多出來的今天那一則不會撞到別人的識別碼', () => {
    const plan = planReminders([card('新卡')], BEFORE, DEFAULT_REMINDER_TIME);

    expect(new Set(plan.map((one) => one.id)).size).toBe(plan.length);
  });
});

/**
 * 時間變成參數之後，上面那兩道閘門仍然是同一套規則，只是拿來比的那個數字換人。
 * 這幾條驗的正是「換人了嗎」——把時間寫死的話它們會轉紅。
 */
describe('設定的提醒時間', () => {
  it('每一則都排在設定的那個時刻，不是預設的 08:00', () => {
    // 現在是 09:00，設 22:30 的話今天那一則也排得出來，因此是 8 則而不是 7 則。
    const plan = planReminders([card('新卡')], NOW, '22:30');

    expect(plan).toHaveLength(8);
    expect(new Set(plan.map((one) => one.hour))).toEqual(new Set([22]));
    expect(new Set(plan.map((one) => one.minute))).toEqual(new Set([30]));
  });

  it('個位數的時與分不會被補零弄錯，07:05 就是 7 點 5 分', () => {
    const plan = planReminders([card('新卡')], NOW, '07:05');

    expect(plan[0]).toMatchObject({ hour: 7, minute: 5 });
  });

  it('今天那一則的閘門跟著設定走：設 22:30，現在 09:00 還沒到，排得出來', () => {
    const plan = planReminders([card('新卡')], NOW, '22:30');

    expect(plan[0]).toMatchObject({ month: 7, day: 23, hour: 22, minute: 30 });
    expect(plan).toHaveLength(8);
  });

  it('設 05:00 而現在 09:00 已經過了，今天那一則不排', () => {
    const plan = planReminders([card('新卡')], NOW, '05:00');

    expect(plan[0]).toMatchObject({ month: 7, day: 24 });
    expect(plan).toHaveLength(7);
  });

  it('分鐘也算數：現在 09:00，設 09:01 還沒到、設 09:00 算已經過了', () => {
    expect(planReminders([card('新卡')], NOW, '09:01')[0]).toMatchObject({ day: 23 });
    expect(planReminders([card('新卡')], NOW, '09:00')[0]).toMatchObject({ day: 24 });
  });
});

describe('提醒時間的設定值', () => {
  it('沒設過時是 08:00', () => {
    const { reminder } = setup();

    expect(reminder.time()).toBe('08:00');
  });

  it('設過之後記在本機，重開 app 仍然記得', async () => {
    const { reminder, storage, native } = setup('granted');

    await reminder.enable();
    await native.finish();
    reminder.setTime('22:30');
    await native.settle();
    await native.finish();

    expect(reminder.time()).toBe('22:30');
    // 同一份 storage 重建一個，等同重開 app。
    const again = createDailyReminder({ native, storage, plan: () => [] });
    expect(again.time()).toBe('22:30');
  });

  it('關掉開關再打開，記得的是上次設的時間，不會跳回預設值', async () => {
    const { reminder, native } = setup('granted');

    await reminder.enable();
    await native.finish();
    reminder.setTime('22:30');
    await native.settle();
    await native.finish();

    reminder.disable();
    await native.finish();
    expect(reminder.time()).toBe('22:30');

    await reminder.enable();
    await native.finish();
    expect(reminder.time()).toBe('22:30');
  });

  it('改了時間就依新時間整批重排，不必重開 app', async () => {
    const { reminder, native } = setup('granted');

    await reminder.enable();
    await native.finish();
    expect(native.applied[0]?.[0]?.hour).toBe(8);

    reminder.setTime('22:30');
    await native.settle();
    await native.finish();

    expect(native.applied[1]?.[0]?.hour).toBe(22);
    expect(native.applied[1]?.[0]?.minute).toBe(30);
  });

  it('提醒關著時改時間只是記下來，不為沒開提醒的人白跑一趟原生', async () => {
    const { reminder, native } = setup('granted');

    reminder.setTime('22:30');
    await native.settle();

    expect(reminder.time()).toBe('22:30');
    expect(native.outstanding()).toBe(0);
    expect(native.applied).toEqual([]);
  });

  it('時間不進使用者的資料：自己占一格，與卡片那一份無關', async () => {
    const { reminder, storage, native } = setup('granted');

    await reminder.enable();
    await native.finish();
    reminder.setTime('22:30');
    await native.settle();
    await native.finish();

    expect(storage.getItem('va-practice:data')).toBeNull();
    expect(storage.getItem('va-practice:reminder-time')).toBe('22:30');
  });

  /**
   * 票 09 的裝置上開關那一格存的是 `'on'`、時間那一格根本不存在，因此**跟著預設值走**。
   * 開關的狀態零行相容（仍然是開著的），但被叫的時刻會從票 09 的 06:00 變成 08:00
   * ——那是改預設值的必然結果，也正是票 18 訂正要的（見票裡那則）。
   */
  it('票 09 留下的裝置：開關照樣開著，時刻跟著預設值走', () => {
    const native = fakeNative('granted');
    const storage = fakeStorage();
    storage.setItem('va-practice:reminder', 'on');

    const reminder = createDailyReminder({ native, storage, plan: () => [] });

    expect(reminder.enabled()).toBe(true);
    expect(reminder.time()).toBe('08:00');
  });

  it('不成形的時間進不去，記著的那個不受影響', async () => {
    const { reminder, storage, native } = setup('granted');

    await reminder.enable();
    await native.finish();
    reminder.setTime('22:30');
    await native.settle();
    await native.finish();

    reminder.setTime('');
    reminder.setTime('25:99');
    reminder.setTime('晚上十點');
    await native.settle();

    expect(reminder.time()).toBe('22:30');
    expect(storage.getItem('va-practice:reminder-time')).toBe('22:30');
    // 沒有東西改變，也就不該有任何一趟重排。
    expect(native.outstanding()).toBe(0);
  });

  it('存進去的東西壞掉時退回預設值，不會排出一個看不懂的時刻', () => {
    const native = fakeNative('granted');
    const storage = fakeStorage();
    storage.setItem('va-practice:reminder', 'on');
    storage.setItem('va-practice:reminder-time', '25:99');

    const reminder = createDailyReminder({ native, storage, plan: () => [] });

    expect(reminder.time()).toBe('08:00');
  });
});

describe('開關的狀態', () => {
  it('預設是關的', () => {
    const { reminder } = setup();

    expect(reminder.enabled()).toBe(false);
  });

  it('開起來之後記在本機，重開 app 仍然是開的', async () => {
    const { reminder, storage, native } = setup();

    await reminder.enable();
    await native.finish();

    expect(reminder.enabled()).toBe(true);
    // 同一份 storage 重建一個，等同重開 app。
    const again = createDailyReminder({ native, storage, plan: () => [] });
    expect(again.enabled()).toBe(true);
  });

  it('關掉之後就是關的', async () => {
    const { reminder, native } = setup();

    await reminder.enable();
    await native.finish();
    reminder.disable();

    expect(reminder.enabled()).toBe(false);
  });

  it('開關不進使用者的資料：只占自己那一格，與卡片那一份無關', async () => {
    const { reminder, storage, native } = setup();

    await reminder.enable();
    await native.finish();

    expect(storage.getItem('va-practice:data')).toBeNull();
    expect(storage.getItem('va-practice:reminder')).not.toBeNull();
  });
});

describe('通知權限', () => {
  it('沒問過時請求一次，答應了就開起來並登記提醒', async () => {
    const { reminder, native } = setup('prompt');
    native.willAnswer('granted');

    await expect(reminder.enable()).resolves.toBe(true);
    await native.finish();

    expect(native.asked()).toBe(1);
    expect(reminder.enabled()).toBe(true);
    expect(native.applied[0]).toHaveLength(7);
  });

  it('被拒絕時開關維持關閉，一則提醒都不登記', async () => {
    const { reminder, native } = setup('prompt');
    native.willAnswer('denied');

    await expect(reminder.enable()).resolves.toBe(false);
    await native.settle();

    expect(reminder.enabled()).toBe(false);
    expect(native.outstanding()).toBe(0);
    expect(native.applied).toEqual([]);
  });

  it('已經被拒絕過的話不再請求第二次', async () => {
    const { reminder, native } = setup('denied');

    await expect(reminder.enable()).resolves.toBe(false);

    expect(native.asked()).toBe(0);
    expect(reminder.enabled()).toBe(false);
  });

  it('已經給過權限的話直接開起來，不再問一次', async () => {
    const { reminder, native } = setup('granted');

    await expect(reminder.enable()).resolves.toBe(true);
    await native.finish();

    expect(native.asked()).toBe(0);
    expect(reminder.enabled()).toBe(true);
  });

  it('權限還在時 verify 說是，畫面照記著的狀態畫就對了', async () => {
    const { reminder, native } = setup('granted');

    await reminder.enable();
    await native.finish();

    await expect(reminder.verify()).resolves.toBe(true);
    // 只是問一句，不該順手重排一趟。
    expect(native.outstanding()).toBe(0);
  });

  it('權限被收回時 verify 說不是，並就地把開關關掉、清空已登記的', async () => {
    const { reminder, native } = setup('granted');

    await reminder.enable();
    await native.finish();

    native.revoke();
    await expect(reminder.verify()).resolves.toBe(false);
    await native.finish();

    expect(reminder.enabled()).toBe(false);
    expect(native.applied[1]).toEqual([]);
  });

  it('開關本來就關著時 verify 說不是，不必問權限也不必動任何東西', async () => {
    const { reminder, native } = setup('granted');

    await expect(reminder.verify()).resolves.toBe(false);

    expect(native.outstanding()).toBe(0);
  });

  it('權限稍後在系統設定被收回時，開關自己關掉並清空已登記的', async () => {
    const { reminder, native } = setup('granted');

    await reminder.enable();
    await native.finish();

    native.revoke();
    reminder.refresh();
    await native.settle();
    await native.finish();

    expect(reminder.enabled()).toBe(false);
    // 清空是「重排成空的一批」，與關掉開關走同一條路徑。
    expect(native.applied[1]).toEqual([]);
  });
});

describe('資料一變就整批重排', () => {
  it('資料變了就依最新的那一份重登記', async () => {
    const context = setup('granted', [card('新卡')]);
    const { reminder, native } = context;

    await reminder.enable();
    await native.finish();
    expect(native.applied[0]?.[0]?.body).toBe('今天有 1 張到期');

    // 匯入一批單字。
    context.setCards([card('新卡'), card('第二張'), card('第三張')]);
    reminder.refresh();
    await native.settle();
    await native.finish();

    expect(native.applied[1]?.[0]?.body).toBe('今天有 3 張到期');
  });

  it('今天複習完、一張都不再到期時，重排成空的一批', async () => {
    const context = setup('granted', [card('新卡')]);
    const { reminder, native } = context;

    await reminder.enable();
    await native.finish();

    context.setCards([dueIn(30)]);
    reminder.refresh();
    await native.settle();
    await native.finish();

    expect(native.applied[1]).toEqual([]);
  });

  it('關著的時候什麼都不做，不為沒開提醒的人白跑一趟原生', async () => {
    const { reminder, native } = setup('granted');

    reminder.refresh();
    await native.settle();

    expect(native.outstanding()).toBe(0);
    expect(native.applied).toEqual([]);
  });

  it('關掉開關時清掉全部已登記的提醒', async () => {
    const { reminder, native } = setup('granted');

    await reminder.enable();
    await native.finish();

    reminder.disable();
    await native.finish();

    expect(native.applied[1]).toEqual([]);
  });

  it('重排期間的連續變動併成一趟，落地的是最新那一份', async () => {
    const context = setup('granted', [card('新卡')]);
    const { reminder, native } = context;

    await reminder.enable();
    await native.settle();

    // 第一趟還在路上時又改了兩次，例如匯入一批單字之後又複習了一張。
    context.setCards([card('新卡'), card('第二張')]);
    reminder.refresh();
    await native.settle();
    context.setCards([card('新卡'), card('第二張'), card('第三張')]);
    reminder.refresh();
    await native.settle();

    await native.finish();
    expect(native.applied[0]?.[0]?.body).toBe('今天有 1 張到期');

    // 被合併掉的那一份沒有意義，補的那一趟直接是最新的。
    await native.finish();
    expect(native.applied[1]?.[0]?.body).toBe('今天有 3 張到期');

    // 而且只補這一趟，不會一份一份補完。
    expect(native.outstanding()).toBe(0);
  });

  it('重排失敗時不重試，也不留下一個轉不停的迴圈', async () => {
    const { reminder, native } = setup('granted');

    await reminder.enable();
    await native.fail();

    expect(native.applied).toEqual([]);
    // 失敗後把機會留給下一次變動，與雲端推送同一個立場。
    expect(native.outstanding()).toBe(0);
  });

  it('重排失敗後，下一次資料變動照樣再排一趟', async () => {
    const context = setup('granted', [card('新卡')]);
    const { reminder, native } = context;

    await reminder.enable();
    await native.fail();

    context.setCards([card('新卡'), card('第二張')]);
    reminder.refresh();
    await native.settle();
    await native.finish();

    expect(native.applied[0]?.[0]?.body).toBe('今天有 2 張到期');
  });
});
