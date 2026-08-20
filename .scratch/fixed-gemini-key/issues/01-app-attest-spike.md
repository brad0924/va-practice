# 01 — 探路：App Attest 在 Capacitor 裡拿得到權杖，並打通一個 Firebase AI Logic 請求

Status: ready-for-human
Type: enhancement

決策背景見 `../spec.md`，本票對應決定四、五、六、七與「測試決定」。

**這張票的結果可能推翻決定四與五。在它回報之前，其餘所有票都不要動工。**

## 要做什麼

用最小的程式碼證明三件事在真機上成立：

1. 原生層向 Apple 取得 App Attest 憑證，換到 Firebase App Check 權杖。
2. WebView 裡的 JavaScript 透過 `CustomProvider` 拿得到那個權杖。
3. 帶著那個權杖，Firebase AI Logic 回得出一個結構化輸出的回覆。

**不動 `gemini-reading.ts`、不動資料畫面、不動任何既有行為。** 探路的程式碼可以醜、可以是一顆暫時的按鈕，驗完就拆。

## 為什麼要單獨一張票

App Attest 是 Apple 的原生 API，`DCAppAttestService` 在**模擬器上一律回不支援**。維護者的開發機是 Windows，沒有 Mac、沒有模擬器，唯一的驗證管道是跑 `ios-testflight.yml` 送一版上去、裝到 iPhone 上試。

也就是說這條路通不通，答案一次要等一輪 TestFlight。若等到功能、文案、隱私權政策、商店申報全部改完才發現卡住，退回去的東西太多。

`.scratch/ios-app/spec.md` 決定二十九的探路 build 就是這個模式。

## 前置設定（都在票內完成）

- 在現有的 Firebase 專案（雲端備份那一個）開啟 Firebase AI Logic，選 **Gemini Developer API**（不是 Vertex），確認專案留在 **Spark 免費方案**、不綁計費。
- 在 Firebase 主控台的 App Check 註冊這支 iOS app，provider 選 App Attest。
- 在 Apple Developer 的 App ID 上確認 App Attest capability 已開啟（Bundle ID `io.github.brad0924.vapractice`，Explicit App ID，見 `.scratch/ios-app/issues/01`）。
- 下載 `GoogleService-Info.plist` 放進 iOS 專案，**進版控**（決定七：那把是 Firebase 的公開設定金鑰，靠 App Check 與安全規則擋，不靠保密；CI 需要它）。
- 裝 `firebase` 與 `@capacitor-firebase/app-check`，跑 `npx cap sync ios`。

## 探路程式碼的形狀

```js
await FirebaseAppCheck.initialize();
const provider = new CustomProvider({ getToken: () => FirebaseAppCheck.getToken() });
await initializeAppCheck(getApp(), { provider });

const model = getGenerativeModel(getAI(getApp()), {
  model: 'gemini-3.6-flash',
  generationConfig: { responseMimeType: 'application/json', responseSchema: /* 隨便一個小 schema */ },
});
const result = await model.generateContent('測試');
```

## 要回報的發現

每一項都要有實測結果，不接受「應該可以」：

- `FirebaseAppCheck.initialize()` 在 Capacitor 8 的 iOS 殼上跑不跑得起來。Capacitor 8 用 SPM 不用 CocoaPods（`.scratch/ios-app/spec.md`「上架」段），這個外掛裝不裝得上是第一個要確認的。
- `getToken()` 在 TestFlight 安裝的 build 上回得出權杖嗎？**注意 TestFlight 與 App Store 的 build 走的憑證路徑可能與開發 build 不同**，這是必須實測的原因。
- Firebase AI Logic 的回覆是否真的通過 App Check 驗證（把 App Check 設成強制執行，然後確認未帶權杖的請求會被拒）。
- 結構化輸出：`Schema.*` 建構式能不能表達 `gemini-reading.ts` 現有的 `RESPONSE_SCHEMA` 形狀（陣列包物件、`required`、`propertyOrdering`）。
- iOS 產物實際大了多少（firebase SDK 進來之後）。
- 一次 TestFlight 往返實際花多久（決定後面幾票怎麼排）。

## 驗收

