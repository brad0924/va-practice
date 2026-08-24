# 02 — repo 重排：`src/lib/` 抽成兩邊共用

Status: ready-for-agent
Type: enhancement
Blocked by: 無，可立即開始

決策背景見 `../spec.md` 的〈程式碼怎麼擺〉。

## 為什麼有這張票

改寫之後畫面碼變成兩份（網頁版一份、React Native 一份），這是接受的代價。**但邏輯層只能有一份。**

雲端備份若有兩套實作在寫同一批資料，哪天解不開會查不出是誰寫壞的。排程、儲存、加解密都是同理。

這張票在任何 React Native 程式碼出現之前先做，因為之後每一張票都會 import 它。

## 要做什麼

把 `src/lib/` 那批純邏輯搬到兩邊都取得到的位置，網頁版改成從新位置 import。

要搬的是純邏輯：排程（`review.ts`）、儲存（`storage.ts`）、雲端備份（`cloud-backup.ts`、`cloud-crypto.ts`）、讀音（`reading.ts`、`reading-retry.ts`）、提醒排程（`daily-reminder.ts`、`reminders.ts`）、必填格（`required-fields.ts`）、型別（`types.ts`）等，連同它們的測試。

**`*-native.ts` 那批不要一起搬。** 它們是 Capacitor 專用的橋接（`haptics-native.ts`、`keychain-native.ts`、`speech-native.ts` 等），React Native 上要各自重接，不是共用的東西。

**`src/ui/` 一律不搬**，那是網頁版的畫面碼。

具體目錄怎麼排、要不要動用 workspace，由實作決定——判準是**網頁版與 React Native 都 import 得到同一份，而且只有一份**。

## 硬約束

**網頁版不出現任何行為回歸。** 這條沿用 `../../ios-app/spec.md` 的訂正版本：不為了這次改寫而改變網頁版的行為；共用程式碼上兩邊都有的 bug，修一次兩邊一起好，不算違反。

守門員是既有測試：**必須全數通過，而且一個都不准改**。這是一次搬家，不是一次重構。

## 這張票不做的事

- **不改任何邏輯。** 只搬位置與 import 路徑。
- **不碰 `src/ui/`。**
- **不建立 React Native 專案。** 那是票 `03`。
- **不順手重構。** 看到寫得不好的地方記下來，不要在這張票裡改。

## 驗收

- [ ] 純邏輯與其測試都在共用位置，網頁版從那裡 import
- [ ] `npm run typecheck` 過
- [ ] 既有測試全數通過，且測試檔內容一行未改
- [ ] `npm run build` 與 `npm run build:ios` 都出得了包
- [ ] `*-native.ts` 與 `src/ui/` 留在原地
