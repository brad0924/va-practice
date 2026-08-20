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
