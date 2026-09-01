# 16 — 新增／編輯卡片：讀音格搬上手機

Status: ready-for-human
Type: enhancement
Blocked by: 15

決策背景見 `../spec.md` 的〈實作順序〉：
「編輯畫面有讀音格、合併切割、必填格、讀音預填，是最難的一頁，排第二是為了讓最大的風險早點曝出來。」

## 為什麼有這張票

**手機上現在新增與編輯卡片完全不能用。** 票 `15` 做完之後，卡片列表點得進來的地方就是這一頁。

這一頁上有這條路上剩下最大的未知：讀音格的合併與切割，網頁版做成兩顆字元大小的小按鈕，
手指按不到那種尺寸。

## 要做什麼

對照 `src/ui/editor-view.ts`（429 行）與 `src/ui/reading-editor.ts`（284 行）。

| 部位 | 內容 |
| --- | --- |
| 單字本 | 排在詞條之前——先決定放哪，再打內容。編輯既有卡時改它就是搬家，`interval`／`ease`／`due` 一律不動 |
| 詞條 | 打完離開輸入框去問一次 AI 讀音 |
| 讀音區 | 一格一個漢字串，合併與切割見下 |
| 提示字 | 詢問中／填好了／失敗的原因；沒話講時整行不留空隙 |
| 釋義 | 必填 |
| 按鈕 | 新增模式兩顆：「儲存」與「儲存並繼續」；編輯模式一顆「儲存」，底下一顆刪除 |
| 必填格 | `core/lib/required-fields.ts` 那台機器管順序，畫面只負責把輸入框翻成序號 |

### `reading-editor.ts` 搬進 `core/`

**它從頭到尾不碰 DOM，是一台純狀態機**（檔頭第一行就寫著）。搶答檢查、要不要重畫、
提示字的生死、預填的五條守門全在裡面，對外只用「變更單」溝通。搬進 `core/lib/` 直接能用，
兩邊共用一份。連帶 `reading-editor.test.ts`（516 行）一起搬，測試要全綠。

### 合併與切割：照網頁版定死

2026-08-28 拍板：**不做原型，照網頁版的做法**——點格與格之間的接縫合併、點漢字與漢字之間切割。
觸控目標撐到 44×44pt（HIG 最小值），視覺上的符號維持小顆。

**這是明知有風險仍然選的路，見下面〈已知風險〉。**

### 儲存並繼續

連續加字的手感照搬：存完留在原地、三面清空、焦點回詞條、跳一則 toast 說存進去了。
網頁版靠 Enter 走這條，iOS 上對應的是鍵盤的 return 鍵。
「這次開 app 期間上一張卡選的那本」那個記憶照舊，只活在記憶體、不進備份。

### React Native 上沒有的東西

- `confirm()` 不存在。刪除卡片改用 `Alert.alert()`。
- 網頁版那段防「點空」的 `pointerdown` 補丁（`editor-view.ts:175` 那段註解）是 DOM 的毛病，
  **不要照抄**。React Native 上重新確認一次：鍵盤開著時直接點「取消」，那一下按得到嗎。

## 這張票不做的事

- **不做資料頁與統計頁。**
- **不改讀音的規則。** `core/lib/reading.ts` 那七支純函式、五條預填守門、必填格的順序，一個字不動。
- **不修擴充 B 區漢字標不了讀音**那件事——票 `06` 挖到的，共用邏輯既有的範圍，不歸這張票。
- **不加語音選單、不動朗讀。** 那在票 `11`。

## 已知風險

**44pt 的觸控方塊塞在字與字之間，會把詞條撐得很開。**
維護者已知並選擇照網頁版定死，不先做原型。撐開到不能看的話，那時候再回頭談做法——
先做出來，讓問題長在看得見的地方。驗收那條「詞條撐開後仍然讀得下去」就是為了逼出這件事。

**這一頁是四頁裡最難的。** spec 把它排第二就是要讓這個風險早點曝出來，不是因為它簡單。

## 驗收

- [x] 新增與編輯兩種模式都走得完：存進去、回得到列表、資料真的改到 MMKV
- [x] `reading-editor.ts` 與它的測試已搬進 `core/`，網頁版改成從那裡取，兩邊測試全綠
- [x] AI 讀音預填問得到、填得進去，失敗時提示字說得出原因（**接線那一半只有真機驗得到**，見底下〈驗收狀態〉）
- [x] 合併與切割點得動，觸控目標量得到 44×44pt
- [ ] **詞條撐開後仍然讀得下去** — 拿一個五、六個漢字串的長詞實測
- [x] 必填格的順序與網頁版一致：空著時 return 鍵跳去下一個空格，不是直接儲存
- [x] 「儲存並繼續」存完留在原地、三面清空、焦點回詞條、toast 跳得出來
- [x] 編輯既有卡改單字本等於搬家，`interval`／`ease`／`due` 沒被動到
- [x] 刪除卡片走 `Alert.alert()` 確認
- [ ] 鍵盤開著時「取消」按得到，不會白按一下
- [x] 詞條重複時擋得下來（`assertTermAvailable()`），訊息說得出撞到哪一張
- [x] `../hig-checklist.md` 補進表單與輸入相關條目，並逐項核過
- [ ] **並排目測**：與 Apple 自家 app 擺一起，維護者判定不覺得舊
- [ ] 日文九宮格組字到一半按 return 不會跳欄（見底下〈一條推論，寫下來讓真機去打〉）

