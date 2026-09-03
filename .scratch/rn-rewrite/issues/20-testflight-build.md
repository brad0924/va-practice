# 20 — React Native 版出一次 TestFlight build

Status: ready-for-human
Type: enhancement
Blocked by: 無（19 張功能票已全部收掉）

決策背景見 `../spec.md` 的〈路線〉與〈上架〉。

**規格談完了（2026-09-03 一輪 `/grill-with-docs`）。** 開票當天列的〈要你拍板的〉五條
已全部有答案，其中兩條是查證出來的、不必決定。底下〈決定〉那八條是那一輪談定的，
不是實作時的自由選擇。

## 為什麼有這張票

`../spec.md`〈上架〉寫著：

> **Capacitor 版不先送審，等 React Native 版好了才一起送，而且不設回頭看的時間點。**

「等 React Native 版好了」那個條件在 2026-09-03 達成了：19 張功能票全收，
四項原生功能（語音、觸覺、Keychain、每日提醒）到齊，`ADR-0015` 要的 4.2 實質內容成立。

但**沒有任何一張票在講 React Native 版怎麼出包上 TestFlight**。`rn-rewrite` 那 19 張
全是功能票，最後一張（`19`）的驗收走的是 `eas build --profile preview` 那種內部散佈的包，
**不是 App Store 散佈的包**。TestFlight 要的是後者。

## 現況盤點

### 現成的那條路是 Capacitor 版的

`.github/workflows/ios-testflight.yml` 存在而且能動，但它底下跑的是 `npx cap sync` 與
`xcodebuild -project ios/App/App.xcodeproj`。React Native 版沒有 `ios/App/`
（`mobile/.gitignore` 把 `/ios` 排除掉，原生專案每次建置重新產生），也不經過 Capacitor。
**build 那一段一行都用不到。**

用得到的是它的另外兩大段——簽章與上傳——以及它指向的那批 secrets，因為兩版是同一個
Apple 帳號、同一個 Bundle ID：

| Secret | 用途 |
| --- | --- |
| `APP_STORE_CONNECT_KEY_ID` / `_ISSUER_ID` / `_PRIVATE_KEY` | App Store Connect API 金鑰，`altool` 上傳用 |
| `IOS_DIST_CERT_P12` / `_PASSWORD` | 散佈憑證（票 `ios-app 17` 那張 Apple Distribution） |
| `IOS_PROVISIONING_PROFILE` | 佈建描述檔 |
| `APPLE_TEAM_ID` | 團隊識別碼 |

Bundle ID 兩版相同：`io.github.brad0924.vapractice`（票 `ios-app 01` 定案）。
**App Store Connect 上那筆 app 記錄已經存在**，這張票不必重建。

### EAS 上的實況

`eas build:list` 查證（2026-09-03）：這個專案在 EAS 上跑過 12 次 iOS build，
**全部是 `development` profile、`distribution: internal`、build number 全是 1**。
`preview` profile 一次都沒用過，EAS 也還沒替這個專案建過任何發佈憑證。

`mobile/eas.json` 沒有 production profile、也沒有 `submit` 段。

### 版號那一格

Capacitor 版那支 workflow 拿 `github.run_number` 當 `CURRENT_PROJECT_VERSION`，
1.0.0 底下至少已經燒到 19（票 `ios-app 17` 記著 run 18、19 都成功上傳）。

### 圖示——查證後不必決定

開票時列的第 5 條問「`ios-app 21` 在 React Native 版還成不成立」。**不成立，因為它已經解決了。**

- `ios-app 21` 與 `22` 都是 `done`，`22` 把圖案重新設計成鉄紺底的玻璃格「単語」。
- `mobile/assets/icon.png` 與 `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`
  **md5 完全相同**（`89d28219223788426126957666ef5ac6`），兩張都是 `scripts/icon.svg`
  這份母檔產出來的（票 `03` 把 `mobile/` 那張接進同一支產生器）。

剩下的只有票 `22` 沒打勾的那兩條實機確認，它們要有 build 才看得到，因此併進本票驗收。

## 決定

### 一、build 在 GitHub 的 macOS runner 上跑，不用 EAS Build

改寫 `.github/workflows/ios-testflight.yml`，**不新開檔案**。build 段換成
`expo prebuild` → `pod install` → `xcodebuild`，簽章與上傳兩大段原封保留。

