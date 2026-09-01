# React Native 版的密碼用 `react-native-keychain`，不用 `expo-secure-store`

React Native 版把雲端備份的暱稱與密碼存進 iOS Keychain 時，拉的是 `react-native-keychain` v10
並開 `cloudSync: true`，而不是 Expo 官方的 `expo-secure-store`。**理由只有一個：官方那支沒有
iCloud 鑰匙圈同步。**

決策的完整經過見 `.scratch/rn-rewrite/issues/17-keychain-and-device-consent.md`。

## 為什麼這件事值得記一筆

這支 app 的其餘原生能力清一色走 `expo-*`（`expo-haptics`、`expo-speech`、`expo-clipboard`、
`expo-file-system`、`expo-localization`⋯⋯）。在這樣一份相依清單裡冒出一支非 Expo 的原生模組，
下一個讀到的人一定會問「為什麼不用 `expo-secure-store`」——而且很可能順手把它換掉。

換掉的代價不只是改一支 import：`kSecAttrSynchronizable` 決定那筆密碼會不會存在於使用者的
其他裝置上，換套件等於改變資料的存放範圍，而且要重新出包才驗得到。

## 差在哪

`expo-secure-store` 的 iOS 選項只有 `keychainService`、`keychainAccessible`、
`requireAuthentication`、`authenticationPrompt`、`accessGroup`。**沒有 `kSecAttrSynchronizable`
的對應項**，文件裡也沒有任何跨裝置同步的說法。

`react-native-keychain` v10 有。`src/types.ts` 那一行寫著：

```ts
/** Whether to synchronize the keychain item to iCloud.
 * @platform iOS
 */
cloudSync?: boolean;
```

## 為什麼非要 iCloud 同步不可

**因為整個「這台裝置要不要接」的機制是為它而存在的。**

`core/lib/cloud-consent.ts` 的檔頭記著它的來歷：票 `06` 真機驗證時發現，第二台裝置一裝好就已經
是登入狀態（密碼跟著 iCloud 鑰匙圈走過去了），**問都沒問就把整份雲端資料拉了下來**。訂正後的
規則是「密碼跟著走，同意不跟著走」。

沒有 iCloud 同步的話，這件事從來不會發生——新裝置那一格是空的，`wantsPull()` 第一行就
`return false`。票 `10` 當初不接 `cloud-consent.ts`，寫的正是這個理由。

跟著失效的還有兩處對使用者的承諾：隱私權政策寫的「iOS 版存在系統的 Keychain 裡」，
以及 `data.cloudHint` 那段「把密碼交給 iCloud 鑰匙圈保管降低忘記的機率」——密碼同時是加密金鑰，
遺失即無法復原（`ADR-0003`），那句話不是客套。

## Consequences

**新架構不是問題。** v10 的 `package.json` 有 `codegenConfig`（`type: "modules"`），是 TurboModule；
沒有 Expo 設定檔外掛，靠 autolinking 接上，prebuild 之後就在。

**接線一行都不必寫。** `core/lib/keychain.ts` 那個中間人早就在了——它把非同步的 Keychain 包成
`StorageLike` 同步介面（`ADR-0002` 那個介面不改），Capacitor 版已經在用同一支。這次只多一支
`mobile/lib/keychain-native.ts` 把套件的三支方法接上去。

**「停止同步」因此不能再刪 Keychain 那一筆。** `SecItemDelete` 會把刪除同步到使用者所有的裝置，
在手機上按一下就讓電腦上的密碼一起消失，而那句確認文字只講了這一台。React Native 版的
「停止同步」改成只停這台、不動 Keychain；網頁版沒有這個問題（密碼只存在那台瀏覽器裡），
維持原本的刪除行為。

**這件事驗不完整。** 要證明密碼真的跟著 iCloud 走到第二台，手邊得有兩台同一個 Apple ID 的 iPhone。
沒有。這一條掛在票 `17` 的驗收上，不阻擋收票。模擬器不頂替——上面的 iCloud 鑰匙圈本來就不可靠，
測出來的結果不管是過是不過都不能當真。