## Comments

### 2026-08-31 — 動工前三個問題，維護者當場拍板

票面沒涵蓋、而且不同答案會做出不同東西的三件事：

| 題目 | 定案 | 理由 |
| --- | --- | --- |
| 手機版的 AI 讀音怎麼問 | **固定金鑰走 Firebase AI Logic** | 與 Capacitor 版 iOS 同一條路、同一個 Firebase 專案，使用者什麼都不必設定。被放棄的是「自備金鑰打 Gemini」（零新套件，但金鑰的設定介面排在資料頁那張票，等於這張票交不出驗收第 3 條）與「先不接」 |
| 「新增卡片」的入口 | **導覽列右上一顆 ＋** | 那是 iOS 上這一頁主要動作該待的位置（`N-13`）。沒放進底下那條工具列，是因為那條列已經是票 `15` 的〈已知風險〉——再多一顆只會讓並排目測更難過 |
| 「預覽」那一列 | **留著，位置照網頁版** | 它是唯一看得到「存進去會長什麼樣」的地方，而 `Term` 這支元件現成就有 |

### 2026-08-31 — Firebase AI Logic 在 React Native 上怎麼接

新裝四個套件：`@react-native-firebase/app`、`/app-check`、`/ai`、`/remote-config`（都是 26.3.2）。
`GoogleService-Info.plist` 從 `ios/App/App/` 複製一份到 `mobile/`，`app.json` 加上
`ios.googleServicesFile`、App Attest 的 entitlement、以及 `@react-native-firebase/app` 這個外掛。

**bundle ID 兩邊本來就一樣**（`io.github.brad0924.vapractice`），所以 Firebase 主控台那一側
一個字都不必改：同一支 iOS app、已註冊 App Attest、已強制執行。

與 Capacitor 版那一支（`src/lib/gemini-reading-native.ts`）比，這裡少掉三段接線，
因為整條在原生層：不必 `initializeApp()`、不必自己橋接 App Check 權杖、
**不必寫那十行 Swift**。那十行當初是為了搶在 Firebase 啟動前把 provider 換成 App Attest
（`.scratch/fixed-gemini-key/issues/01` 花了一輪 TestFlight 才查出來走成了 DeviceCheck）；
這裡用一行 `provider.configure({ apple: { provider: 'appAttest' } })` 講同一件事。
**那個預設值仍然是 DeviceCheck，所以那一行不能省。**

### 2026-08-31 — `core/` 不再 import `firebase/ai`

`core/lib/gemini-reading.ts` 原本為了一個型別（`SchemaRequest`）import 了 `firebase/ai`。
共用給手機版之後這條路走不通：CI 上手機那個工作只在 `mobile/` 裡裝套件，
而 `mobile/` 裝的是 `@react-native-firebase/ai`，沒有 `firebase`——`tsc --noEmit` 當場紅。

改成 `core/` 自己宣告一份 `ResponseSchema`。順帶的好處是 `core/` 現在一個外部套件的型別都不 import，
那才是共用層本來該有的樣子。代價是嚴格度改由自己守；最後一道仍然是兩邊 SDK 的型別檢查。

> 手機那一側還要多一下轉型：`@react-native-firebase/ai` 的 `SchemaType` 是真的 TypeScript
> `enum`（同名不同國籍），而 `@firebase/ai` 的是字串聯集。執行期兩者是同一個字串，
> 送出去的 JSON 一個位元組都不差。

### 2026-08-31 — 失焦換欄那條沒有搬過來

網頁版的換欄鍵有兩條路：`↵` 與「✓」（失焦）。**只搬了 `↵`。**

那第二條是為了 iPhone Safari 鍵盤上方那條橫條右端的「完了」——它是純系統 UI，
按下去網頁只收到 `blur`、沒有任何按鍵事件，所以那件事只能掛在失焦上（`ADR-0006`）。
**React Native 的 `TextInput` 沒有那條橫條**，收鍵盤的那顆鍵不存在，第二條路因此沒有源頭。

