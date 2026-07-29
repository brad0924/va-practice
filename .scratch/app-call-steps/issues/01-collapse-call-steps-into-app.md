# 01 — 把排程與匯入的呼叫步驟收進 App

Status: done
Type: enhancement

## 需求

`App`（`src/app.ts:18-45`）是畫面的插座板，上面掛著 `store`、`now`、`random`、`advance`、`reload`。畫面因此拿得到材料，自己把步驟拼起來：

- `review-view.ts:51-52` 自己組 `rate(app.queue, rating, app.now(), app.random)` 再送回 `app.advance()`。
- `data-view.ts:216-219` 匯入時自己依序做 `store.importJson` → `app.reload` → `app.cloud.push`。

**這不是在修 bug。今天兩條路都寫對了，使用者的資料不會出事。** 要處理的是清單本身：只要 `store` 還在 `App` 上，任何畫面都寫得出 `app.store.save(app.data)`——編譯得過、跑得動，但繞過了 `persist()`（`app.ts:150-153`），存了本機卻不推雲端，下次開 app 被雲端那份蓋回去。

目標是把清單縮短到那行程式碼**打不出來**。

## 決定

1. **`App` 上新增 `rate(rating)`、`importBackup(text)`、`exportBackup()`，移除 `store`、`random`、`advance`、`reload`。** `reload` 不是刪掉，是降級成 `start()` 裡的區域函式（與 `persist()`、`replaceInData()`、`mount()` 同層）——`importBackup` 吸收掉 `data-view` 那次呼叫之後，只剩 `onPulled` 在用。改完後全專案 grep 不到 `app.store`、`app.advance`、`app.random`、`app.reload`。

2. **`now()` 與 `cloud` 留在清單上。** `list-view.ts:42` 要 `now()` 算逾期天數，`data-view` 要 `now()` 組匯出檔名、要 `cloud` 做登入與換密碼。原始構想是「now、random、store、advance 一起收回去」，實際上只有三個做得到。

3. **三個新方法都不做導覽、不重畫。** 沿用 `advance`／`upsert`／`remove`／`reload` 既有的一致行為：主動操作由畫面自己決定接下來去哪。`review-view` 保留 `app.showReview()`，`data-view` 保留 `app.showList()`。`onPulled` 仍是唯一自己 `render()` 的地方——它是背景事件，當下沒有畫面在等它。

4. **匯入失敗繼續丟例外，由畫面接住顯示。** `importBackup` 完全不碰錯誤處理，`storage.ts` 丟出來的訊息直接冒上去，`data-view` 現有的 `try/catch` 一字不改。與旁邊的登入、換密碼兩個表單同形（都是接住例外 → `toMessage()` → 塞進紅字）。「匯入失敗：」這個前綴與紅字樣式屬於畫面文案，不進 `app.ts`——同 `docs/spec.md:98` 對讀音編輯器立的規矩。

5. **`data-view` 的私有 `download()` 搬進 `src/ui/dom.ts`，改成通用的 `download(content, filename, type)`。** 那五行舞步（`Blob` → `createObjectURL` → 隱形 `<a>` → `click()` → `revokeObjectURL`）跟下載什麼完全無關，屬於瀏覽器機制，與 `el()`、`button()` 同層；`file-saver` 的 `saveAs(blob, filename)` 就是這個形狀。`type` 收成參數而不寫死 `'application/json'`——寫死的話它就不是通用工具，那不如不抽。檔名（`jlpt-cards-${toDateKey(app.now())}.json`）留在 `data-view`，理由同決定 4：使用者看得到的字串屬於畫面。

6. **`exportBackup()` 只回 JSON 字串，內部轉一手呼叫 `store.exportJson()`。** 與 `importBackup(text: string)` 對稱：一個吃字串、一個吐字串。

7. **`onPulled` 不改、不與 `importBackup` 合併。** 兩者五個步驟裡有三個相反：時間戳來源（檔案 vs 伺服器）、推不推雲端（必須推 vs 絕對不能推）、重不重畫（不重 vs 要重）。合併只會生出 `{ updatedAt?, push, render }` 這種靠參數決定行為的簽名，讀的人得先看懂三個開關。改為在 `importBackup` 旁留一句註解說明它刻意不是唯一入口，避免未來誤以為改了這裡就順便修好那裡。

8. **不動 `store.exportJson()` 內部呼叫 `load()` 這件事。** `load()` 會跑單向合併並寫回 localStorage，所以匯出這個看起來只讀的動作順手寫了一次硬碟。今天無害（`app.ts:52` 開 app 時已合併過，再跑一次補不到東西、寫回去的內容一模一樣、`updatedAt` 也原封不動），而處理它要碰 `lib/storage.ts`、兩個測試與 `docs/spec.md`，與本次「只碰畫面能拿到什麼」的主題不同源。另開 issue 記錄。

9. **不寫測試、不改 `docs/spec.md`。** `App` 維持「畫面的共用狀態與導覽」的定位，不升格成第五道接縫——要能測協調順序就得把 `start()` 改成注入時鐘、亂數與儲存，投入與報酬不成比例，而真正需要驗證的邏輯（`rate()` 算間隔、`importJson()` 驗格式）早就在 `lib/` 的接縫裡測過了。

## 驗收

- `npm run build` 通過。
- `npm test` 全綠，且**沒有任何測試檔被修改**——本次不碰 `lib/`，現有測試理論上一項都不該受影響。
- 全專案搜不到 `app.store`、`app.advance`、`app.random`、`app.reload`。
- `src/ui/dom.ts` 有 `download(content, filename, type)`；`data-view.ts` 的私有 `download()` 已刪除。
- 手動：評分四顆鈕都能翻到下一張，鍵盤 1–4 也是。
- 手動：匯出備份，檔名為 `jlpt-cards-<今天>.json`，內容可再匯入回來。
- 手動：匯入一個壞掉的 JSON，畫面出現「匯入失敗：⋯⋯」紅字，且卡片沒有被清空。
- 手動：匯入一份正常備份後跳回卡片頁，且雲端有被推一次（已登入時，角落狀態字不會停在未上傳）。

## Comments

- `CONTEXT.md` 的「備份」詞條補一句：覆蓋的範圍包含這份資料的新舊，匯入舊備份會讓這台裝置在雲端的新舊比較中變成較舊的一方。這是決定 1 那條「匯入必須推雲端」規則的成因，原本只活在 `data-view.ts:218` 的一行註解裡。
- 不開 ADR：本次行為零變化，決定容易反悔，也沒有推翻任何既有決定。
