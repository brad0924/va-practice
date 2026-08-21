# 07 — 503 這種「再試一次就會好」的失敗，現在一次都不重試

Status: done
Type: enhancement

## 怎麼發現的

2026-08-21，維護者在 dev server 打詞條，讀音預填失敗，畫面出：

```
Gemini 回了 503：This model is currently experiencing high demand.
Spikes in demand are usually temporary. Please try again later.
```

當時用的是 `gemini-3.6-flash`。細節記在 `reading-prefill` 票 06 的 Comments（2026-08-21 那則）。

## 病灶

`gemini-reading.ts:208` 收到非 2xx 就直接丟出去：

```ts
if (!response.ok) {
  const why = await reason(response);
  throw ...   // ← 不分幾號，一律放棄
}
```

查過 `gemini-reading.ts`、`gemini-reading-native.ts`、`reading-editor.ts`：**整條路徑一行重試都沒有。**

而 503 那句話字面就是「請稍後再試」。這是最該自動重試的情況，我們卻直接把錯誤端到使用者臉上，讓他自己填讀音格。

## 為什麼只挑 5xx，不是全部重試

失敗分兩種。**再送一次會成功的**，跟**再送一百次都一樣的**。

| 狀況 | 哪一種 | 重試的後果 |
| --- | --- | --- |
| 500／502／503／504 伺服器那端出事 | 暫時 | **會成功**。Google 自己叫你等一下再試 |
| 連不上（`gemini.offline`） | 暫時 | 可能成功，但多半是使用者自己的網路 |
| 逾時 | 暫時 | 它本身就是把預算燒光的那種失敗 |
| 400／403 金鑰不對 | 永久 | 一樣失敗。金鑰不會自己變對 |
| 404 型號叫不動 | 永久 | 一樣失敗 |
| 429 額度用完 | 中間 | 馬上重試**更糟**，額度燒更快 |

## 決定（2026-08-21 triage 拍板）

### 一、重試共用同一份 10 秒預算，碼表不重按

`gemini-reading.ts:184` 那顆碼表按在函式最外層，`finally` 才關掉。**整支函式——包含重試——都在同一顆碼表底下跑。** 像微波爐轉 10 分鐘的旋鈕，中途換一盤菜進去，旋鈕不會回到 10 分。

維持現狀不動。使用者的等待上限一秒都不變，票 06「`TIMEOUT_MS` 維持 10 秒」那個決定也不受影響。

**代價要處理，見下面「碼表到期時該講哪句話」。**

### 二、重試範圍：500／502／503／504

只收這四個狀態碼。**不含**連不上、不含逾時、不含任何 4xx（400／403／404／429 一次就放棄）。

### 三、本票只做網頁版，iOS 另開一張

已查證（不是推測）：`node_modules/@firebase/ai/dist/index.node.mjs:1402` 的 `makeRequest()` 從頭到尾只 `fetch` 一次，非 2xx 直接組 `AIError` 丟出。整份 bundle 唯一的 `retry` 字樣在 1456 行，是一句英文錯誤訊息裡的「then retry」，不是程式邏輯。**SDK 不重試，iOS 沒有免費的可撿。**

iOS 那半邊的重試得寫在 `gemini-reading-native.ts` 裡，而那支檔案 import 了 Capacitor 外掛與 firebase 執行期程式碼，**node 底下載不起來、測不到**（`ai-logic-error.ts` 當初獨立成一支檔案就是為了繞開這件事）。沒有自動測試守得住，驗收只能上真機。混進本票會把整張票的狀態拖成 `ready-for-human`。

因此 iOS 獨立成 `.scratch/reading-prefill/issues/09-retry-transient-failures-ios.md`。

### 四、次數不設上限，中間不等

10 秒預算之內能問幾次就問幾次，兩次之間不停頓。不設次數上限，不設最小間隔。

### 五、畫面要顯示第幾次

第一次維持「詢問中…」。第 2 次起換成「重試中（第 2 次）…」，數字跟著跑。

## 不設煞車是刻意的，風險據實記錄

triage 當下提出過一個風險：503 若回得很快（例如 100 毫秒），10 秒內可以送出上百次請求。免費額度是**每顆模型每天 20 次**，最壞的情況是使用者打一個詞條、一天額度當場燒光，接下來整天都是「額度用完」。

