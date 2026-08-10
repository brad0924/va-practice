import Foundation
import Capacitor
import Security

/// 雲端備份的暱稱與密碼，存進 iOS Keychain 並標記為可同步到 iCloud 鑰匙圈。
///
/// 只有 read／write／remove 三支，沒有狀態、沒有排程——預載、排隊與失敗時怎麼辦
/// 都在 TypeScript 那一側（`src/lib/keychain.ts`），那裡測得到，這裡測不到。
///
/// 不存 localStorage 的理由：那份資料跟著 WebView 走，換一支手機就沒了，
/// 而使用者可能一年沒輸入過那組密碼。Keychain 的項目則會隨 iCloud 鑰匙圈到新裝置，
/// 且鑰匙圈是端對端加密的，Apple 自己讀不到內容（見 spec 決定十）。
@objc(KeychainPlugin)
public class KeychainPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "KeychainPlugin"
    public let jsName = "Keychain"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "read", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "write", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise)
    ]

    /// Keychain 裡認出「這幾筆是這支 app 的」的那個名字。項目本身走 app 預設的
    /// access group，因此不需要 Keychain Sharing 這個 capability。
    private static let service = "io.github.brad0924.vapractice"

    /// 讀、寫、刪共用同一組條件。
    ///
    /// `kSecAttrSynchronizable` 就是「換手機時密碼自動跟著走」那一行，它同時也是
    /// **查詢條件**：三支方法必須一致地帶著它，否則寫進去的是可同步的那一批、
    /// 讀的卻是只存本機的那一批，永遠對不上。
    ///
    /// 使用者沒開 iCloud 鑰匙圈時不會失敗，只是那一筆留在本機不同步——
    /// 功能照常運作（見 spec 決定十）。
    private static func query(_ key: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecAttrSynchronizable as String: kCFBooleanTrue!
        ]
    }

    @objc func read(_ call: CAPPluginCall) {
        guard let key = call.getString("key") else {
            call.reject("沒有帶 key")
            return
        }

        var query = Self.query(key)
        query[kSecReturnData as String] = kCFBooleanTrue!
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecItemNotFound {
            // 還沒登入過。不帶 value 回去，JS 那側會當成未登入照常啟動。
            call.resolve([:])
            return
        }
        guard status == errSecSuccess,
              let data = item as? Data,
              let value = String(data: data, encoding: .utf8) else {
            call.reject("讀取 Keychain 失敗（\(status)）")
            return
        }
        call.resolve(["value": value])
    }

    @objc func write(_ call: CAPPluginCall) {
        guard let key = call.getString("key"), let value = call.getString("value") else {
            call.reject("沒有帶 key 或 value")
            return
        }

        let data = Data(value.utf8)
        let query = Self.query(key)

        // 先當作已經有那一筆（換密碼就是這條路），沒有才新增。
        // 反過來寫（先刪再加）會在中間開出一個兩邊都沒有的窗口，沒有必要。
        let updated = SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary)
        if updated == errSecSuccess {
            call.resolve()
            return
        }
        guard updated == errSecItemNotFound else {
            call.reject("寫入 Keychain 失敗（\(updated)）")
            return
        }

        var insert = query
        insert[kSecValueData as String] = data
        // 開機後第一次解鎖過就讀得到。這一份是啟動時第一件要用的東西，
        // 而 `ThisDeviceOnly` 那幾種與 iCloud 鑰匙圈同步互斥，不能用。
        insert[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock

        let added = SecItemAdd(insert as CFDictionary, nil)
        guard added == errSecSuccess else {
            call.reject("寫入 Keychain 失敗（\(added)）")
            return
        }
        call.resolve()
    }

    @objc func remove(_ call: CAPPluginCall) {
        guard let key = call.getString("key") else {
            call.reject("沒有帶 key")
            return
        }

        let status = SecItemDelete(Self.query(key) as CFDictionary)
        // 本來就沒有那一筆，與剛剛刪掉了是同一個結果：使用者要的是「不要再記著」。
        guard status == errSecSuccess || status == errSecItemNotFound else {
            call.reject("清除 Keychain 失敗（\(status)）")
            return
        }
        call.resolve()
    }
}
