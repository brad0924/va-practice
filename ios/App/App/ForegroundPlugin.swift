import UIKit
import Capacitor

/// 「app 回到前景了」這條訊號的原生那一端。
///
/// 存在的理由只有一個：這個 app 只在啟動時決定「今天是幾號」，而原生 app 從背景
/// 醒來不會重新載入頁面（iOS 的設計，不是機率問題）。跨過午夜之後，網頁層必須
/// 被告知一聲，才有機會把複習佇列換成當日那份。
///
/// 網頁那一側另有一條訊號（`document` 的可見性變化事件）。那條在 WKWebView 裡
/// 可靠不可靠，本專案沒有驗過，而驗一次要跑完一輪 TestFlight——因此兩條都送，
/// 第一版就會動。網頁層那支檢查是冪等的，兩條都到與只到一條結果相同。
///
/// 不用 `@capacitor/app` 的理由與其餘五支插件相同：原生實作留在自己的 repo 裡，
/// 且不值得為了一個事件多牽一條 npm 依賴。
@objc(ForegroundPlugin)
public class ForegroundPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ForegroundPlugin"
    public let jsName = "Foreground"
    /// 一支方法都沒有：這支插件只送事件，不接受呼叫。
    /// `addListener` 不必登記在這裡——橋自己認得它（見 `CapacitorBridge.swift`）。
    public let pluginMethods: [CAPPluginMethod] = []

    /// 插件被註冊時叫一次（見 `MainViewController`）。監聽從此掛著不解除：
    /// 這條訊號與 app 同生共死，沒有天然的解除時機。
    override public func load() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(willEnterForeground),
            // 用 willEnterForeground 而不是 didBecomeActive：後者連「拉下通知中心
            // 再收起來」這種沒離開過 app 的情況都會叫，而那時日期不可能變。
            // 冷啟動不會送這一個，那條路本來就會重新算日期，不必也不該重複。
            name: UIApplication.willEnterForegroundNotification,
            object: nil
        )
    }

    @objc private func willEnterForeground() {
        // 不帶內容：跳到前景這件事本身就是全部，日期由網頁層自己去看。
        notifyListeners("foreground", data: nil)
    }
}
