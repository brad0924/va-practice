# 02 — iOS 讀音預填改走 Firebase AI Logic，移除 iOS 的金鑰設定介面

Status: ready-for-human
Type: enhancement
Blocked by: 01

決策背景見 `../spec.md`，本票對應決定一、二、十一、十六。

## 要做什麼

把 iOS build 的讀音預填從「使用者自備金鑰、直接打 Gemini REST」換成「固定金鑰、走 Firebase AI Logic」，並讓資料畫面上的金鑰設定區塊在 iOS build 消失。

**網頁版一個字都不能變。**

## 現況

- `src/lib/gemini-reading.ts` 的 `askReading(key, term, doFetch)` 直接打 `generativelanguage.googleapis.com`，金鑰走 `x-goog-api-key` 標頭。
- `src/lib/gemini-key.ts` 管 `va-practice:gemini` 那格 localStorage。
- `src/ui/data-view.ts` 的 `geminiSection()` 畫出設定區塊。
- `src/app.ts:152` 用 `createGeminiKey(localStorage)` 把它接上去。

## 決定

### 分岔點放在「請求怎麼送出去」，其餘共用

`INSTRUCTIONS`、`RESPONSE_SCHEMA` 的內容、以及 `acceptPrefill`（`src/lib/reading.ts`）的驗證邏輯**兩條路徑共用**。分岔只在把請求送出去的那一段：一邊是 `fetch` 加金鑰標頭，一邊是 Firebase AI Logic 的 `generateContent()`。

`RESPONSE_SCHEMA` 在 Firebase 那邊要用 `Schema.array(...)` 那種建構式表達，形狀不變（票 01 已驗證形狀表達得出來）。

### 打包時切，不在執行期切

沿用 `vite.config.ts` 既有的 `mode === 'ios'` 慣例。執行期偵測 Capacitor 會讓網頁版也載入 firebase SDK，白白變胖——而網頁版的打包產物體積正是 `ADR-0005` 拿來說服自己的論據之一。

### 錯誤語彙沿用現有那一套

`gemini-reading.test.ts` 守著「各種失敗變成一條說得出原因的 key」。Firebase 那條路徑的失敗也要落回同一組 `AppError` key（`gemini.timeout`、`gemini.offline`、`gemini.httpError` 等），不要新增一套平行的錯誤語彙。

### App Check 拿不到憑證時完全靜默

不出錯誤提示，讀音格單純留空，與現在「沒設金鑰就什麼都不發生」一致（決定十一）。這條錯誤使用者一點辦法都沒有，看了只會焦慮。

### `gemini-key.ts` 整支保留

網頁版還要用。iOS build 只是不渲染 `geminiSection()`，不刪檔案、不刪測試。`keychain.test.ts:159` 用到 `va-practice:gemini`，該測試不受影響。

## 驗收

- **網頁版**：`npm run build` 的產物裡搜不到 `firebase` 相關程式碼；資料畫面的金鑰區塊在、行為與現在一字不差；貼上金鑰後讀音預填照常運作。
- **iOS build**：資料畫面上沒有「Gemini API 金鑰」區塊；全新安裝、不做任何設定，新增卡片打完詞條後讀音格自動填入。
- 真機（TestFlight）驗證上一項，模擬器驗不出來。
- 把 App Check 在 Firebase 主控台暫時改成拒絕，確認 iOS 上讀音格留空且**畫面上沒有任何錯誤字**、儲存不被擋。
- 離線狀態下 iOS 新增卡片，讀音格留空、儲存不被擋。
- `npm test` 全綠。`gemini-reading.test.ts` 不需要為了這張票放寬任何斷言。
- 票 01 留下的探路按鈕與程式碼已清掉。

## Comments

### 2026-08-20 — 實作完成，等兩項人工驗證

程式碼全部到位、`npm test` 564 個測試全綠、`tsc --noEmit` 乾淨。**Status 仍留在 `ready-for-human`**：驗收有兩條只有維護者做得到（真機一輪、網頁版貼金鑰一次），沒驗完不改 `done`。

#### 動了哪些檔案

| 檔案 | 做什麼 |
| --- | --- |
| `src/lib/gemini-reading.ts` | 抽出兩條路徑共用的東西：`MODEL`、`TIMEOUT_MS`、`RESPONSE_SCHEMA`、`INSTRUCTIONS`、`promptFor()`、`parseReply()` |
| `src/lib/ai-logic-error.ts`（新） | 純函式：把 Firebase SDK 的錯翻回**同一組** `AppError` key |
| `src/lib/ai-logic-error.test.ts`（新） | 7 條，守著上一項 |
| `src/lib/gemini-reading-native.ts`（新） | iOS 那條的接線。Capacitor 與 firebase 只出現在這裡，不寫測試（比照 `haptics-native.ts`） |
| `src/lib/app-error.ts` | 加 `SilentError`：問不成、但畫面上一個字都不出 |
| `src/ui/reading-editor.ts` | 接住 `SilentError`：提示字收掉、讀音格留空 |
| `src/ui/editor-view.ts` | 分岔點 `createAsk()` |
| `src/ui/data-view.ts` | iOS 不渲染 `geminiSection()`；拆掉票 01 的探路接線 |
| `src/ui/app-check-spike.ts` | 刪除 |

