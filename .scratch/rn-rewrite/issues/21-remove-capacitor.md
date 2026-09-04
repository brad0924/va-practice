# 21 — 把 Capacitor 那一整套移除

Status: done
Type: enhancement
Blocked by: ~~20~~（**2026-09-03 解除**：run 22 出了 TestFlight build，維護者實機裝起來驗過）

決策背景見 `../spec.md` 的〈路線〉。

**做完了（2026-09-04）。** 兩個 commit：`a92bdab` 刪檔、`9fc9857` 動程式碼。驗收 15 條全過。

**規格談完了（2026-09-04 一輪 `/grill-with-docs`）。** 開票當天列的〈要你拍板的〉五條
已全部有答案，另外兩條是動工前重新盤查才浮出來的。底下〈決定〉那七條是那一輪談定的，
不是實作時的自由選擇。

## 為什麼有這張票

票 `20` 決定改寫 `.github/workflows/ios-testflight.yml`，把 build 段換成 React Native 的
流程。改完之後，Capacitor 那一整套就沒有任何東西在讀了——但它還留在 repo 裡。

票 `20` 刻意不順手清掉，理由寫在它的〈決定〉第八條：**那張票的成功條件是「TestFlight 上
出現裝得起來的 build」**，混進移除工作的話，第一趟 CI 倒掉時要先分辨是 prebuild 的問題
還是清錯了東西。

## 現況盤點

查證於 2026-09-03，動工前（2026-09-04）重新盤查過一次，多找到兩項。

### 相依套件（7 個）

`package.json` 裡的 `@capacitor/core`、`@capacitor/cli`、`@capacitor/ios`、
`@capacitor/filesystem`、`@capacitor/share`、`@capacitor-firebase/app`、
`@capacitor-firebase/app-check`。

### 原生專案與設定

- `ios/` 整個目錄（Xcode 專案、`Assets.xcassets`、`Splash.imageset`、`CapApp-SPM`）
- `capacitor.config.ts`
- **`tsconfig.json` 的 `include` 陣列列著 `capacitor.config.ts`**（2026-09-04 新找到）

### 建置流程

- `package.json` 的 `build:ios`（`vite build --mode ios`）與 `sync:ios`
- `vite.config.ts` 裡那條 `mode === 'ios'` 的分支
- `scripts/inject-signing.mjs` 與 `scripts/inject-signing.test.mjs`

### 網頁版程式碼裡的原生接縫（10 個檔，647 行）

`src/lib/` 底下那批 `*-native.ts`：`cloud-consent-native`、`daily-reminder-native`、
`download-native`、`foreground-native`、`gemini-reading-native`、`haptics-native`、
`keychain-native`、`safety-copy-native`、`speech-native`，加上 `download-native.test.ts`。

它們接在五個地方：`src/app.ts`（五處 import）、`src/main.ts`（兩處）、`src/ui/dom.ts`、
`src/ui/editor-view.ts`（動態 import）、`src/ui/speech.ts`。

**這批是這張票真正的工作量，其餘都只是刪檔。** 網頁版在瀏覽器裡跑的時候這些路徑本來就
走不到（`isNative` 為 false），但它們是活的程式碼，拆掉要動到呼叫端。

### `core/lib/safety-copy.ts` 會變成孤兒（2026-09-04 新找到）

`src/lib/safety-copy-native.ts` 是它唯一的呼叫端。**`mobile/` 從來沒有用過它**——票 `07`
決定 React Native 版不接保險副本。接線一拆，`core/lib/safety-copy.ts` 與
`core/lib/safety-copy.test.ts`（172 行）就沒有任何人讀。

### 圖示產生器

`scripts/generate-icons.mjs` 目前寫出四張 PNG，其中一張的目的地是
`ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`。
`scripts/generate-icons.test.mjs` 有測試守著那個檔。

**這一項不是單純刪掉。** React Native 版的 `mobile/assets/icon.png` 是同一支腳本、
同一份 `scripts/icon.svg` 產出來的，兩張 md5 相同。刪掉 `ios/` 那張之後，
腳本與測試要跟著改成只認 `mobile/` 那張。

### CONTEXT.md 裡有一則詞條指著 Capacitor 版