連帶不必搬的還有它的兩條前提（「離開的那一格必須有值」「焦點落到讀音區就不搶」）——
那兩條各自擋的是失焦路上的一種壞掉，`↵` 這條走不到。`ADR-0006` 的規則一個字沒改，
只是其中一半在這個平台上沒有觸發它的按鍵。

### 2026-08-31 — 「鍵盤開著時取消按得到嗎」：答案是兩件事

票要求在 React Native 上重新確認一次。查下來是兩個不同的問題：

- **「取消」按得到**，因為它掛在導覽列上（`headerLeft`），不在捲動區裡。網頁版那個
  `pointerdown` 補丁擋的是 Safari 的「blur → 焦點跳走 → 畫面捲動 → 按鈕在 touchend 前移位」，
  React Native 沒有那條連鎖。**補丁沒有照抄，票明講不要。**
- **但同一種白按在 React Native 上另有一個源頭**：`ScrollView` 的
  `keyboardShouldPersistTaps` 預設是 `'never'`，鍵盤開著時第一下觸控只用來收鍵盤，
  底下的按鈕收不到那一下。表單裡的「儲存」「儲存並繼續」「刪除」三顆都會中。
  改成 `'handled'` 就好，不必自己立旗子。

### 2026-08-31 — `upsertCard`／`removeCard` 補進 `ReviewSession`

編輯畫面存卡**不能走 `applyData()`**。那一支的閘門比的是「複習範圍內的卡是不是同一批」（id 集合），
而這裡兩種情況都會被它判錯：

- 改一張卡的內容時 id 集合沒變 → 佇列不重建 → 複習畫面手上那張停在舊的字。
- 新增一張時集合變了 → 整個佇列重洗 → 評成「再次」排回去的那幾張一起消失。

照網頁版 `src/app.ts` 的 `upsert()`／`remove()` 各補一支，做針對性的增補而不是重建。
`lib/review-session.test.ts` 加了 11 條守它，含「搬到複習範圍外的本要離開佇列」
與「搬走的若是手上那張，答案要蓋回去」。

### 2026-08-31 — HIG 清單逐項核過

`../hig-checklist.md` 新增〈Forms & text input〉一章 16 條（`F-01`–`F-16`），
取自 Text fields、Virtual keyboards、Entering data 三頁的線上版。

這一頁核過的結果：

| 條目 | 結果 |
| --- | --- |
| `F-01` 一格只裝一小段 | 過。詞條、讀音、釋義都是短資訊 |
| `F-02` 提示文字＋另一行標籤 | 過。三格都有標籤，詞條與釋義另有提示文字；讀音格的標籤就是它正上方那幾個漢字 |
| `F-03` 大小對得上字量 | 過。讀音格 64 點寬（放得下三四個假名），詞條與釋義滿版 |
| `F-04` 間距與堆疊 | 過。直向堆疊，格與格之間 20，標籤貼著自己那一格（8） |
| `F-05` 換欄順序合乎預期 | 過。順序由 `core/lib/required-fields.ts` 決定，`ADR-0006` 定的那一圈 |
| `F-06` 該驗證的時候驗證 | **知情偏離**。讀音是不是假名只在按下儲存時驗，換欄鍵不出紅字——`ADR-0006` 明講理由：打字時被念一次，紅字會貶值成常態 |
| `F-07` 鍵盤型別配合內容 | **做不到**。讀音格該跳日文假名鍵盤，但 iOS 沒有「指定鍵盤語言」這個 API，鍵盤語言是使用者自己的設定。做得到的那一半有做：詞條與讀音關掉自動大寫與自動修正 |
| `F-08` return 鍵的字樣 | **知情偏離**。三格都是「下一個」。它的意思本來就是「去下一個空格」，而下一個是誰要看還有哪幾格空著——照著改字樣的話，打字打到一半那顆鍵會跟著閃 |
| `F-09` 尾端的清除鈕 | 過。詞條與釋義都有（`clearButtonMode`）。讀音格不給——那幾格只放一兩個假名，一顆鈕塞進去會擠掉字 |
| `F-10` 鍵盤不蓋住重要的東西 | 過。捲動區開了 `automaticallyAdjustKeyboardInsets`，正在打的那一格自己讓開 |
| `F-11` 鍵盤上方那條控制列 | 不適用。沒有自訂那一條 |
| `F-12` 拿得到的別叫人打 | 過。單字本預設是上一張選的那本；讀音由 AI 先填 |
| `F-13` 能選就別打 | 過。單字本是一張 sheet 選的，不是打字 |
| `F-14` 邊填邊驗 | **知情偏離**，與 `F-06` 同一條理由（`ADR-0006`） |
| `F-15` 必填要讓人知道 | **知情偏離**。Apple 建議「填完才讓按鈕可按」；這裡按得下去，但按了會擋下來、出一句話、游標落到該填的那一格（`ADR-0009`）。灰掉的按鈕講不出「還缺哪一格」 |
| `F-16` 讓人用貼的 | 過。而且**貼上帶讀音標記的字串會被攤回格子**（`setTerm` 認得 `焦[こ]がす` 這種寫法） |
| `B-06` 破壞性動作不指定 primary | 過。刪除走 `destructive`，`cancel` 排在前面 |
| `B-10`（不要寫死按鈕尺寸與圓角） | **既有偏離**，與票 `06`、`15` 同一個理由：React Native 沒有系統按鈕元件可用，尺寸只能自己給。守的是下限 44（`B-01`） |
| `N-10` 返回與關閉用系統按鈕 | **知情偏離**。左上角是「取消」不是返回箭頭——這一頁是表單，iOS 上表單的左上角就是「取消」。往回滑那個手勢沒有被拿掉 |
| `M-01` 玻璃只給控制與導覽層 | 過。這一頁只有導覽列是玻璃的，輸入框、按鈕、toast 全走標準材質（`M-02`） |
| `M-10`／`B-04` 主要動作只有一個 | 過。新增模式的「儲存並繼續」、編輯模式的「儲存」，各只有一顆上色，而且色上在文字不在背景 |
| `T-14` 不要只靠顏色 | 過。刪除那顆鈕面上是一句完整的話、按下去還有警示窗；toast 上有打勾；失敗那行本身就是一句話 |

