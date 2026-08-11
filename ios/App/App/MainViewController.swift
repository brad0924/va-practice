import UIKit
import Capacitor

/// 只為了註冊住在 app 自己這個 target 裡的那幾支插件而存在。
///
/// Capacitor 6 之後，住在 app 自己這個 target 裡的插件不會被自動掃描到——
/// 自動註冊只涵蓋 `cap sync` 從 node_modules 找到的那些。因此得自己在 bridge
/// 載入後註冊一次，而唯一的掛載點是 `CAPBridgeViewController` 的子類。
///
/// 指向這個子類的是 `SceneDelegate`，**不是 `Main.storyboard`**：
/// storyboard 建好的 root 會被 `SceneDelegate` 整個換掉，改那裡沒有任何作用。
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(SafetyCopyPlugin())
        bridge?.registerPluginInstance(KeychainPlugin())
        bridge?.registerPluginInstance(SpeechPlugin())
        bridge?.registerPluginInstance(HapticsPlugin())
    }
}