- 一支裝在真 iPhone 上的 TestFlight build，按下探路按鈕會顯示 Firebase AI Logic 回來的 JSON。
- App Check 設為強制執行的狀態下仍然成功。
- 上述每一項發現寫進本檔案的 `## Comments`。
- 網頁版行為零改動；`npm test` 全綠。
- 探路用的按鈕與程式碼在票 02 動工前移除（本票可以留著，由 02 清掉）。

## 走不通的話

回報後停下來，不要自行改走別條路。決定四的另外兩個選項（自己寫 Cloud Function、硬塞進 ipa）都各自牴觸別的決定，需要維護者重新拍板。

## Comments

### 2026-08-19 — 檔案工程完成，真機驗證待維護者執行

**這張票完成了可以完成的那一半。** 程式碼與原生設定全數落地並驗證過；三件要證明的事一件都還沒證明，因為那需要一輪 TestFlight 加一支真 iPhone。以下是誠實的分界。

#### 已完成並驗證

| 項目 | 怎麼驗的 |
| --- | --- |
| 三個套件裝上 | `firebase@12.17.1`、`@capacitor-firebase/app@8.4.0`、`@capacitor-firebase/app-check@8.4.0` |
| 外掛接進 SPM | `cap sync ios` 產出的 `Package.swift` 列出四支外掛，`symlinks/` 兩條連結建得出來 |
| 探路程式碼 | `src/ui/app-check-spike.ts`，資料畫面最底下兩顆按鈕（A 帶權杖、B 不帶） |
| App Attest entitlement | `App.entitlements` 加上 `appattest-environment = production` |
| **網頁版零改動** | 改動前後各 build 一次，`dist/` 全部 14 個檔案 **SHA256 逐位元相同** |
| 測試 | 551 個測試全過（29 檔），`git status` 確認**零個測試檔被修改或新增** |
| typecheck | `tsc --noEmit` 乾淨 |

#### 發現一：外掛裝得上，但 `cap sync` 會安靜地失敗

**這是本票目前為止最有價值的一項。**

兩支 `@capacitor-firebase` 外掛的 README 都要求在 `capacitor.config.ts` 加 `experimental.ios.spm.packageOptions` 的 `symlink: true`。原因是 SPM 拿資料夾的最後一段當套件身分：`node_modules/@capacitor-firebase/app-check` 的身分是 `app-check`，而 `firebase-ios-sdk` 自己帶的 `github.com/google/app-check` 身分也是 `app-check`。Xcode 26 遇到同名會直接報錯（capawesome issue #959）。symlink 把資料夾換一個名字掛進來，身分就變成 `CapacitorFirebaseAppCheck`，不再撞。

**Windows 預設不准建立符號連結。** `cap sync ios` 因此丟 `EPERM`、寫不出 `Package.swift`——**但它回傳 0**。也就是說整條自動化流程都不會發現外掛沒進去。這種失敗一旦發生在 CI 上，build 會一路成功、外掛卻不在產物裡，要等裝到 iPhone 上按下去才知道，一輪 TestFlight 就白費了。

兩件事因此做了：

- 維護者以**系統管理員身分**開一個終端機跑 `npx cap sync ios`，連結才建得出來（開 Windows 開發人員模式效果相同，是一勞永逸的版本）。
- `ios-testflight.yml` 在 `sync:ios` 之後加一道 `grep`，確認 `CapacitorFirebaseAppCheck` 真的在 `Package.swift` 裡，不在就當場讓 workflow 倒。CI 跑在 macOS 上照理不會踩到，但這一道的成本是三行、擋掉的是一整輪 TestFlight。

#### 發現二：Capacitor 8.5 在 Windows 上把路徑寫成反斜線

同一次 `cap sync` 產出的 `Package.swift` 長這樣：

```swift
.package(name: "CapacitorFirebaseApp", path: "symlinks\CapacitorFirebaseApp"),
```

`\C` 在 Swift 裡不是合法的跳脫字元，這個檔在 macOS 上**連解析都過不了**。原本 commit 進去的那份（`ios-app` 票 01 產的）用的是正斜線，所以這是新踩到的。已手動改回正斜線——那個檔開頭寫著 `DO NOT MODIFY`，這次是為了修工具的毛病而破例，且 CI 每趟都會在 macOS 上重產一份正確的。

#### 發現三：`Schema.*` 表達得出現有的 `RESPONSE_SCHEMA`

票裡問的三件事都成立，但 `required` 的寫法是反過來的：

