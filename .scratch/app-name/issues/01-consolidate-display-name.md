# 01 — 顯示名稱收斂成單一來源

Status: done
Type: enhancement
Blocked by: 無，可立即開始

本功能沒有 spec.md——只有兩張票，決策背景全在這張票的「決定」一節。

## 要做什麼

app 的顯示名稱目前以字面值散在七個位置，分短名（`JLPT 單字`）與全名（`JLPT 單字複習`）兩組。把它收斂成一份常數，讓改名時不會漏改。

**這張票一個字都不改名字。** 常數誕生時就填現有的兩個值，跑完之後使用者看到的畫面與現在一模一樣。改名是票 02 的事。

### 現況：七處字面值

短名 `JLPT 單字`：

| 位置 | 誰在吃它 |
| --- | --- |
| `capacitor.config.ts:8` `appName` | **沒人在吃**，見下方「那行 appName 是死的」 |
| `ios/App/App/Info.plist:10` `CFBundleDisplayName` | iPhone 主畫面圖示底下那行字 |
| `index.html:9` `apple-mobile-web-app-title` | 網頁版「加入主畫面」的名字 |
| `vite.config.ts:25` manifest `short_name` | Android 主畫面 |
| `src/ui/data-view.ts:45` | app 內提示「設定 → JLPT 單字 → 通知」，引用的正是 iOS 主畫面那個名字 |

全名 `JLPT 單字複習`：

| 位置 | 誰在吃它 |
| --- | --- |
| `index.html:12` `<title>` | 瀏覽器分頁標題 |
| `vite.config.ts:24` manifest `name` | PWA 安裝提示 |
| `public/privacy.html` `:19`／`:108`／`:111`／`:199` | 隱私權政策頁的分頁標題、頁首的更新日期那行、內文首句、頁尾的返回連結 |

## 決定

### 保留短名與全名兩個值，不壓成一個

PWA manifest 規範本來就要 `name`（完整名，安裝提示用）與 `short_name`（主畫面圖示用，會被截斷）兩欄；iOS 主畫面圖示底下約 11–12 個全形字就會截成「JLPT 單…」。**一長一短是各平台的真需求，不是失誤。**

所以單一來源是一個含兩欄的物件，不是一個字串：

```ts
// src/lib/app-name.ts
export const APP_NAME = {
  short: 'JLPT 單字',
  full: 'JLPT 單字複習',
};
```

放 `src/lib/` 與 `storage.ts`、`cloud-backup.ts` 同層。守門測試放 `src/lib/app-name.test.ts`——`vite.config.ts` 的 vitest `include` 只掃 `src/**/*.test.ts`，放別處就得動測試設定。

### 能 import 的就 import，剩下的用測試守門

七個位置不是同一種檔案，這決定了手法：

| 位置 | 手法 |
| --- | --- |
| `vite.config.ts` manifest `name`／`short_name` | `import` |
| `src/ui/data-view.ts:45` | `import` |
| `capacitor.config.ts` `appName` | `import` |
| `index.html` `<title>`、`apple-mobile-web-app-title` | Vite plugin 替換佔位符 |
| `ios/App/App/Info.plist` `CFBundleDisplayName` | **字面值 + 守門測試** |
| `public/privacy.html` × 4 | **字面值 + 守門測試** |

後兩者天生在打包流程外面：`Info.plist` 是 XML 且 Capacitor 只在 `cap add` 那一次寫過它；`privacy.html` 依票 04 的決定是「不參與打包、原封複製進 `dist`」的靜態檔，不 import 任何東西。

**為什麼不寫一支 script 去改寫這兩個檔**，見 `docs/adr/0012-display-name-single-source.md`。簡述：那兩個檔仍進版控，script 一旦忘了跑就靜默停在舊值，而且沒有任何東西會抓到——比現在更危險。

守門測試讀那兩個檔、撈出名字、與常數比對，不一致就紅燈，**訊息要指出是哪個檔的哪一處**，否則紅燈了還得自己去找。

### 那行 `appName` 是死的，但留著並改成 import

