# 01 — 標答表從來沒有在真的瀏覽器裡跑過

Status: needs-triage
Type: enhancement

決策背景見 `core/lib/cloud-crypto-vectors.ts` 的檔頭那張表、`vitest.config.ts` 的
`environment: 'node'`，以及 `.scratch/rn-rewrite/issues/05-crypto-golden-vectors.md`。

## 為什麼有這張票

**標答表現在插了三個插座，只有手機那個是真的通到牆上。**

`cloud-crypto-vectors.ts` 的檔頭列了三個地方會跑這張表。把它跟「使用者手上真正在跑的
那份加解密」擺在一起看，缺口就出來了：

| 使用者實際在用的 | 他手上真正跑的加解密 | 現在誰在驗 | 是同一份嗎 |
| --- | --- | --- | --- |
| 電腦上的網頁版 | 瀏覽器的 `crypto.subtle` | `test.yml` 的 vitest | **不是**，跑的是 Node 內建那份 |
| 上架中的 iOS Capacitor 版 | WKWebView 的 `crypto.subtle` | 同上 | **不是**，同一個問題 |
| React Native 版 | `react-native-quick-crypto` | `mobile-crypto.yml` 開 iOS 模擬器 | **是** |

`vitest.config.ts` 寫的是 `environment: 'node'`。所以 repo 根與 `mobile/` 這兩趟測試，
跑的都是 Node 的 webcrypto，不是任何一個使用者身上的實作。

## 先講它不是什麼

**這不是一個已知的錯，是一個沒被量過的假設。**

Node 的 webcrypto 與瀏覽器的 `crypto.subtle` 實作的是同一份 W3C WebCrypto 規格，
而這條路上用到的 PBKDF2 與 AES-GCM 是那份規格裡定得最死的部分。兩邊對不上的機率不高。

寫在最前面是為了不要把它當成緊急事故——現在沒有任何徵狀指向這裡。

## 這不是票 05 的疏忽

票 `05` 問的是「React Native 那一半對不對得上網頁版」，**網頁版被當成標準答案**。
標準答案本身用什麼實作跑出來的，那張票沒有理由去問。

現在會問，是因為 `.scratch/rn-rewrite/issues/13` triage 時攤開了三個環境的覆蓋率，
才看到網頁版那一格自己也是空的。

## 真正該擔心的是哪一格

不是 Chrome，是 **WKWebView**。

Capacitor 版是**現在唯一有在上架、真的裝在別人手機上**的那一版（React Native 版
票 `05` 明寫「不要送到任何人手上」）。它跑的是 iOS 的 WKWebView，那份 `crypto.subtle`
與桌面 Chrome 不是同一個實作。

而萬一真的對不上，徵狀與票 `05` 防的那件事一模一樣：**存的時候一切正常，
某天想還原才發現打不開**，那時資料已經沒了。

## 要做什麼

讓那張標答表在**真的瀏覽器**裡也跑一遍，跟現有那兩趟並列，不取代任何一趟。

`checkAllVectors()` 已經是一支不綁執行環境的函式（`cloud-crypto-vectors.ts` 檔頭
明寫「它不屬於任何一個執行環境」），所以缺的只是一個會在真瀏覽器裡呼叫它的地方。

## 這張票不做的事

- **不改 `core/lib/cloud-crypto.ts`。** 票 `05` 那條規矩照舊：網頁版是標準答案。
- **不改標答表的內容。** 換測試暱稱是 `.scratch/rn-rewrite/issues/14`。
- **不動 `mobile-crypto.yml`。** 那支是手機那一環，與這張票並列，不互相取代。
- **不拿掉現在那兩趟 Node 上的測試。** 它們守的是「標答表不准漂」，那件事仍然要守。

## 待決

- **在哪個瀏覽器裡跑。** 只跑一顆無頭引擎，還是連 WKWebView 那一格一起補（後者要在
  iOS 模擬器上跑 Capacitor 版，成本接近 `mobile-crypto.yml`）。
- **用什麼工具。** 這個 repo 現在一支瀏覽器測試工具都沒有，引進哪一套要先拍板。
- **跑在哪一支流程裡。** 併進 `test.yml`，還是像 `mobile-crypto.yml` 那樣另開一支
  有觸發條件的。

## 驗收

- [ ] 同一張標答表在真的瀏覽器裡跑過，六列全過
- [ ] 故意把一列標答改壞，這一趟真的紅燈（不能只驗綠燈那一半）
- [ ] 現有的兩趟 Node 測試照常，一支都沒被拿掉