| `gemini-reading.ts` 現有寫法 | Firebase AI Logic 的寫法 |
| --- | --- |
| 陣列包物件、物件包陣列 | `Schema.array({ items: Schema.object({...}) })` 疊得起來 |
| `required: ['splittable', 'cells']` | **沒有 `required`。所有屬性預設必填**，可選的才列進 `optionalProperties` |
| `propertyOrdering: [...]` | 原樣支援，`splittable` 排在 `cells` 前面那個用意保得住 |

原本兩處 `required` 列的都是全部屬性，所以搬過去兩處都不必寫任何東西。這一項對票 02 是好消息。

#### 發現四：外掛 README 那段範例在嚴格模式下編不過

README 寫的是：

```ts
const provider = new CustomProvider({ getToken: () => FirebaseAppCheck.getToken() });
```

外掛的 `GetTokenResult.expireTimeMillis` 是**可選**的（註解寫「只有 Android 與 iOS 有」），而 `CustomProvider` 要的 `AppCheckToken` 那一格必填，`tsc` 直接拒絕。已加一支三行的轉接函式補值。票 02 照抄 README 會撞到同一顆。

#### 發現五：JS 那一側大了 75 KB，網頁版一個位元組都沒胖

| | 大小 |
| --- | --- |
| 新增的 `app-check-spike-*.js` chunk | 75.19 kB（gzip 23.71 kB） |
| 網頁版 `dist/` | **14 個檔案 SHA256 逐位元相同** |

網頁版沒胖是因為 `data-view.ts` 那段用 `import.meta.env.MODE === 'ios'` 包住一個動態 import。`MODE` 在打包時就換成字面值，整段成為死碼，連 chunk 都不會產出（spec 決定十六）。

**原生那一側大了多少還不知道**——`firebase-ios-sdk` 是透過 SPM 進來的，要真的 archive 過一次才量得出來。這一項留給 TestFlight 那一輪回報。

#### 發現六：App Attest 不必上傳任何金鑰，而且沙盒環境沒有用

Firebase 官方文件（`app-check/ios/app-attest-provider`）確認兩件事：

- 註冊 App Attest **不需要上傳 `.p8` 私密金鑰、也不需要填 Team ID**。外掛 README 那句「上傳的 p8 要選 DeviceCheck 服務」講的是 DeviceCheck provider，那條路只有 iOS 13 走；本專案的部署目標是 iOS 15，外掛的 `CustomAppCheckProviderFactory` 一律走 App Attest。
- 「App Check currently doesn't accept tokens generated in the App Attest sandbox environment」——**沙盒環境產的權杖 App Check 一律不收**。這證實 entitlement 要寫 `production`，也再次確認 TestFlight 是唯一的驗證管道，Xcode 直接裝的 development build 就算有 Mac 也驗不出來。

#### 發現七：JS 端的設定值跟原生要，不必在 repo 裡抄第二份

`@capacitor-firebase/app` 的 `getOptions()` 會把原生從 `GoogleService-Info.plist` 讀到的值交出來，`initializeApp()` 直接吃它。這順手解掉一個隱憂：App Check 權杖綁在 Firebase 的 App ID 上，而原生拿到的權杖屬於 plist 裡那支 **iOS** app。同一個來源取設定，JS SDK 用的必然是同一個 App ID，不會對不上。

另外，`getAI()` 的**預設後端就是 `GoogleAIBackend`（Gemini Developer API）**，不是 Vertex。程式碼裡仍明寫出來，讓決定看得見。

#### 還沒證明的事

這五項只有真機答得出來，本票要等它們才收：

1. **`FirebaseAppCheck.initialize()` 在 Capacitor 8 的 iOS 殼上跑不跑得起來。** 發現一證明的是「裝得上、寫進 `Package.swift`」，那是檔案層的事；「跑得起來」是執行期的事，只有真機答得出來。這兩件事很容易被混為一談。
2. `getToken()` 在 TestFlight 安裝的 build 上回不回得出權杖。
3. Firebase AI Logic 的回覆是否真的通過 App Check 驗證（B 按鈕要被拒才算數）。
4. iOS 產物實際大了多少（原生那一側）。
5. 一次 TestFlight 往返實際花多久。

#### 維護者待辦（只有你做得到）

