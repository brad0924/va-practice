# 05 — 隱私權政策分岔成兩段，商店隱私申報重跑

Status: ready-for-human
Type: enhancement
Blocked by: 01

決策背景見 `../spec.md`，本票對應決定十、十八。

## 要做什麼

### 一、隱私權政策

`public/privacy.html:172-194` 現在寫著三句話，改成固定金鑰之後對 iOS 版全部變假：

- 「必須由你**自行填入**一把 Google Gemini 的 API 金鑰才會啟用」
- 「**不經過任何第三方伺服器**……用的是**你自己申請**的金鑰、走**你自己**的額度」
- 「這個功能**預設關閉**」

那一節要分成兩段講：**網頁版**維持原文一字不改，**iOS app** 另寫一段。

`public/privacy-en.html` 同步改。**不多開檔案**——現在已經是按語言分的兩份，再按平台分會變四份。

iOS 那段要誠實寫出來的事：

- 讀音預填**預設啟用**，不需要任何設定。
- 使用者打的日文詞條會送到維護者的 Firebase 專案，再由 Google 的 Gemini 處理。
- 用的是**維護者提供的**金鑰、走維護者的額度。
- 送出的內容仍然僅止於詞條本身，不含釋義、複習進度或其他卡片（這一句原文還是真的，保留）。
- 免費層的內容可能被 Google 拿去改進模型。**這一項的同意主體換人了**：原本是使用者自己申請金鑰、自己接受 Google 的條款，現在是維護者替他決定的（`../spec.md` 決定十）。這句話必須寫出來，不能省略。
- 為了確認請求來自真的那支 app，會用到 Apple 的 App Attest 產生一份裝置證明。這份證明不含使用者身分、也不用於追蹤。

`public/privacy.html` 開頭那段給維護者的註解寫著「這頁寫的每一句都是那幾支程式實際的行為，不是宣示」——這條自我要求不放寬。改完要逐句對照 `gemini-reading.ts` 與新的 Firebase 路徑。

`scripts/hooks` 底下那兩道隱私權政策的提醒 hook（`.scratch/i18n/issues/11`）要確認仍然抓得到這次的改動。

### 二、App Store Connect 的隱私申報

App Privacy 那份表（商店頁上「App 隱私」欄位的來源）要重跑。原本沒有伺服器可以誠實勾「不收集資料」，現在有了：使用者輸入的詞條會經過維護者的 Firebase 專案。

至少要重新檢查的類別是 **User Content**。實際勾選以 App Store Connect 當下的表單為準，本票不預先寫死答案。

**注意兩個東西不要混淆**：這份表**不是** ATT（App Tracking Transparency）。ATT 是那個「允許 App 追蹤你跨其他公司的 App 和網站的活動嗎」的系統對話框，跟本功能無關——Apple 對「追蹤」的定義限於「把資料與其他公司的資料串起來做廣告投放或成效衡量、或交給資料仲介」，送詞條換假名不沾任何一條，而且這支 app 沒有廣告 SDK、不要 IDFA。**不要為此加上 ATT 提示。**

### 三、商店描述那句「不追蹤」

`.scratch/ios-app/store-listing.md:87-88` 寫著：

```
【不追蹤】
不收集分析數據，沒有第三方追蹤。
```

**評估後判定這句話仍然成立**，不必改：App Attest 是 Apple 自家的防偽驗證，不給 IDFA，Apple 明確把防詐與安全用途排除在追蹤定義之外；Firebase AI Logic 也不是分析工具。本票把這個判斷記錄下來，是為了讓下次有人問到時不必重新推導一遍。

三種 storefront 的文案（繁中、日本語、English）都確認過同一句。

## 為什麼要等票 01

政策裡寫的每一句都要對得上實際行為，而實際行為要等票 01 確定走得通、以及確定用了哪些元件（是否真的走 App Attest、是否真的是這個 Firebase 專案）才定得下來。

## 驗收

- `public/privacy.html` 與 `privacy-en.html` 的 Gemini 那一節分成網頁版與 iOS 版兩段，網頁版原文一字未改。
- iOS 那段的每一句都對得上 `gemini-reading.ts`（網頁路徑）與新的 Firebase 路徑（iOS 路徑）的實際行為。
- 「同意主體換人」那一句在兩種語言裡都寫出來了。
- App Store Connect 的 App Privacy 表重新填過並存檔。
- 沒有加入任何 ATT 提示。
- `npm test` 全綠（含 `scripts/` 那兩支 hook 的測試）。

