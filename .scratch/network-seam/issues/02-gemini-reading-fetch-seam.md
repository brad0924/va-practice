# 02 — 讀音預填的網路縫、九條測試與文件更正

Status: done
Type: enhancement

## 需求

`src/lib/gemini-reading.ts`（141 行）沒有測試檔，檔案第 7 行寫著理由：

> 比照 `cloud-backup.ts` 直接用全域 `fetch`，因此沒有測試檔。

**這個因果不成立。** 測試裡換掉 `fetch` 是做得到的——`localStorage` 同樣是全域的瀏覽器工具，這專案早就用 `StorageLike` 把它遞進來了。那句話把「沒做」寫成了「做不到」，而且被 `.scratch/reading-editor/spec.md:76、235` 引用過兩次，等於錯誤結論被複製了三份。

這支函式七成的程式碼在做同一件事：**把各種失敗翻成使用者看得懂的話**（「等超過 10 秒沒有回覆」「連不上 Gemini」「Gemini 回的不是 JSON」）。那正是最該被測的部分，而現在一條都沒守著。

## 決定

1. **`askReading` 新增第三個參數 `doFetch: typeof fetch`，必填。** `editor-view.ts:25` 改成遞 `fetch.bind(window)` 進去；**`bind` 不可省**，`fetch` 被拆下來單獨呼叫時瀏覽器會丟 `Illegal invocation`。必填而非預設值，理由同 `01` 決定 1：跟 `storage` 同待遇，讓「這個模組會上網」在呼叫端就讀得到。

2. **不新增 `timeoutMs` 參數，逾時那條用假時鐘。** 那句訊息是 `TIMEOUT_MS / 1000` 算出來的，若改成傳 5 毫秒進去測，斷言到的會是「等超過 0.005 秒沒有回覆」——**使用者真正看到的那句話與 `10_000` 這個值反而沒有任何測試守著**，有人把它改成 100 也照樣全綠。改用 `vi.useFakeTimers()` 快轉，模組仍用自己的常數，測試斷言到的就是上線那句。

   只在逾時那一個測試開啟假時鐘、結束立刻 `vi.useRealTimers()`，其餘八條用真時鐘。這是專案第一次出現假時鐘，刻意限縮在這一處。

3. **假的 `fetch` 一律回真的 `Response`**（Node 內建建構子），型別直接用 `typeof fetch`，不自訂 `FetchLike`。理由：決定 5 的第 6、8 兩條靠的是 `response.json()` 遇到爛內容自己 reject 的真實行為，自訂介面會把它變成假貨自己演。

4. **逾時測試的假 `fetch` 要演出取消：**

   ```ts
   const 永不回應: typeof fetch = (_url, init) =>
     new Promise((_, reject) => {
       init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
     });
   ```

   這是必要的，不是作弊——`controller.signal.aborted` 必須真的為 `true` 才會走到那句訊息（`:117`），而「被 abort 就 reject」正是真 `fetch` 的行為。

5. **新增 `src/lib/gemini-reading.test.ts`，涵蓋九條：**

   1. 成功 → 回傳 `JSON.parse` 後的值
   2. 十秒沒回覆 → 「等超過 10 秒沒有回覆」（假時鐘）
   3. `fetch` 直接失敗、未被取消 → 「連不上 Gemini」
   4. 非 2xx 且錯誤 body 挖得到原因 → 「Gemini 回了 429：<原因>」
   5. 非 2xx 但挖不到原因 → 「Gemini 回了 404：沒有附原因」
   6. 回應 body 不是 JSON → 「讀不懂 Gemini 的回覆」
   7. 是 JSON 但挖不到 `candidates[0].content.parts[0].text` → 「Gemini 沒有回覆內容」
   8. 挖到 text 但它不是 JSON → 「Gemini 回的不是 JSON」
   9. 送出去的請求：header 帶得到 `x-goog-api-key`、body 裡找得到詞條

6. **第 9 條只斷言金鑰與詞條，不比對 `INSTRUCTIONS` 或 `RESPONSE_SCHEMA` 的內容。** 提示詞是會反覆調整的東西——檔案註解自己記錄了改過兩版（熟字訓判準那兩次）。比對全文的測試會在每次微調時無辜變紅，然後被人習慣性地改掉，那比沒有測試更糟。

7. **不動 `INSTRUCTIONS`、`RESPONSE_SCHEMA`、`ENDPOINT` 與模型名稱。** 本次只加參數與測試，行為零變化。

8. **文件三處一併更正（本張處理，`01` 不碰）：**

   - `gemini-reading.ts:7` 那句假理由拿掉，換成事實：`fetch` 由呼叫端遞進來，失敗訊息的翻譯有測試涵蓋。
   - `cloud-backup.ts` 檔頭補一句，說明 `hooks.fetch` 與 `retry()` 為什麼在介面上（模組不碰 DOM，連線恢復的時機由接線層決定）。
   - `docs/spec.md` 的 Testing Decisions 補一段：對外部服務的轉接頭（雲端備份、讀音預填）一律把 `fetch` 當參數遞進來測，並列出兩邊各自守住的情境。

9. **`docs/spec.md` 的「四個模組，各自對應一個測試接縫」數字不動。** 那份清單講的是這個 app 的骨架——少一塊 app 就不成立。雲端備份按 ADR-0003 是「備份的搬運帶」，讀音預填按 ADR-0005「永遠是選配的」，兩者拔掉複習照跑，是配件不是骨頭。專案已有同形的先例：`cloud-crypto.ts` 有 18 個測試，也不在那四塊裡。

10. **不改 `.scratch/` 底下的舊檔案。** `.scratch/reading-editor/spec.md:76、235` 與 `.scratch/reading-prefill/issues/04` 決定 7 記錄的是當時的決定，回頭改寫會抹掉歷史。要更正的是現行文件（決定 8）。

11. **不寫 ADR。** 這是測試策略調整，不是 ADR-0002／0003／0005 那種「選了哪家、付什麼代價」的層級；`StorageLike` 那道縫也沒有 ADR。

## 驗收

- `npm run build` 通過。
- `npm test` 全綠，新增 `src/lib/gemini-reading.test.ts`，決定 5 的九條都在。
- 第 2 條測試斷言的字串裡含「10 秒」，不是換算後的小數。
- **現有測試檔一個都沒被修改。**
- 假時鐘只出現在第 2 條測試裡，且該測試結束後還原成真時鐘（其餘八條不受影響）。
- 全專案搜不到「因此沒有測試檔」這句話。
- `docs/spec.md` 的 Testing Decisions 讀得到網路層測到哪些情境；模組與接縫那段仍寫「四個」。
- 手動：設好金鑰，新增卡片打完詞條，讀音格會被填上、上方出現「請確認」那行。
- 手動：把金鑰改成亂填的一串，打完詞條會出現「Gemini 回了 400：⋯⋯」之類的紅字，且**儲存流程完全不受影響**（讀音格留空也存得下去）。
- 手動：清空金鑰後新增卡片，全程一個字都不多、一個請求都不發。

## Comments

- 本張與 `01` 出自同一輪 grilling，決定一起拍板。核心結論是：擋住測試的從來不是「用了全域 `fetch`」，兩個檔案的真實障礙不同——`gemini-reading.ts` 是「隨時做得到，只是沒做」，`cloud-backup.ts` 是 `window.addEventListener` 那道真的牆。
- 實作順序建議先 `02` 再 `01`：`02` 的縫小、驗證得快，可以先確認「真 `Response` 當假貨」這套寫法在這專案跑得順，再去動 `01` 那個要拆牆又要處理非同步時序的。