**這與 `../spec.md`〈路線〉寫的「EAS Build 雲端出包」不同，但沒有推翻它的理由。**
那句的理由是「整條路在 Windows 上走得完」——GitHub 的 macOS runner 同樣滿足。換的只是
向誰借那台 Mac。spec 的訂正與 `ADR-0017` 的註記見〈決定記在哪裡〉。

選它而不選 EAS 的理由：public repo 的 macOS runner 不計費，EAS 免費方案有每月配額與排隊；
而簽章那整套（臨時鑰匙圈、匯入 p12、讀 profile、清理）票 `ios-app 17` 已經做過一次，能搬。

### 二、不設停損條件

票上不寫任何「幾趟 CI 之後退回 EAS」的規則。卡住就繼續修。

**這與前兩張探路票（`swiftui-spike 01`、`rn-spike 01`）刻意寫死停損條件的做法相反**，
是維護者明確的選擇，理由與 spec 對 React Native 那條路線的態度一致。真的要退回 EAS 是
臨場判斷，不是這張票預先寫好的規則。

### 三、build number 繼續吃 `github.run_number`

沿用同一支 workflow 就沿用同一個計數器，天然接在 TestFlight 已經燒掉的號碼後面，
**不必去 App Store Connect 查任何數字**。這也是「改寫現有那支」而不是「新開一支」的
主要理由——新 workflow 的 `run_number` 從 1 開始，一定撞號。

底層問題沒有變，票 `ios-app 17` 已經記過：`run_number` 與 App Store Connect 的
build number 是兩套獨立計數器，re-run 時 `run_number` 不會 +1。維護者當時的決定是
不處理——撞號會在上傳那步大聲倒掉、不會靜默出錯，重跑一趟就過。**這張票沿用那個決定。**

### 四、兩套測試都當閘門

- 根目錄的 vitest（`npm test`）——裝著共用的 `core/lib` 那 21 支測試，包含加解密的六列標答
- `mobile/` 的 jest（`npm test`）——裝著相依守門與畫面測試

兩套都綠才往下 build。代價是每趟多幾分鐘、要裝兩份 `node_modules`，換到的是
「上傳到 TestFlight 的包有自動檢查擋過」。

### 五、憑證沿用現有那三組 secrets

`IOS_DIST_CERT_P12`、`IOS_DIST_CERT_PASSWORD`、`IOS_PROVISIONING_PROFILE` 原封不動，
**Apple 後台不新增任何憑證**。走 GitHub 自己 build 就沒有第二種走法，EAS 一張也不必建。

這順帶避開一格額度問題：票 `ios-app 17` 記著發佈憑證上限 3 張、當時建完第 3 張就滿了。
若讓 EAS 自己去建一套，可能得先撤掉一張。

現有的憑證有效期到約 2027-08，profile 是 2026-08 產的。到期怎麼續見
`docs/ios-signing-renewal.md`。

### 六、驗收線是裝進手機跑一遍

從 TestFlight 裝起來，確認四項原生功能還在（語音、觸覺、Keychain、每日提醒）。
**這是 App Store 散佈的包與 `preview` 包唯一會有差別的地方**——簽章與 entitlement
若有問題，`preview` 包測不出來。

順手補完票 `22` 那兩條實機確認，它們幾乎不花時間。

### 七、`ios-app 11`（送審）不解凍

它維持 `needs-triage`，送審仍然沒有時間點。**TestFlight 內部測試不需要任何 App Store
頁面素材**，兩件事天然分得開。

但它那行 `Blocked by` 全是 Capacitor 版的票號，React Native 版沒有一張對得上，
其中 `21` 而且已經 `done`。清單改成對得上現況的：`rn-rewrite 20` 加 `ios-app 20`。

### 八、Capacitor 那一側另開清理票

這張票**只換 workflow**。`ios/` 目錄、`@capacitor/*` 相依、`sync:ios` 指令、
`scripts/inject-signing.mjs` 與它的測試——這批換完 workflow 之後就沒人讀了，
清理獨立成票 `21`。

分開的理由：這張票的成功條件是「TestFlight 上出現裝得起來的 build」。混進移除工作的話，
第一趟 CI 倒掉時要先分辨是 prebuild 的問題還是清錯了東西。

### 決定記在哪裡

- `../spec.md`〈路線〉加一段訂正，講清楚「在 Windows 上走得完」這個理由沒變、換的只是向誰借 Mac
- `docs/adr/0017-react-native-rewrite-for-liquid-glass.md` 第 31 行那句順帶提到 EAS 的話補一行指回 spec

