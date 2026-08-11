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
        CAPPluginMethod(name: "speak", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "describeVoices", returnType: CAPPluginReturnPromise)
    ]

    /// 合成器得活得比一次朗讀久，否則話還沒念完就被回收，聲音會被切掉。
    /// 它同時也是「連按兩次不會疊在一起念」的所在：中斷的對象是同一台合成器。
    private let synthesizer = AVSpeechSynthesizer()

    /// 網頁版那條路用的是 Web Speech 的 0.9 倍速，這裡取聽感相當的值。
    /// 兩把尺不同——`AVSpeechUtterance` 的正常速度是 `AVSpeechUtteranceDefaultSpeechRate`
    /// （0.5）而不是 1.0，因此照著比例縮，不是直接填 0.9（那會快到聽不清楚）。
    private static let rate = AVSpeechUtteranceDefaultSpeechRate * 0.9

    /// 使用者可能在 app 開著的時候去設定裡換語音或下載新的，因此每次朗讀都重挑一次。
    /// 這一趟只是過濾一個十幾筆的陣列，比「挑一次就好」省下的那點時間不值得換來
    /// 「換了設定要重開 app 才生效」這個解釋不清的行為（見票 15）。
    private var voice: AVSpeechSynthesisVoice? {
        Self.japaneseVoice()
    }

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

    /// 挑要用哪一顆日文語音：**先看系統選的那顆，再在同一顆裡挑品質最好的版本。**
    ///
    /// 票 07 原本是「全清單挑品質最高的」，完全不看系統設定——使用者在
    /// 「設定 → 輔助使用 → 朗讀內容」把日文語音換成別顆，這支 app 毫無反應（見票 15）。
    ///
    /// 同一顆語音常有 compact 與 enhanced 兩個版本，因此依**名字**收攏後再取品質最高的，
    /// 使用者只要下載了增強版就會自動用上，不必再回來選一次。
    ///
    /// 代價：使用者選的那顆若只有 compact，而別顆有 enhanced，這裡會挑前者——
    /// 音質不是最好的。那是尊重使用者選擇要付的錢，不加「差太多就不跟隨」這種
    /// 說不清界線的例外。
    ///
    /// 系統預設拿不到時才退回全清單品質最高的那顆；再拿不到就交回 nil，
    /// 系統會用當前語言的預設語音念，那總比不出聲好。
    private static func japaneseVoice() -> AVSpeechSynthesisVoice? {
        let japanese = AVSpeechSynthesisVoice.speechVoices().filter { $0.language.hasPrefix("ja") }
        let best = japanese.max { $0.quality.rawValue < $1.quality.rawValue }

        guard let preferred = AVSpeechSynthesisVoice(language: "ja-JP") else { return best }
        let sameVoice = japanese.filter { $0.name == preferred.name }
        return sameVoice.max { $0.quality.rawValue < $1.quality.rawValue } ?? preferred
    }

    // MARK: - 暫時的鷹架（票 15），驗完就拆

    /// 把原生這端看到的語音狀況回成一段可以直接截圖的文字。
    ///
    /// 存在的理由只有一個：開發機是 Windows，看不到 Safari 的除錯器，
    /// 「這支手機上有哪幾顆日文語音」在畫面上完全看不見。用完即拆，不是功能。
    @objc func describeVoices(_ call: CAPPluginCall) {
        let japanese = AVSpeechSynthesisVoice.speechVoices().filter { $0.language.hasPrefix("ja") }
        let preferred = AVSpeechSynthesisVoice(language: "ja-JP")

        var lines = ["當前語言：\(AVSpeechSynthesisVoice.currentLanguageCode())"]
        lines.append("系統預設：\(Self.describe(preferred))")
        lines.append("實際挑到：\(Self.describe(Self.japaneseVoice()))")
        lines.append("清單共 \(japanese.count) 顆日文語音：")
        lines.append(contentsOf: japanese.map { "・\(Self.describe($0))" })

        call.resolve(["report": lines.joined(separator: "\n")])
    }

    private static func describe(_ voice: AVSpeechSynthesisVoice?) -> String {
        guard let voice else { return "（沒有）" }
        let quality: String
        switch voice.quality.rawValue {
        case 3: quality = "premium 優質"
        case 2: quality = "enhanced 增強"
        default: quality = "compact 壓縮"
        }
        return "\(voice.name)／\(quality)／\(voice.language)／\(voice.identifier)"
    }
}