「**保險副本**」寫著「**只在 Capacitor 版成立**」。Capacitor 版不存在之後那一則要怎麼處理，
是這張票的範圍。

## 決定

### 一、`src/lib/*-native.ts` 那 10 個檔整批刪，連呼叫端一起收

刪掉之後，五個呼叫端跟著簡化。網頁版拿到的本來就是「空的東西」——`createNativeHaptic()`
回傳空殼、`createNativeDailyReminder()` 回傳 null、`main.ts` 的 `isNative()` 永遠是 false。
那些分支一起消失。

**使用者看得到的東西一個都不變。** 拆掉的全是在瀏覽器裡走不到的路徑。

不選「留著」的理由：那 10 個檔 import 的是 `@capacitor/*`，相依一拔掉 `npm run typecheck`
當場紅燈。留著它們等於連七個相依套件也要留，這張票就只剩下刪 `ios/` 目錄。

### 二、保險副本這個概念從專案裡整個消失

- 刪 `core/lib/safety-copy.ts` 與 `core/lib/safety-copy.test.ts`
- 刪 `CONTEXT.md` 的〈保險副本〉詞條
- 刪 `docs/glossary.md` 對照表的那一列

**後兩者必須同一個 commit 一起改**，`src/lib/glossary.test.ts` 釘的是條目清單本身，
少一條、多一條都紅燈。

不改寫成歷史註記的理由：`CONTEXT.md` 是現況的詞彙表，不是編年史。要查它為什麼消失，
路徑是 `ADR-0015` 與票 `07`。

### 三、啟動畫面不搬，跟 `ios/` 一起刪

`ios/App/App/Assets.xcassets/Splash.imageset/` 底下是三張同一張圖（Capacitor 的預設模板
寫法）。**React Native 版沒有讀它**——`mobile/assets/` 底下只有 `icon.png` 一個檔，開機畫面
由 `mobile/app.json` 的 `expo-splash-screen` 現場畫：底色 `#141821`、中間放 app 圖示、寬 180。

那個樣子是票 `20` 的 TestFlight build 實機裝起來看過的，不動它。

### 四、圖示產生器改成只認 `mobile/` 那張

`scripts/generate-icons.mjs` 的 `NATIVE_ICONS` 陣列拿掉 `ios/` 那一筆，
`scripts/generate-icons.test.mjs` 跟著改。**母檔 `scripts/icon.svg` 留著**，它仍是圖案的
唯一來源。`public/` 底下那三張（192／512／1024）不受影響。

### 五、`ADR-0015` 補一句移除日期，不加狀態欄位

在開頭那段引言後面補一行「2026-09-04，Capacitor 那一整套已從 repo 移除（票 `21`）」，
其餘一字不改。

**不加 `Status: superseded` 欄位。** 目前 20 份 ADR 沒有任何一份有狀態欄，被推翻的那幾份
（`0002`、`0008`、`0012` 等）全靠開頭的引言註記。開一個新慣例只為了這一份，會讓其他份顯得不一致。

### 六、一次做完，切兩個 commit

同一張票做完，但分兩批送：

1. **刪檔那批**——`ios/`、`capacitor.config.ts`、`tsconfig.json` 的 include、
   `vite.config.ts` 的 ios 分支、`inject-signing`、圖示產生器、`package.json` 的
   `build:ios` 與 `sync:ios`。零風險。
2. **動網頁版程式碼那批**——10 個 `*-native.ts`、五個呼叫端、七個 `@capacitor/*` 相依、
   `core/lib/safety-copy.ts`、CONTEXT 與 glossary。有讓網頁版出錯的風險。

分開的理由：出事時 `git revert` 拆得開。

**訂正（2026-09-04，動工時）：七個相依從第一批移到第二批。** 開票時把相依算進「刪檔那批」，
順序是反的——`src/lib/*-native.ts` 還在 `import` 那七個套件，先拔相依會讓 `npm run typecheck`
當場紅燈。相依必須與讀它的那批程式碼同一個 commit 走。

代價是第一批不再是「全部的刪檔」，只是「沒有人讀的那些檔」。兩批各自仍然自成一體、
各自 typecheck 與測試全綠，`git revert` 照樣拆得開。

