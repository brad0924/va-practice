# 05 — 保險副本：寫入原生儲存，啟動時能還原

Status: done
Type: enhancement
Blocked by: 01

決策背景見 `../spec.md`，本票對應決定五、六、七、八、九。

## 要做什麼

在 iOS 上，讓使用者的單字與進度多一份保險：**萬一 WebView 那一層的資料被清掉了，打開 app 還能自己救回來**，使用者不會看到一個空的 app。

網頁版完全不受影響，一行程式碼都不會改變它的行為。

## 決定

### `ADR-0002` 不推翻：localStorage 仍是唯一真相來源

所有讀寫路徑一字不改，`src/lib/storage.ts` 的 `StorageLike` 保持**同步**。否決「全面換成 Capacitor Preferences」：該 API 是非同步的，換過去等於把 `storage.ts`、`app.ts` 的 `persist()` 與整批既有測試改寫成等待語意，改動範圍與收益不成比例。

### 副本是唯讀的，永遠不當資料來源

程式任何時候讀的都是 localStorage。這份副本只有一個用途：啟動時發現 localStorage 沒有資料、而副本有，才把副本寫回 localStorage 並照常啟動。

**這一點寫進 `CONTEXT.md` 的詞彙（由 10 負責）時要特別標明**，否則日後很容易被誤解成第二個真相來源。

### 寫入沿用 `cloud-backup` 的 `pending` / `sending` 模式，不用計時器

直接照抄 `cloud-backup.ts` 的 `flush()`：同時只寫一份，寫入期間進來的變動一律覆蓋成「待寫的最新那一份」，上一趟回來後若 `pending` 已換人就再寫一次。因為寫的永遠是整份資料，被合併掉的中間那幾份沒有任何意義。

不用固定延遲的節流，三個理由：延遲秒數是無從論證的魔術數字；計時器會開出一個「資料已改、計時中、app 被滑掉」的破口，而「一次一趟」沒有這個窗口；本 repo 已經有這個模式，照抄勝過新發明一種。

### 還原判斷必須早於 `store.load()`

`store.load()` 在 localStorage 空白時會自行初始化一份新資料。還原晚一步，使用者就會先看到一個空的 app。因此 iOS 的啟動流程多一個非同步的前置步驟，`src/main.ts` 需要相應調整。

**網頁版的啟動路徑不變**——這個前置步驟只在 iOS 上發生。

### 寫入時即指定 App Group

第二版的 Widget 是另一支獨立的程式，讀不到本 app 的私有資料。現在就指定 App Group，Widget 屆時直接有東西可讀。本票只負責寫進去，**不實作任何讀取端**。

> **訂正（實作時查證）**：原訂用 `@capacitor/preferences` 寫入，但那支插件**做不到 App Group**——它的 `group` 參數只是 key 的字首，底層一律寫進 app 私有的 `UserDefaults.standard`。已改為自寫一支只有兩支方法的原生插件，詳見下方 `## Comments` 與 `spec.md` 決定六、九。

## 這張票不做的事

- 不實作 Widget，也不寫任何 Widget 會用到的讀取邏輯
- 不改 `src/lib/storage.ts` 的介面，不把任何既有路徑改成非同步
- 不碰雲端備份的憑證存放（那是 06）

## 驗收

- [x] 複習、新增、編輯、刪除卡片之後，原生儲存裡有一份與 localStorage 內容一致的資料
- [x] 連續快速操作（例如匯入一批單字）時，寫入被合併，不會每一次變動都送一趟
- [x] 寫入期間又有新變動時，最後落地的是最新那一份，不是中途那一份
- [x] 清掉 WebView 的資料後重開 app，單字與進度完整還原，不是空的 app
- [x] 副本與 localStorage 都空白時，照常初始化成新使用者，不報錯
- [x] 副本寫入失敗時，複習流程完全不被打斷（與雲端推送同一個立場）
- [x] 副本寫入時指定了 App Group
- [x] 網頁版的啟動流程與行為零變化
- [x] 既有測試全數通過，且一個既有測試檔都沒被修改

## Comments

### 2026-08-07 — `@capacitor/preferences` 做不到 App Group，改為自寫插件

**這張票的前提在動工前就被查證推翻了一半。** spec 決定六原訂用 `@capacitor/preferences` 寫入，並假設它「底層為 iOS UserDefaults」因此順便就能給 Widget 讀。前半句對，後半句錯。

讀官方插件的 iOS 原始碼（`preferences/ios/Sources/PreferencesPlugin/Preferences.swift`）：

```swift
private var defaults: UserDefaults {
    return UserDefaults.standard
}

private var prefix: String {
    switch configuration.group {
    case .cordovaNativeStorage: return ""
    case let .named(group): return group + "."
    }
}
```

