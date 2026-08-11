import Foundation
import AVFoundation
import Capacitor

/// 日文朗讀的原生那一端：用 `AVSpeechSynthesizer` 念出收到的那串讀音文字。
///
/// 只有 speak 一支。念什麼由 TypeScript 那一側決定（`src/ui/speech.ts` 先跑
/// `toReadingText()`，聽到的與卡片教的讀法一致，見 spec 決定十六）；
/// 挑語音、選語速、中斷前一次則在這裡，因為那三件事都只有原生 API 答得出來。
///
/// 不走 Web Speech 的理由是音質：iOS 的 Web Speech 底層雖然也是這支合成器，
/// 卻只拿得到 compact（壓縮）品質的語音，那就是真機實測聽到的機械感來源
/// （見 spec 決定十五）。重音（高低アクセント）不在此改善之列——原生同樣是從假名
/// 推測，換引擎不保證解決。
@objc(SpeechPlugin)
public class SpeechPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SpeechPlugin"
    public let jsName = "Speech"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "speak", returnType: CAPPluginReturnPromise)
    ]

    /// 合成器得活得比一次朗讀久，否則話還沒念完就被回收，聲音會被切掉。
    /// 它同時也是「連按兩次不會疊在一起念」的所在：中斷的對象是同一台合成器。
    private let synthesizer = AVSpeechSynthesizer()

    /// 網頁版那條路用的是 Web Speech 的 0.9 倍速，這裡取聽感相當的值。
    /// 兩把尺不同——`AVSpeechUtterance` 的正常速度是 `AVSpeechUtteranceDefaultSpeechRate`
    /// （0.5）而不是 1.0，因此照著比例縮，不是直接填 0.9（那會快到聽不清楚）。
    private static let rate = AVSpeechUtteranceDefaultSpeechRate * 0.9

    /// 語音清單不會在 app 執行中變動，挑一次就好。
    private lazy var voice: AVSpeechSynthesisVoice? = Self.bestJapaneseVoice()

    @objc func speak(_ call: CAPPluginCall) {
        guard let text = call.getString("text") else {
            call.reject("沒有帶 text")
            return
        }

        // 插件的方法跑在背景執行緒上，合成器則要在主執行緒上使喚。
        DispatchQueue.main.async { [weak self] in
            guard let self else {
                call.resolve()
                return
            }

            // 連續快速點朗讀時，前一次立刻停掉，不會兩句疊在一起念。
            // `.immediate` 而不是 `.word`：使用者按下一次就是不想再聽上一次。
            self.synthesizer.stopSpeaking(at: .immediate)

            let utterance = AVSpeechUtterance(string: text)
            utterance.voice = self.voice
            utterance.rate = Self.rate
            self.synthesizer.speak(utterance)

            // 念完不回報：呼叫端只是點了一顆按鈕，不等聲音結束。
            call.resolve()
        }
    }

    /// 挑品質最好的那個日文語音。
    ///
    /// `quality` 由差到好是 `.default`（compact）、`.enhanced`、`.premium`，rawValue
    /// 遞增，因此取最大的那個就是最好的。enhanced 與 premium 要使用者自己到
    /// 「設定 → 輔助使用 → 朗讀內容 → 語音」下載，沒下載時這裡拿到的仍是 compact，
    /// 朗讀照常可用——只是聽起來與改動前一樣（見 spec 決定十五）。
    ///
    /// 清單真的空了才退回 `AVSpeechSynthesisVoice(language:)`；再拿不到就交回 nil，
    /// 系統會用當前語言的預設語音念，那總比不出聲好。
    private static func bestJapaneseVoice() -> AVSpeechSynthesisVoice? {
        let japanese = AVSpeechSynthesisVoice.speechVoices().filter { $0.language.hasPrefix("ja") }
        let best = japanese.max { $0.quality.rawValue < $1.quality.rawValue }
        return best ?? AVSpeechSynthesisVoice(language: "ja-JP")
    }
}