#### 三個實作期間改掉的決定

**一、`RESPONSE_SCHEMA` 收成一份，型別名改小寫，兩條路徑共用同一份。**

票裡寫的是「Firebase 那邊要用 `Schema.array(...)` 那種建構式表達」，那會讓形狀存在兩份，與票 01 交代的「收斂成一份」互斥。查證後的實測地圖是：

| | 大寫 | 小寫 |
| --- | --- | --- |
| Google REST 端點（網頁版） | 實測通過 | Google 教學頁有範例，沒實測過 |
| Firebase AI Logic（iOS） | SDK 型別直接擋掉 | 票 01 實測通過 |

Google 的 API 參考頁用大寫、教學頁用小寫，兩邊都沒明講另一種收不收。維護者拍板走小寫、自己在網頁版實測——**代價是網頁版送出去的內容變了**（`"ARRAY"` → `"array"`），這一點與票裡「網頁版一個字都不能變」字面上互斥，記在這裡而不是假裝沒發生。行為上網頁版沒有任何一處改動：`dist/` 只多了 243 bytes（`SilentError` 那個類別），`firebase` 相關程式碼一個位元組都沒進去。

**二、靜默的範圍擴到 HTTP 401。** 票裡寫的是「App Check 拿不到憑證時完全靜默」，但驗收那條「把 App Check 在主控台暫時改成拒絕，確認畫面上沒有任何錯誤字」製造出來的是 401，不是本地拿不到憑證。而且 SDK 的行為是：憑證拿不到時它只在主控台留一句警告、照樣把請求送出去，換回來的正是 401——**本地那條路根本到不了畫面**。因此 401 也收進靜默，否則驗收那條過不了。

**三、憑證在編輯畫面一打開就先去要。** App Attest 第一次跟 Apple 要憑證要花好幾秒，等到詞條打完才開始排，那幾秒會整段吃掉 10 秒的問話預算。`createAsk()` 在 iOS 分支裡先 `prepare()` 一下，不等它。

#### 兩件票裡沒提、但必須知道的事

**一、接線階段（`wire()`）失敗一律靜默。** 接線本身不上網，所以離線通常仍接得起來，之後 `generateContent()` 失敗會正常落到 `gemini.offline`（畫面上出「連不上 Gemini」）。但外掛載不起來、`GoogleService-Info.plist` 沒被打包這類問題會安靜地什麼都不發生——這正是決定十一那句「代價是維護者收不到任何回報」的實際樣子。

**失敗的那一次不會被記住。** 第一版寫成「接一次就好、失敗不重來」，code review 抓出那是把整個 app session 的讀音預填壓在第一次失敗上——而失敗是靜默的，誰都不會發現。改成失敗就忘掉，下一張卡再試。重試安全性查證過：`initializeApp()` 同名同設定回既有那一個，`initializeAppCheck()` 比對 `getToken` 的內容也回既有那一個，都不會丟重複初始化的錯。

**二、沒有狀態碼的失敗一律當離線，這是兜底不是推論。** SDK 自己攔下來的設定錯誤同樣沒有狀態碼，會被說成「連不上 Gemini」。接受這個誤導的理由寫在 `ai-logic-error.ts` 的註解裡：那幾種錯要嘛開發時就炸了、要嘛是伺服器擋下來的（那時候帶得回狀態碼），而多開一條 key 只是把維護者的問題寫進使用者的畫面。

#### 據實記錄：本票踩過的兩條線

**一、寫了 7 條單元測試，而 spec 說這一段不靠單元測試。** 「測試決定」寫著「新增的 Firebase 路徑因為靠 SDK 而非 `fetch`，`doFetch` 那個接縫接不上，這一段的正確性靠票 01 的真機驗證，不靠單元測試」。那句話對的是**送出請求**那一段，確實沒測。測的是從那一段抽出來的純函式——「Firebase 那條路的失敗也落回同一組 key」，而那正是本票決定裡明寫要守住的東西。多出來的成本是一支 88 行的測試檔。

**二、動了票 06 的檔案。** 在它的「候選詞條」清單底下加了一條「說不出口的失敗」（程式碼裡是 `SilentError`）。那是票 06 的範圍，這裡只留交棒註記、沒有替它做決定。成本一行。

#### 維護者待辦（只有你做得到）

