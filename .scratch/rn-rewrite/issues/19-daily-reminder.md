# 19 — 每日提醒接到 React Native 上

Status: needs-triage
Type: enhancement
Blocked by: 18

決策背景見 `../spec.md` 的〈原生功能〉。

**開這張票是為了不讓它沉底**，規格還沒談完——`Status` 因此是 `needs-triage` 而不是
`ready-for-agent`。動工前要先把〈還沒決定的事〉那幾條問過維護者。

## 為什麼有這張票

`../spec.md`〈原生功能〉列了四項要在 React Native 上重接，`ADR-0015` 寫明這四項是通過
App Store 審查準則 4.2（Minimum Functionality）的實質內容，少一項就是一支「把網站裝進殼裡」
的 app，會被退件。

| 項目 | 狀態 |
| --- | --- |
| 原生日文語音 | 票 `11`，已收 |
| 評分觸覺 | 票 `08`，已收 |
| Keychain 存密碼 | 票 `17` |
| **每日提醒** | **這張票** |

它本來排在資料頁那張票裡。2026-09-01 拍板拆出來，理由是它與資料頁另外三區**沒有任何共用的東西**：
要裝 `expo-notifications`、加設定檔外掛、走一次系統通知權限、排未來七天的通知，
而且資料變動時整批要重排。混在一起的話資料頁那張票的驗收會卡在通知權限這一關。

## 現成的東西

**純邏輯一行都不必改**，`core/lib/` 底下兩支已經在那裡：

- `core/lib/reminders.ts`（61 行）：哪一天會積到幾張到期卡。不取用系統時鐘、不碰原生 API。
- `core/lib/daily-reminder.ts`（304 行）：把預估翻成一批要登記的通知、記住這台有沒有開提醒、
  資料變動時重排。同樣不碰原生 API——**怎麼登記通知由呼叫端遞進來**。

要接的只有 `ReminderNative` 那三支方法（`daily-reminder.ts:65`）：問權限、要權限、整批換掉。
Capacitor 那一端的接線在 `src/lib/daily-reminder-native.ts`，可以照著看，但**實作不能照抄**——
那一支底下是 app 自己寫的 Swift 插件（`ios/App/App/DailyReminderPlugin.swift`）。

畫面那一區的樣子照網頁版 `src/ui/data-view.ts` 的 `reminderSection()`：一個開關加一格時間，
外加權限被拒絕時那句話（`data.reminderDenied`）。**時間格用系統那個滾輪**，
自己做一個只會比它差。

## 還沒決定的事

動工前要問維護者，一輪問完：

1. **原生那一端用 `expo-notifications`，還是自己寫一支 Swift 模組？** Capacitor 版選了自己寫，
   理由是「不必為了四支方法多牽一條 npm 依賴」。React Native 這邊的權衡不一樣——
   `expo-notifications` 是 Expo 官方套件，而自己寫 Swift 模組要處理新架構的接線。
2. **iOS 同時登記通知有 64 則的上限**，`reminders.ts` 現在排七天（`FORECAST_DAYS = 7`），
   遠低於上限。這個數字要不要跟著改。
3. **資料變動時重排的觸發點放哪。** 網頁版接在 `app.ts` 的 `persist()`；手機上對應的位置是
   `mobile/lib/review-session.ts` 的 `onPersisted`，那裡現在掛著雲端推送。
4. **這一區在資料頁的分組清單裡怎麼擺。** 開關是一列，時間是另一列點進去選？還是同一列？

## 驗收

規格談完再寫。至少要包含：權限拒絕時開關會彈回去、通知真的在設定的時刻送到鎖定畫面、
複習完當天的卡之後當天不再叫、以及跨過午夜之後排的是新的一批。
