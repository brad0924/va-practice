# 02 — repo 重排：`src/lib/` 抽成兩邊共用

Status: done
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

- [x] 純邏輯與其測試都在共用位置，網頁版從那裡 import
- [x] `npm run typecheck` 過
- [~] 既有測試全數通過（613 條全過）；搬走的 21 支測試一行未改，網頁版留下的 7 支只改 import 行，見下方 Comments
- [x] `npm run build` 與 `npm run build:ios` 都出得了包
- [x] `*-native.ts` 與 `src/ui/` 留在原地

## Comments

### 搬到哪裡、怎麼取

共用位置是 repo 根的 `core/`，共 40 個檔：`core/lib/` 35 檔（原始碼 18、測試 17），`core/i18n/` 5 檔（三語字串加索引與測試）。原始碼 3,463 行、測試 5,011 行。兩邊都用路徑別名 `@core/` 取，例如 `@core/lib/storage`、`@core/i18n`。

**`core/lib` 與 `core/i18n` 是刻意排成兄弟目錄的**，因為那正是 `src/lib` 與 `src/i18n` 原本的關係。這樣一來搬進 `core/` 的 40 個檔案，內部的相對 import（`./storage`、`../i18n`、`../lib/storage`）全部原封不動——git 認得出 40 個都是純 rename，零位元差異。

**深度也剛好一樣**（`src/lib` 與 `core/lib` 都在第二層），所以兩支測試裡指向 repo 根的 `../../` 路徑照樣通：`core/lib/app-name.test.ts` 讀 `ios/App/App/Info.plist`，`core/lib/cloud-backup.test.ts` 讀 `.scratch/cloud-backup/firebase-rules.json`。

**`core/` 換位置時要一起改的有四處**，這份清單也寫在 `tsconfig.json` 的 `paths` 上方：

| 檔 | 管什麼 |
| --- | --- |
| `tsconfig.json` 的 `paths` | `tsc --noEmit` 看不看得懂 `@core/` |
| `tsconfig.json` 的 `include` | `core/` 進不進型別檢查 |
| `vite.config.ts` 的 `resolve.alias` | 打包與 vitest 找不找得到檔 |
| `vite.config.ts` 與 `capacitor.config.ts` 各自的 import | 這兩支自己是設定檔，別名要等它們跑完才生效，只能寫相對路徑 `./core/lib/app-name` |

`vitest` 的 `setupFiles` 也跟著搬到 `core/test-setup.ts`。它做的事是「每支測試開跑前把介面語言接上繁體中文」，接的是 `core/i18n`——留在 `src/` 的話 `core/` 那 21 支測試會反過來依賴網頁版目錄，正是決定 2 要避開的事。

### 四個實作決定

1. **目錄**：`core/` 放 repo 根，網頁版留 `src/`，Expo 專案之後放 `mobile/`。不動 npm workspaces。
2. **`src/i18n/` 整個搬**。非搬不可：`storage.ts`、`cloud-backup.ts`、`app-error.ts` 都呼叫 `t()`，翻譯留在網頁版的話共用層會反過來依賴網頁版。
3. **`required-fields.ts` 從 `src/ui/` 搬進 `core/lib/`**。票的清單與 spec 第 63 行都列「必填格」；那個檔開頭自己寫著「完全不碰 DOM」，是規則不是畫面。票裡「`src/ui/` 一律不搬」指的是畫面碼。
4. **import 一律寫別名**，不寫 `../../core/...`。

### 驗收條件裡沒能百分之百做到的一條

「測試檔內容一行未改」對**搬走的那 21 支測試**（5,011 行）完全成立，git 認得出是純 rename。

**但留在網頁版的 7 支測試檔改了 import 那幾行**：`src/app.test.ts`、`src/i18n/smoke.test.ts`、`src/ui/{book-filter,data-view,list-view,reading-editor,stats-view}.test.ts`。它們 import 的模組搬走了，路徑非改不可。改的全是 `import` 那幾行，斷言、測資、測試名稱一字未動——`git diff --diff-filter=M` 逐行核對過。測試數字前後一致：32 檔 613 條，全過。

### 記下來但這張票不改的

- **共用層有兩支測試綁著網頁版的工具鏈。** `core/lib/app-name.test.ts` 用 Vite 的 `?raw` 讀 `ios/App/App/Info.plist` 與兩份 `public/privacy*.html`；`core/lib/cloud-backup.test.ts` 用 `node:fs` 讀 `.scratch/cloud-backup/firebase-rules.json`。兩支現在都過，但 Metro 上跑不了。要跟 React Native 的測試設定一起想。
- **`core/lib/gemini-reading.ts` 型別引用 `firebase/ai` 的 `SchemaRequest`。** 只是型別（`import type`，執行期會被抹掉），但 React Native 那側要讓 `tsc` 過就得裝得到 `firebase` 的型別。
- **`src/lib/glossary.test.ts` 留在原地**。它比對的是 `CONTEXT.md` 與 `docs/glossary.md` 兩份文件，不是領域邏輯，而且同樣靠 `?raw`。
- **文件裡指到已搬走檔案的路徑已一併更新**：`docs/adr/`（0003、0006、0010、0012、0013、0015）、`docs/spec.md`（必填格那兩處，它離開 `src/ui/` 了）、`index.html` 的 app 名稱來源註解。ADR-0017 講的是 `src/lib/` 這個目錄本身的歷史敘述，沒改。
- **`src/i18n/` 現在只剩 `smoke.test.ts` 一支**。翻譯檔都搬走了，目錄名有點名不副實。那支測的是三語各開一次整個 app，屬於網頁版畫面測試，留在網頁版沒錯；要不要改名或搬到 `src/` 根層，留給之後決定，這張票不順手改。
- **`vite.config.ts` 的 alias 是字串前綴比對**，將來若真出現叫 `@core-foo` 的套件會被誤命中。現在沒有這種東西，不預先加防護。
- **`scripts/hooks/privacy-signals.mjs` 不用動**。它用的是排除清單（`UNWATCHED`）不是白名單，`core/` 底下的檔照樣在守備範圍內。