**不另開 ADR。** 這個決定不難反轉（換回 EAS 就是刪掉 workflow、打 `eas build`），
而 ADR-0017 的結論（選 React Native 而不選 SwiftUI）完全沒有被動到。

### `mobile/eas.json` 不動

`development` profile 還在天天用（連 Metro 開發），`preview` 留給票 `03` 那條
舊機器驗收。不加 production、不加 `submit` 段——這條路上用不到。

## 這張票不做的事

- **送審上架本身。** 這張票只到「TestFlight 上出現一個裝得起來的 build」，送審是 `ios-app 11`
- **App Store 頁面素材與多語系。** 那是 `ios-app 20`
- **移除 Capacitor。** 那是票 `21`
- **票 `03` 第 5 條**（iOS 26 以下的退回行為）。仍然沒有機器可驗，繼續開著
- **不改 app 的任何功能**，`core/`、`mobile/app`、`mobile/ui` 一個字都不動

## 已知的坑（動工時查證，不要照抄）

### `scripts/inject-signing.mjs` 直接搬過去會停下來

它靠專案檔裡那行 `CODE_SIGN_STYLE = Manual;` 定位，而那行是票 `ios-app 17` 手動寫進
Capacitor 專案檔的。`expo prebuild` 每次重新生成 `project.pbxproj`，不會有那行，
腳本會照設計當場停住。

等價的做法是寫一支 Expo config plugin（`mobile/plugins/with-app-check-first` 是現成的
形狀可以照抄）。**但先別急著寫**，見下一條。

### 票 `ios-app 17` 那四趟 CI 試出來的簽章分工，這裡可能不成立

當時的麻煩來自 Firebase 走 SPM 拉進八個額外 target，它們不接受被塞 provisioning profile，
所以 profile 名稱非得掛在 App target 上不可。

`mobile/app.json` 設了 `@react-native-firebase/app` 的 `disableSPM: true`，
**Firebase 走 CocoaPods**，Pods 是獨立的專案，簽章行為不一樣。

所以：**先試最簡單的——四個簽章設定全部從 `xcodebuild` 命令列傳**。倒了再寫 config plugin。
不要一開始就照抄那套複雜的分工。

### `xcodebuild` 要換成 `-workspace`

`expo prebuild` 加 CocoaPods 產出的是 `.xcworkspace` 不是 `.xcodeproj`。
scheme 名稱由 Expo 依 app 名稱決定，動工時從產物讀出來，**不要寫死**。

### 上傳那一步不變

`xcrun altool --upload-app` 與那三個 App Store Connect API secret 原封保留。

## 驗收

- [x] `ios-testflight.yml` 不再出現 `cap sync` 與 `ios/App/App.xcodeproj`
- [x] workflow 在 build 之前跑過根目錄的 vitest 與 `mobile/` 的 jest，任一支紅燈就不出包
      （加碼：兩套各配一道 `npm run typecheck`，見 2026-09-03 的 code-review 那則）
- [ ] 手動觸發一次 workflow，走完 prebuild、簽章、archive、export、上傳，全綠
- [ ] **Apple 後台的憑證張數一張都沒增加**（比照票 `ios-app 17` 的驗收）
- [ ] 臨時鑰匙圈在 job 結束時被清掉，不留在 runner 上
- [ ] App Store Connect 處理完，TestFlight 上出現這個 build
- [ ] **實機**：從 TestFlight 裝起來，四項原生功能都還在——日文語音唸得出來、評分有觸覺回饋、
      雲端備份的密碼存得進 Keychain、每日提醒排得出來
- [ ] **實機**（票 `22` 補完）：主畫面上是新圖示，不是舊的那疊閃卡
- [ ] **實機**（票 `22` 補完）：在深色桌布上，圖示邊界跟背景分得開
- [x] 網頁版部署（`deploy.yml`）不受影響
- [x] `core/`、`mobile/app`、`mobile/ui` 零改動

## Comments

### 2026-09-03 — 開票

> *This was generated by AI. 盤點是查過的，決定一條都還沒做。*

票 `19` 收掉之後，維護者問「我想針對這版做一次 TestFlight build，該開新對話嗎」，
盤點才發現這件事沒有票。〈現況盤點〉是當場查證的結果，〈要你拍板的〉五條一條都還沒問。

下一步是 `/grill-with-docs`。

### 2026-09-03 — 規格談完，轉 ready-for-agent

一輪 `/grill-with-docs`，四個回合。開票時列的五條全部有答案，值得記下來的轉折有兩個。