### 2026-08-31 — 驗收狀態

自動測試守得住的九條已經全綠（網頁 639 條、手機 477 條，其中編輯畫面 31 條、
`reading-editor` 搬過來的 37 條、`review-session` 新增 11 條、`budgeted()` 新增 4 條）。

**剩五條要真機**（第五條是 code review 之後長出來的，見底下）**：**

- [ ] **詞條撐開後仍然讀得下去** — 票的〈已知風險〉指名的那一條。拿五、六個漢字的長串實測
- [ ] **鍵盤開著時「取消」按得到** — 它掛在原生導覽列上，這台機器畫不出來
- [ ] **AI 讀音預填真的問得到** — App Attest 在模擬器上一律回不支援，只有真機驗得到。
      畫面這一側（問出去、填進格子、失敗那句話）已經有測試守著，用的是一支假的 AI
- [ ] **並排目測**

**動工前維護者要先做兩件 repo 外的事：**

1. **重新 EAS Build。** 這張票新增了四個原生套件，現有那個包裡沒有它們。
2. **確認 provisioning profile 帶得到 App Attest capability。** `app.json` 現在明寫了
   `appattest-environment`，profile 裡沒有那個 capability 的話簽章會當場倒。
   Apple Developer 那邊的 App ID 早就開好了（`.scratch/fixed-gemini-key/issues/01`），
   但 EAS 管的是另一組憑證，第一次帶這個 entitlement 出包時可能要讓它重新產一張。

### 2026-08-31 — 為什麼不是 `done`

實作與自動測試都完成了，但票自己的〈已知風險〉指名要看
「44pt 的觸控方塊會不會把詞條撐得不能看」，而那一條只有真機看得出來。
沿用票 `03` 與 `15` 的做法：剩下只有人做得到的事，掛 `ready-for-human`。

### 2026-08-31 — code review 兩軸的結果與修正

`/code-review` 兩軸各跑一次（定點 `HEAD`，也就是票 `15` 收掉那一版）。**兩軸各抓到一條真的，都修了。**

#### Spec 軸：驗收第 7 條「焦點回詞條」其實跳票了

`reset()` 原本靠「換 `key` 讓輸入框重生」來清空三格，然後 `termRef.current?.focus()`。
兩層都不成立：重生等於把那個輸入框卸下來換一個新的，新的沒有焦點；而 `focus()` 是
同步跑的，那一刻重生還沒發生，於是打在一個馬上要被丟掉的輸入框上。網頁版沒有這個坑，
它只改 `.value`，節點不換。

改成用 `TextInput` 的 `clear()` 清詞條與釋義——不換節點，焦點留得住，`focus()` 也對得到人。
讀音區照舊換號碼牌重生（詞條清空之後那一區一格都不剩，本來就沒有焦點可掉）。
`seed` 因此從三格減成兩格。

> **這一條自動測試守不到**：React Native 的測試工具答不出「現在焦點在誰身上」。
> 驗收那一條仍然勾著，但真正的證據是真機——連著加字時第二張打不打得下去，一按就知道。

#### Standards 軸：讀音預填的政策值兩邊各存一份

spec 的〈程式碼怎麼擺〉把讀音預填點名為共用邏輯，而「邏輯層不准分岔」是那一節寫下的
**這條路上最不能踩的線**。實作時 `mobile/lib/gemini-reading-native.ts` 把 Capacitor 版
那幾段政策照抄了一份：Remote Config 的兩個參數名、後備表、一小時的過期時間，
以及憑證那份獨立碼表。那幾段**一行 SDK 都不碰**，是政策不是接線。

