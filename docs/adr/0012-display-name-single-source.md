# 顯示名稱：打包流程內的用 import，流程外的用測試守門

> **2026-09-04，Capacitor 那一整套已從 repo 移除（票 `rn-rewrite 21`）。** 本份的兩套分法沒有被推翻，
> 但底下點名的七個位置只剩四個活著：
>
> - `capacitor.config.ts`（流程內）——檔案刪了
> - `ios/App/App/Info.plist`（流程外）——`ios/` 整個刪了
> - `src/ui/data-view.ts`（流程內）——那一區只有每日提醒的權限提示用得到短名，該區隨接線一起拆掉
>
> 補上這份 ADR 寫成之後才出現的兩個：`mobile/ui/data-screen.tsx` 直接 `import`（流程內），
> `mobile/app.json` 的 `expo.name` 寫字面值、靠 `core/lib/app-name.test.ts` 守門（流程外）——
> Expo 出包時把它寫進自己產的那份 `Info.plist`，落點與舊的那一處相同。
>
> 四加二，總數仍是**六個**。**底下正文一字不改**，記的是當時的狀況。

app 的顯示名稱只有一份來源：`core/lib/app-name.ts`，含短名與全名兩欄。但它抵達七個位置的方式**刻意分成兩套**：

- **打包流程內**（`vite.config.ts`、`src/ui/data-view.ts`、`capacitor.config.ts`）→ **直接 `import`**。這幾處從此物理上不可能與來源不一致。`index.html` 走 Vite plugin 替換佔位符，效果同級。
- **打包流程外**（`ios/App/App/Info.plist`、`public/privacy.html`、`public/privacy-en.html`）→ **仍寫字面值，另有 `core/lib/app-name.test.ts` 讀檔比對**。改名時這幾個檔要人工改，但漏了一定紅燈。

判準是**這個檔有沒有辦法吃到一個 TypeScript 常數**。`Info.plist` 是 XML，而且 Capacitor 只在 `cap add` 那一次寫過它；隱私權政策各語言版依票 04 的決定是「不參與打包、原封複製進 `dist`」的靜態檔，不 import 任何東西。這幾個檔沒有任何天然管道拿得到常數。

隱私權政策每多一種語言就多一個這類檔案（`.scratch/i18n/spec.md` 決定八加了英文版）。守門測試因此**不逐處寫比對規則，改成掃 `data-app-name` 屬性**：那幾處的中文上下文換了語言就整批失效，屬性則語言無關。`Info.plist` 那半段是 XML，沒有這個問題，維持逐處釘死。

## 為什麼

**這份文件真正要留下來的，是被否決的那條路。**

看到「有些地方 import 常數、有些地方寫死字面值」的人，第一反應幾乎一定是「這不一致，統一一下」，然後動手寫一支 build 前執行的 script 去改寫那兩個檔。那條路看起來最徹底，實際上比現況更危險：

`Info.plist` 與 `privacy.html` 仍然進版控。script 一旦忘了跑、或 CI 的某條路徑沒排到它，這兩個檔就**靜默停在舊值**——iPhone 主畫面顯示舊名字、隱私權政策頁抬頭是舊名字，而且**沒有任何東西會抓到**。要補上這個破口，就得再加一道一致性檢查，而那就是現在這套做法。

換句話說：**「全面自動化」若要安全，最後還是得長出守門測試；那不如直接只做守門測試。** 自動化省下的是改名時手動改兩個檔的力氣，而改名這件事一年可能發生零次。

至於 `Info.plist`，還有第二層理由。它是 Capacitor 產生的檔，`editProjectSettingsIOS()` 只在 `cap add` 被呼叫（`@capacitor/cli/dist/tasks/add.js:105`）。自寫 script 去改寫它，等於在跟 Capacitor 搶同一個檔案的所有權——現在相安無事，是因為沒人重跑 `cap add`。

**`capacitor.config.ts:8` 的 `appName` 是一份不生效的副本，但仍保留並改成 import。** 它在 `cap add ios` 之後就再無作用（`cap sync`／`copy`／`update` 都不碰 `Info.plist`）。刪掉它更誠實，但重建原生專案時 `cap add` 會因為缺 `appName` 直接失敗（`cli/dist/common.js:72`）。留著並 import 的成本是一行，且未來重建時自動正確。

## Considered Options

- **全部寫字面值，單靠守門測試**：完全不動 build 流程、不新增 plugin，最輕。否決的原因是測試得去解析 `vite.config.ts` 與 `src/ui/data-view.ts` 的原始碼抓字串，這種測試脆弱（換行、改引號就可能認不出來），而那兩個檔明明 `import` 就徹底解決了。
- **全面自動化，寫 script 改寫 `Info.plist` 與 `privacy.html`**：看起來最徹底。否決的原因見上——script 忘了跑會靜默停在舊值且無人察覺，要補破口就得再加守門測試，繞回原點；另外還要跟 Capacitor 搶 `Info.plist` 的所有權。
- **讓 `privacy.html` 進 Vite 打包流程**：這樣它就能吃到常數，守門測試只剩 `Info.plist` 一處。否決的原因是那會推翻票 04 的決定——那頁跟 app 沒有任何往來、不 import 任何東西、樣式內嵌，原封複製進 `dist` 就是最後的樣子。為了一個名字把一頁法律文件拖進打包流程，代價不成比例。
- **把短名與全名壓成單一字串**：改名時只想一個值。否決的原因是 PWA manifest 規範本來就要 `name` 與 `short_name` 兩欄，iOS 主畫面圖示底下約 11–12 個全形字就截斷——一長一短是各平台的真需求，壓成一個等於把新名字綁死在主畫面塞得下的長度內。

## Consequences

**改名的程式碼工作縮成「改兩行常數 + 跟著紅燈修兩個檔」。** 這是這套做法唯一想買到的東西。

**代價是專案裡永遠有兩套寫法。** 讀到其中一套時得先確認那個檔在不在打包流程內，否則會誤以為另一處寫錯了——這份文件存在的一半理由就是防這個誤會，另一半是防止有人「順手修好」它。

**守門測試的失敗訊息是它的主要價值。** 它要指得出是哪個檔的哪一處對不上，否則紅燈了還得自己去翻。這條不是可有可無的打磨，是這套做法能不能用的關鍵。

**還有第八處在 repo 外，這套機制永遠管不到。** App Store Connect 的商品名稱是網頁後台的欄位，沒有任何測試碰得到它。改名時最容易忘的就是它，因此它被寫成票 02 的驗收項目，而不是指望機制。

**識別碼不在這套機制的管轄內，而且刻意不動。** Bundle ID `io.github.brad0924.vapractice` 在 App Store Connect 建記錄時就綁死、永遠不能改；GitHub repo 名、`package.json` 的 `name`、`/va-practice/` base path 改了會讓線上網址斷掉。顯示名稱與識別碼是兩種東西，換名字時不該互相牽動。
