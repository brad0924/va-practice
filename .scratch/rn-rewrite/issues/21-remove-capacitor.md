# 21 — 把 Capacitor 那一整套移除

Status: ready-for-agent
Type: enhancement
Blocked by: ~~20~~（**2026-09-03 解除**：run 22 出了 TestFlight build，維護者實機裝起來驗過）

決策背景見 `../spec.md` 的〈路線〉。

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

1. **刪檔那批**——相依、`ios/`、`capacitor.config.ts`、`tsconfig.json` 的 include、
   `vite.config.ts` 的 ios 分支、`inject-signing`、圖示產生器。零風險。
2. **動網頁版程式碼那批**——10 個 `*-native.ts`、五個呼叫端、`core/lib/safety-copy.ts`、
   CONTEXT 與 glossary。有讓網頁版出錯的風險。

分開的理由：出事時 `git revert` 拆得開。

### 七、兩處註解裡的斷掉指標順手修掉

刪檔會讓兩段註解指向不存在的東西。**只改那幾個字，不動它們解釋的程式碼**：

- `.github/workflows/ios-testflight.yml` 第 204 行指著 `scripts/inject-signing.mjs`。
  那段在解釋「這一版為什麼可以把簽章設定全部從指令列傳」，論述本身仍然成立，
  只是那個檔沒了。改成講清楚它已被移除。**這不是 build 段，票 `20` 的界線沒有被跨過。**
- `src/styles.css` 第 28–30 行拿 Capacitor 的 `zoomEnabled: false` 當對照，說明
  `touch-action: manipulation` 為什麼要掛在 `*` 上。那個 iOS app 不存在了，
  括號裡「iOS app 的雙指本來就被 Capacitor 關掉了」整句拿掉，論述照舊。

`core/lib/`、`mobile/`、其餘 ADR 裡提到 Capacitor 的都是行文對照，指的是歷史上真的
發生過的事，**不動**。

## 這張票不做的事

- **不動 `mobile/` 底下任何東西**
- **不改網頁版的行為。** 拆掉的是走不到的路徑，使用者看得到的東西一個都不變
- **不碰 `.github/workflows/ios-testflight.yml` 的 build 段。** 那是票 `20`
- **不刪 `scripts/icon.svg`**，它是圖案的唯一來源
- **不改其他 ADR 裡提到 Capacitor 的行文**

## 驗收

第一批（刪檔）：

- [ ] `package.json` 沒有任何 `@capacitor` 開頭的相依，也沒有 `build:ios` 與 `sync:ios`
- [ ] `ios/` 目錄、`capacitor.config.ts`、`scripts/inject-signing.mjs` 與它的測試都不存在
- [ ] `tsconfig.json` 的 `include` 不再列 `capacitor.config.ts`
- [ ] `vite.config.ts` 沒有 `mode === 'ios'` 分支
- [ ] `npm run icons` 只寫出四個檔，最後一個是 `mobile/assets/icon.png`；
      重跑之後 `git status` 乾淨（圖案沒有漂移）
- [ ] `npm run typecheck` 與 `npm test` 全綠

第二批（動程式碼）：

- [ ] `src/lib/` 底下沒有任何 `*-native.ts`
- [ ] `core/lib/safety-copy.ts` 與它的測試不存在
- [ ] 全 repo 搜 `@capacitor` 只剩 `package-lock.json` 之外零筆
      （`core/`、`mobile/`、ADR 裡的行文對照不算，那是歷史）
- [ ] `CONTEXT.md` 與 `docs/glossary.md` 都沒有〈保險副本〉，`src/lib/glossary.test.ts` 綠燈
- [ ] `npm run typecheck` 與 `npm test` 全綠
- [ ] `npm run build` 出得了包
- [ ] **`mobile/` 零改動**（`git diff --stat mobile/` 是空的）
- [ ] `mobile/` 的 jest 全綠（確認沒有波及共用的 `core/`）
- [ ] `ADR-0015` 開頭多一行移除日期，其餘一字未動

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