搬進 `core/`：

| 搬走的東西 | 新家 |
| --- | --- |
| `REMOTE_MODEL_KEY`／`REMOTE_INSTRUCTIONS_KEY`／`REMOTE_FALLBACK`／`CONFIG_MAX_AGE_MS` | `core/lib/gemini-reading.ts`（後備值 `MODEL`、`INSTRUCTIONS` 本來就住那裡） |
| `budgeted()`（憑證那份碼表） | `core/lib/reading-retry.ts`（同一個模組已經放著重試迴圈，同樣是純邏輯） |

`src/lib/gemini-reading-native.ts` 跟著改成從那裡取。**搬過去順帶測得到**：
`reading-retry.test.ts` 加了 4 條守 `budgeted()`，其中一條守的是那句措辭——
逾時丟的必須是 `SilentError` 而不是 `gemini.timeout`，憑證慢了不能被講成「模型太慢」。

留在各自檔裡的只剩真的分岔的那三段：`wire()`、`mount()`、拿權杖。

#### 其餘幾筆判斷題，改了四處

- **`readonly { id: string; name: string }[]` → `Book`**。同一支檔已經在 import `Card`，
  `Book` 就在旁邊。
- **`asked` 改名 `mine`**，順帶拿掉一個 `!`：那個變數裝的是狀態機不是「問過的東西」。
- **`session.snapshot().data.cards.find(...)` 拆成兩行**，跟 `cards-screen.tsx` 同一個寫法。
- **`FormButton` 的 `secondary` 補一段註解**：它底下沒有樣式不是漏掉，「沒有顏色」正是
  這一顆該有的樣子（`M-10` 一頁只給一個強調）。

`upsertCard()`／`removeCard()` 與網頁版 `src/app.ts` 逐行相似那一條**不動**：
`review-session.ts` 檔頭與 `sameCards()` 那段註解已經記過同一個立場——共用的那條線畫在
儲存與加解密上，不畫在畫面編排的佇列增補上。

#### 兩筆加碼，補記在這裡

- **「找不到這張卡」那一頁**（`editor.cardGoneTitle`／`cardGone`）。票面沒提，網頁版也沒有
  這個狀態——那邊的編輯畫面拿的是一個現成的卡片物件，不存在「用編號查不到」這回事。
  手機版是用網址帶編號進來的，查不到是真的走得到，而**靜靜地變成新增畫面**會讓使用者
  以為自己的卡被清空了。
- **`mobile/jest.config.js` 多收了四支 `core/` 測試**（`reading`、`required-fields`、
  `reading-retry`、`ai-logic-error`）。票只要求搬 `reading-editor.test.ts`。理由與票 `15`
  收 `card-list`、`book-scope` 那兩支相同，那段註解就寫在同一個檔案裡：這一頁整個靠它們，
  而它們要在 React Native 這套工具鏈底下也載得進來。

#### 順手修的一件事：Jest 的預設 5 秒不夠

加了兩支測試之後，全套跑起來偶爾會在第一條上超時（同一支單獨跑是 3 秒跑完 31 條）。
病灶是冷啟動時要把整棵 React Native 元件樹轉譯一遍，而 **CI 上每一趟都是冷的**。
`testTimeout` 提到 15 秒。真的死結仍然會紅，只是不再誤傷冷啟動那一趟。

#### 一條推論，寫下來讓真機去打

網頁版換欄鍵第一行是 `if (event.key !== 'Enter' || event.isComposing) return;`，
擋的是「輸入法正在組字，這一下 Enter 是在確定候選字」。手機版**沒有對應的一句**，
理由是組字期間那顆鍵被 UIKit 的輸入法收走、`onSubmitEditing` 根本不會發。
**這是推論不是實測**，已寫進程式碼註解並列入真機驗收：日文九宮格打到一半按 return
若真的跳了欄，就是這個推論不成立。

### 2026-09-01 — CI 第一趟就紅：Firebase 走 SPM 撞上靜態連結

推上去之後 `mobile-crypto.yml` 停在「建包」，訊息是「prebuild 沒產出 .xcworkspace」。
**那是症狀。** 病因印在上一步的 log 裡，而那一步是綠的：

```
[!] [react-native-firebase] SPM + static linkage is not supported (target(s): Pods-JPVocab).
firebase-ios-sdk 的 Swift Package products 是 automatic libraries（不是 type: .dynamic），
所以每個 react-native-firebase pod 都會夾帶一份自己的 SDK。配上靜態連結，那幾份在
連結時撞成重複符號。
```

