# 01 — 雲端備份的網路縫與八條測試

Status: done
Type: enhancement

## 需求

`src/lib/cloud-backup.ts`（245 行）沒有測試檔。這個模組管的是複習進度怎麼上雲、換裝置怎麼接回來——它錯掉的形態是「進度安靜消失」或「雲端那份被舊資料蓋掉」，兩種都不會報錯，要等換裝置才發現。

**沿用至今的理由是假的。** `gemini-reading.ts:7` 寫著「比照 `cloud-backup.ts` 直接用全域 `fetch`，因此沒有測試檔」，但「全域」從來不是障礙——測試裡換掉 `globalThis.fetch` 是做得到的。

真正卡住的是 `cloud-backup.ts:76`：

```ts
window.addEventListener('online', () => void flush());
```

測試環境是 `environment: 'node'`（`vite.config.ts:29`），沒有 `window`。這一行寫在 `createCloudBackup()` 的函式體裡，所以**今天在測試裡連建都建不出來一個 `CloudBackup`**，第一行就 `ReferenceError`。只遞一個假 `fetch` 進去解決不了，得兩道縫一起開。

## 決定

1. **`CloudBackupHooks` 新增必填的 `fetch: typeof fetch`。** 比照同一份 hooks 裡的鄰居 `storage`——它從來就是必填的，沒有偷偷預設成 `localStorage`。`app.ts:57` 遞 `fetch.bind(window)`；**`bind` 不可省**，`fetch` 被拆下來單獨呼叫時瀏覽器會丟 `Illegal invocation`。

2. **型別直接用 `typeof fetch`，不自訂 `FetchLike`。** 測試裡用 `new Response(...)` 做真的回應物件（Node 內建）。理由：`readOpen()` 與 `write()` 都靠 `response.json()` 的真實行為，自訂最小介面會讓那個行為變成假貨自己演——演錯了測試照樣綠燈，買到的是假的安心感。

3. **刪掉 `:76`，介面新增 `retry(): void`，內容就是 `void flush()`。** `app.ts` 在 `createCloudBackup({...})` 之後加一行 `window.addEventListener('online', () => cloud.retry())`。模組從此不碰 DOM——`lib/` 底下本來就不該碰，`storage` 早就是遞進來的，這是同一個立場。

   `retry()` **不回傳 Promise**，介面語意維持「命令式、不等結果」，與 `push()`、`begin()` 一致。測試不靠 await 它（見決定 4）。

   已知且接受的代價：「瀏覽器真的發出 `online` 事件時會補上」這一環落在 `app.ts`，而 `app.ts` 沒有測試、本次也不給它測試。自動化測到的是「叫它重試，待推的那份會送出去」，事件接線靠手動驗收。

4. **測試等非同步的方式：拿 hooks 當終點線。** `push()` 不等結果就回來，但模組每做完一件事都會回頭叫 `onStatus` 或 `onPushed`。假的 hooks 每次被叫就記錄，並讓測試能等到「下一次被叫」。不引進 `vi.waitFor`，也不用 `await Promise.resolve()` 猜微任務輪數——猜錯的測試會時好時壞，比沒有測試更糟。

5. **新增 `src/lib/cloud-backup.test.ts`，涵蓋八條：**

   1. 離線：`push` 送不出去 → `pending` 留著、`onStatus` 收到「進度還沒上傳，恢復連線後會自動補上」；換成會成功的假 `fetch` 後 `retry()` → 那一份真的補上去、狀態字被清空
   2. 401：`write` 回 401 → `onStatus` 收到 `WRONG_PASSWORD`，**且之後再 `push` 完全不發請求**（`blocked` 生效）
   3. 送出期間連續 `push` 三次 → 只送出最後那一份（`:143-147` 的 `while` 與 `snapshot` 比對）
   4. `begin`：雲端較新 → 走 `onPulled` 且不推；本機較新或雲端沒資料 → 推上去
   5. `signIn` 密碼錯（解不開雲端那份）→ 拋 `WRONG_PASSWORD`，**且完全沒發出 PUT**
   6. `changePassword`：送出的 `prev` 是舊指紋、成功後 `pending` 被清掉
   7. 未登入時 `begin`／`push` 一個請求都不發（ADR-0003 的靜默承諾）
   8. `signOut` 之後 `push` 零請求、`pending` 清空

6. **假物件手寫，不用 mock 工具。** 沿用 `storage.test.ts:6` 的 `fakeStorage` 寫法，`.scratch/reading-editor/spec.md:74` 已經定過這條規矩。

7. **`ITERATIONS` 不動，測試照付 PBKDF2 的稅。** 實測 `deriveKeys` 一次約 51 ms（`cloud-crypto.ts:8`，200,000 輪），而 `account` 是模組私有狀態，外面只能經由 `signIn()` 或 `begin()` 進去。八到十個測試約多半秒，整套從 2.06 秒變成大約 3 秒。**不把迭代數改成可注入**——那會讓測試繞過真正的金鑰派生，而 `cloud-crypto.test.ts` 已經在付同樣的稅（18 項 1.29 秒），沒有理由這裡例外。

8. **不引進 jsdom 或任何假瀏覽器。** 專案兩次明確拒絕過（`.scratch/due-time-buckets/issues/02` 決定 22、`.scratch/reading-editor/spec.md`），決定 3 拆掉那道牆之後也不需要。

9. **本張不碰 `docs/spec.md`。** 文件三處統一在 `02` 處理，避免兩張票改同一個檔案。

10. **不動 `cloud-crypto.ts`、不動 Firebase 安全規則、不動 `CloudBackup` 既有六支方法的行為。** 本次只加 `retry()` 與 `hooks.fetch`，其餘一律行為零變化。

## 驗收

- `npm run build` 通過。
- `npm test` 全綠，新增 `src/lib/cloud-backup.test.ts`，決定 5 的八條都在。
- **現有測試檔一個都沒被修改**——本次不動任何既有模組的行為。
- `src/lib/cloud-backup.ts` 全檔搜不到 `window`。
- 整套測試耗時仍在 5 秒以內。
- 手動：登入後評分一張卡，角落狀態字不會停在未上傳。
- 手動：DevTools 切 offline，評分一張 → 角落出現「進度還沒上傳，恢復連線後會自動補上」→ 切回 online → 狀態字自動消失。**這一項專測 `app.ts` 那行接線，自動化測試涵蓋不到。**
- 手動：故意用錯的密碼登入，出現「暱稱或密碼不對」，且雲端那份沒有被動到（換回正確密碼仍接得回原本的進度）。

## Comments

- 決策脈絡見同目錄 `02` 的「Comments」——兩張票出自同一輪 grilling，決定是一起拍板的。
- 不開 ADR：這是測試策略調整，不是 ADR-0002／0003／0005 那種「選了哪家、付什麼代價」的層級。專案已有先例——`StorageLike` 那道縫也沒有 ADR。