### 七、指向已刪檔案的註解一律修掉，純歷史行文一律不動

**分界線是「照著這行字去找，找不找得到東西」**，不是那行字提不提到 Capacitor：

- **指標斷了 → 修。** 只改那幾個字，不動它解釋的程式碼。
- **只是拿當年的做法當對照 → 不動。** 那些寫的是歷史上真的發生過的事。

#### 要修的（動工時清出來的完整清單）

| 位置 | 斷在哪 |
| --- | --- |
| `.github/workflows/ios-testflight.yml` | 指著 `scripts/inject-signing.mjs` |
| `src/styles.css` | 拿一個不存在的 iOS app 的雙指行為當對照 |
| `core/lib/` 八支檔 | 指著 `safety-copy.ts`、`src/lib/*-native.ts` 或 `ios/App/App/Info.plist` |
| `src/app.test.ts`、`src/ui/dom.test.ts` | 講「兩條訊號」「兩條路」，現在各只剩一條 |
| `public/privacy.html`、`privacy-en.html` | 檔頭那份對照清單的路徑 |
| `docs/adr/0002`、`docs/adr/0012` | 見底下 |

workflow 那一處只改註解，**build 段一行不動，票 `20` 的界線沒有被跨過**。

#### 兩份 ADR 各補一則日期註記，正文一字不改

這兩份不是「提到 Capacitor」而已，是**整份的前提被這次移除改掉了**：

- **`ADR-0002`**（localStorage 為唯一來源）有一則 2026-08-18 的補充在講保險副本。
  那個東西現在連程式碼都沒了，那則補充從此純屬歷史。
- **`ADR-0012`**（顯示名稱）列著 app 名字寫在七個地方，其中三個被這次移除掉了
  （`capacitor.config.ts`、`ios/App/App/Info.plist`、`src/ui/data-view.ts`）。

**兩份都只在開頭或結尾補一則帶日期的註記，正文一個字不改**——比照 `ADR-0015`
自己開頭那一段的寫法。這是這個 repo 處理「被後來的事實推翻」的既有慣例，`0002`、`0008`、
`0012` 都是這樣。

#### 不動的

`core/lib/storage.ts`、`cloud-crypto.ts`、`gemini-reading.ts`、`reading-retry.ts` 裡
「網頁版與 Capacitor 版⋯⋯」「兩條 Firebase 路徑（Capacitor 版 iOS 與 React Native 版）」
那類句子，以及 `scripts/hooks/privacy-signals.mjs` 舉 `@capacitor-firebase/app-check`
當例子那一行——都是行文對照，指的是歷史上真的發生過的事。

**`mobile/` 底下六處指向 `src/lib/*-native.ts` 與 `ios/App/App/*.swift` 的註解也不動**，
即使那是斷掉的指標。理由是〈驗收〉那條「`mobile/` 零改動」是這張票最硬的一道守門，
不值得為六行註解換掉。另開一張票處理。

### 八、`data-view.ts` 那兩段永遠畫不出來的 UI 也拆掉

**（2026-09-04 動工時追加，維護者當場拍板。）**

拆掉接線之後，`App` 介面的 `reminder` 與 `cloudConsent` 在網頁版永遠是 `null`。
它們各撐著「資料」畫面上的一段 UI：

- 每日提醒那一整區（106 行），外面包著 `if (reminder === null) return null`
- 「這台裝置拒絕過雲端、按這裡接回來」那一塊，外面包著 `app.cloudConsent?.declined() === true`

**兩個判斷式在網頁版恆為 false，那兩段從來沒有被畫出來過。** 連同 `App` 介面那兩個欄位
與 `data-view.test.ts` 針對它們的四個測試一起拆。

〈決定〉第一條點名的是五個呼叫端，`data-view.ts` 不在裡面——它不 `import` 任何
`*-native.ts`，是隔一層讀 `app.reminder`。因此另外問過。

拆掉不損失任何守門：那一區的行為在 iPhone 上由 `mobile/ui/data-screen.tsx` 負責，
它有自己完整的測試（`mobile/ui/data-screen.test.tsx`）。`data.reminder*` 那批 i18n 字串
**留著不動**，`mobile/` 還在用同一批鍵。