**第一次轉折：「沒辦法用 Github 的 CI 做了嗎?」**

第一輪我把選項寫成「舊 workflow 要留、停、還是改寫成呼叫 eas」，三個都預設了 build 走 EAS。
維護者反問的那一句把前提直接掀開。

查下去才發現我的框架有問題：GitHub CI 當初存在的理由是「借一台 Mac」，而 EAS Build
也是在借一台 Mac，兩者解的是同一個問題。React Native 版要多跑一步 `expo prebuild`
（Windows 跑不了，票 `03` 記過），但 macOS runner 跑得了——**GitHub CI 技術上做得完整條路**。

我第一輪還說過「這推翻 spec」，那句講重了。`spec.md`〈路線〉寫的是「EAS Build 雲端出包」，
但它給的**理由**是「整條路在 Windows 上走得完」，GitHub 的 runner 同樣滿足。
手段換掉、理由沒變。這是後來決定「訂正 spec 就夠、不另開 ADR」的依據。

**第二次轉折：停損條件從有變沒有。**

維護者說「有辦法先試 3 嗎，真的不行或太麻煩再改」，我因此把停損條件列成一題，
給了「五趟 CI」「撞到特定的牆」「不設」三個選項，並推薦第一個——理由是這個 repo 前兩張
探路票都刻意寫死停損。

答案選了「不設，做到通為止」。所以票上不寫任何觸發條件，「真的不行再改」回到臨場判斷。

**兩條不必決定的：**

- **圖示**（開票時的第 5 條）：`ios-app 21`、`22` 都已 `done`，而 `mobile/assets/icon.png`
  與 Capacitor 版那張 md5 相同。查證就解決了，不是決定。
- **憑證**（第 1 條）：一旦 build 走 GitHub，就只有「沿用現有 secrets」一條路。
  它本來排在第二輪要問，第一輪的答案出來之後自己消失了。

**版號那一題答過兩次。** 第二輪維護者選的是「查出最高號 +1，交給 EAS 的 `autoIncrement`」，
但第三輪決定不走 EAS 之後那個機制就不存在了，因此重問了一次，改成「繼續吃 `run_number`」。
重問而不是默默換掉，是因為那是兩個不同的答案。

### 2026-09-03 — workflow 換好了，剩下的都要人去跑

> *This was generated by AI.*

`.github/workflows/ios-testflight.yml` 一個檔，101 行進、37 行出。`core/`、`mobile/app`、
`mobile/ui`、`mobile/eas.json`、`deploy.yml` 都沒碰。`Status` 轉 `ready-for-human`——
剩下那七條驗收全是只有維護者做得到的：觸發 workflow、看 Apple 後台、從 TestFlight 裝上手機。

**`/implement` 一趟做完，沒有卡住的地方。**

#### 兩處與票上假設不同，都落在〈已知的坑〉那一區

**一、build number 不能照抄，但決定三的效果沒有變。**

票上〈版號那一格〉記著 Capacitor 版把 `github.run_number` 當 `CURRENT_PROJECT_VERSION`
傳給 `xcodebuild`。**那招搬過來會靜靜地失效。**

查 `mobile/node_modules/@expo/config-plugins/build/ios/Version.js` 的 `setBuildNumber`：
`expo prebuild` 把 `CFBundleVersion` 寫成**字面值 `"1"`**，不是 `$(CURRENT_PROJECT_VERSION)`
那種佔位符（`mobile/app.json` 沒設 `ios.buildNumber`，走的是預設值）。那個建置設定傳了
也沒有人讀，每一趟都會是 1，第二趟開始就撞號——而且會撞在上傳那步，前面全部白跑。

改成 prebuild 之後用 `PlistBuddy` 直接寫 Info.plist，寫完讀回來比對。**決定三沒有動**：
吃的還是 `run_number`，換的只是塞進去的方式。

沒有改 `mobile/app.json` 去加一格 `ios.infoPlist.CFBundleVersion`，理由是那會連帶影響
天天在用的 `eas build --profile development`，而這張票只該換 workflow。

**二、`PROVISIONING_PROFILE_SPECIFIER` 也放進指令列。**

票上寫「先試最簡單的——四個簽章設定全部從 `xcodebuild` 命令列傳」。那個「四個」數的是
Capacitor 版指令列上的四個，profile 名稱是被 `scripts/inject-signing.mjs` 單獨掛上去的第五個。
**這裡五個全放指令列**——手動簽章少了 profile 會當場倒，「最簡單」不可能是把它拿掉。

