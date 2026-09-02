# 17 — 密碼搬進 Keychain，順帶把「這台要不要接」問出來

Status: done
Type: enhancement
Blocked by: 16

決策背景見 `../spec.md` 的〈實作順序〉與 `docs/adr/0019-react-native-keychain-for-icloud-sync.md`。
這張票**不碰任何畫面**，它是資料頁（票 `18`）動工前擋在前面的那一段。

## 為什麼有這張票

`mobile/lib/cloud-probe.ts` 的檔頭現在寫著：

> **暱稱與密碼會存在 MMKV，不是 Keychain。**⋯⋯**這一版不要送到任何人手上。**

票 `05` 當初明寫「不做金鑰搬遷」，票 `10` 接雲端登入時也明寫不接 `cloud-consent.ts`，
理由是「密碼存 MMKV、不跟 iCloud 走，新裝置那格是空的，`wantsPull()` 第一行就 `return false`——
現在接等於寫一段永遠不生效的程式碼」，並交代**等金鑰搬進 Keychain 那張票一起做**。這是那張票。

**Keychain 是 App Store 準則 4.2 那四項實質功能之一**（`ADR-0015`）。另外三項——原生日文語音（票 `11`）、
評分觸覺（票 `08`）——已經收了，每日提醒排在票 `19`。這一項補上之後只剩提醒。

### 為什麼它從資料頁那張票拆出來

一支原生模組加一次共用層介面改造，與畫面工作性質完全不同，而且它擋在雲端備份那一區前面。
拆開的手法與票 `15` 把單字本管理從資料頁提前拿出來一樣：**擋在前面的先做**。

**代價已知**：這張票做完的時候沒有正式畫面可以驗它，而探針（`probe-screen.tsx`）正要在票 `18` 被刪掉。
處理方式見〈驗收〉——這一輪仍靠探針驗，票 `18` 動工時才連同探針一起收掉。

## 要做什麼

### 一、`react-native-keychain` 頂替 MMKV 那一格

裝 `react-native-keychain` v10，開 `cloudSync: true`。**選它而不是 `expo-secure-store` 的理由見 `ADR-0019`**：
官方那支沒有 iCloud 同步選項，而整個「同意」機制的存在前提就是密碼會跟著 iCloud 走。

接線走 `core/lib/keychain.ts` 那個**現成的**中間人，一行都不必改——它把非同步的 Keychain 包成
`StorageLike` 同步介面（`ADR-0002` 那個介面不改），Capacitor 版已經在用同一支。
手機這一端只要補一支 `mobile/lib/keychain-native.ts`，把套件的三支方法接成 `KeychainLike`。

`v10` 的 `codegenConfig` 是 `type: "modules"`，新架構已就緒；沒有 Expo 設定檔外掛，
靠 autolinking 接上即可——`kSecAttrSynchronizable` 不需要額外的 entitlement，
但**這一點要在真機出包時確認**，不要當成已知事實。

**MMKV 裡那筆舊的暱稱密碼不搬。** Keychain 是空的就是未登入，去資料頁重登一次。
留兩條讀取路徑比重打一次密碼糟——而且這一版本來就沒有送到任何人手上。

### 二、同意的介面改成非同步

`core/lib/cloud-consent.ts` 的 `ask()` 與 `wantsPull()` 現在是**同步**的，因為它唯一的客戶是
`confirm()`，那在 WKWebView 裡會擋住整條執行緒。**React Native 沒有會擋住執行緒的對話框**，
`Alert.alert` 是 callback。

兩支都改成回 `Promise`。摸到的檔四支，都是機械式改動：

| 檔 | 改什麼 |
| --- | --- |
| `core/lib/cloud-consent.ts` | `ask` 與 `wantsPull` 改回 Promise |
| `core/lib/cloud-consent.test.ts` | 跟著 await |
| `src/lib/cloud-consent-native.ts` | `confirm()` 包成 `Promise.resolve()` |
| `src/app.ts` | 呼叫端 await 一下 |

**網頁版本來就沒有這條支線**（`createNativeCloudConsent` 在那邊回 `null`），不受影響。

**不在手機那端自己組一套 callback。** 那會讓 `wantsPull()` 裡「該不該問」的判斷被重寫一次，
兩份邏輯日後各自漂走——`../spec.md`〈程式碼怎麼擺〉把邏輯層分岔列為這條路上最不能踩的線。

### 三、開機那一問接上去

`mobile/lib/app-context.tsx` 現在開機直接叫 `cloud.begin()`（票 `10`）。改成先問 `wantsPull()`，
答「要」才 `begin()`。順序不能反——反過來就是先拉再問，問了也沒用。

問的方式用 `Alert.alert` 兩顆鈕，文字查 `cloud.pullConfirm`（三份翻譯檔本來就有）。

### 四、「停止同步」照舊清掉那一筆