**`GoogleService-Info.plist` 已經到位。** 維護者在本票實作期間下載並放進 `ios/App/App/`，`project.pbxproj` 的資源引用也補上了（四處：`PBXFileReference`、`PBXBuildFile`、群組、`Resources` build phase）。檔案內容驗過：`BUNDLE_ID` 是 `io.github.brad0924.vapractice`，`DATABASE_URL` 指向雲端備份那個 RTDB——確認是同一個 Firebase 專案（決定六）。下面第 1 點因此已完成，留著是為了記錄怎麼做的。

1. ~~**在 Firebase 註冊這支 iOS app 並下載 plist。**~~ **已完成。** 路徑是：主控台 → 齒輪 → 專案設定 → 一般 → 您的應用程式 → 新增應用程式 → Apple，Bundle ID 填 `io.github.brad0924.vapractice`（一字不差）。後面「新增 Firebase SDK」那幾步要全部跳過，那是給 Xcode 手動流程看的，本專案走 Capacitor 加 SPM。
2. **開啟 Firebase AI Logic**，選 **Gemini Developer API**（不是 Vertex），確認專案留在 **Spark 免費方案**、沒有綁計費（決定八）。
3. **在 App Check 註冊這支 app**，provider 選 **App Attest**。不必上傳任何金鑰（見發現六）。**先不要開強制執行**，順序見第 6 點。
4. **在 Apple Developer 的 App ID 上開 App Attest capability。**（Identifiers → `io.github.brad0924.vapractice` → 勾 App Attest）
   > **這一步會連帶一件容易漏掉的事：capability 改了，provisioning profile 必須重新產生，然後 repo 的 `IOS_PROVISIONING_PROFILE` secret 要換成新的那張。** 沒換的話 `xcodebuild` 會倒在簽章——`App.entitlements` 現在明寫了 `appattest-environment`，profile 裡沒有這個 capability 就對不上。這是刻意的：在 CI 上倒掉，比等一輪 TestFlight 才發現拿不到權杖便宜得多。
5. **跑 `ios-testflight.yml`**，裝到 iPhone，進資料畫面滑到最底下。
   - 按 **A：帶權杖**。應該一路印到「回覆：[...]」。
   - 按 **B：不帶權杖**。**此時還沒開強制執行，所以它也會成功**——這是對的，代表對照組本身是通的。
6. **回 Firebase 主控台把 App Check 的強制執行打開**（App Check → APIs → Firebase AI Logic → 強制執行），等幾分鐘，然後**再按一次兩顆按鈕**：
   - A 仍然成功 → 權杖有效。
   - B 這次失敗 → 未帶權杖真的會被擋。
   - 兩者都成立，驗收那兩條才算數。
7. **把每一顆按鈕印出來的東西抄回本檔**，成功與失敗的訊息都要。失敗訊息比成功的有價值——它講得出是哪一段倒的。

#### 據實記錄：本票踩過的三條線

code review 的 Spec 軸抓出來的，逐條認下。

**一、「不動資料畫面」被踩了。** 本票「要做什麼」寫著「不動 `gemini-reading.ts`、**不動資料畫面**、不動任何既有行為」，但 `src/ui/data-view.ts` 加了三行。這與驗收那條「按下探路按鈕會顯示……」字面上互斥——按鈕總得有地方放。

實際的改動是把一個動態 import 包在 `import.meta.env.MODE === 'ios'` 裡面。網頁版整段是死碼，`dist/` 14 個檔案 SHA256 逐位元相同，既有行為一個位元組都沒動。**但字面上確實踩了那一條，記在這裡而不是假裝沒發生。**

**二、改了 `ios-testflight.yml`，那不在本票範圍內。** 加的是發現一那道 `grep`。理由是本票存在的全部意義就是別浪費 TestFlight 往返，而 `cap sync` 安靜失敗正好會浪費一整輪。成本三行。**但這是既有發布流程的改動，維護者應知情**——不同意的話直接砍掉那一步，其餘都不受影響。

**三、多裝了一個套件。** 本票前置設定只寫「裝 `firebase` 與 `@capacitor-firebase/app-check`」，實際裝了三個。第三個是 `@capacitor-firebase/app`，用途見發現七（JS 端的設定值跟原生要，不必在 repo 裡抄第二份）。**這一項是維護者在實作前拍板的**，不是實作者自行加碼。

#### 留給票 02 的兩件事