## Comments

### 2026-08-20 — 票 03 交棒：多了一個裝置識別碼要交代

票 03 讓 iOS build 用上 Firebase Remote Config，而 **Remote Config 抓設定前一定會先跟 Google 要一組 Firebase Installation ID**（`@firebase/remote-config` 依賴 `@firebase/installations`，抓取請求帶 `X-Goog-Firebase-Installations-Auth` 標頭）。這是一組存在裝置上、註冊到 Google 的識別碼，App Attest 那條沒有涵蓋它。

本票的 iOS 那段要多寫一句對得上它的話。**票 03 只留這條交棒註記，不替本票決定措辭。** App Privacy 表的 Identifiers 類別也要一併重看。

### 2026-08-21 — 政策與文案改完，App Store Connect 那份表等人去填

**做完的（agent 這一端）**

- `public/privacy.html`、`privacy-en.html` 的 Gemini 那一節改成一個 `<h2>` 底下掛兩個 `<h3>`：
  「網頁版（選用，預設關閉）」與「iOS app（預設啟用）」。兩份各多一小段 `h3` 的樣式，
  刻意不給分隔線——有線就會看起來像另起一節，而這兩段講的是同一個功能的兩種情況。
- 網頁版那段的四個項目一字未改。原本開頭那句「編輯卡片時，本 app 可以代為填入漢字的假名讀音」
  搬到 `<h2>` 底下當共同引言，因為它對兩個平台都成立；「預設關閉、必須自行填入金鑰」那半句
  留在網頁版底下。用字沒有增刪。
- iOS 那段五個項目，逐句對得上 `gemini-reading-native.ts`：只送詞條（`promptFor`）、
  經過維護者的 Firebase 專案（`getAI` + `GoogleAIBackend`）、免費層級可能被拿去改進模型
  （spec 決定八不開計費）、App Attest 裝置證明（`FirebaseAppCheck` + `CustomProvider`）、
  Firebase 安裝識別碼（`firebase/remote-config` 依賴 `@firebase/installations`）。
- **「同意主體換人」寫進去了，兩種語言都有**，而且是那一項的粗體主句：
  「這件事是維護者替你決定的」／「That is a decision the maintainer made on your behalf.」
- 兩份的頁首日期更新為 2026-08-21（「本政策的變更」那節本來就承諾會更新它）。
- 兩份的檔頂註解補上 `gemini-reading-native.ts`，並註明這一節按平台分岔的出處。
- **沒有加入任何 ATT 提示。**

**票沒寫、但踩到同一條自我要求，一併改掉的兩處**

1. 「不收集分析數據」那節寫著「除了上述兩項**由你主動啟用的**功能之外……」。iOS 上讀音預填
   不是主動啟用的，這句對 iOS 變假。改成「除了上述那兩項功能之外」，英文同步。
2. `.scratch/ios-app/store-listing.md` 的【讀音預填（選用）】在繁中、日本語、English 三個
   storefront 都寫著「自備金鑰、預設關閉」——那正是這支 iOS app 的商店頁描述，整段已經是假的。
   三語一起改成 iOS 的實情（不必設定、AI 草稿、存前自己確認、填不出來就留空），標題的「（選用）」拿掉。
   文件末尾那條自我檢查（原本寫「與票 11『預設關閉、自備金鑰』一致」）跟著改寫，並把
   本票第三節對【不追蹤】的判定一起記進去，免得下次有人重新推導一遍。

**hook 那一條：不是「確認仍然抓得到」，是抓不到**

把 `privacy-signals.mjs` 的判斷邏輯直接套在本 feature 已經進版的 commit 上實測：

| commit | 做了什麼 | 命中 |
| --- | --- | --- |
| `9f22c26` | 讀音預填改走 Firebase | 2，但兩筆都落在 `gemini-reading.ts` 的**註解**上，只因為那行字裡有 `generativelanguage` |
| `d3d4077` | Remote Config，連帶多一組 Firebase 安裝識別碼 | **0** |
| `5765a69` | App Check 被拒時靜默 | 0 |
| `adf201a` | 429 訊息 | 0 |

