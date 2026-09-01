# 17 — 密碼搬進 Keychain，順帶把「這台要不要接」問出來

Status: ready-for-agent
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

### 四、「停止同步」改成只停這台

**這是這張票裡唯一的行為改變，2026-09-01 維護者拍板。**

`cloud-backup.ts` 的 `signOut()` 現在一次做兩件事：停掉這台的推送（`account = null`，
`push()` 第一行就 `if (account === null) return`）、以及刪掉暱稱密碼那一格。

開了 `cloudSync` 之後第二件事會出事：`SecItemDelete` 會把刪除**同步到使用者所有的裝置**。
也就是說在手機上按「停止同步」，電腦上的密碼也會一起消失，而那句確認文字只講了這一台。

`cloud-backup.ts` 因此多一支「只停這台」的方法：做 `signOut()` 的前三行（`account`、`pending`、
`blocked` 歸零），**不碰 `CREDENTIALS_KEY`**。`signOut()` 本身原封不動，網頁版繼續用它。

`cloud-consent.ts` 跟著多一支公開的 `decline()`——現在 `DECLINED` 只從 `wantsPull()` 內部寫得進去。

停完之後 `nickname()` 仍答得出暱稱，因為它本來就有後路：

```js
nickname() { return account?.nickname ?? recall()?.nickname ?? null; }
```

**下次開機不會再問**：`wantsPull()` 讀到 `DECLINED` 就 `return false`。這是對的，人剛剛才親手停掉。

畫面那一半屬於票 `18`。

## 這張票不做的事

- **不碰任何畫面。** 資料頁是票 `18`。這一輪仍靠 `probe-screen.tsx` 驗。
- **網頁版與 Capacitor 版的「停止同步」一行不改。** 兩邊情況真的不同：網頁版的密碼只存在那台
  瀏覽器裡，刪掉就是只刪那一台，「停止同步」四個字沒講錯。跟進的話要為網頁版另接一整套同意機制。
- **不改 `data.stopConfirm` 那句話。** 手機版要用的是另一條新字串，那條屬於票 `18`。
- **不動 `cloud-backup.ts` 的加解密。** 標答表（票 `05`）守著那一塊，這張票一個位元都不該讓它變。

## 已知風險

**`cloudSync` 那一半驗不了。** 要證明密碼真的跟著 iCloud 走到第二台，手邊得有兩台同一個
Apple ID 的 iPhone。沒有。**這一條掛著，不阻擋收票**——做法與票 `03` 驗收第 5 條（沒有舊 iPhone）
一致，那一條到今天還掛著。

不用模擬器頂替：模擬器上的 iCloud 鑰匙圈本來就不可靠，測出來的結果不管是過是不過都不能當真。

**`kSecAttrSynchronizable` 可能要 entitlement。** 我查到的資料說不必，但沒有實證。
出包那一趟要確認，卡住的話走 `app.json` 的 `ios.entitlements`（`with-app-check-first` 旁邊已經有先例）。

## 驗收

真機，iOS 26。

- [ ] EAS Build 出得來、裝得進真機（`react-native-keychain` 沒有把 build 弄壞）
- [ ] 探針上登入一次，殺掉 app 再開，**不必重打密碼**就接得回雲端（密碼真的寫進 Keychain 了）
- [ ] 開機那一問跳得出來，而且講得出暱稱
- [ ] 那一問按「取消」→ 這次不接、資料不被蓋掉；**再開一次 app 不會再問**
- [ ] 那一問按「接回來」→ 拉下雲端那份；再開一次 app 不會再問，直接接
- [ ] 探針上按「停止同步」→ 推送停了（在網頁版動一動，手機這邊不會被蓋掉）
- [ ] 停止同步之後 `cloud.nickname()` **仍答得出暱稱**（Keychain 那筆沒被刪）
- [ ] 網頁版按「停止同步」→ 行為與現在完全一樣，密碼被刪、要重打
- [ ] `npm test` 與 `tsc --noEmit` 兩邊都綠（含改成非同步之後的 `cloud-consent.test.ts`）
- [ ] 加解密標答仍 `PASS 6/6`
- [ ] **掛著**：密碼跟著 iCloud 鑰匙圈走到第二台 iPhone（沒有第二台裝置，驗不了）