## 這張票不做的事

- **不動 `mobile/` 底下任何東西**（含那六處斷掉的註解指標，另開票）
- **不改網頁版的行為。** 拆掉的是走不到的路徑，使用者看得到的東西一個都不變
- **不碰 `.github/workflows/ios-testflight.yml` 的 build 段。** 那是票 `20`
- **不刪 `scripts/icon.svg`**，它是圖案的唯一來源
- **不改 ADR 的正文。** `ADR-0002`、`ADR-0012`、`ADR-0015` 都只在外圍補一則帶日期的註記

## 驗收

第一批（刪檔，commit `a92bdab`）：

- [x] `package.json` 沒有 `build:ios` 與 `sync:ios`
- [x] `ios/` 目錄、`capacitor.config.ts`、`scripts/inject-signing.mjs` 與它的測試都不存在
- [x] `tsconfig.json` 的 `include` 不再列 `capacitor.config.ts`
- [x] `vite.config.ts` 沒有 `mode === 'ios'` 分支
- [x] `npm run icons` 只寫出四個檔，最後一個是 `mobile/assets/icon.png`；
      重跑之後 `git status` 乾淨（圖案沒有漂移）
- [x] `npm run typecheck` 與 `npm test` 全綠

第二批（動程式碼，commit `9fc9857` 起）：

- [x] `package.json` 沒有任何 `@capacitor` 開頭的相依，`package-lock.json` 也清乾淨
- [x] `src/lib/` 底下沒有任何 `*-native.ts`
- [x] `core/lib/safety-copy.ts` 與它的測試不存在
- [x] 全 repo 搜 `@capacitor` 只剩行文對照
      （`mobile/lib/share-file-native.ts`、`scripts/hooks/privacy-signals.mjs`、
      `docs/adr/`、`.scratch/` 的舊票，以及 `scripts/hooks/fixtures/*.diff` 那兩份錄下來的舊 diff）
- [x] `CONTEXT.md` 與 `docs/glossary.md` 都沒有〈保險副本〉，`src/lib/glossary.test.ts` 綠燈
- [x] `src/ui/data-view.ts` 沒有 `reminderSection`，`App` 介面沒有 `reminder` 與 `cloudConsent`
- [x] `npm run typecheck` 與 `npm test` 全綠
- [x] `npm run build` 出得了包
- [x] **`mobile/` 零改動**（`git diff --stat mobile/` 是空的）
- [x] `mobile/` 的 jest 全綠（確認沒有波及共用的 `core/`）
- [x] `ADR-0002`、`ADR-0012`、`ADR-0015` 各多一則帶日期的註記，三份的正文都一字未動

## Comments

### 2026-09-03 — 開票

> *This was generated by AI. 盤點是查過的，決定一條都還沒做。*

票 `20` 的 `/grill-with-docs` 談到「Capacitor 那一側要收到哪裡」時，維護者選了
「另開一張清理票，票 `20` 只換 workflow」。這就是那張票。

開票時只盤點、不決定，形狀比照票 `20` 當初的開法。下一步是 `/grill-with-docs`，
把〈要你拍板的〉五條談完再轉 `ready-for-agent`。

### 2026-09-04 — 規格談完，轉 ready-for-agent

一輪問答，兩個回合。開票時列的五條全部有答案，另外從動工前的盤查裡多找到兩項。

**第一回合的四題有三題被反問。** 維護者問的是「這是做什麼的」「跟 Capacitor 有什麼關聯」
「現在 RN 版有用到嗎」——卡住的不是選項寫得不夠清楚，是題目底下那幾個名詞沒有先建立起來。
補了一段比喻（Capacitor 版是「把網站裝進盒子」，`*-native.ts` 是穿過盒子的接線，保險副本
是「防房東進來清掉」的抄本）之後，同樣三題一次就答完。

**多找到的兩項都在盤查裡。** `tsconfig.json` 的 `include` 列著 `capacitor.config.ts`，
開票當天沒查到；`core/lib/safety-copy.ts` 會變孤兒，是因為開票時只盤點 `src/`，沒往 `core/` 追。
第二項把〈保險副本〉從「文件怎麼寫」變成「程式碼也要一起收」。

