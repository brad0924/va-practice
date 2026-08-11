import Foundation
import Capacitor
import UserNotifications

/// 每日提醒的原生那一端：問通知權限，以及把一整批提醒登記進系統。
///
/// 沒有狀態、沒有排程計算、沒有合併閘門——哪幾天要叫、各幾張、幾點叫，
/// 全部在 TypeScript 那一側決定（`src/lib/reminders.ts` 與 `src/lib/daily-reminder.ts`），
/// 那裡測得到，這裡測不到。
///
/// 不用 `@capacitor/local-notifications` 的理由與其餘四支插件相同：原生實作留在
/// 自己的 repo 裡，且這四支方法不值得多牽一條 npm 依賴。
@objc(DailyReminderPlugin)
public class DailyReminderPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DailyReminderPlugin"
    public let jsName = "DailyReminder"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "permission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "request", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "replaceAll", returnType: CAPPluginReturnPromise)
    ]

    private let center = UNUserNotificationCenter.current()

    /// 登記時共用的識別碼字首。
    ///
    /// **清空那一步沒有用到它**——底下清的是本 app 全部待發的通知，因為目前只有這一種。
    /// 哪天多出第二種，這裡要改成先撈出待發清單、只清這個字首開頭的那些；
    /// 現在不先寫那段，是因為它一行都還沒有人需要。
    private static let idPrefix = "daily-reminder-"

    /// 目前的權限。**不跳任何對話框**——「還沒問過」與「已經拒絕」在這裡分得出來，
    /// JS 那側才做得到「不重複請求」（見 spec 決定二十四）。
    @objc func permission(_ call: CAPPluginCall) {
        center.getNotificationSettings { settings in
            call.resolve(["state": Self.name(of: settings.authorizationStatus)])
        }
    }

    /// 跳一次系統對話框。使用者按過一次之後系統不會再跳，只會靜靜地回同一個答案，
    /// 因此呼叫端必須先問 `permission()`。
    @objc func request(_ call: CAPPluginCall) {
        // 只要 alert 與 sound。**不要 badge**——這支 app 一個地方都沒有設過紅點數字，
        // 多要一項用不到的權限只會讓那張對話框看起來比實際上更貪心。
        center.requestAuthorization(options: [.alert, .sound]) { granted, error in
            if let error = error {
                call.reject(error.localizedDescription)
                return
            }
            call.resolve(["state": granted ? "granted" : "denied"])
        }
    }

    /// 先清掉全部已登記的提醒，再登記這一批。空陣列即為全部清掉。
    ///
    /// 「複習完就不再被叫」與「匯入一批卡後數字立刻正確」走的是同一條路徑，
    /// 因此這裡不需要任何個別取消的邏輯（見 spec 決定二十一）。
    @objc func replaceAll(_ call: CAPPluginCall) {
        guard let reminders = call.getArray("reminders", JSObject.self) else {
            call.reject("沒有帶 reminders")
            return
        }

        center.removeAllPendingNotificationRequests()

        // 每一則都是一次非同步登記，全部回來了才算這一趟結束——
        // JS 那側的閘門靠這個 promise 判斷「上一趟回來了沒」。
        let group = DispatchGroup()
        let lock = NSLock()
        var failure: String?

        for item in reminders {
            guard let request = Self.notificationRequest(from: item) else { continue }
            group.enter()
            center.add(request) { error in
                if let error = error {
                    lock.lock()
                    // 只留第一個錯誤：呼叫端拿它去寫 log，不做分類。
                    if failure == nil { failure = error.localizedDescription }
                    lock.unlock()
                }
                group.leave()
            }
        }

        group.notify(queue: .main) {
            if let failure = failure {
                call.reject(failure)
                return
            }
            call.resolve()
        }
    }

    /// 把 JS 遞來的一則翻成系統認得的登記。少了任何一個欄位就跳過這一則——
    /// 寧可少叫一天，也不要用一個猜出來的日期去吵人。
    private static func notificationRequest(from item: JSObject) -> UNNotificationRequest? {
        guard let id = int(item["id"]),
              let title = item["title"] as? String,
              let body = item["body"] as? String,
              let year = int(item["year"]),
              let month = int(item["month"]),
              let day = int(item["day"]),
              let hour = int(item["hour"]),
              let minute = int(item["minute"]) else {
            return nil
        }

        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default

        // 年月日時分五個都給滿，`repeats` 為 false：這是某一天早上的一次提醒，
        // 不是每天重複的鬧鐘——張數天天不同，重複的那種說不出正確的數字。
        var components = DateComponents()
        components.year = year
        components.month = month
        components.day = day
        components.hour = hour
        components.minute = minute

        // 用當地時區解讀，與 JS 那側算日期時用的是同一把尺。
        let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: false)
        return UNNotificationRequest(identifier: "\(idPrefix)\(id)", content: content, trigger: trigger)
    }

    /// 橋過來的數字是 `NSNumber`，直接 `as? Int` 在某些路徑上會落空，因此兩條都試。
    private static func int(_ value: JSValue?) -> Int? {
        if let number = value as? NSNumber { return number.intValue }
        return value as? Int
    }

    /// `.provisional` 與 `.ephemeral` 都算給過權限：通知送得出去，
    /// 差別只在會不會出現在鎖定畫面上，那不是這支 app 分得出來也管得著的事。
    private static func name(of status: UNAuthorizationStatus) -> String {
        switch status {
        case .notDetermined: return "prompt"
        case .denied: return "denied"
        default: return "granted"
        }
    }
}