1. **`RESPONSE_SCHEMA` 現在有兩份。** `gemini-reading.ts` 一份原始 JSON 物件、`app-check-spike.ts` 一份 `Schema.*` 建構式。探路刻意重寫一次，為的就是證明形狀保得住。spec 決定十六要求兩邊**共用**，票 02 必須收斂成一份。模型名 `gemini-3.6-flash` 同樣現在寫死在兩處。
2. **拆除的範圍是那一支檔案，不是那些套件。** 要刪的是 `src/ui/app-check-spike.ts` 與 `data-view.ts` 那三行接線。`firebase`、`@capacitor-firebase/app`、`@capacitor-firebase/app-check` 三個相依是票 02 的主體，留著。

#### 一個刻意不加的擋點

Spec 軸建議為 `GoogleService-Info.plist` 也加一道 CI 檢查。**不加，因為那會是重複的。**

plist 一旦被加進 `project.pbxproj` 的資源清單，檔案不在就是 `xcodebuild` 的 `Build input file cannot be found`——當場倒、訊息清楚。多一道 `grep` 擋的是同一件事。

寫下這段時的風險是「pbxproj 還沒有那個引用」，但那個中間狀態在本次實作結束前就消失了——plist 與引用都已進版控。擋點因此確定不加。

### 2026-08-19 — 第一趟 TestFlight 倒在 archive：簽章設定被廣播給 SPM 相依

第一趟 build（run 87371010571）失敗。**不是憑證或 profile 的問題**——前 9 步全過，包含匯入憑證、匯入 profile，以及發現一那道新加的 `grep`。倒在第 10 步 archive，而且**連編譯都還沒開始**（log 裡 `CompileSwift` 零次）。

8 個錯誤，全部同一句：

```
Firebase_FirebaseCore does not support provisioning profiles, but provisioning
profile va-practice App Store has been manually specified.
```

出錯的 8 個 target 一個都不是我們的 app：

```
Firebase_FirebaseCore              GoogleUtilities_GoogleUtilities-Environment
Firebase_FirebaseCoreInternal      GoogleUtilities_GoogleUtilities-Logger
Promises_FBLPromises               GoogleUtilities_GoogleUtilities-NSData
Promises_Promises                  GoogleUtilities_GoogleUtilities-UserDefaults
```

#### 原因

workflow 原本把簽章設定寫在 `xcodebuild` 的**指令參數**上。指令參數會套用到這次 build 的**每一個** target，不是只有 App。Xcode 14 起這件事變成硬性錯誤：SPM 拉進來的 target 不接受 provisioning profile，被硬塞就整個 archive 失敗。

這些 target 全是本票裝 Firebase 才帶進來的。**為什麼 Capacitor 那三支不會觸發同樣的錯，沒有實證**——log 在做任何事之前就停了。不影響修法，因此不編一個理由填上去。

#### 修法：把設定掛到 App 那個 target 上

target 層的設定只管那一個 target，SPM 那幾支看不到。三件事：

1. `project.pbxproj` 裡 App target 的 **Release** 設定改成 `CODE_SIGN_STYLE = Manual`（Debug 那份維持 Automatic，本專案沒有 Debug 的發佈路徑）。
2. 新增 `scripts/inject-signing.mjs`。CI 在 archive 之前呼叫它，把 profile 名稱與 team ID 填進那個區塊。
3. `xcodebuild archive` 的指令參數只留下 `CODE_SIGN_IDENTITY` 與 `OTHER_CODE_SIGN_FLAGS`（用哪張憑證、憑證在哪個鑰匙圈）——那 8 個 target 對這兩件事不會抗議。

**兩個值仍然不進 repo**（維護者拍板）。profile 名稱是 CI 當下從 `.mobileprovision` 讀出來的，team ID 留在 secret 裡。這保住 `.scratch/ios-app/issues/17` 刻意建立的性質，也保住 `docs/ios-signing-renewal.md` 那句「名字隨你取，CI 會自己讀」。

#### 那支腳本靠一行字定位，所以替它寫了測試

`inject-signing.mjs` 認的是 App target Release 設定裡那行 `CODE_SIGN_STYLE = Manual`——全檔唯一一處。**這是腳本與 `project.pbxproj` 之間的耦合，而沒有任何工具看得出來**：有人在 Xcode 裡改一下簽章方式、或重新產生原生專案，那行就沒了或變成兩行，而 `npm test` 與 `tsc` 都不會有反應，錯誤要到 CI 的 archive 那一步才炸。

