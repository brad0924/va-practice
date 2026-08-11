# 06 — 雲端備份的密碼改存 Keychain，換裝置自動帶走

Status: done
Type: enhancement
Blocked by: 01, 05

決策背景見 `../spec.md`，本票對應決定十、十一、十二、十三。

## 要做什麼

讓使用者換新 iPhone 時，**雲端備份的密碼自動跟著走**，不必記住一組可能一年沒輸入過的字串。

## 決定

### 密碼存進 iOS Keychain 並開啟 iCloud 同步

iCloud 鑰匙圈是端對端加密的，Apple 自己讀不到內容。使用者未啟用 iCloud 鑰匙圈時退化為僅存本機，功能不受影響、不報錯。

### `cloud-backup.ts` 一行不改——走既有的注入接縫

`CloudBackupHooks.storage` 本來就是外部遞進來的 `StorageLike`，`app.ts` 目前遞的是 `localStorage`。iOS 版改遞一個由 Keychain 支撐的實作即可。**這是本工程沒有開新接縫的關鍵，不要為了 Keychain 去改 `cloud-backup.ts`。**

### 以「啟動時預載」化解同步／非同步的衝突

Keychain API 是非同步的，`StorageLike` 是同步的。解法：啟動流程中先非同步讀出憑證，填進一個實作 `StorageLike` 的記憶體物件；此後 `getItem` 由記憶體同步回答，`setItem` 同步更新記憶體、並非同步寫回 Keychain。

憑證只有**登入、換密碼、登出**三個時機會變動，頻率極低，這個模型足夠。

擋在 05 後面的理由：兩者共用同一個非同步啟動前置步驟，先後做才不會蓋掉彼此。

### `ADR-0003` 的「密碼遺失即無法復原」不變

Keychain 降低了忘記密碼的機率，但沒有消除它——使用者可能沒開 iCloud 鑰匙圈，或整個換掉 Apple ID。因此設定雲端備份的畫面必須明說後果，並指向手動匯出備份這條後路。

## 這張票不做的事

- 不改變雲端備份的加解密、指紋、路徑或新舊比較邏輯
- 不改 `cloud-backup.ts`
- 不做密碼救援或重設流程——機制上不可能，`ADR-0003` 已定案

## 驗收

- [x] iOS 上登入雲端備份後，憑證存進 Keychain 而非 localStorage
- [x] Keychain 項目標記為可同步到 iCloud 鑰匙圈
- [x] 關掉 app 再開，仍是登入狀態，會自動拉雲端資料
- [x] 「停止同步」後，Keychain 裡的憑證確實被清掉，重開仍是未登入
- [x] 換密碼後，新憑證正確寫回 Keychain
- [ ] 未啟用 iCloud 鑰匙圈的裝置上，功能正常運作，只是不同步（**驗不到，改由文件支撐，見下方 Comments**）
- [x] `src/lib/cloud-backup.ts` 一行未改
- [x] 網頁版的憑證仍存 localStorage，行為零變化
- [x] 設定雲端備份的畫面明說「密碼遺失無法復原」，並指向匯出備份
- [x] 既有測試全數通過，且一個既有測試檔都沒被修改

## Comments

### 2026-08-10 — 落地的東西

| 檔案 | 是什麼 |
| --- | --- |
| `src/lib/keychain.ts` | 預載、排隊、失敗時怎麼辦。純的，不碰任何原生 API，讀寫方式由呼叫端遞進來 |
| `src/lib/keychain.test.ts` | 上者的 11 條測試 |
| `src/lib/keychain-native.ts` | 唯一碰 Capacitor 的檔案。順便清掉 localStorage 裡那筆過時的明文 |
| `ios/App/App/KeychainPlugin.swift` | 原生那一端，只有 read／write／remove 三支 |
| `MainViewController.swift`、`project.pbxproj` | 多註冊一支插件、把新的 Swift 檔掛進編譯清單 |
| `src/main.ts`、`src/app.ts` | 啟動時多等一件事；`start()` 多收一個「暱稱與密碼存哪裡」的參數 |
| `src/ui/data-view.ts` | 登入表單的說明字多一句，指向「手動備份」 |

