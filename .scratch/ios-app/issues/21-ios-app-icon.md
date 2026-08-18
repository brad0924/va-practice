# 21 — 手機上那張 app 圖示還是 Capacitor 的範例圖

Status: done
Type: bug
Blocked by: 無，可立即開始

擋著 `11`（送審）。不擋 `10`、`14`、`20`。

## 這是什麼問題

**裝在手機上的 app，圖示是工具附的範例圖，不是這個專案的圖。**

白底、一個藍色叉叉、淡淡的格線——那是 `cap add ios` 那天（2026-08-07）Capacitor 自己放進去的預設圖。從那天到現在沒人動過它。

檔案是 `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`（1024×1024）。`Contents.json` 只列這一筆，是整個 app 唯一的圖示來源。

這個缺口是做 `../../rn-spike/issues/01` 的盲測時，把兩個 app 擺在一起對照圖示才發現的。

## 為什麼現有的票蓋不到

專案裡有**兩張**圖示，用在不同地方。像賣餅乾：盒子上印的照片是一回事，餅乾本身是另一回事。

| 檔案 | 用在哪 | 誰做的 |
| --- | --- | --- |
| `public/icon-1024.png` | Apple 的上架網頁 | 票 `04`（`spec.md` 決定三十） |
| `ios/.../AppIcon-512@2x.png` | **裝進手機、出現在主畫面** | **沒有人** |

- **`04`** 已 `done`，它做的是第一張。它的「這張票不做的事」也寫明不重新設計圖案。
- **`11`** 明文寫「不做 App Store 的行銷素材優化」。
- **`20`** 管的是上架頁面的文字與截圖。

`scripts/generate-icons.mjs` 的 `OUT_DIR` 寫死指向 `public/`，碰不到 `ios/`。

## 決定

### 圖案沿用現有的，不重新設計

用 `generate-icons.mjs` 裡那份 `SHAPES`（一疊閃卡）畫出來的圖，與網頁版主畫面圖示完全一致。理由同 `04`：這張票不是設計工作。

### 由同一支腳本產出，不手動放檔

`npm run icons` 多寫一個輸出目標。**不要另外開一支腳本，也不要把圖片手動複製進 `ios/`**——圖案的唯一來源是那份 `SHAPES` 描述，多一個來源就多一個會漂移的地方，那正是 `ADR-0012` 對顯示名稱堅持的同一件事。

### 輸出必須是 RGB，不能帶透明度

**這是本票唯一的技術陷阱。** iOS 的 app 圖示不接受帶 alpha 通道的 PNG。

現況已查證：

- `public/icon-1024.png` 是 `colorType 6`（RGBA）
- Capacitor 那張範例圖是 `colorType 2`（RGB）
- `encodePng()` 把 `header[9] = 6` 寫死了

所以要讓 `encodePng()` 能輸出 RGB。**`public/` 底下那三張維持 RGBA 不變**——網頁版與 App Store Connect 那張都沒問題，沒有理由順手改它們，改了還得重驗 `04` 的驗收。

### 換完不會被 `cap sync` 蓋回去

`package.json` 沒有 `@capacitor/assets`，Capacitor 本身也不管圖示；`cap sync`／`copy` 只搬 `dist` 與外掛。放進 `Assets.xcassets` 的檔案會留著。

## 這張票不做的事

- **不重新設計圖案。** 要改設計是另一件事，另開票
- **不動 `public/` 底下那三張**（`icon-192`／`512`／`1024`），它們現在是對的
- **不補其餘尺寸。** `Contents.json` 現在就是單一張 1024 的通用圖示，那是現行 Xcode 支援的寫法，沒有壞
- **不送審、不上傳 App Store Connect。** 那是 `11`
- **不碰啟動畫面。** `Splash.imageset` 同樣還是 Capacitor 的範例圖，但它不是這張票的範圍——要處理另開票

## 驗收

- [x] `npm run icons` 之後，`ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` 是那疊閃卡的圖，不是藍色叉叉
      （110522 → 10649 bytes）
- [x] 那張圖是 1024×1024、`colorType 2`（RGB，不帶 alpha 通道）
      IHDR 與 Capacitor 那張逐位元組相同（`0000 0400 0000 0400 0802`），只有內容換掉。
- [x] 它的圖案與 `public/icon-1024.png` 一致（逐像素比對，容許抗鋸齒造成的微小差異，作法比照 `04` 的驗收）
      **比 `04` 嚴格**：`04` 比的是 512 與 1024 兩次獨立運算，必須容許抗鋸齒誤差；這裡兩張同解析度、
      同一次 `draw(1024)` 編碼兩遍，所以要求 RGB 三通道完全相同。實測 1048576 個像素、0 個通道對不上。
- [x] `public/icon-192.png`／`icon-512.png`／`icon-1024.png` 三個檔的 md5 與改動前一字不差
      `3fed72cf…`／`9ea3bf9d…`／`9a871ce7…`，三個都沒動。
- [x] `Contents.json` 沒有改動
- [x] 網頁版行為零變化：`npm run typecheck` 乾淨、`npm test` 全綠、`dist` 產物與改動前一致
      typecheck 乾淨，547 測全綠（29 檔），`npm run build` 過。`dist` 的來源（`src/`、`public/`、
      `index.html`、`vite.config.ts`）在 `git status` 裡完全沒動，產物必然一致。
- [x] 下一次跑 `Build iOS and upload to TestFlight` 之後，實機上的圖示已經換掉（這一項要等 CI 跑過，可與 `11` 一起驗）
      2026-08-18 實機確認：主畫面上是那疊閃卡，不是藍色叉叉。

## Comments

### 2026-08-18 — 落地的東西

| 檔案 | 是什麼 |
| --- | --- |
| `scripts/generate-icons.mjs` | `encodePng()` 多收 `{ alpha }`。`false` 時丟掉 alpha 通道、IHDR 色彩類型寫 `2`。預設仍是 `6`，所以 `public/` 那三張一個位元組都沒動 |
| 同上，`main()` | 畫完 1024 那張之後，**同一份像素**再存一次到 `ios/`。不重畫（重畫要多花五秒），不另開腳本 |
| 同上，檔尾的 `if (argv[1] && …) main()` | 測試要 `import { encodePng }`，import 的時候不能順手把檔案寫出去 |
| `scripts/generate-icons.test.mjs` | 五條測試。三條守 `encodePng` 的兩種輸出，兩條守已 commit 的那張圖 |

那兩條「守已 commit 的圖」是刻意的：alpha 加回去在本地不會有任何錯誤，要等上傳 App Store Connect
被退件才知道——那是很慢又很貴的回饋迴圈，值得用一條讀檔測試換掉。

### 2026-08-18 — 實機驗收過了，票轉 done

第七條驗收要等 CI 打包一次才看得到，所以實作那個 commit 沒有轉 `done`，比照票 `14` 的做法。
CI 跑完之後在手機上確認：主畫面上是那疊閃卡。票轉 `done`，`11` 不再被這張擋著。

`Splash.imageset` 還是 Capacitor 的範例圖。那不在本票範圍內（見「這張票不做的事」），要處理另開票。
