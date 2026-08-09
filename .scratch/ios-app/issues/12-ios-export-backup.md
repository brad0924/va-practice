# 12 — iOS 上匯出備份完全沒反應

Status: ready-for-human
Type: bug
Blocked by: 01

本票沒有對應的 spec 決定——它是票 05 真機驗收時照出來的既有缺陷，spec 寫的時候不知道它存在。

## 症狀

在 iPhone 上按「資料」畫面的**匯出備份**，**什麼都不會發生**：沒有檔案、沒有分享單、沒有錯誤訊息、畫面沒有任何變化。網頁版完全正常。

## 這不是誰改壞的

`src/ui/dom.ts` 的 `download()` 自專案初期就是這個寫法，最後一次被碰是 `ca72203`，遠早於整個 iOS 工程。票 05 的 commit（`b9031e5`）沒有碰到 `dom.ts` 或 `data-view.ts`。

**是票 01 漏測的一條。** 那張票的八項災情清單裡，「資料」只涵蓋「localStorage 讀寫是否正常」，匯出從來沒被測過。

## 為什麼

`src/ui/dom.ts:20-28` 走的是瀏覽器的老招數——造一個隱形的 `<a download>`，塞進 Blob 網址，程式按它一下：

```ts
const url = URL.createObjectURL(new Blob([content], { type }));
const link = el('a');
link.href = url;
link.download = filename;
link.click();
URL.revokeObjectURL(url);
```

WKWebView 與 Safari 不同，**不認 `download` 屬性**，Capacitor 也沒有接 iOS 的下載處理器，導覽因此被直接取消——沒有反應、也沒有錯誤，與症狀完全吻合。

另有兩個較輕的嫌疑同時存在（連結從未掛進 DOM、`revokeObjectURL` 在 `click()` 的下一行就收回網址）。**已決定不去分辨**：見下方決定。

## 為什麼這件事比一顆按鈕嚴重

`spec.md` 決定十三與票 06 都把「手動匯出備份」當成**密碼遺失後的唯一後路**，並要求雲端備份的設定畫面明白指向它。那條後路在 iOS 上目前不存在。在本票修好之前，iOS 使用者把資料帶出去的唯一途徑是雲端備份。

## 決定

### 直接做原生分享單，不先試那 3 行的小修

否決「先把連結掛進 DOM、延後 `revokeObjectURL`，看看是不是這兩個小毛病」。理由是期望值不划算：主因判斷是 WKWebView 根本不支援 `download` 屬性，小修成功的機率不高，而失敗的話還是得回頭做原生分享單，只是多燒一趟 CI 的時間。這是一條資料安全的後路，不適合用碰運氣的方式修。

### 用 `@capacitor/filesystem` 加 `@capacitor/share`

把 JSON 寫成暫存檔，再叫出 iOS 的分享單。使用者因此可以存到「檔案」、AirDrop、傳給自己——**比原本的「下載一個檔案」更貼近 iOS 的習慣**，不是將就。

兩個都是官方套件。與票 05 自寫插件的情況不同：那次是官方套件做不到要的事，這次官方套件正好就是要的東西。

### 接縫開在 `src/ui/dom.ts` 的 `download()` 內部，平台判斷不進畫面層

`download()` 內部判斷平台：原生走分享單，其餘沿用現有的隱形連結。

> **2026-08-07 訂正。** 本條原文是「呼叫端一字不改，`data-view.ts:236` 的那一行不動」。實作時發現它與「真正失敗才說一句人話」相衝：`download()` 知道失敗了，但畫面上那行紅字（`status`）在 `data-view.ts` 手上，兩邊接不上。
>
> 改法是讓 `download()` 回傳 `Promise`、失敗用丟的，呼叫端 `await` 完自己決定怎麼講——與旁邊「匯入備份」完全同一個寫法。呼叫端因此動了幾行。
>
> **改掉的只有字面承諾，不是用意。** 本條要的是「這台裝置是什麼」不散進畫面層，而呼叫端拿到的只是一個錯誤物件，它依然不知道自己跑在 iPhone 還是瀏覽器上。驗收第七條照樣成立。
>
> 否決過的兩條：把 `status` 這個 DOM 元素當參數傳進 `download()`（一個工具函式不該手上抓著別人畫面上的一塊）；用 `alert()`（全 repo 零筆，且 `confirm()` 是攔破壞性動作、`alert` 是回報結果，本 repo 的結果一律走 status／toast）。