`src/lib/cloud-backup.ts` **一行未改**——`CloudBackupHooks.storage` 本來就是外部遞進來的，這正是決定十一要的效果。

### 為什麼要有 `keychain.ts` 這個中間人

Keychain 的 API 是非同步的，`StorageLike` 是同步的。做法照決定十二：啟動時先非同步讀出來、填進一個記憶體物件，此後 `getItem` 由記憶體同步回答，`setItem` 同步更新記憶體、並在背景寫回 Keychain。

比決定十二多做的一件事：**寫回 Keychain 一律排隊，一次一趟**。並行的話兩趟回來的順序可能相反，落地的就會是已經被推翻的那一份——「登入後立刻停止同步」正是這種前後腳。這條有測試釘住，把排隊拿掉它就轉紅。

### 不做 localStorage → Keychain 的搬遷，但把舊的那一份清掉

已經在這台 iPhone 上登入過的人，更新後會變成未登入，要重新輸入一次暱稱與密碼（卡片與進度完全不受影響）。票裡沒要求搬遷，而 app 還沒上架，為一次性的事養一段永久的程式碼不划算。

但**舊的那一份必須清掉**：它是明文，從此不再被讀到，「停止同步」也清不到它（那條路現在清的是 Keychain）。留著等於白白多一個讀得到密碼的地方，驗收第一條「存進 Keychain 而**非** localStorage」字面上也不成立。清除寫在 `keychain-native.ts`，只在 iOS 那條路發生。

### 詞彙：不用「憑證」

`CONTEXT.md` 把「憑證」列在「指紋」的 `_Avoid_` 裡，因此程式與註解一律寫「暱稱與密碼」。票與 spec 裡的「憑證」二字沒有跟著改——那是決策紀錄，不是程式。

### 誠實的分界：原生那一半一行都沒被執行過

與票 05 同樣的處境，開發機是 Windows，沒有 Xcode。能在本機做到的驗證只有這些：

| 驗的東西 | 怎麼驗的 | 結果 |
| --- | --- | --- |
| 預載、排隊、失敗、只收一個鍵 | vitest 11 條 | ✅ 全過 |
| 全部測試 | `npm test` | ✅ 391 過（18 檔） |
| 既有測試零修改 | `git status` | ✅ 只新增一個測試檔 |
| typecheck | `tsc --noEmit` | ✅ 乾淨 |
| `project.pbxproj` 沒被改壞 | 用 `xcode` 套件實際 parse | ✅ 五個 Swift 檔都在 Sources，兩個 configuration 仍指到 entitlements |
| `cap sync ios` | 實跑 | ✅ exit 0 |
| 網頁版 build | 實跑 | ✅ `base` 仍為 `/va-practice/`，service worker 照常產出 |

**兩件只有真機驗得到、且目前只有推論支撐的事**：

1. **Keychain 不需要多勾任何 capability。** 項目走 app 預設的 access group，`kSecAttrSynchronizable` 也不需要 iCloud 的 entitlement。若真機上讀寫一律回 `-34018`（`errSecMissingEntitlement`），那就要在 App ID 補勾 Keychain Sharing 並在 `App.entitlements` 加 `keychain-access-groups`。
2. **沒開 iCloud 鑰匙圈時照樣能用。** 預期是 `SecItemAdd` 照常成功、那一筆只留在本機不同步。這是驗收第六條，也是整份驗收裡唯一沒有任何程式或測試支撐的一條，**請單獨驗，不要跟其他條一起勾掉**。

### 順帶記錄一個 Windows 上的坑

在 Windows 跑 `npm run sync:ios`，Capacitor 會把 `ios/App/CapApp-SPM/Package.swift` 裡的相依路徑改寫成反斜線（`..\..\..\node_modules\@capacitor\filesystem`），macOS 上編不過。這次已 `git checkout` 還原。**以後在 Windows 跑完 `sync:ios`，記得檢查這個檔案有沒有被改**。