`@react-native-firebase` 26 預設用 Swift Package Manager 去拿 firebase-ios-sdk，而這個
專案走的是 React Native 的預設連結方式（靜態程式庫——log 上那句 `Framework build type is
static library`）。**沒有人設過 `use_frameworks!`**，這件事是套件的預設值撞上框架的預設值。

套件自己印出兩條解法，選了第二條：

| 走法 | 影響範圍 | 選它嗎 |
| --- | --- | --- |
| `use_frameworks! :linkage => :dynamic` | **整包每一個原生套件**的連結方式都變。這包裡有 `react-native-quick-crypto`（它會下載一份靜態的 OpenSSL）、MMKV 那組 nitro modules、`expo-glass-effect` | 否 |
| `$RNFirebaseDisableSPM = true` | 只改 Firebase 自己怎麼拿相依（改回 CocoaPods），其餘一個都不碰 | **是** |

做法是 `app.json` 那個外掛加一個參數，不必自己去改 Podfile：

```json
["@react-native-firebase/app", { "ios": { "disableSPM": true } }]
```

**在 Windows 上驗得到的那一半已經驗過**：`expo prebuild` 在這台機器上產不出 iOS 專案，
但那支外掛的插旗函式（`plugin/build/ios/podfile.js`）可以單獨餵 Expo 57 的 Podfile 範本跑一次。
結果是旗標落在 `prepare_react_native_project!` 之後、第一個 `target` 之前——正是外掛註解
要求的位置（旗標必須在任何 target 之前，`firebase_spm.rb` 才看得到它）。
**pod 真的裝不裝得起來只有 CI 答得出來。**

#### 順手改掉「紅燈亮錯地方」

`expo prebuild` 的 `pod install` 失敗時**它自己照樣 exit 0**，所以那一步是綠的。
下一步的防呆檢查抓到了「沒有 workspace」並且紅燈——那個檢查有做事，但它講得出的
只有症狀，而原因躺在一支綠燈步驟的 log 裡，沒有人會去翻。

檢查搬進 prebuild 那一步：認 `.xcworkspace` 在不在（那份 workspace 正是 `pod install`
的產出）。下次同一類事情紅燈會亮在印著錯誤的那一步上。

### 2026-09-01 — CI 第二趟：SPM 過了，卡在下一層的 module map

關掉 SPM 之後 Firebase 改由 CocoaPods 拿（log 上看得到 `AppCheckCore`、`nanopb`、
`RecaptchaInterop` 都裝進來了），然後撞上 Firebase 裝進 iOS 專案的**經典第二關**：

```
The following Swift pods cannot yet be integrated as static libraries:
The Swift pod `AppCheckCore` depends upon `GoogleUtilities` and `RecaptchaInterop`,
which do not define modules.
The Swift pod `FirebaseCoreInternal` depends upon `GoogleUtilities`...
The Swift pod `FirebaseRemoteConfig` depends upon `FirebaseABTesting` and `GoogleUtilities`...
```

Swift 寫的 pod 要 import 別人時，對方得產出 module map；而 `GoogleUtilities` 這幾個是
Objective-C 的老套件，預設不產。

**這一次不必猜是哪幾個**——CocoaPods 自己把三個 Swift pod 與它們缺的三個相依都列出來了，
而且它是**整張相依圖驗完才報告**，不像編譯錯誤那樣修一個冒一個。

兩條解法，維護者選了影響面小的那條：

| 走法 | 影響範圍 | 選它嗎 |
| --- | --- | --- |
| 整包改用 static framework（`useFrameworks`） | React Native Firebase 官方對 Expo 寫的做法，路很多人走過。但**這包裡每一個原生套件的連結方式都跟著變**——含會下載靜態 OpenSSL 的 quick-crypto 與 MMKV 底下那組 nitro modules。`expo-build-properties` 另外附了一個 `forceStaticLinking` 專門用來救「改成 framework 之後裝不起來的 pod」，那說明踩雷是常態 | 否 |
| 只給那三個 pod 開 module map | 連結方式一個字不改。點名 `GoogleUtilities`、`RecaptchaInterop`、`FirebaseABTesting` 三個，其餘一個都沒碰到 | **是** |

做法是裝 `expo-build-properties`，在 `app.json` 用它的 `extraPods`：

```json
["expo-build-properties", { "ios": { "extraPods": [
  { "name": "GoogleUtilities", "modular_headers": true },
  { "name": "RecaptchaInterop", "modular_headers": true },
  { "name": "FirebaseABTesting", "modular_headers": true }
] } }]
```

**整條鏈在 Windows 上驗過了**（真的裝不裝得起來仍然只有 CI 答得出來）：

1. `expo config --type introspect` 顯示這三筆被序列化進 `Podfile.properties.json`
   的 `apple.extraPods`。