這是本 repo 已經用過的 pattern——`spec.md` 決定十四對 `src/ui/speech.ts` 就是這樣處理的，理由也一樣：**不要讓「這台裝置是什麼」這個概念散落到畫面層**。

### 檔名與內容一字不改

`jlpt-cards-YYYY-MM-DD.json`，內容是 `app.exportBackup()` 原封那一串。兩邊產出的檔案必須能互相匯入。

### 使用者按取消不算失敗

分享單被取消是正常操作，不該跳錯誤。真正失敗（寫不進暫存檔等）才說一句人話。

## 這張票不做的事

- **不改網頁版的匯出**，一行都不碰
- 不改匯入那條路（除非實測發現它也壞了，見下）
- 不改備份檔的格式、檔名、或匯出的內容
- 不為分享單加任何設定或偏好

## 待確認

**「匯入備份」在 iOS 上會不會跳出檔案選擇器？** 它走的是另一條路（`<input type="file">` 加 `click()`），在 WKWebView 裡通常是好的，但既然匯出是壞的，這一條必須實測確認。若它也壞了，範圍比本票目前設定的大，應回頭修訂本票。

## 驗收

- [ ] iPhone 上按「匯出備份」跳出 iOS 分享單
- [ ] 存到「檔案」app 後，檔名是 `jlpt-cards-YYYY-MM-DD.json`
- [ ] 該檔案在網頁版能成功「匯入備份」，卡片與進度完整
- [ ] 網頁版匯出的檔案在 iOS 上也能成功匯入（雙向互通）
- [ ] 在分享單上按取消，不跳任何錯誤、畫面照常
- [ ] iPhone 上按「匯入備份」跳得出檔案選擇器（見「待確認」；壞掉的話回頭修訂本票）
- [x] 網頁版的匯出行為與本票之前一字不差
- [x] 「這台裝置是什麼」的判斷沒有出現在 `data-view.ts` 或任何畫面層檔案裡
- [x] 既有測試全數通過，且一個既有測試檔都沒被修改

## 實作紀錄（2026-08-07）

### 落地的樣子

| 檔案 | 做了什麼 |
| --- | --- |
| `src/lib/download-native.ts` | 新增。本次唯一碰 Capacitor 的檔案（票 05 的 `safety-copy-native.ts` 也碰，那是既有的）：寫暫存檔、叫分享單。網頁版拿到 `null` |
| `src/lib/download-native.test.ts` | 新增。只測 `isCancelled()` |
| `src/ui/dom.ts` | `download()` 開接縫：拿得到原生手段就走它，拿不到沿用隱形連結。改回傳 `Promise`，失敗用丟的 |
| `src/ui/dom.test.ts` | 新增。釘住網頁版那條路的行為 |
| `src/ui/data-view.ts` | 匯出按鈕改成 `await` + `try/catch`，失敗寫進既有的 `status`（見決定三的訂正） |
| `ios/App/CapApp-SPM/Package.swift` | `cap sync` 產出，接上兩個新插件 |

`data-view.ts` 只動了匯出按鈕那一顆的 handler，匯入、雲端、Gemini 三段一個字都沒改。

### 兩個票裡沒寫死、由實作決定的地方

**一、平台判斷不放在 `dom.ts`，放在 `src/lib/download-native.ts`。** 票說接縫開在 `download()` 內部，但驗收又要求「裝置判斷不得出現在任何畫面層檔案」，而 `dom.ts` 就住在 `src/ui/`。解法是拆兩層：`createNativeSaveFile()` 在網頁版回 `null`，`dom.ts` 問的是「有沒有原生的存檔手段」而不是「這台是不是 iPhone」——與 `hasJapaneseVoice()` 同一個形狀，Capacitor 的 import 也全部關在 `lib` 那一側，與票 05 的 `safety-copy-native.ts` 一致。