`group` 只是**加在 key 前面的一段字首**，寫的永遠是 `UserDefaults.standard`——app 私有的那一份。它從來就不是 `UserDefaults(suiteName:)`。官方文件對 `ConfigureOptions.group` 的說明也只講「用來組織 key/value」，一個字都沒提 App Group。

處理方式沿用票 01 訂正決定三十三的做法：**改掉不成立的前提，而不是替驗收加例外**。決定九要的是「Widget 讀得到」，換一個做得到的手段才叫達成，把 App Group 延到第二版只是把同一件事往後推、還多欠一次資料搬遷。

改為在 app target 內自寫一支 Capacitor 插件，直接用 `UserDefaults(suiteName:)`。附帶的好處：**一個新的 npm 依賴都不必加**（`@capacitor/core` 本來就在）。

### 落地的東西

| 檔案 | 是什麼 |
| --- | --- |
| `src/lib/safety-copy.ts` | 合併閘門與還原判斷。純的，不碰任何原生 API，讀寫方式由呼叫端遞進來 |
| `src/lib/safety-copy.test.ts` | 上者的 14 條測試 |
| `src/lib/safety-copy-native.ts` | 唯一碰 Capacitor 的檔案。網頁版拿到的是個什麼都不做的 `SafetyCopy` |
| `ios/App/App/SafetyCopyPlugin.swift` | 原生那一端，只有 `read` 與 `write` 兩支 |
| `ios/App/App/MainViewController.swift` | 只為了註冊上者而存在，見下 |
| `ios/App/App/App.entitlements` | 宣告 App Group `group.io.github.brad0924.vapractice` |
| `SceneDelegate.swift`、`project.pbxproj` | 指向新的 view controller、把兩個 Swift 檔掛進編譯清單、加上 `CODE_SIGN_ENTITLEMENTS` |

### 為什麼多一支 `MainViewController`

**Capacitor 6 之後，住在 app 自己這個 target 裡的插件不會被自動掃描到**——自動註冊只涵蓋 `cap sync` 從 `node_modules` 找到的那些。因此得在 bridge 載入後自己 `registerPluginInstance()` 一次，而唯一的掛載點是 `CAPBridgeViewController` 的子類。那支檔案除了這一行沒有任何內容。

### 偏離 spec 的一處實作判斷：閘門掛在 store 與 localStorage 之間

spec 決定六寫的是「`persist()` 存完 localStorage 之後額外寫一份」。照字面做會漏掉四條同樣會改動本機資料的路徑：`importBackup`、`importWords`、雲端拉下來的 `onPulled`、以及推送成功後回填時間戳的 `onPushed`。漏掉任何一條，副本就與 localStorage 對不上，而驗收第一條要的正是「一致」。

因此改成一支 `withSafetyCopy(storage, copy)`，把一個 `StorageLike` 的轉接層夾在 `createStore()` 與 `localStorage` 之間：**每一次本機寫入都必然帶著副本一起走**，不靠人記得在四個地方各補一行。它只抄 `STORAGE_KEY` 那一個鍵——雲端憑證與 Gemini 金鑰同樣住在 localStorage，但那些不是使用者的資料。

代價是每次啟動 `store.load()` 會多寫一趟同樣內容的副本。原生儲存的寫入很快，且那一趟順帶會把還原後遷移過的形式覆蓋上去，接受。

### 網頁版

啟動路徑仍然是同步的，`isNative()` 為假時 `main.ts` 一步都不多；`persist()` 那條路拿到的是個空的 `push()`。**行為零變化，但產物不再與票 01 的基準線逐位元相同**——bundle 從 44.49 kB 長到 53.40 kB（gzip 17.20 → 20.58 kB），因為 `@capacitor/core` 整個進了網頁版的 bundle，儘管網頁版一行都不會執行到。

考慮過用 `window.Capacitor` 的全域探測加動態 `import()` 把這 3.4 kB（gzip）擋在網頁版之外，沒有採用：那要改用一個沒有寫進官方文件的全域物件、外加一層非同步，換 3.4 kB 不划算。硬約束是「行為一字不改」，不是「位元組不增加」。

### 誠實的分界：原生那一半一行都沒被執行過

開發機是 Windows，沒有 Xcode，`xcodebuild` 是 macOS 限定。因此三個 Swift／entitlements 檔案**連能不能編譯都還不知道**，typo 也不例外。能在本機做到的驗證只有這些：