2. `expo-modules-autolinking/build/platforms/apple/apple.js` 讀那一格並 `JSON.parse`。
3. `expo-modules-autolinking/scripts/ios/autolinking_manager.rb` 把每一筆翻成
   `@podfile.pod(name, { modular_headers: true })`，而那段跑在 `use_expo_modules!` 裡面，
   也就是 **target 區塊之內**——正是 CocoaPods 那句建議要求的位置。

`$RNFirebaseDisableSPM = true` 仍然要留著：拿掉就會退回第一趟那個 SPM 的錯。

### 2026-09-01 — 真機裝上去了，讀音預填毫無反應

CI 過了、包裝上真機、編輯畫面本身動得起來，但**打完詞條失焦之後畫面一個字都不出**。
維護者回報：連「詢問中…」那一行都沒看到；試的是有漢字的新詞、讀音格留空——
守門條件逐條對過都該通過。

#### 「完全沒有字」不代表它沒去問

時序追過一遍：`prefill()` 是**先同步掛上「詢問中…」，再去問**。如果 Firebase 那一端當場
就失敗（例如根本沒接起來），那個失敗會在同一個 tick 裡回來，而 React 把同一個 tick 的
畫面更新合併成一次——**那一行從掛上到被收掉，可能一幀都沒畫出來**。

所以「完全沒有字」與「問了但瞬間失敗」在眼睛看起來一模一樣。

#### 這是那條「刻意不出聲」的設計第一次咬人

spec 決定十一拍板「App Check 過不了就一個字都不出」，理由是使用者對這種錯無能為力。
代價現在浮出來了：**「壞了」跟「它根本沒試」長得一樣，維護者自己也分不出來**。
而且有三條路都會走到靜默，修法完全不同：

- Firebase 根本沒接起來（plist 沒進包、原生模組沒連上）
- App Attest 跟 Apple 要不到憑證
- 憑證拿到了但 Google 不認（回 401）

維護者的開發機是 Windows，看不到裝置上的主控台（票 `03` 就記過這件事）。

#### 加一支探針，逐段報告

2026-09-01 維護者拍板：**在資料頁那支探針畫面加一顆「試問一次讀音」**。
被放棄的是「接 Metro 看 console」（要先認定那個包是 dev build，而且程式裡一行
`console.log` 都沒有）與「改掉那條靜默的規則」（那要動兩個平台共用的那一層，
網頁版會一起變）。

`mobile/lib/gemini-reading-native.ts` 加一支 `probeReading()`，三段各自報告：

1. 接線接不接得起來（印出 `projectId` 與 `appId`——**兩格空的話問題在打包，不在憑證**）
2. App Check 要不要得到權杖（只印長度不印權杖本身：那是這台裝置的通行證）
3. 真的問一次模型，**不經過 `toReadingError()`** ——那一支會把 401 翻成 `SilentError`，
   正是這支探針要挖出來的那一種

**它跑的是 `ensure()` 接出來的同一組東西，不是另接一份。** 另接一份的話探針綠了也不代表
編輯畫面會動——那才是這支探針唯一的價值。

> 資料頁那張票做好時，`probeReading()` 要跟探針畫面一起消失。

### 2026-09-01 — 探針一次問出病因：走的是 DeviceCheck，不是 App Attest

三行結果：

```
1. 接線 OK · project=va-practice · appId=1:868881672534:ios:0101e57fef7da60adccef7
   Remote Config：OK
2. App Check 要不到權杖：code=appCheck/token-error
   URL: .../apps/1:868881672534:ios:...:exchangeDeviceCheckToken
   HTTP 400 · "App not registered: 1:868881672534:ios:..." · FAILED_PRECONDITION
3. 問模型失敗：status=401 · Firebase App Check token is invalid
```

第 1 行證明 `GoogleService-Info.plist` 進了包、原生模組接得起來——**打包沒問題**。
病灶在第 2 行那個網址結尾：**`exchangeDeviceCheckToken`**。它走的是 DeviceCheck，
而主控台註冊的是 App Attest，所以 Google 說「這支 app 沒登記」。第 3 行的 401 只是下游。

**這與 Capacitor 版當年那個卡點是同一個症狀**（`.scratch/fixed-gemini-key/issues/01`
的〈卡點：走的是 DeviceCheck，不是 App Attest〉），但**成因不同**：那邊是外掛根本沒提供
選 provider 的開關，這裡有指定，只是沒等它生效。

#### 成因：`initializeAppCheck()` 是「同步回來、背景繼續做」

套件自己的原始碼寫得很清楚。模組層那支的註解第一句：

> Returns synchronously for firebase-js-sdk parity;
> **native provider setup continues in the background.**

最後一行是 `void (appCheck).initializeAppCheck(options)`——**promise 被丟掉了**。
實例身上那一支才回得出來：它先 `configureProvider('appAttest')`（往原生層的橋接呼叫），
完成之後才開自動更新，而套件在那一段留的註解正是在講順序不能顛倒：