**維護者聽過這個風險之後選擇不裝煞車。** 理由是這同時是一次實地量測：503 到底回得多快、它算不算額度，目前查不到，而裝了煞車就量不到。

動工時順手把兩個數字記進本票的 Comments：

1. 撞到 5xx 時，10 秒內實際重試了幾次。
2. 那一天之後額度剩多少（也就是 5xx 算不算數）。

若數字難看，再回頭談煞車（次數上限或最小間隔）。**這一節不要刪**，下一個人要讀得到當初為什麼沒裝。

## 碼表到期時該講哪句話

共用預算有個直接後果：一直撞 5xx 撞到 10 秒，`controller.abort()` 會把飛在半空的那次 fetch 砍掉，現有的 `catch` 就丟 `gemini.timeout`。**使用者看到的會是「等超過 10 秒沒有回覆」，而不是他真正撞到的 503。**

那是錯的。原因要跟事實對得上：

- **這一輪至少收過一次 5xx** → 丟最後那次的 `gemini.httpError`（帶 status 與 Google 給的那句 reason）。
- **一次 5xx 都沒收過**（單純就是慢） → 照舊丟 `gemini.timeout`。

## 怎麼把次數送到畫面上

`askReading()` 現在只回一個 Promise，沒有回報進度的管道；`prefill()` 也只有 `now` 與 `later` 兩個時刻（`editor-view.ts:155`）。中途多出來的更新需要第三條路。

建議的形狀（四個地方，由裡往外）：

1. **`gemini-reading.ts`**：`askReading(key, term, doFetch, onAttempt?)`。開始第 N 次嘗試前呼叫 `onAttempt(N)`，N 從 2 起算。
2. **`reading-editor.ts`**：`Ask` 型別跟著多一個參數；`Note` 多一種 `{ kind: 'retrying'; attempt: number }`；`prefill(onProgress?: (change: Change) => void)`，重試回報時把 note 換掉並把單子交給 `onProgress`。
3. **`editor-view.ts`**：`prefill()` 那個呼叫傳進 `(change) => { if (asked !== editor) return; apply(change); }`——跟現有 `later.then()` 裡那道守門同一條。`noteWording()` 的 switch 多一格。
4. **`src/i18n/`**：`zh-Hant`、`en`、`ja` 各加一句 `editor.noteRetrying`，帶 `{attempt}` 參數。

`askReadingNative` 不用改：多出來的參數它不接，TypeScript 允許少收參數。

## 兩道守門會被打破，一定要一起改

新增 `retrying` 這種 note，會踩壞票 05 剛補好的兩處。**這不是猜測，是讀過程式碼確認的。**

1. **`reading-editor.ts:137` 的 `prefilling`**：現在寫 `note?.kind === 'asking' || willAsk()`。重試期間 note 是 `retrying`，而 `willAsk()` 此時已經因為 `term === askedTerm` 回 false——`prefilling` 會變成 false，**`ADR-0006` 的換欄避讓在重試期間失效，游標會被送進讀音格**。

2. **`reading-editor.ts:224` 的 `settle()`**：現在寫 `if (note?.kind !== 'asking') return NOTHING;`。重試期間 note 是 `retrying`，這條會把成功的回覆整份丟掉，**畫面卡在「重試中」收不掉**——正是那段註解說要避免的「一場問不完的等待」。

兩處要讀同一份清單。那支檔案自己的註解寫著理由：「兩邊各寫一份會漂移，漂移的下場是換欄鍵把游標送進讀音格、AI 的回覆再把使用者正在打的字蓋掉。」照辦——抽一個 `const awaiting = () => note?.kind === 'asking' || note?.kind === 'retrying';`，兩邊都用它。

## 實作時會踩到的一件事

程式用 `AbortController` 當煞車。它的規矩是**踩過一次就永遠是踩下的狀態**，放不開。共用預算的做法不必換新的——那顆 controller 在碼表到期前一直是沒踩下的狀態，重試沿用同一個 signal 即可。

## 好消息：不必上網就測得出來

`askReading()` 的第三個參數 `doFetch` 是呼叫端遞進來的（`network-seam` 票 02 留的縫）。測試可以餵一個「第一次回 503、第二次回正常」的假 fetch，斷言最後拿到的是正常那份。