`scripts/inject-signing.test.mjs` 把這件事拉進 `npm test`（5 條，`vite.config.ts` 的 `include` 本來就收 `scripts/**/*.test.mjs`）：真的那份專案檔錨點剛好一處、掛進去的位置確實在 App target 的 Release 區塊內、CRLF 行尾原樣保留、以及錨點是 0 處或 2 處時當場丟錯而不是猜一個位置寫下去。

腳本本身也在真的專案檔上實跑驗過，diff 剛好三行、行尾沒被換掉。

#### 這一趟證明的事

- 憑證、profile、`IOS_PROVISIONING_PROFILE` secret 三者都是對的。
- 新加的那道 `Package.swift` 防線（發現一）在真的 CI 上通過了。
- **`GoogleService-Info.plist` 有沒有被正確打包，這趟還沒驗到**——build 在編譯之前就停了。留給下一趟。

### 2026-08-19 — 第二趟：搬過頭了，team 要留在命令列

第二趟（run 87378217962）一樣倒在 archive，但**錯誤換了一句**，同樣那 8 個 target：

```
Signing for "GoogleUtilities_GoogleUtilities-Logger" requires a development team.
```

兩趟剛好構成一組乾淨的對照，這是本票關於簽章最有用的產出：

| | `DEVELOPMENT_TEAM` | `PROVISIONING_PROFILE_SPECIFIER` | 那 8 個 SPM target 的反應 |
| --- | --- | --- | --- |
| 第一趟 | 命令列 | 命令列 | 抱怨**許可證**（不接受 provisioning profile） |
| 第二趟 | 都拿掉 | 移到 App target | 抱怨**沒有 team** |
| 第三趟 | 命令列 | 移到 App target | 待驗 |

**結論：那 8 個 target 是會被蓋章的，所以需要 team；它們不接受的只有 provisioning profile。** 上一輪一次搬了兩個，搬過頭。

`inject-signing.mjs` 因此只掛 profile 名稱，`DEVELOPMENT_TEAM` 放回 `xcodebuild` 的指令參數（全體適用）。這一條寫進了腳本檔頭與 workflow 的註解——它是反直覺的，不寫下來下次一定再搬一次。

**票 01 要證明的三件事仍然一件都沒碰到。** 前兩趟都在編譯開始之前就停了，`GoogleService-Info.plist` 有沒有被正確打包也還沒驗到。

### 2026-08-19 — 第三、四趟：搬的份量試出來了

第三趟（run 87380054814）白跑，原因不在程式：修正的那個 commit 沒推上去，CI 抓到的是上一版。log 裡 `xcodebuild` 根本沒有 `DEVELOPMENT_TEAM` 那一行。**教訓：改完一定要先 `git push` 再開新的 run。**

第四趟（run 87382557459）換了第三句錯誤：

```
GoogleUtilities_GoogleUtilities-UserDefaults is automatically signed for development,
but a conflicting code signing identity Apple Distribution has been manually specified.
```

上一輪連 `CODE_SIGN_STYLE=Manual` 也一起從命令列拿掉了，那 8 個 target 因此退回自動簽章，然後跟被指定的發佈憑證打架。

#### 四趟拼出來的完整答案

| 命令列上有什麼 | 那 8 個 SPM target 的反應 |
| --- | --- |
| 全部四個（含 profile） | `does not support provisioning profiles` |
| 全部拿掉 | `requires a development team` |
| 少了 `CODE_SIGN_STYLE` | `conflicting provisioning settings` |
| **只拿掉 profile** | **待驗** |

**結論：那 8 個 target 完全接受「手動簽章、用這張憑證、屬於這個 team」，唯一不接受的是被塞一張 provisioning profile。** 搬少了會倒，搬多了也會倒——要搬的只有 `PROVISIONING_PROFILE_SPECIFIER` 一項。

這張表寫進了 workflow 與 `scripts/inject-signing.mjs` 的註解。它反直覺，不寫下來下次一定重走一遍這四趟。

### 2026-08-20 — 第一次裝上真 iPhone：三件事成立，卡在權杖那一格

第五趟 CI 通過，build 上了 TestFlight，裝進 iPhone。兩種狀態（App Check 未強制／已強制）各按 A、B 一次，共四筆結果。

#### 已經證明成立