> **這一節在 2026-09-02 被推翻重寫。** 原本寫的是相反的東西——「只停這台、不刪 Keychain」，
> 並為此在 `cloud-backup.ts` 加一支 `stopHere()`、在 `cloud-consent.ts` 加一支公開的
> `decline()`。兩支都做出來了，然後整批拆掉。經過見底下 Comments 的〈為什麼翻掉〉。

`cloud-backup.ts` 的 `signOut()` 一次做兩件事：停掉這台的推送（`account = null`，
`push()` 第一行就 `if (account === null) return`）、以及刪掉暱稱密碼那一格。**兩件都留著。**

密碼搬進 Keychain 之後那第二件事的射程變大了：`SecItemDelete` 會把刪除**同步到使用者
所有的裝置**。**這正是隱私權政策已經寫給使用者的行為**（`public/privacy.html`）：

> iOS 版的暱稱與密碼存在系統的 Keychain 裡，是唯一的例外：移除 app 不會把它清掉，
> 按下「停止同步」才會。若你開啟了 iCloud 鑰匙圈，那一份也會同時從鑰匙圈移除。

所以 `cloud-backup.ts` **一行不改**，手機版與網頁版走同一支 `signOut()`。
要補的是**那句確認文字要講清楚它會清到所有裝置**，而那條新字串屬於票 `18`。

**「拒絕接回」是另一件事，不受影響。** 開機那一問按「取消」時 `DECLINED` 由 `wantsPull()`
自己在函式裡寫進去，**Keychain 那一筆不刪**（理由見 `cloud-consent.ts` 檔頭）。
反悔那條路也早就在：`declined()` 判斷要不要長出那顆鈕，按下去叫 `grant()`，
網頁版 `src/ui/data-view.ts` 接的就是這兩支。手機版那顆鈕屬於票 `18`。

畫面那一半屬於票 `18`。

## 這張票不做的事

- **不碰任何畫面。** 資料頁是票 `18`。這一輪仍靠 `probe-screen.tsx` 驗。
- **`cloud-backup.ts` 的「停止同步」一行不改。** 三個版本走同一支 `signOut()`。
- **不改 `data.stopConfirm` 那句話。** 手機版要用的是另一條新字串，那條屬於票 `18`。
- **不動 `cloud-backup.ts` 的加解密。** 標答表（票 `05`）守著那一塊，這張票一個位元都不該讓它變。

## 已知風險

**`cloudSync` 那一半驗不了。** 要證明密碼真的跟著 iCloud 走到第二台，手邊得有兩台同一個
Apple ID 的 iPhone。沒有。**這一條掛著，不阻擋收票**——做法與票 `03` 驗收第 5 條（沒有舊 iPhone）
一致，那一條到今天還掛著。

不用模擬器頂替：模擬器上的 iCloud 鑰匙圈本來就不可靠，測出來的結果不管是過是不過都不能當真。

~~**`kSecAttrSynchronizable` 可能要 entitlement。**~~ **2026-09-02 真機證實不必**：
EAS Build 出得來、裝得進真機、Keychain 讀寫都通，`app.json` 一個字沒改。這一條結案。

## 驗收

真機，iOS 26。

- [x] EAS Build 出得來、裝得進真機（`react-native-keychain` 沒有把 build 弄壞）
- [x] 探針上登入一次，殺掉 app 再開，**不必重打密碼**就接得回雲端（密碼真的寫進 Keychain 了）
- [x] 開機那一問跳得出來，而且講得出暱稱
- [x] 那一問按「取消」→ 這次不接、資料不被蓋掉；**再開一次 app 不會再問**
- [x] 那一問按「接回來」→ 拉下雲端那份；再開一次 app 不會再問，直接接
- [x] 探針上按「停止同步」→ 推送停了（在網頁版動一動，手機這邊不會被蓋掉）
- [x] 停止同步之後 `cloud.nickname()` **答不出暱稱了**（Keychain 那筆真的被清掉，
      與隱私權政策的承諾一致），重打一次暱稱密碼接得回來
- [x] 那一問按「取消」之後 `cloud.nickname()` **仍答得出暱稱**——拒絕不刪 Keychain，
      這一條與上一條是兩件不同的事
- [x] 網頁版按「停止同步」→ 行為與現在完全一樣，密碼被刪、要重打
- [x] `npm test` 與 `tsc --noEmit` 兩邊都綠（含改成非同步之後的 `cloud-consent.test.ts`）
- [x] 加解密標答仍 `PASS 6/6`
- [ ] **掛著**：密碼跟著 iCloud 鑰匙圈走到第二台 iPhone（沒有第二台裝置，驗不了）

## Comments

### 2026-09-01 — 動工前四個問題，維護者當場拍板

票面沒涵蓋、而且不同答案會做出不同東西的四件事：

