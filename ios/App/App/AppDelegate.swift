import UIKit
import Capacitor
import FirebaseCore
import FirebaseAppCheck

/// App Check 一律走 App Attest，不要退回 DeviceCheck。
///
/// 部署目標是 iOS 15，`AppAttestProvider`（需要 iOS 14）永遠可用，因此不寫版本判斷。
/// 回傳 nil 代表這台裝置不支援，那時 Firebase 自己會處理，我們不要偷偷換一套。
final class AppAttestOnlyProviderFactory: NSObject, AppCheckProviderFactory {
    func createProvider(with app: FirebaseApp) -> AppCheckProvider? {
        AppAttestProvider(app: app)
    }
}

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // App Check 的 provider 必須在 `FirebaseApp.configure()` **之前**指定，晚了就來不及——
        // App Check 會在 configure 的時候用出廠預設（iOS 上是 DeviceCheck）把自己建好，
        // 之後再指定也換不回來。
        //
        // `@capacitor-firebase/app-check` 這兩件事分在兩個時間點做：它在外掛載入時就
        // `FirebaseApp.configure()`，而「請用 App Attest」要等 JS 呼叫 `initialize()` 才發生。
        // 順序因此一定是反的。2026-08-20 真機實測到的後果：權杖請求打到
        // `…:exchangeDeviceCheckToken`，Firebase 回 `App not registered`——
        // 後台只登記了 App Attest，app 卻拿 DeviceCheck 去換（見 .scratch/fixed-gemini-key/issues/01）。
        //
        // 這裡搶在外掛之前把兩件事按正確順序做完。`didFinishLaunchingWithOptions` 跑在
        // Capacitor 建立 bridge、載入外掛之前，是這支 app 裡最早的接縫。
        // 外掛的 `load()` 只在 `FirebaseApp.app() == nil` 時才 configure，因此不會重複做。
        AppCheck.setAppCheckProviderFactory(AppAttestOnlyProviderFactory())
        if FirebaseApp.app() == nil {
            FirebaseApp.configure()
        }
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}