### 維護者待辦

1. 手動觸發 `Build iOS and upload to TestFlight`。
2. 真機驗那六條：登入 → 關掉 app 再開仍登入 → 換密碼 → 停止同步後重開仍未登入 → 沒開 iCloud 鑰匙圈的裝置上照常運作 → 換裝置（或另一台同 Apple ID 的裝置）密碼自動帶到。
3. 編不過的話把 Actions 的 log 貼回來——前幾趟很可能是在打 Swift 編譯錯誤，不是在測功能。

### 2026-08-11 — 真機驗證：五條通過，第六條驗不到

CI 那一趟乾淨：`KeychainPlugin.swift` 編進去了、0 個 error、`ARCHIVE`／`EXPORT`／`UPLOAD` 全部 SUCCEEDED，且 CI 打出來的 JS 與本機 build 是同一個 hash。**兩個未證實的假設中，「Keychain 不需要多勾任何 capability」這一個成立了**——真機上沒有出現 `-34018`，App ID 一個 capability 都沒有補勾。

前五條在真機上通過，包含最強的那一條：**第二台裝置全新安裝後，密碼真的自己跟著到了**。這同時證實了項目確實帶著可同步的標記，並且真的透過 iCloud 鑰匙圈同步出去了。

順帶記錄一個當初沒想到的觀察：**驗收第二條的「標記」那一半，其實同一台裝置就驗得到**。讀取時的查詢條件帶著 `kSecAttrSynchronizable`，它只找得到可同步的那一批，所以「滑掉重開仍是已登入」就已經證明標記蓋上了。第二台裝置驗的是另一件事——同步真的發生。

#### 第六條為什麼驗不到

維護者的 iPhone **關不掉 iCloud 鑰匙圈**：開關按得下去，轉圈圈約兩分鐘後自動彈回開啟——是「請求失敗後回滾」，不是被限制鎖住。原因未查明，懷疑與進階資料保護有關，但那是 Apple 那一端的事。

而且就算關成功了，驗到的也只是「這台關掉之後還能用」，與「從來沒開過鑰匙圈的裝置」情境並不完全相同。

#### 改由文件支撐，以及證據等級

查證的結果一致地支持原假設，但**要說清楚這是推論不是引用**：

- Apple DTS（Quinn）的說法是「用 `kSecAttrSynchronizable`，**如果使用者啟用了 iCloud 鑰匙圈**，項目就會透過 iCloud 同步」——句型講的是「同步與否取決於使用者的設定」，不是「存不存得進去取決於它」
- Apple 支援文件寫「之後把 iCloud 鑰匙圈打開，密碼會再同步到裝置上」——那些密碼在打開之前顯然已經存在本機
- **但沒有任何一份 Apple 文件白紙黑字寫「鑰匙圈關閉時 `SecItemAdd` 照樣成功」**

來源：[Apple Developer Forums 676891](https://developer.apple.com/forums/thread/676891)、[Set up iCloud Keychain](https://support.apple.com/en-us/109016)、[Secure keychain syncing](https://support.apple.com/guide/security/secure-keychain-syncing-sec0a319b35f/web)

#### 推錯的話會怎樣

最壞的後果是那些使用者**每次重開 app 要重新登入一次**，卡片與進度一張都不會少——不是資料損失。風險被框在這個範圍內，因此這張票以 `done` 收掉，不卡在一台找不到的裝置上。

日後若真有使用者回報「每次開 app 都要重新登入」，第一個要查的就是這裡。

### 2026-08-11 — 這張票的驗證過程生出了票 14

第二台裝置全新安裝時，**問都沒問就把整份雲端資料拉了下來**。機制上完全正確（決定十要的就是這個），但它把「不必重新輸入密碼」做成了「不必表示同意」。

那是設計問題不是缺陷，已開 `14-ask-before-first-cloud-pull.md` 處理，並在該票訂正決定十：**密碼跟著走，但同意不跟著走**。