| 題目 | 定案 | 理由 |
| --- | --- | --- |
| 驗收第 6、7 條要按的那顆「停止同步」不存在 | **加在探針上** | 〈不做的事〉那句「不碰任何畫面」講的是正式畫面（資料頁＝票 `18`）。探針的檔頭本來就寫著「它不是任何一頁正式介面」，而且票 `18` 動工時整支被取代。不加的話那兩條只能跟著掛 |
| `Alert.alert` 要的標題與兩顆鈕的字沒有出處 | **三份翻譯檔各補三條** `cloud.pullTitle`／`pullAccept`／`pullDecline` | 網頁版的 `confirm()` 由系統配 OK／取消，這三條是 React Native 才需要的。掛在 `cloud.*` 底下與 `cloud.pullConfirm` 同一組，日後一起改。被放棄的是「借單字本那條『取消』」（少改六行，但這一問的字從此散在三個功能區底下） |
| ~~「只停這台」那支方法的名字~~ | ~~`stopHere()`~~ | **這一列作廢**：那支方法在同一天被整支拆掉，見底下〈為什麼翻掉〉 |
| Keychain 是非同步讀的，那幾毫秒畫面怎麼辦 | **讀完之前 `AppProvider` 什麼都不畫** | 雲端備份問「登入了沒」的方式是同步的，早一步建起來它就認定這台沒登入，`push()` 第一行返回，這台從此一次都推不上去。改動集中在 `app-context.tsx` 一支檔，四個畫面一行不動 |

### 2026-09-01 — 程式碼這一半做完了，真機那一半沒有

`npm test`（root 643 條、mobile 482 條）與兩邊的 `tsc --noEmit` 都綠，六筆加解密標答仍 `PASS 6/6`。
`core/lib/keychain.ts` 與 `cloud-backup.ts` 的加解密一個位元都沒動。

**驗收那十一條一條都還沒打勾**——它們整批要真機、iOS 26、一趟 EAS Build。
第 11 條（密碼跟著 iCloud 走到第二台 iPhone）沒有第二台裝置，維持〈已知風險〉寫的「掛著，不阻擋收票」；
其餘十條出包之後就驗得到。`kSecAttrSynchronizable` 要不要 entitlement 也在那一趟確認。

新增與改動的檔：

| 檔 | 做了什麼 |
| --- | --- |
| `mobile/lib/keychain-native.ts`（新） | 把 `react-native-keychain` v10 的三支方法接成 `KeychainLike`，三支都帶 `cloudSync: true`；順手清掉 MMKV 那筆舊的明文 |
| `mobile/lib/cloud-consent-native.ts`（新） | `ask()` 包成 `Alert.alert` 兩顆鈕的 Promise |
| `core/lib/cloud-consent.ts` | `ask`／`wantsPull` 改回 Promise |
| `core/lib/cloud-backup.ts` | **一行沒改** |
| `mobile/lib/app-context.tsx` | 開機先讀 Keychain 再建共用那一份；接著先問 `wantsPull()`，答「要」才 `begin()` |
| `mobile/ui/probe-screen.tsx` | 多一顆「停止同步」，走 `signOut()`；登入成功時 `grant()`，接法與網頁版 `data-view.ts` 相同 |
| `src/app.ts`、`src/lib/cloud-consent-native.ts` | 跟著改成非同步。**網頁版一個 await 都不會走到**：`cloudConsent` 是 null，`||` 當場短路 |

### 2026-09-01 — 三件票面沒交代、但做了的事

審查抓出來的，各記一筆，維護者要退掉隨時退得掉。

**一、探針登入成功時多叫一句 `cloudConsent.grant()`。**
`grant()` 的介面說明本來就寫著「在這台裝置上親手登入成功也算」，網頁版 `src/ui/data-view.ts`
接的是同一句。少了它會漏掉一條真的會發生的路：**開機那一問按了「取消」、之後又自己去探針登入**——
那台裝置的答案停在 `DECLINED`，`wantsPull()` 從此 `return false`，驗收第 2 條當場不過。

**二、`keychain-native.ts` 刪掉 MMKV 裡那筆舊的明文密碼。**
票只寫「不搬」，沒寫刪。做法與 Capacitor 版那支一字不差（`src/lib/keychain-native.ts`）：
那一筆從此不再被讀到，留著只是白白多一個讀得到密碼的地方，而且「停止同步」也清不到它。

~~**三、`stopHere()` 除了那三行，還收掉那行狀態字。**~~ 那支方法已經整支拆掉，這一條作廢。

### 2026-09-01 — 驗收第 3、4、5 條要怎麼製造出那個狀態

那三條要的是「有密碼、但這台從沒答過、本機也沒與雲端往返過」。單純登入一次做不出來：
登入會把 `updatedAt` 推上去，`wantsPull()` 走 `syncedBefore` 那條，不問。