真的倒下來的話，下一步是寫 Expo config plugin。判斷依據（倒在什麼訊息上才算是這一種）
寫在 Archive 那一步的註解裡。

#### 本機驗過的

- YAML 剖析得開，15 個步驟
- 12 段 `run` 腳本逐一 `bash -n` 通過——CI 唯一測不到、一錯就白跑一趟的地方
- 根目錄 vitest：34 檔 639 支全綠
- `mobile/` jest：20 套 519 支全綠
- 兩邊 `tsc --noEmit` 都乾淨

#### 還開著的

- 票 `03` 第 5 條（iOS 26 以下的退回行為）仍然沒有機器可驗，這張票不碰
- 票 `21`（移除 Capacitor）要等這張票的 TestFlight build 真的裝得起來才解鎖

#### 補查：Xcode 不會把 PlistBuddy 寫的值蓋掉

`/code-review` 的 Spec 軸提了一個殘留風險：若 Expo 模板的 pbxproj 帶 `GENERATE_INFOPLIST_FILE=YES`，
Xcode 會自己生一份 `Info.plist`，寫進去的 build number 就白寫了。

抓 `expo-template-bare-minimum@57.0.21`（`expo prebuild` 實際用的那份模板）查實，三件事一次確定：

- **沒有 `GENERATE_INFOPLIST_FILE`**，只有 `INFOPLIST_FILE = HelloWorld/Info.plist`，指的是模板裡
  那份實體檔。Xcode 讀它、不生它，所以 `PlistBuddy` 寫的值站得住。
- 模板的 `CFBundleVersion` 本來就是字面值 `1`。`CURRENT_PROJECT_VERSION = 1` 在 pbxproj 裡有定義，
  但 `Info.plist` 從頭到尾沒有引用它——**傳給 `xcodebuild` 確實不會有任何作用**，上面那一節的判斷成立。
- 目錄名、`.xcodeproj`、`.xcscheme` 三者同名（`HelloWorld/`、`HelloWorld.xcodeproj`、
  `HelloWorld.xcscheme`）。`ios/$SCHEME/Info.plist` 這個推法因此是對的，而且共用 scheme 存在，
  `xcodebuild -workspace ... -scheme "$SCHEME"` 找得到。

### 2026-09-03 — `/code-review` 兩軸，維護者加了兩道閘門

**Spec 軸：零 finding。** 八條決定、五條不做的事、四個坑、十一條驗收逐條對過。
它另外自己查證了「build number 那一段」——確認 `mobile/app.json` 沒有 `ios.buildNumber`、
`setBuildNumber` 會寫字面值，所以改用 `PlistBuddy` 是對的、決定三語意沒變。
第五個簽章設定（`PROVISIONING_PROFILE_SPECIFIER`）也判為對〈已知的坑〉第二條的合理解讀。

**Standards 軸：零硬性違規。** 引號與變數展開、`GITHUB_ENV` 的先後、靜默失敗、secret 外洩、
`working-directory` 與相對路徑，逐項查過都沒問題。

#### 當場修掉的三件（都不改行為）

- `PLIST` 這個變數在同一支檔裡指過兩種東西——我新加那步的是 app 的 `Info.plist`，
  簽章那步的是 profile 解出來的 plist。把我這邊改名成 `INFO_PLIST`，簽章那一大段一個字不動。
- Archive 原本從 `SCHEME` 拼回 `ios/$SCHEME.xcworkspace`。改成把 prebuild 實際找到的
  `WORKSPACE` 一起傳下去、直接用它——拼回來等於把「目錄名與 scheme 同名」多賭一次。
- 票號引用混用了兩種寫法。統一成票檔自己在用的 `rn-rewrite 20`／`ios-app 17`
  （原本那串 `.scratch/rn-rewrite/issues/20` 少了 slug，點不開）。

#### 維護者拍板加了兩道

Standards 軸指出這支比同儕 workflow 鬆，兩件都端出去問，兩件都選了加：

- **每一套測試前面各配一道 `npm run typecheck`。** `test.yml` 兩個 job 都是「先 typecheck 再 test」，
  這支原本只有 test。**這一項小幅擴充了決定四**——那條點名的是兩套測試，現在是兩套測試加兩道型別檢查。
  理由是出正式包這條路不該比日常 CI 鬆。代價約半分鐘。
- **`timeout-minutes: 60`**，與 `mobile-crypto.yml` 同一個數字。不設的話 GitHub 預設六小時才砍，
  期間佔著 `concurrency` 名額，下一趟只能排隊。

