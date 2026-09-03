/**
 * 每日提醒接上原生那一端的接線。`expo-notifications` 只出現在這裡，
 * `core/lib/daily-reminder.ts` 因此維持可以在 vitest 裡測的純度，立場與 `haptics.ts` 相同。
 *
 * ## 為什麼走 `expo-notifications`，與 Capacitor 版相反
 *
 * Capacitor 版底下是 app 自己那支插件（`ios/App/App/DailyReminderPlugin.swift`），
 * 理由是「四支方法不值得多牽一條 npm 依賴」。**那筆帳在這裡算不出來**：
 * `mobile/.gitignore` 把 `/ios` 排除掉了，原生專案每次建置重新產生，所以自己寫 Swift
 * 除了那支檔還要多寫一支設定檔外掛把它塞進去（像 `../plugins/with-app-check-first.js`），
 * 再加上新架構的接線。實質是兩份工，換掉的只是一條官方套件的依賴（票 `19` 拍板）。
 *
 * ## 那支套件的設定檔外掛**刻意沒有**加進 `app.json`
 *
 * 它在 iOS 上只做三件事：塞一條 `aps-environment` entitlement、搬自訂通知音效檔、
 * 開遠端推播的背景模式。後兩件這支 app 都不做，第一件是**遠端推播**的宣告，
 * 而這張票只做本地通知（票 `19` 的〈Out of scope〉第三條）。
 *
 * 加了它，建置出來的 app 會帶著推播 entitlement，簽章時 Apple 會回頭查這個 App ID
 * 有沒有開 Push Notifications 能力，沒開就當場失敗——為了一個一則都不會發的功能。
 *
 * **不加它，本地通知一件事都不會少**：原生模組是靠 autolinking 進去的
 * （`node_modules/expo-notifications/expo-module.config.json` 列著那十個 module 與
 * 一個 AppDelegate subscriber），與設定檔外掛無關。2026-09-02 維護者拍板不加。
 * 哪天真的要做遠端推播，那時再把它加回來。
 *
 * ### 但「不寫進 `app.json`」擋不住那格權限（2026-09-03 訂正）
 *
 * 上面預言的失敗真的發生了，而且**是在已經照做的情況下發生的**：第一趟 TestFlight build
 * 倒在「provisioning profile 沒有 Push Notifications 能力」。
 *
 * 原因是 `expo-notifications` 被列在 `@expo/prebuild-config` 的 `versionedExpoSDKPackages`
 * 裡，`expo prebuild` 會**自動套用**它的設定檔外掛，跟 `app.json` 寫了什麼無關。
 * 現在改成讓它加、然後由 `../plugins/without-push-entitlement.js` 拿掉，
 * 那支外掛有測試守著（票 `20`）。這一段的**結論沒有變**，變的是怎麼做到。
 *
 * ## `setNotificationHandler()` 也**刻意沒有**設，寫下來免得日後被當成漏掉
 *
 * 套件文件在 `scheduleNotificationAsync()` 底下寫著「不設處理器的話通知不會被呈現」。
 * 那句話只對**前景**成立：它設的是 `userNotificationCenter(_:willPresent:)` 那個 delegate，
 * 而 iOS 只在 app 正開著的時候叫它（見套件的 `NotificationCenterManager.swift`）。
 * app 在背景或關著時，系統直接顯示，一個 delegate 都不經過。
 *
 * 這支 app 的提醒本來就是要在使用者**沒**開著它的時候叫他，而且今天那一則有一道閘門是
 * 「提醒時間還沒到」（`planReminders()`）。前景不彈是對的行為，不是缺口。
 * Capacitor 版那一側也沒有設過對應的東西。
 *
 * 本模組不寫自動測試：原生模組在 Node 環境下不存在，硬要測就得造一整套假物件，
 * 測到的只是自己寫的假貨（與 `haptics.ts`、`keychain-native.ts` 同一個理由）。
 * 守得住的那一半——開關的行為、什麼時候重排——由 `../ui/data-screen.test.tsx` 與
 * `./app-context.test.tsx` 遞假的進去驗，其餘靠真機的手動驗收清單。
 */
import * as Notifications from 'expo-notifications';
import {
  createDailyReminder,
  type DailyReminder,
  type ReminderPermission,
  type ScheduledReminder,
} from '@core/lib/daily-reminder';
import type { StorageLike } from '@core/lib/storage';

/**
 * 登記時共用的識別碼字首。
 *
 * **清空那一步沒有用到它**——底下清的是本 app 全部待發的通知，因為目前只有這一種。
 * 哪天多出第二種，這裡要改成先撈出待發清單、只清這個字首開頭的那些；現在不先寫那段，
 * 是因為它一行都還沒有人需要。與 `DailyReminderPlugin.swift` 同一個立場。
 */
