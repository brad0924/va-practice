import Foundation
import Capacitor

/// 保險副本的原生那一端：把整份資料寫進 App Group 的 UserDefaults。
///
/// 只有 read 與 write 兩支，沒有狀態、沒有排程、沒有錯誤分類——
/// 合併閘門與還原判斷都在 TypeScript 那一側（`src/lib/safety-copy.ts`），
/// 那裡測得到，這裡測不到。
///
/// 不用 `@capacitor/preferences` 的理由只有一個：它的 `group` 參數只是加在 key
/// 前面的一段字首，底層一律寫進 `UserDefaults.standard`，也就是 app 私有的那一份，
/// 第二版的 Widget 讀不到（見 spec 決定九）。
@objc(SafetyCopyPlugin)
public class SafetyCopyPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SafetyCopyPlugin"
    public let jsName = "SafetyCopy"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "read", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "write", returnType: CAPPluginReturnPromise)
    ]

    /// 必須與 `App.entitlements` 裡的那一個一字不差。
    ///
    /// 對不上時**不會有任何錯誤**：`UserDefaults(suiteName:)` 照樣回一個能用的物件，
    /// 只是寫進去的東西 Widget 讀不到。因此底下那道 guard 擋的只是 suiteName
    /// 本身不合法（nil、等於 bundle id、等於 global domain）這幾種情況，
    /// 擋不到 entitlement 沒配好——那件事只有真機上 Widget 讀不到時才看得出來。
    private static let appGroup = "group.io.github.brad0924.vapractice"

    /// 整份資料就存這一個鍵。副本永遠是完整的一份，沒有第二個鍵要管。
    private static let key = "safety-copy"

    private var shared: UserDefaults? {
        UserDefaults(suiteName: Self.appGroup)
    }

    @objc func read(_ call: CAPPluginCall) {
        guard let defaults = shared else {
            call.reject("讀不到 App Group \(Self.appGroup)")
            return
        }
        guard let value = defaults.string(forKey: Self.key) else {
            // 還沒有副本。不帶 value 回去，JS 那側會當成「沒有副本」照常初始化。
            call.resolve([:])
            return
        }
        call.resolve(["value": value])
    }

    @objc func write(_ call: CAPPluginCall) {
        guard let value = call.getString("value") else {
            call.reject("沒有帶 value")
            return
        }
        guard let defaults = shared else {
            call.reject("寫不進 App Group \(Self.appGroup)")
            return
        }
        defaults.set(value, forKey: Self.key)
        call.resolve()
    }
}