#### 提了但不在這張票做的一件

`expo prebuild` 加「偵測 `.xcworkspace` 有沒有產出」那一段，`mobile-crypto.yml` 裡也有一份，
而且兩邊寫法**已經開始分岐**（那邊 `test -n "$(ls -d ...)"`，這邊 `WORKSPACE=$(... | head -1)`）。
抽成 composite action 是自然的收法，但那要動另一支 workflow，超出這張票的範圍。
**留給票 `21`**，它本來就要清這一區。

### 2026-09-03 — 第一趟 CI：倒在推播權限，不是簽章分工

run 21，`ARCHIVE FAILED`，exit 65。前面每一步都綠：兩套測試、prebuild、`pod install`、
build number 寫進 `Info.plist`、憑證與 profile 匯入，全過。

**〈已知的坑〉第二條那個賭注贏了。** 五個簽章設定全從指令列傳，Pods 那一側完全沒有排斥
provisioning profile，`inject-signing.mjs` 那套複雜分工確實不必照抄。倒的是別的東西：

```
error: Provisioning profile "va-practice App Store" doesn't include
       the Push Notifications capability. (in target 'JPVocab')
error: Provisioning profile "va-practice App Store" doesn't include
       the aps-environment entitlement. (in target 'JPVocab')
```

#### 這個失敗票 `19` 預言過，而且我們已經照它說的做了

`mobile/lib/daily-reminder-native.ts` 的檔頭寫著：

> 加了它，建置出來的 app 會帶著推播 entitlement，簽章時 Apple 會回頭查這個 App ID
> 有沒有開 Push Notifications 能力，沒開就當場失敗——為了一個一則都不會發的功能。
> **2026-09-02 維護者拍板不加。**

「不加」的做法是不把 `expo-notifications` 的設定檔外掛列進 `app.json` 的 `plugins`。
**那個做法在 Expo SDK 57 上無效。**

`expo-notifications` 被列在 `@expo/prebuild-config` 的 `versionedExpoSDKPackages` 裡
（`build/plugins/withDefaultPlugins.js` 第 171 行），`expo prebuild` 會**自動套用**它的外掛，
跟 `app.json` 寫了什麼無關。那支外掛的 iOS 那一半只有一句話：

```js
if (!config.modResults['aps-environment']) config.modResults['aps-environment'] = mode;
```

#### 修法：讓它加，然後拿掉

新增 `mobile/plugins/without-push-entitlement.js`，寫進 `app.json` 的 `plugins`。
**沒有去 Apple 後台開 Push Notifications 能力**——票 `19` 的結論（這支 app 不要推播權限）
沒有變，變的只是怎麼做到。憑證與 profile 一張都沒動，決定五因此照樣成立。

順序這一格是關鍵，查證過才寫：`@expo/config-plugins` 的 mod 執行順序是**倒過來的，
最後註冊的先跑**（`withMod` 先跑自己的 action，再呼叫前一個註冊的）。而註冊順序是
`app.json` 的 `plugins` 最先、自動套用的那批在後——所以寫在 `app.json` 裡的這支跑在最後，
拿得掉前面加上去的那格。這一條是本機跑小實驗量出來的，不是照文件猜的。

#### 它有兩支測試守著

這支外掛平常只有 macOS 上的 `expo prebuild` 跑得到，而且是「寫錯了會安靜地沒有效果」
的那一種——沒效果的下場就是再燒一趟十分鐘的 CI。所以補了
`mobile/plugins/without-push-entitlement.test.ts`，直接把 mod 鏈叫起來驗兩件事：

- `aps-environment` 被拿掉，其他 entitlement 一格不動
- 本來就沒有那格時**當場丟例外**，不安靜跳過（安靜跳過分不出「套件不再加它」與
  「順序壞了」，而後者要等 Archive 才發現）

`mobile/` jest 現在是 21 套 521 支，全綠。根目錄 vitest 34 檔 639 支不受影響。

#### 順帶訂正的一段註解

`mobile/lib/daily-reminder-native.ts` 檔頭那段說明現在是錯的（它說不寫進 `app.json`
就不會帶那格權限）。加了一小節訂正，講清楚結論沒變、機制換了。

#### 下一趟要看的

再觸發一次 workflow。build number 會是新的 `run_number`，不會撞號。
這次要看的是 Archive 能不能過——過了就輪到 export 與上傳兩步，那兩步這一趟還沒跑到。