> AppCheck-AD-4: attach the real provider before enabling auto-refresh so early
> refresh does not run while the native facade is still pending.

我們接完線就馬上去要權杖，那一刻原生層手上還是**出廠預設的 DeviceCheck**。

#### 修法：等它換完

`wire()` 改成非同步，`await` 那支等得到的初始化；`ensure()` 跟著改成記一個 promise，
而且**失敗的那一次不記住**（與 Capacitor 版同一個形狀）。同一組設定叫第二次是安全的——
原生那一支（`RNFBAppCheckModule.mm` 的 `configureProvider`）只是在共用的 factory 上
記下「這個 app 用哪一個 provider」。

型別自己寫一份 `AwaitableAppCheck`：那支方法住在套件的 `lib/types/internal.ts`，
沒有從公開入口匯出，`package.json` 的 `exports` 也擋住深層路徑。

#### 驗的時候要整支關掉重開，不能只重載 JavaScript

錯誤訊息裡那句 `Too many attempts` 是 App Check 客戶端自己的退避——連續失敗之後它會
停一段時間不再試。重載 JavaScript 不會重啟原生那一半，那個退避狀態會留著。

### 2026-09-01 — 等它換完沒有用：factory 根本沒掛上去

修了「等原生換完 provider」之後**症狀一模一樣**，網址還是 `exchangeDeviceCheckToken`。
那代表問題比上一輪判斷的更早：**Firebase 從頭到尾沒拿到我們那個 factory。**

原生那一端讀完就清楚了：

- `RNFBAppCheckProviderFactory.m` 的註解寫著「Firebase may call this during
  `FirebaseApp.configure()` before JS runs configureProvider. Install a pending facade only」
  ——它**設計上就預期自己在 configure 的那一刻已經在場**。
- 但 `[FIRAppCheck setAppCheckProviderFactory:]` 只在 `RNFBAppCheckModule` 的
  `+sharedInstance` 裡（`dispatch_once`），而那支只有 JavaScript 叫得動它。
- `@react-native-firebase/app` 的 Expo 外掛把 `FirebaseApp.configure()` 插進 `AppDelegate`，
  **沒有人在那之前叫 `sharedInstance`**。

於是啟動順序是：configure（`FIRAppCheck` 拿著內建的 DeviceCheck 誕生）→ 很久以後
JavaScript 才去掛 factory。太晚了。

官方文件（rnfirebase.io/app-check/usage）對 React Native 0.79 以上明講要自己補兩件事，
而這裡是 0.86：

```swift
RNFBAppCheckModule.sharedInstance()   // 先掛 factory
FirebaseApp.configure()
```

加上 bridging header 那一行 `#import "RNFBAppCheckModule.h"`（文件也明講**不要**在 Swift 裡
`import RNFBAppCheck`，那個 pod 是純 Objective-C）。

> **Capacitor 版當年是同一個順序問題**（`.scratch/fixed-gemini-key/issues/01` 的〈卡點〉），
> 那邊手寫十行 Swift 就結案，因為它的 `ios/` 進版控。這裡每次 `expo prebuild` 都重新產生，
> 所以得寫成外掛：`mobile/plugins/with-app-check-first.js`。

#### 這支外掛刻意會當場失敗

找不到 `FirebaseApp.configure()` 那個錨點時**直接丟例外讓 prebuild 紅**，不安靜地跳過。
安靜跳過的下場就是再出一次「看起來好了、其實走 DeviceCheck」的包，而那種包要靠探針
才驗得出來——這一輪已經為它燒掉兩趟真機了。

它排在 `@react-native-firebase/app` **後面**：錨點是那支插進去的。

#### Windows 上驗到哪

拿 Expo 57 真的 `AppDelegate.swift` 範本，先跑 RNFirebase 那支外掛真的會做的改動，
再跑這一支：`RNFBAppCheckModule.sharedInstance()` 落在 `FirebaseApp.configure()` **上一行**，
重跑一次不會重複插。bridging header 那一半用範本真的那一份驗，同樣冪等。

#### 順手修好相依守門的一個誤報

`import-scan.ts` 那個小掃描器把外掛裡的字串 `#import "RNFBAppCheckModule.h"` 當成了
JavaScript 的 import，報「少宣告一個叫 `RNFBAppCheckModule.h` 的套件」。
`#import` 是 Objective-C，永遠不會是 JavaScript 的 import——修掃描器，不加例外。
它的檔頭本來就承認自己「只是個小掃描器，不是剖析器」而且會多報，這是第一次真的多報。

`@expo/config-plugins` 補進 `package.json`：那支外掛直接 import 它，守門抓得對。