`gemini-reading.test.ts` 已經有一整套這種寫法（`responds()`、`json()`、`reply()`、`failure()`），照著加即可。逾時那條測試示範了假時鐘要怎麼跟 `AbortController` 搭。

編輯器那半邊有 `reading-editor.test.ts` 與 jsdom 的 UI 測試（`ADR-0014`）。

## 順序

**票 06 不擋本票。** 重試不管你打的是哪顆模型，票 06 的 push／revert 決定與本票無關。

## 驗收

程式碼與測試那一段全部離線跑得完，一次網路都不必上。

1. 假 fetch 第一次回 503、第二次回正常 → `askReading()` 回傳的是正常那份，使用者看不到錯誤。
2. 500、502、504 各一條，行為同上。
3. 400、403、404、429 各一條：一次就放棄，**假 fetch 只被呼叫一次**（數呼叫次數）。
4. 連不上（fetch 直接 reject）：一次就放棄，不重試。
5. 假 fetch 一直回 503 直到碼表到期 → 丟出的是 `gemini.httpError`（status 503，reason 是 Google 那句原文），**不是** `gemini.timeout`。
6. 假 fetch 從不回應直到碼表到期（一次 5xx 都沒收過）→ 丟出的仍是 `gemini.timeout`，`{ seconds: 10 }` 那句沒有變樣。
7. 回報的次數從 2 起算、逐次遞增。
8. 重試期間 `editor.prefilling` 仍為 `true`（換欄避讓不失效）。
9. **票 05 連動**：重試期間使用者自己在讀音格打了字，之後回覆才回來 → 讀音不被覆蓋，而且「重試中」那句要收掉，不能永遠掛著。
10. `npm test` 全綠、`npm run typecheck` 乾淨。
11. 三種語言的 `editor.noteRetrying` 都在（`i18n` 的 smoke 測試會擋漏翻）。
12. `CONTEXT.md` 的「讀音預填」那條要補一句。現在它寫「問不成的時候（離線、共用的額度見底、憑證過不了）兩邊一樣，讀音格留空給人填」——重試上線之後，「問不成」多了一層意思：伺服器那端出事的那幾種會自己先再試，試到預算用完才算問不成。**不必開新的 ADR**：這是 `ADR-0005` 底下的行為細節，沒有推翻任何既有決定。

## Comments

### 2026-08-21 — Triage：四題拍板，狀態改 ready-for-agent

> *This was generated by AI during triage.*

#### 動筆前查過的三件事

1. **沒做過。** 全 `src/` 只有 `cloud-backup.ts` 的 `retry()` 帶重試，那是離線之後補推備份，跟讀音這條路無關。
2. **沒被否決過。** `.out-of-scope/` 目錄不存在。
3. **票面問題三查證完畢**，結論寫在決定三：Firebase 那顆 SDK 不重試。

#### 一個票面沒寫到的差別

票面問題一問「重試吃不吃同一份 10 秒預算」。這題在兩條路上答案本來就不同：

- **網頁版**：一顆 `setTimeout` 包住整支 `askReading()`，重試預設共用。
- **iOS**：`TIMEOUT_MS` 是交給 SDK 的 `RequestOptions.timeout`，而 SDK 在**每次** `generateContent()` 裡自己開一顆新計時器（`index.node.mjs:1411`）。所以 iOS 只要多呼叫一次，**天生就是各給 10 秒**。

本票選了「共用」，票 09 若照抄行為就得自己動手限制，那不是免費的。這件事寫進票 09。

#### 為什麼是 ready-for-agent 而不是 ready-for-human

跟票 06 的體質不一樣。票 06 卡住委派的是驗收——要維護者自己的金鑰、要人眼判斷 `吹雪` 對不對、要進 Firebase 主控台加一輪 TestFlight。

本票的驗收 1 到 11 條**全部用假 fetch 跑得完**，一次網路都不必上，一把金鑰都不必給。這是 `network-seam` 票 02 留下那個縫的直接紅利。

唯一要真的上網的是「不設煞車」那一節交代的兩個數字（503 回多快、算不算額度），而那兩個數字是**上線之後撞到才記**，不是動工的前置條件。