原因是五個訊號全部假設「送出去」在程式碼裡看得見——寫死一個網址、按下 `fetch(`。
Firebase 這條路走 SDK，從頭到尾一個網址字串都沒有。`d3d4077` 尤其該被擋：它替裝置帶進了
一組註冊到 Google 的識別碼，也就是本票剛剛才寫進政策的那一句，而當時完全沒有東西出聲。

補了一條訊號 `\bfirebase\/[a-z-]+`（涵蓋 `firebase/ai`、`firebase/remote-config`、
`@capacitor-firebase/app-check`、`@firebase/installations`），並照現有「考題」的寫法把
`d3d4077` 凍成 `scripts/hooks/fixtures/d3d4077.diff`，加兩條回歸測試。補完後重掃：
`9f22c26` 13 命中、`d3d4077` 5 命中，都指在 `gemini-reading-native.ts` 上。
`adf201a` 與 `5765a69` 仍是 0，那是對的——那兩次只改畫面上的字，沒有改動任何離開裝置的東西。

**驗證**：`npm run typecheck` 乾淨，`npx vitest run` 全綠（31 檔 569 條，含 hook 那 26 條）。
兩份政策頁實際在瀏覽器裡渲染確認過標題層級與版面。

**還沒做、只有人做得到的**

App Store Connect 的 App Privacy 那份表要登入後台重填，agent 進不去。填的時候手上該有的事實：

- **User Content**：使用者輸入的日文詞條會離開裝置，經維護者的 Firebase 專案交給 Google 的 Gemini。
  送出的僅止於詞條本身加一段固定指示，不含釋義、複習進度或其他卡片。維護者這端不儲存、不記錄。
- **Identifiers**：Firebase 安裝識別碼（Remote Config 抓設定時產生，存在裝置上並註冊到 Google）；
  App Attest 的裝置證明（Apple 的防偽驗證，不是 IDFA，不含使用者身分）。
- 兩者都**不用於追蹤**（Apple 的追蹤定義是「與其他公司的資料串起來做廣告投放或成效衡量、
  或交給資料仲介」），這支 app 沒有廣告 SDK、不要 IDFA。
- 實際勾選以當下的表單為準，本票不預先寫死答案。

填完存檔後，這張票就可以轉 `done`。

### 2026-08-21 — 兩軸 code review 之後改掉的六處

Standards 軸沒有硬性違反（逐句對應、避用詞、美式拼字、日文標點、regex 慣例全過）。
Spec 軸抓到四句「寫得比程式滿」，全部屬實，連同 Standards 的兩條判斷題一起改掉：

1. **「請求會經過維護者的伺服器」** 直接牴觸 spec 決定四「維護者不養伺服器」。
   改成「請求不是直接送到 Gemini 的……維護者自己沒有伺服器，這一段全程在 Google 的機器上」。
2. **「連同一段固定的作答指示」** 對 iOS 不成立——那段指示在 Remote Config 上（spec 決定十五），
   同一份清單第五項自己就寫了。改成「由維護者設定的作答指示」。網頁版那句的「固定」是對的，沒動。
3. **「你打開 app 的那一刻就已經在用維護者的金鑰了」** 是修辭，程式上打開 app 什麼都不發
   （`prepare()` 要到編輯畫面才跑）。改成「你新增卡片、打完一個詞條，用的就已經是維護者的金鑰」。
4. **「每次請求會附上一份由 App Attest 產生的裝置證明」** 誇大了：實際附上的是會快取重用的
   App Check 憑證。改成「那份憑證由 Apple 的 App Attest 為這台裝置簽發，換一次可以用上一段時間」。
5. 新訊號的 `name` 從描述句改回可 grep 的字面（`firebase/*、Firebase*`），`means` 與同儕對齊。
6. **訊號本身還有一個洞**：只認帶斜線的模組路徑的話，`ios/` 那一整側是漏的——原生層寫的是
   `import FirebaseCore`，沒有斜線，而 App Attest 正是在 `AppDelegate.swift` 裡指定的（票 01）。
   pattern 擴成 `\bfirebase\/[a-z-]+|\bFirebase[A-Z]`，加兩條測試釘住：兩種寫法都認得，
   而散文裡的「Firebase AI Logic」（後面是空格不是大寫）不算命中。