| 驗的東西 | 怎麼驗的 | 結果 |
| --- | --- | --- |
| 合併閘門、還原判斷 | vitest 14 條 | ✅ 全過 |
| 既有測試零修改 | `git status` | ✅ 只新增一個測試檔 |
| 全部測試 | `npm test` | ✅ 376 過（15 檔） |
| typecheck | `tsc --noEmit` | ✅ 乾淨 |
| `project.pbxproj` 沒被改壞 | 用 `xcode` 套件實際 parse，印出 Sources 清單與兩個 configuration 的 `CODE_SIGN_ENTITLEMENTS` | ✅ 兩個 Swift 檔都在，Debug／Release 都指到 `App/App.entitlements` |
| `cap sync ios` | 實跑 | ✅ exit 0 |
| 網頁版 build | 實跑，`base` 為 `/va-practice/`、service worker 照常產出 | ✅ |

### 維護者待辦（只有你做得到）

1. **在 Apple Developer 建 App Group。** Certificates, Identifiers & Profiles → Identifiers → 左上下拉切到 **App Groups** → ＋ → Identifier 填 `group.io.github.brad0924.vapractice`（**必須以 `group.` 開頭**，且要與 `App.entitlements` 裡那一串一字不差）。Description 隨便填，那是內部標籤。
2. **在 App ID 上勾 App Groups 並指派剛建的那一個。** 回到 Identifiers → App IDs → `io.github.brad0924.vapractice` → Capabilities 找到 App Groups → 勾起來 → Edit → 選第 1 步那一個 → Save。**這是票 01 說的「整個工程從頭到尾只會多勾一個」那一勾。**
3. **手動觸發 `Build iOS and upload to TestFlight`。** CI 走 `-allowProvisioningUpdates` 自動簽章，前兩步沒做的話會倒在簽章那一步，訊息大致是找不到帶 App Groups 的 provisioning profile。
4. **真機能驗的**：複習幾張、匯入一批單字，關掉 app 再開資料照常；全新安裝時照常進到空的新使用者狀態、不報錯。
5. **編不過的話把 Actions 的 log 貼回來。** 前幾趟很可能是在打 Swift 編譯錯誤，不是在測功能。

### 一條驗收在沒有 Mac 的情況下驗不到

「清掉 WebView 的資料後重開 app 完整還原」這條，**目前沒有辦法在真機上誠實地驗證**，寫在這裡免得日後有人以為勾過了。

最直覺的做法——刪掉 app 再重裝——**不能用來驗這件事**：刪除 app 會把 App Group 的共用容器一起帶走，副本與 localStorage 同歸於盡，重裝後看到空的 app 是正確行為，什麼都沒證明。「卸載 App」（Offload）則兩者都保留，同樣證明不了。iOS 真正會清掉 WKWebView website data 的時機是儲存空間吃緊，那正是這個功能防的情境，但無法隨意觸發。

要真的驗，只有兩條路，都不在本票範圍：把 iPhone 接上 Mac 用 Safari 的網頁檢閱器清掉 localStorage；或出一個暫時的 debug build，在「資料」畫面加一顆清 localStorage 的按鈕，驗完拿掉。

目前這條路徑的保障來自 `safety-copy.test.ts` 那六條還原測試——它們驗的是判斷邏輯（有／沒有／壞掉／讀不出來各該怎麼辦），驗不到的是原生那一端真的把字串交了回來。

### 這張票為什麼是 `ready-for-human` 而不是 `done`

程式碼工程全數落地並在能驗的範圍內驗過了，但驗收九條裡有三條需要真機或 CI 才能勾。剩下的每一件事都只有維護者做得到（Apple 後台、觸發 workflow、實機操作），`ready-for-human` 是本 repo 標籤表裡唯一講得出這件事的那一個。三條勾完就改 `done`。

### 2026-08-07 — code-review 後的修正

雙軸審查抓到一個**阻斷級**的錯誤和幾個真問題，都已修掉。

#### 1. 插件掛錯地方，真機上會整個功能無聲啞掉（阻斷級）

原本把 `Main.storyboard` 的 view controller 改指向 `MainViewController`。**那完全沒有作用。** 票 01 留下的 `SceneDelegate.swift` 自己造一個 window、把 root 硬寫成 `CAPBridgeViewController()`，storyboard 建好的那個會被整個換掉（Capacitor 8 範本就是這樣寫的，`Info.plist` 的 `UISceneStoryboardFile` 形同虛設）。

後果特別惡劣：`capacitorDidLoad()` 不會被呼叫 → 插件不註冊 → `read`／`write` 一律以 UNIMPLEMENTED reject → 而這兩端的錯誤都被**刻意吞掉**（那是驗收第六條要的）。結果就是副本永遠寫不進去、還原永遠拿到 null，**畫面上一點徵兆都沒有**，直到某天真的需要它。

已改成在 `SceneDelegate` 那一行換掉，並把 `Main.storyboard` 的改動整個還原（它本來就沒作用，留著只會讓專案裡有兩個互相矛盾的答案）。`MainViewController` 的註解也改成明說掛載點是 `SceneDelegate` 而不是 storyboard。