| 項目 | 證據 |
| --- | --- |
| **`GoogleService-Info.plist` 被正確打包** | 畫面印出 `原生設定：projectId=va-practice appId=1:868881672534:ios:…`，那是原生從 plist 讀出來的 |
| **`FirebaseAppCheck.initialize()` 在 Capacitor 8 的 iOS 殼上跑得起來** | 印出「原生 App Check 初始化完成」。**這是票裡「要回報的發現」第一條，答案是可以** |
| **Firebase AI Logic 已啟用、端點打得到** | B 打到 `firebasevertexai.googleapis.com/v1beta/projects/va-practice/models/gemini-3.6-flash:generateContent`，回的是 **401**，不是 404 也不是「API 未啟用」 |
| **iOS 產物體積** | 待補（維護者回報） |

#### 意外收穫：「未帶權杖會被拒」已經驗完，而且比原設計更強

B 在**未強制**與**已強制**兩種狀態下**都失敗**，訊息一字不差：

```
FirebaseError: AI: Error fetching from https://firebasevertexai.googleapis.com/v1beta/
projects/va-practice/models/gemini-3.6-flash:generateContent:
[401] Firebase App Check token is invalid. (AI/fetch-error)
```

B 原本設計成「強制執行前會成功、之後會失敗」的對照組。**實際上 AI Logic 一律要求 App Check，那個開關對它沒有作用。** 這印證 spec 決定五那句「App Check 不是選配：Firebase 對 AI Logic 強制啟用」——不是靠開關擋，是天生就擋。

驗收那條「確認未帶權杖的請求會被拒」因此成立。A／B 兩顆按鈕的設計前提有誤，但結論比原本更硬。

#### 卡點：走的是 DeviceCheck，不是 App Attest

A 在兩種狀態下都停在同一格——`getToken()`：

```
—— 失敗：Error: The operation couldn't be completed. Too many attempts.
 - URL: https://firebaseappcheck.googleapis.com/v1/projects/va-practice/apps/
        1:868881672534:ios:0101e57fef7da60adccef7:exchangeDeviceCheckToken
 - HTTP status code: 400
 - "message": "App not registered: 1:868881672534:ios:0101e57fef7da60adccef7."
 - "status": "FAILED_PRECONDITION"
```

網址結尾是 **`exchangeDeviceCheckToken`**。DeviceCheck 是 Firebase 在 iOS 上的**出廠預設** provider，不是外掛指定的 App Attest。

Firebase 主控台已確認：這支 app **已註冊，認證服務是 App Attest**。所以 `App not registered` 的意思是「這支 app 沒有登記 DeviceCheck 這一套」——後台與客戶端用的不是同一套。

外掛也沒有提供選 provider 的開關（`InitializeOptions` 只有 debug 相關）。它一律用 App Attest。**所以我們指定的那一套根本沒生效。**

#### 推測的原因與修法（尚未證實）

外掛把兩件事分在兩個時間點做：

| 什麼時候 | 做什麼 |
| --- | --- |
| 外掛載入（app 一啟動） | `FirebaseApp.configure()` |
| JS 呼叫 `initialize()` | `AppCheck.setAppCheckProviderFactory(CustomAppCheckProviderFactory())` |

而 Firebase 官方文件要求：**provider factory 必須在 `configure()` 之前指定**。App Check 會在 configure 的時候用出廠預設把自己建好，之後再指定也換不回來。探路按鈕更是要等使用者按下去才呼叫 `initialize()`，時間差更大。

這解釋了觀察到的每一個現象，**但沒有實證**——只有一份吻合的推理。

修法：在 `ios/App/App/AppDelegate.swift` 的 `didFinishLaunchingWithOptions` 裡，搶在 Capacitor 建立 bridge、載入外掛之前，先 `setAppCheckProviderFactory` 再 `configure()`。約十行 Swift，含一個只回傳 `AppAttestProvider` 的小 factory。

**這超出本票原本的預期**（原本只打算寫 JS，探路程式碼「可以醜、可以是一顆暫時的按鈕」），維護者知情後同意先試一輪。兩個風險據實記錄：推測可能是錯的；`import FirebaseCore`／`FirebaseAppCheck` 在 App target 裡不一定看得到那些模組，真的看不到的話 CI 會在編譯階段就倒（幾分鐘，不浪費 TestFlight 往返）。