**二、失敗時那句人話走既有的 `status` 紅字。** 這條在 code review 後翻過一次：原本寫 `alert()`，理由是「呼叫端不准動」。但 `alert()` 是全 repo 唯一一筆，而本 repo 回報結果一律走 status／toast。改成 `download()` 回傳 `Promise`、呼叫端 `await` 完自己講——票的決定三已隨之訂正，理由寫在那裡。

### 取消怎麼認出來的

`@capacitor/share` 的 iOS 實作在使用者滑掉分享單時走 `call.reject("Share canceled")`（`node_modules/@capacitor/share/ios/Sources/SharePlugin/SharePlugin.swift:63`），**沒有錯誤代碼可認，只有這句訊息**。因此只能比對字串 `/cancel/i`。認錯的後果是少報一次錯，不會把失敗說成成功。

寫檔那一段不在這個 try 裡：`Filesystem.writeFile()` 失敗一律報出來，那正是票說的「寫不進暫存檔」。

`isCancelled()` 因此**有自動測試**（`download-native.test.ts`）。它是這條路上唯一沒有原生依賴的一段，而「按取消不跳錯誤」整條驗收就靠它——把它跟插件一起劃進「原生橋接層不寫測試」是說不過去的。

### `cap sync` 在 Windows 上產出的路徑是壞的

`Package.swift` 裡兩個新套件的 `path` 被寫成反斜線（`..\..\..\node_modules\@capacitor\filesystem`）。**那是無效的 Swift 字串**——`\n`會被當成換行、`\@` 是無效跳脫，本機 Xcode 開不起來。已手動改回正斜線，也就是 macOS 上的 CLI 本來就會產出的形狀。

CI 不受影響（它在 macOS 上重跑 `npm run sync:ios`，會自己覆蓋掉）。但**日後任何人在 Windows 上跑 `npm run sync:ios`，這兩行都會再壞一次**，commit 前要看一眼。

### 本機驗到哪裡

| 驗的東西 | 怎麼驗的 | 結果 |
| --- | --- | --- |
| 網頁版匯出行為不變 | 新增 `dom.test.ts`，先對**改動前**的程式碼跑過一次確認會過，再動 `dom.ts` | ✅ |
| 取消判斷認得對的字、也認得出真失敗 | 新增 `download-native.test.ts` 3 條，訊息一字取自插件的 Swift 原始碼 | ✅ |
| 全部測試 | `npm test` | ✅ 380 過（17 檔） |
| 既有測試檔零修改 | `git status` | ✅ 只新增一個測試檔 |
| typecheck | `tsc --noEmit` | ✅ 乾淨 |
| iOS build 與 sync | `npm run sync:ios` | ✅ 兩個插件都被認到 |

**原生那一半一行都沒被執行過**，與票 05 同一個處境：Windows 上沒有 Xcode。分享單長什麼樣、檔案寫不寫得進暫存區，全都要真機才知道。

### 維護者待辦

1. 手動觸發 `Build iOS and upload to TestFlight`。
2. 真機上驗前五條驗收，其中**「按取消不跳錯誤」務必真的按一次取消**——那是這張票唯一靠字串比對撐住的地方。
3. 順手驗掉下面那條「待確認」：按「匯入備份」看檔案選擇器跳不跳得出來。

### 待確認那一條的現況

**還沒驗**，已在驗收清單補上一條 checkbox，否則它沒有任何攔截點。

本票沒有改動匯入那條路（`<input type="file">` 加 `click()`）一個字，因此它現在是好是壞與這張票之前完全相同。若真機上發現它也壞了，**照票原本說的回頭修訂本票**——修法會不一樣（要走 `@capacitor/filesystem` 的讀檔或文件選擇器，不是分享單），範圍確實比目前設定的大，但要不要拆票是維護者的決定，不是實作者可以在紀錄裡自己翻案的。