做法是**把 app 刪掉重裝**：MMKV 整格跟著消失（同意那格、`updatedAt` 一起歸零），
而 Keychain 那一筆活著。重裝後第一次開機就是那一問該跳出來的時刻。

### 2026-09-01 — `/code-review` 抓到三條，都修了

~~**一、`signOut()` 的執行順序被我動到了。**~~ 那支共用的 `stopPushing()` 已經整支拆掉，
`cloud-backup.ts` 現在與 `HEAD` 逐字相同，這一條作廢。

**二、開機那一趟爆掉會變成一片不說話的白畫面。** 這一段以前住在 `useState(() => …)` 裡，
丟例外就是一片紅畫面；搬進 Promise 之後同一個例外會被默默丟掉，而 `wiring` 永遠是 null，
`AppProvider` 永遠什麼都不畫。補了 `.catch`，接住之後在畫面那一輪重新丟出去，
另加一條測試釘住它。

**三、`src/app.ts` 的 `void finishBoot()` 把例外吞了。** `showReview()` 丟例外以前會從
`start()` 同步冒出去，包成 async 之後變成一個沒人接的 rejected promise。改成
`finishBoot(pull)` 收一個布林值、不寫 `async`；網頁版那條路由 `if` 直接同步叫它，
**整條路一個 Promise 都不碰**。

另外把三條新翻譯搬到 `cloud.pullConfirm` 正下方——原本插在 `cloud.wrongPassword`
與它的說明中間，兩邊的註解都對不上了。

### 2026-09-02 — 為什麼把第四節整個翻掉

commit 前的隱私權守門攔下來，指著 `public/privacy.html` 那一段：

> iOS 版的暱稱與密碼存在系統的 Keychain 裡，是唯一的例外：移除 app 不會把它清掉，
> 按下「停止同步」才會。若你開啟了 iCloud 鑰匙圈，那一份也會同時從鑰匙圈移除。

**那句話已經把「會清到所有裝置」講給使用者聽了。** 第四節當初的顧慮是「按下去電腦上的密碼
也會消失，而確認文字只講了這一台」——問題出在**確認文字**，不在行為本身。

維護者拍板：不要為了遷就一句話而讓兩支 app 的同一顆鈕做不同的事，改成程式跟著政策走。
於是 `stopHere()` 與公開的 `decline()` 兩支連同測試整批拆掉，`cloud-backup.ts` 回到一行沒改。
要補的那句確認文字（講明它會清到所有裝置）屬於票 `18`。

**「拒絕接回」與「停止同步」是兩件事，拆掉之後兩條都還在。** 開機那一問按「取消」時，
`DECLINED` 由 `wantsPull()` 自己在函式裡寫進去——**它從來就不需要外面有一支公開方法**，
新加的 `decline()` 唯一的客戶就是「停止同步」。反悔那顆鈕靠的是 `declined()` 與 `grant()`，
兩支都是這張票之前就有的，一個字沒動（手機版那顆鈕屬於票 `18`）。

### 2026-09-02 — 真機跑完，十二條過十一條，收掉

真機、iOS 26。除了第 12 條（第二台 iPhone）以外全過。

**`kSecAttrSynchronizable` 不必額外的 entitlement，這下有實證了。** 〈已知風險〉那一條
寫著「我查到的資料說不必，但沒有實證，出包那一趟要確認」——EAS Build 出得來、裝得進真機、
Keychain 讀寫都通，`app.json` 一個字都沒改。那一條可以劃掉了。

**Keychain 真的在存東西。** 登入一次、殺掉 app 再開，不必重打密碼就接得回雲端。
以前那一筆在 MMKV，這條驗的就是它換了地方還活著。

**兩顆「不要」分得開。** 開機那一問按「取消」之後暱稱還在（拒絕不刪 Keychain）；
按「停止同步」之後暱稱沒了（那一筆真的被清掉），重打一次接得回來。
這正是 2026-09-02 把第四節翻掉之後該有的樣子，也是隱私權政策寫給使用者的那一句。

#### 第 12 條掛著，理由不變

密碼跟著 iCloud 鑰匙圈走到第二台 iPhone——手邊沒有第二台同一個 Apple ID 的裝置。
〈已知風險〉寫的「這一條掛著，不阻擋收票」照舊，模擬器不頂替。

哪天手上有第二台，要驗的是：**那台一裝好就已經是登入狀態，而且開機那一問會跳出來**
（密碼跟著走、同意不跟著走）。那正是 `cloud-consent.ts` 整支存在的理由。

#### 順帶提醒：票 `03` 驗收第 5 條還開著

iOS 26 以下的 `GlassView` 退回長什麼樣，卡在沒有舊 iPhone，票 `03` 仍是 `ready-for-human`。
（維護者要求：`rn-rewrite` 每收掉一張票都要提醒這一條。）