const ID_PREFIX = 'daily-reminder-';

/**
 * 把系統的權限狀態翻成 `core/` 那三個字。
 *
 * **看的是 iOS 自己那一格，不是跨平台的 `granted`**：`.provisional` 與 `.ephemeral`
 * 都算給過權限（通知送得出去，差別只在會不會出現在鎖定畫面上，那不是這支 app 分得出來
 * 也管得著的事），而跨平台那一格會把它們算成「還沒給」。這條對法與
 * `DailyReminderPlugin.swift` 的 `name(of:)` 逐條一致。
 *
 * `ios` 讀不到時才退回跨平台那兩格。這支 app 只出 iOS（`app.json` 的 `platforms`），
 * 那條路正常不會走到，留著是為了不在讀不出東西時丟例外。
 */
function toPermission(status: Notifications.NotificationPermissionsStatus): ReminderPermission {
  const ios = status.ios?.status;
  if (ios !== undefined) {
    if (ios === Notifications.IosAuthorizationStatus.NOT_DETERMINED) return 'prompt';
    if (ios === Notifications.IosAuthorizationStatus.DENIED) return 'denied';
    return 'granted';
  }
  if (status.granted) return 'granted';
  return status.canAskAgain ? 'prompt' : 'denied';
}

/**
 * 先清掉全部已登記的提醒，再登記這一批。空陣列即為全部清掉。
 *
 * 那一批同時送出去、全部回來了才算這一趟結束——`createDailyReminder()` 的閘門靠這個
 * promise 判斷「上一趟回來了沒」。`Promise.all` 與 Swift 那邊的 `DispatchGroup` 同一件事。
 */
async function replaceAll(reminders: readonly ScheduledReminder[]): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  await Promise.all(
    reminders.map((reminder) =>
      Notifications.scheduleNotificationAsync({
        identifier: `${ID_PREFIX}${reminder.id}`,
        content: {
          title: reminder.title,
          body: reminder.body,
          // 不指定的話這一則是靜音的。與 `DailyReminderPlugin.swift` 的 `.default` 對齊。
          sound: 'default',
        },
        /**
         * 年月日時分五個都給滿，`repeats` 為 false：這是某一天早上的一次提醒，
         * 不是每天重複的鬧鐘——張數天天不同，重複的那種說不出正確的數字。
         *
         * **`month` 直接遞 1–12，不 `-1`。照文件改成 0 起算之前先讀完這一段。**
         *
         * `CALENDAR` 這一種在原生那側是把數字原封塞進 `DateComponents`
         * （`TriggerRecords.swift` 的 `CalendarTriggerRecord.dateComponentsFrom()`），
         * 而 `DateComponents.month` 本來就是 1 起算的。
         *
         * 套件文件那句「所有欄位照 JavaScript `Date` 的範圍，一月是 0」**掛在
         * `MONTHLY` 與 `YEARLY` 那兩種上，不是這一種**——只有那兩支的 Swift 真的寫著
         * `month: self.month + 1`，`CalendarTriggerRecord` 一個 `+1` 都沒有。
         * 文件那一頁把三種排在一起，很容易讀成同一條規則（2026-09-02 差點照著改）。
         *
         * `ScheduledReminder.month` 刻意定成 1–12 正是為了這一步不必再翻一次，
         * 與 `DailyReminderPlugin.swift` 走的是同一條路徑（`UNCalendarNotificationTrigger`
         * 配 `DateComponents`），兩版因此不會在這裡分岔。
         */
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
          year: reminder.year,
          month: reminder.month,
          day: reminder.day,
          hour: reminder.hour,
          minute: reminder.minute,
          repeats: false,
        },
      }),
    ),
  );
}

/**
 * 這台裝置的每日提醒。
 *
 * **不像 Capacitor 版那樣會回 null**：那一支要應付「同一份程式碼也跑在瀏覽器裡」，
 * 而這裡沒有網頁版這條分岔，每一台都是真的 iPhone。
 */
export function createNativeDailyReminder(
  storage: StorageLike,
  plan: (time: string) => readonly ScheduledReminder[],
): DailyReminder {
  return createDailyReminder({
    storage,
    plan,
    native: {
      permission: async () => toPermission(await Notifications.getPermissionsAsync()),
      /**
       * 只要 alert 與 sound。**不要 badge**——這支 app 一個地方都沒有設過紅點數字，
       * 多要一項用不到的權限只會讓那張對話框看起來比實際上更貪心。
       * 不寫這一段的話套件預設連 badge 一起要，因此這裡非給不可。
       */
      request: async () =>
        toPermission(
          await Notifications.requestPermissionsAsync({
            ios: { allowAlert: true, allowSound: true },
          }),
        ),
      replaceAll,
    },
  });
}
