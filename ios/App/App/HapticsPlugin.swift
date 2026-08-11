import UIKit
import Capacitor

/// 評分觸覺的原生那一端：輕輕震一下，告訴使用者這一下被記到了。
///
/// 只有 impact 一支，也不打算有第二支——觸覺只加在評分這一處（見 spec 決定二十五）。
/// 四個評分共用同一種回饋，因此連參數都不必帶：輕重是使用者自己的判斷，
/// 程式不該用震動替它加註解。
///
/// 用 `.light` 而不是 `.medium`／`.heavy` 或 `UINotificationFeedbackGenerator`：
/// 目的是「確認」不是「警示」。
///
/// 不用 `@capacitor/haptics` 的理由不在功能——官方那支的 `ImpactStyle.Light`
/// 打到的是底下同一個 API，手指摸起來一樣。理由是往原生走的路上少一條要拔的線，
/// 並讓原生實作留在自己的 repo 裡，與其餘三支插件同一個立場。
@objc(HapticsPlugin)
public class HapticsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HapticsPlugin"
    public let jsName = "Haptics"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "impact", returnType: CAPPluginReturnPromise)
    ]

    /// 這顆留著不重建。每次現做一顆的話，第一下常常慢半拍甚至是啞的——
    /// 震動硬體要先被叫醒（`prepare()`），而叫醒的效果只跟著同一顆 generator。
    private let generator = UIImpactFeedbackGenerator(style: .light)

    @objc func impact(_ call: CAPPluginCall) {
        // 插件的方法跑在背景執行緒上，回饋則要在主執行緒上發，與 SpeechPlugin 同一個理由。
        DispatchQueue.main.async { [weak self] in
            guard let self else {
                call.resolve()
                return
            }

            self.generator.impactOccurred()
            // 震完順手再叫醒一次：下一張卡通常就在幾秒內評分，那一下才不會慢半拍。
            // 一輪複習裡只有第一下是冷的，之後都是熱的。
            self.generator.prepare()

            // 不回報結果：呼叫端只是評了一次分，不等震動結束。
            call.resolve()
        }
    }
}
