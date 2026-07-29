# 01 — 匯出不再繞經 load()

Status: needs-triage
Type: enhancement

## 需求

`store.exportJson()`（`src/lib/storage.ts:95-97`）是 `JSON.stringify(load(), null, 2)`。而 `load()`（同檔 51-86 行）不是單純的讀取——它會跑單向合併，並且**一律寫回 localStorage**（第 84 行，那個寫回是刻意的：不寫回的話舊格式資料會一直缺少內建卡名單，下次發佈追加卡片時補不進來）。

結果是：按「匯出備份」這個看起來只讀的動作，順手改寫了一次瀏覽器裡存的資料。

**今天無害。** `app.ts:52` 開 app 時已經 `load()` 過一次，匯出時再跑一次補不到任何新卡，寫回去的內容一模一樣，`updatedAt` 也原封不動（`storage.ts:80`）。所以是多做一次白工，不是會出事。

## 方向

不是把 `load()` 裡的寫回拿掉——那條規則必須留著。要改的是**匯出別再繞經 `load()`**：`App` 手上的 `data`（`app.ts:52` 那個變數）本來就是最新的一份，每次評分、新增、刪除、匯入都同步著，直接序列化即可。

```ts
// src/app.ts
exportBackup(): string {
  return JSON.stringify(data, null, 2);
}
```

`store.exportJson()` 從此沒人用，應一併從 `Store` 介面刪除。

## 已知代價（尚未決定值不值得）

- `storage.test.ts:196` 與 `:209` 兩處在用 `store.exportJson()`，要改寫。
- `docs/spec.md:162` 把「匯出與匯入的往返一致性」列為資料存取那道接縫的測試項目——匯出搬離該模組之後，這句話要跟著調。

## 來源

由 `.scratch/app-call-steps/issues/01-collapse-call-steps-into-app.md` 的討論翻出（見該檔決定 8）。當時刻意不拉進那張 issue 的範圍：那張只碰畫面能拿到什麼，這張是 `storage` 模組內部怎麼取資料，主題不同源。**兩張沒有阻擋關係**，先後順序不拘。