另外把商店文案三語的「AI 產生／AIが作る／comes from an AI」改成「AI 猜的／AIの推測／an AI's guess」。
`CONTEXT.md` 的讀音預填 `_Avoid_` 列了「自動產生」（會讓人以為程式對結果負責），原句貼著那條線；
「猜」把責任講清楚，也正好是 spec 使用者故事 2 的用字。

**`CONTEXT.md` 的「讀音預填」詞條本身也已對 iOS 變假**（「需要使用者另行設定才會啟用」），
但那是票 06 第二節明文認領的範圍，本票不碰。

驗證：`npm run typecheck` 乾淨，`npx vitest run` 31 檔 571 條全綠。

### 2026-08-21 — App Privacy 那份表的查證結果

**先更正本票的一個前提：那份表不是「重跑」，是第一次填。** App Store Connect 上顯示的是
`Get Started`，代表從來沒填過。本票原文假設「原本沒有伺服器可以誠實勾不收集資料」，
實際上那格是空的，要從頭走完整份表——涵蓋範圍比本票設想的大，雲端備份那一段也在裡面。

**整份表押在 Apple 對「收集」的定義上**（`developer.apple.com/app-store/app-privacy-details`）：

> "Collect" refers to transmitting data off the device in a way that allows you and/or your
> third-party partners to access it for a period longer than what is necessary to service the
> transmitted request in real time.

關鍵是「**and/or your third-party partners**」。Google 是這裡的合作方，所以要看的是 Google 那端留不留，
不是維護者這端留不留。

**逐項的結論與出處**

| Apple 表單上的欄位 | 判定 | 依據 |
| --- | --- | --- |
| `User Content › Other User Content`（讀音預填的詞條） | 申報 | Gemini 條款的 Unpaid Services 段：內容用於「provide, improve, and develop Google products and services」，且「Human reviewers may read, annotate, and process your API input and output」。遠超過「即時完成這次請求」。 |
| `Identifiers › Device ID`（Firebase 安裝識別碼） | 申報 | Firebase 官方揭露對照表把 Remote Config 列為**一律**收集 Device ID，不是「看用法」那一類。 |
| `Other Data › Other Data Types`（App Attest 證明） | 申報 | 同一份對照表：App Attest 歸 Other Data。**走 DeviceCheck 才會是 Device ID**——本 app 是 App Attest（票 01 的 `06a759c` 確認不再退回 DeviceCheck）。 |
| `User Content › Other User Content`（雲端備份的密文） | **待判斷，建議申報** | 沒查到官方裁示。定義寫的是「allows you… to **access** it」，端對端加密之下維護者解不開，字面上不算；但 Apple 從沒發過「E2EE 可以不報」的條款。多報的代價是商店頁多一行，少報的代價是申報不實。與上面第一列是同一個型別，勾一次涵蓋兩者。 |

**每個型別後面的三題，四項答案一致**：Purposes → `App Functionality`（不勾 Analytics、不勾任何廣告用途）；
Linked to the user's identity → `No`；Used for tracking → `No`。

**三件不要做的事**

1. 不要加 ATT 提示（本票原文已寫；補一條觸發條件：ATT 的觸發點是上面第三題答 Yes，這裡全是 No）。
2. 不要勾 Analytics 當用途——送詞條是為了把讀音填回格子，那是功能。
3. **不要在 Firebase 主控台打開 AI monitoring。** 它預設關閉；打開後會把實際的提示詞與模型回覆
   存進 Cloud Logging 供主控台翻看，那會在 Google 之外**多一層維護者自己這端的保存**，本申報要整個重看。
   （`firebase.google.com/docs/ai-logic/monitoring`）

**順帶發現：隱私政策網址只填了繁中那格。** 右上語言下拉切換後，日本語與 English 兩格都要填
`privacy-en.html`（對應見 `.scratch/ios-app/store-listing.md`；日文共用英文版是 `.scratch/i18n/spec.md` 決定八）。

小抄（同樣內容的可讀版）：https://claude.ai/code/artifact/926802fd-3080-468a-8922-b60fe1c956e3