1. **網頁版實測小寫 schema。** `npm run dev`，貼上金鑰，新增一張卡，打一個**沒問過的**有漢字的詞條，離開詞條欄。讀音格自己填進來就成立。若出現「Gemini 回了 400：⋯」，就是舊端點不吃小寫，回頭改成「共用大寫、iOS 送出前轉小寫」那個方案。
2. **跑一輪 TestFlight**，裝到 iPhone，驗三件事：資料畫面上沒有「Gemini API 金鑰」區塊；全新安裝、什麼都不設定，新增卡片打完詞條讀音格自己填入；離線時讀音格留空、儲存不被擋。
3. **驗「App Check 被拒時完全靜默」。** 做法要挑對：到 App Check 把這支 app 的 App Attest 註冊移除（或改成別的 provider），製造出來的是 401，那正是我們收進靜默的那一條。**不要用「開啟重放攻擊防護」來製造拒絕**——票 01 記過，那一條回的是沒有狀態碼的 `Load failed`，我們會把它當離線，畫面上會出現「連不上 Gemini」，看起來像沒過但其實是驗錯了東西。
4. 票 03（Remote Config）動的是同一段程式碼，票 01 量到一輪 TestFlight 約 35 分鐘——**第 2、3 項建議跟票 03 攢成同一次送審**。

### 2026-08-20 — 第一輪真機實測：三條過，逼出一個設計缺口

#### 過了的

| 驗收 | 結果 |
| --- | --- |
| 網頁版貼金鑰後讀音預填照常運作（小寫 schema） | **過。** 舊端點吃小寫，維護者在 dev server 上實測 |
| iOS 資料畫面上沒有「Gemini API 金鑰」區塊 | **過** |
| 全新安裝、不做任何設定，打完詞條讀音自動填入 | **過。** 整條管子是通的：動態載入模組、跟 Apple 要憑證、問 Gemini、回來填格子 |

#### 沒過的：一半的卡在 10 秒逾時

四次嘗試裡，第 1、3 次出「等超過 10 秒沒有回覆」，第 2 次出「AI 給的讀音對不上這個詞條」（那是**成功**的請求，模型答錯而已），第 4 次成功拿到讀音。App Check 指標顯示**只有「已驗證」在增加**——權杖是有效的，逾時不是被擋。

**原因查到了，在 SDK 的原始碼裡：那 10 秒的碼表是共用的。**

```js
const fetchTimeoutId = setTimeout(...)   // 碼表在這裡按下去
const fetchOptions = {
    headers: await getHeaders(url),      // 這一行裡面才去要 App Check 權杖
    ...
};
response = await fetch(...)
```

`makeRequest()` 先按碼表、再去要權杖。所以**要憑證與問模型共吃同一份 10 秒**。憑證慢一點，使用者看到的是「等超過 10 秒沒有回覆」——而那句話是講給「模型太慢」聽的。

這同時打到兩件事：

1. **決定十一被繞過去了。** App Check 的麻煩應該完全靜默，但它以逾時的形式出了字。
2. **好人也遭殃。** 權杖有效、網路正常，卡照樣逾時。

#### 這一輪的修法

`gemini-reading-native.ts` 新增 `budgeted()`：**先自己把憑證要到手**，用一份獨立的碼表；要不到或要太久一律 `SilentError`。SDK 稍後在自己的窗口裡再要一次時就是從快取拿，模型因此拿得到完整的 10 秒。

秒數暫時沿用同一個常數（10 秒）。**還沒有真機量到的數字，所以不亂拆**，等探針回報再決定。

#### 帶了一顆計時探針上去

`src/ui/prefill-probe.ts`，**丟棄品**，量到數字就拆。畫面右下角一個小框，印出「暖機／接線／憑證／模型」各花幾秒，以及靜默發生的那一刻。

非得畫在畫面上的理由：維護者的開發機是 Windows，看不到 Safari 除錯器，iPhone 上的主控台日誌一行都讀不到（見 `.scratch/ios-app` 的既有紀錄）。而且**靜默的失敗本來就不會在畫面上留下任何痕跡**，不印在這裡就等於沒發生過。

探針刻意讓 `lib/` 反過來 import `ui/`，理由寫在檔頭：拆除時要能一眼看完。

#### 沒能驗成的那一條，以及為什麼

「把 App Check 在主控台改成拒絕」這條**沒驗成**。主控台的 App Check 頁面**沒有取消註冊的按鈕**（右上選單只有「隱藏詳細資料」「管理偵錯符記」，App Attest 面板底下只有「儲存」「取消」）。

改用「把團隊 ID 改成錯的值」，重裝 app 之後仍然無效——指標顯示四次都是「已驗證」。**為什麼無效不知道**，三個都說得通的解釋（權杖快取活過重裝、主控台設定未生效、Firebase 驗 App Attest 不看那個欄位）都沒有證據，不挑一個寫進來。團隊 ID 已改回 `LR56L89886`。

#### 更正票 01 的一條紀錄

發現六寫著「註冊 App Attest **不需要上傳 `.p8` 私密金鑰、也不需要填 Team ID**」。前半正確，**後半是錯的**——主控台的 App Attest 面板有一個「團隊 ID」欄位且必須有值（本專案是 `LR56L89886`）。同一個面板還有「權杖存留時間」，本專案設的是 **1 天**（不是 Firebase 文件講的預設 1 小時），這個數字決定了任何「弄壞 App Check」的測試最久要等多久才看得到效果。