〈決定〉第七條是這一輪多出來的範圍：兩段註解會指向被刪掉的東西。決定順手修掉，
但界線畫得很緊——只改那幾個字，`.github/workflows/` 的 build 段一行不動。

### 2026-09-04 — 做完，驗收全過

兩個 commit：`a92bdab`（刪檔）、`9fc9857`（動網頁版程式碼）。78 個檔，刪 3983 行、加 131 行。
跑完 `/code-review`，Standards 與 Spec 兩軸各出一份。

**票面被改了三處，都是追認實作。** 這三處在 review 時被 Spec 軸點名為 scope creep，
維護者裁示「把實際做了什麼寫進票」：

1. **決定六的批次順序訂正。** 七個相依非得跟讀它們的那批程式碼同一個 commit 走，
   否則第一批的 typecheck 當場紅燈。開票時沒想到這一層。
2. **決定七整條改寫。** 原本寫「`core/lib/`、`mobile/`、其餘 ADR⋯⋯不動」，那條界線劃錯了地方——
   它按「有沒有提到 Capacitor」分，但真正該分的是**「照著這行字去找，找不找得到東西」**。
   刪掉 `safety-copy.ts` 與 `ios/` 之後，`core/lib/` 八支檔、兩支測試、兩份隱私頁的檔頭
   全都指向不存在的檔案。改成按「指標斷了就修，純歷史行文不動」分。
3. **補上決定八。** `data-view.ts` 那兩段永遠畫不出來的 UI，是動工中途另外問維護者、
   當場拍板「拆」的，開票時完全沒盤點到。

**Standards 軸找到 11 條，9 條是真的。** 全部是同一個病灶——我改了程式碼、沒改它上面那句話。
兩支測試的註解還在講被刪掉的參數、`data-view.ts` 的「四區」該是三區、`dom.ts` 與 `dom.test.ts`
還在講「兩條路」、`cloud-consent.ts` 的檔頭跟自己下一段矛盾。都在同一個 commit 補掉了。

剩下兩條：一條是誤判（CONTEXT 的〈複製〉寫「振假名靠疊字做」，那正是 React Native 版現在的做法，
沒有過期）；一條是判斷題不採納（`dom.ts` 的 `download()` 保持 `async`，呼叫端都在 `await`，
改成同步會漣漪出去、換不到東西，只把註解改掉）。

**`mobile/` 底下六處斷掉的註解指標另開票。** 那六行寫著「與 `src/lib/haptics-native.ts` 同一個理由」
這類話，指的檔案都被這張票刪了。不在這裡順手修，是因為〈驗收〉那條「`mobile/` 零改動」
是確認沒弄壞手機版最硬的一道守門，不值得為六行註解換掉。

### 2026-09-04 — 收票後補掉兩處漏網

維護者問「有沒有需要手動驗收的地方」，順手再掃一次，發現盤查時漏了兩處。
**病灶是搜尋詞太窄**：整趟只搜「capacitor」，沒搜「ios/」。

- `.github/workflows/deploy.yml` 的 `paths-ignore` 還列著 `ios/**`，註解寫「兩個 iOS 版」。
  不影響行為（一個永遠不會命中的條件），但就是決定七要修的那一類。
- `docs/ios-signing-renewal.md` 第 153 行說 App Attest 的 `production` 來自
  `ios/App/App/App.entitlements`。**那是活的操作手冊**——2027 年 8 月換憑證時有人會照著做。
  同一個值現在寫在 `mobile/app.json` 的 `ios.entitlements`，`expo prebuild` 每趟寫進產物。
  論述完全成立，只是來源換了地方。

查證過、確認不必動的兩處：`.github/workflows/ios-testflight.yml` 第 116 行的
`ios/$SCHEME/Info.plist` 是活的（那一步 `working-directory: mobile`，指的是 prebuild 重生的
`mobile/ios/`）；`scripts/hooks/privacy-signals.test.mjs` 裡那幾個 `ios/App/App/*.swift`
是餵給比對函式的字串，不讀檔，28 個測試照樣全過。