**這一顆值得記住**：後續票若也要加 app target 內的原生插件，掛載點是 `SceneDelegate`。

#### 2. `SafetyCopyPlugin` 裡一句錯的註解

原本寫「App Group 字串與 entitlements 對不上時 `UserDefaults(suiteName:)` 會是 nil」。**不對。** 它只在 suiteName 本身不合法（nil、等於 bundle id、等於 global domain）時才回 nil；entitlement 沒配好時它照樣回一個能用的物件，只是寫進去的東西 Widget 讀不到。那道 guard 因此對驗收第七條提供不了任何訊號，已把註解改成講實話。

#### 3. 拿掉 `snapshot()` hook

原本 `push()` 不帶參數，回頭去 `localStorage.getItem()` 讀剛剛才寫進去的那一串。轉接層手上本來就有 `value`，直接傳即可——一併刪掉了 hooks 物件、`createNativeSafetyCopy` 的 `storage` 參數，以及一條 null 檢查。順帶解掉一個詞彙問題：`CONTEXT.md` 的「備份」條把「快照」列在 `_Avoid_`，而 `snapshot` 原本是介面上的方法名。

#### 4. 一條恆真的測試

`await expect(native.fail()).resolves.toBeUndefined()` 斷言的是假物件自己的 helper，永遠會過。改成驗真正在意的兩件事：失敗後沒有東西落地、且沒有留下一個原地重試的迴圈。

#### 全部測試做過變異驗證

把 `if (pending === latest)` 與 `if (key === STORAGE_KEY)` 兩道判斷各拿掉一次，對應的測試確實轉紅——不是恆真的裝飾。

最終：**376 個測試全過（15 檔）**，`tsc --noEmit` 乾淨，`cap sync ios` exit 0，`project.pbxproj` 重新 parse 過（四個 Swift 檔都在 Sources、兩個 configuration 都指到 entitlements），網頁版 build 照常產出 service worker 且 `base` 為 `/va-practice/`。

**駁回一項**：Standards 軸建議替「網頁版拿到 no-op」補一條測試。不採納——spec 的測試決定明寫「原生橋接層不寫自動測試」，而那條測試只會斷言一個空函式什麼都沒做，是典型的恆真測試。

### 2026-08-07 — 真機驗證通過，九條驗收全數成立

用票 13 的暫時鷹架驗的：建幾張卡 → 按「清掉本機資料」（只清 localStorage 與雲端憑證，不碰副本）→ 畫面重新載入 → **卡片立刻回來了**。

這一下同時證實了四件事，不只還原那一條：

1. **寫入真的有發生**——副本裡確實有東西，否則不可能還原
2. **還原真的有跑，而且早於 `store.load()`**——晚一步會先看到一個空的 app（決定八）
3. **插件註冊成功**——修掉 `SceneDelegate` 那顆 bug 之後最擔心的一環，在此之前完全沒有證據
4. **App Group 的 entitlement 在執行期是好的**——讀寫走的是同一個共用儲存

雲端憑證一起被清掉是刻意的：不清的話 `cloud.begin()` 會把資料整份拉回來，而「雲端救的」與「副本救的」在畫面上分不出來，測了等於白測。

#### 三條原本沒勾的驗收，現在的依據

| 驗收 | 依據 |
| --- | --- |
| 原生儲存裡有一份與 localStorage 一致的資料 | 還原回來的內容與清掉前一致。四種操作（複習／新增／編輯／刪除）走的是 `store.save()` 同一條路，`withSafetyCopy` 夾在它與 localStorage 之間，沒有第二條路徑 |
| 清掉 WebView 資料後重開 app 完整還原 | 直接驗到 |
| 副本寫入時指定了 App Group | CI 簽章時 entitlement 被接受、profile 帶著 App Groups 產出，加上執行期讀寫 round-trip 成立 |

#### 仍未證實的一件事，留給第二版

**「Widget 真的讀得到這份資料」沒有被驗到**，也驗不到——Widget 還不存在。目前成立的是「寫入端指向 App Group 的共用儲存，且本 app 讀得回來」。第二版做 Widget 時若讀不到，回頭查的第一個地方是 `SafetyCopyPlugin.swift` 的 `appGroup` 常數與 `App.entitlements` 是否仍然一字不差。

#### 順帶記錄一個與本票無關的 TestFlight 怪事

build 3 上傳後狀態正常（`Ready to Submit`、INVITES 為 1），但無論如何都無法指派給 Internal Testing 群組，選單裡群組是反灰的。重新觸發 workflow 產出 build 4 之後一切正常。**原因未查明。** 若再發生，先去群組的 Settings 把自動發佈打開，不要手動跟它耗。