`capacitor.config.ts:8` 的 `appName` 改它、iPhone 上的名字不會動。改寫 `Info.plist` 的 `editProjectSettingsIOS()` 只有 `cap add` 會呼叫（`node_modules/@capacitor/cli/dist/tasks/add.js:105`），`cap sync`／`cap copy`／`cap update` 都不碰。也就是說那行字在當初 `cap add ios` 之後就再無作用，現在的身分是一份會騙人的副本。

**不刪它**：刪了之後萬一哪天要重建原生專案，`cap add` 會直接因為缺 `appName` 而失敗（`cli/dist/common.js:72`）。改成 `import` 是一行的事，而且未來重建時自動正確。

**它現有的註解要改掉。** 目前那段寫「與 PWA manifest 的 short_name 及 index.html 的 apple-mobile-web-app-title 保持一致」——收斂後這句話沒意義了（一致是靠常數保證的），改成講清楚「這行只在 `cap add` 生效」。

### Vite plugin 必須掛在三元判斷式外面

`vite.config.ts` 現在是：

```ts
plugins: isIOS ? [] : [VitePWA({ ... })],
```

新 plugin 很容易被順手塞進 `VitePWA` 旁邊，那樣 **iOS build（`--mode ios`）的 `index.html` 就不會被替換**，主畫面名字與分頁標題會留著佔位符。它必須掛在判斷式外面，兩個 mode 都吃到：

```ts
plugins: [appNamePlugin(), ...(isIOS ? [] : [VitePWA({ ... })])],
```

佔位符不要用 `%VITE_XXX%` 這種寫法——那跟 Vite 內建的 env 變數替換長得一樣，會讓人以為值來自 `.env`。

## 這張票不做的事

- **不改任何名字**，兩個值原樣搬進常數
- **不碰 `vite.config.ts:26` 的 `description`**（`'JLPT N2 日文單字閃卡，離線可用'`）。它只有一處在用，沒有散落問題；而且改名時它整句都要重寫（那副 N2 牌組已依 `ADR-0008` 退場），不是替換一個詞就好。留給票 02
- **不碰識別碼**：Bundle ID `io.github.brad0924.vapractice`、GitHub repo 名、`package.json` 的 `name`、`/va-practice/` base path。前者永遠不能改，後者改了線上網址整個斷掉
- **不碰 `CONTEXT.md`／`CLAUDE.md`／`docs/spec.md` 的標題**。那是給開發者看的專案名，與使用者看到的 app 名是兩件事；而且依 domain-modeling 的規矩，`CONTEXT.md` 是純粹的領域詞彙表，「短名／全名／識別碼」是專案層面的區分，寫進去會稀釋它
- **不碰 icon**

## 驗收

- [x] `src/lib/app-name.ts` 存在，兩個值為 `JLPT 單字` 與 `JLPT 單字複習`
- [x] `vite.config.ts`、`src/ui/data-view.ts`、`capacitor.config.ts` 三處改為 `import` 常數，檔案裡不再有該名字的字面值
- [x] `capacitor.config.ts` 的註解已改寫，說明該行只在 `cap add` 生效
- [x] `index.html` 兩處改為佔位符，Vite plugin 掛在三元判斷式外面
- [x] `npm run build` 產出的 `dist/index.html` 分頁標題為「JLPT 單字複習」、`apple-mobile-web-app-title` 為「JLPT 單字」
- [x] `npm run build:ios` 產出的 `dist/index.html` 同上兩項也正確（這是最容易漏的一項）
- [x] `npm run build` 產出的 manifest 中 `name`／`short_name` 兩值正確
- [x] `src/lib/app-name.test.ts` 存在，涵蓋 `Info.plist` 一處與 `privacy.html` 四處
- [x] 把常數暫時改成別的字串，守門測試紅燈，且訊息指得出是哪個檔的哪一處；改回來後綠燈
- [x] `npm run test` 與 `npm run typecheck` 全綠
- [x] `docs/adr/0012-display-name-single-source.md` 已寫
