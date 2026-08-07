# 04 — 上架素材：1024 icon 與隱私權政策頁

Status: done
Type: enhancement
Blocked by: 無，可立即開始

決策背景見 `../spec.md`，本票對應決定三十、三十一。

## 要做什麼

兩件 App Store Connect 的必要素材。兩件事彼此無關，只是都很小、都不擋任何人，合成一張票免得票太碎。

## 決定

### icon 補一張 1024×1024

`scripts/generate-icons.mjs` 的 `SIZES` 加一個數字即可。**圖案與既有的完全一致**——不重新設計，不調色。既有註解已說明內容留在中央 80% 的安全區內，1024 沿用同一份描述不會出問題。

### 隱私權政策放在既有的 GitHub Pages 站台

不另外找地方托管。內容必須涵蓋兩件事，而且都要寫實話：

- **雲端備份**：端對端加密，伺服器端只存得到密文；沒有帳號系統、不收集電子郵件；暱稱與密碼由使用者自取；**密碼遺失無法復原**。
- **Gemini 讀音預填**：使用者自備 API 金鑰、金鑰只存在該裝置、不進備份也不上雲；此功能預設關閉，未設定金鑰時完全不發生任何請求。

同時要說明 app 不收集任何分析數據、不含第三方追蹤。

**作法：`public/privacy.html`，一個不參與打包的靜態檔。** 不多開一個 Vite 進入點——這頁跟 app 沒有任何往來，不 import 任何東西，原封複製進 `dist` 就是最後的樣子，樣式直接內嵌。網址因此是 `https://brad0924.github.io/va-practice/privacy.html`（合併進 `main` 後生效；`deploy.yml` 的 `paths-ignore` 不含 `public/`，這次改動會照常觸發部署）。

**「寫實話」這句是本票真正的工作量。** 初稿有七處與程式碼對不上，全數按程式碼改寫——其中四處是 code review 的 Spec 軸逐條比對 `cloud-backup.ts`／`gemini-reading.ts` 才抓出來的：

- **沒有刪除雲端備份的功能。** 初稿寫「可在 app 內登入後刪除那份備份」，但 `signOut()` 只清掉本機憑證，伺服器上那段密文會留著。改成照實說：停止同步只停這台裝置，密文續留，但只有使用者的密碼解得開。
- **密碼是明文存在本機的。** 初稿只說「金鑰全程只存在記憶體」——對 `CryptoKey` 而言屬實（`importKey` 的 extractable 為 `false`），但 `remember()` 把 `{nickname, password}` 明文寫進 `va-practice:cloud`，不講會讓人以為裝置上沒有能還原金鑰的東西。補成獨立一條，並沿用程式碼註解的理由：能翻到那格的人本來就讀得到全部的卡與進度。
- **伺服器上的驗證值有兩段不是一段。** PUT 的 body 是 `{ fingerprint, prev, open }`，`prev` 也會被存下來。
- **「沒設定金鑰時一個請求都不發」不能講到 Gemini 以外。** 初稿寫成「不會向 Google 或任何其他伺服器發出一個請求」，但雲端備份只看有沒有登入、與 Gemini 金鑰無關，登入時照樣打 Firebase。限縮成「不會為了讀音向 Google 發出任何請求」。
- **送給 Gemini 的不只詞條。** 還有一段固定的作業指示（`gemini-reading.ts` 的 `INSTRUCTIONS`）。「僅止於此」保留，但把那段指示一起寫出來。
- **漏掉決定三十一明文要求的「不經過任何第三方伺服器」。** 初稿最接近的只有「走你自己的額度」，不等價，補成獨立一條。
- **暱稱本身也不上雲**（路徑是 `sha256(暱稱)`），以及**網頁版托管本身會讓 GitHub 看到 IP 位址**——前者比票上要求的更強、後者是「不與任何伺服器通訊」講得太滿，兩處都補進去了。

另外刻意**不在頁面上寫 localStorage 的鍵名**。初稿寫了 `va-practice:gemini`，但那是實作細節：對讀者沒幫助，改名了也沒有任何測試會抓到這頁過期（檔頭註解已載明這個取捨）。

## 這張票不做的事

- 不申請 Apple Developer Program、不決定 app 名稱與 Bundle ID（維護者自理）
- 不填 App Store Connect 的資料揭露表單（那是 11）
- 不重新設計 icon 的圖案

## 驗收

- [x] `npm run icons` 產出 1024×1024 的 PNG（`public/icon-1024.png`，12.3 KB）
- [x] 1024 的圖案與 192／512 完全一致，只是解析度不同
      （把 1024 以 2×2 降到 512 後與 `icon-512.png` 逐像素比對：平均單通道差 0.068，
      最大差 26 且只落在圓角的抗鋸齒像素上——同一份 `SHAPES` 描述換個解析度畫出來的必然差異。）
- [x] 既有的 192 與 512 產出不變（重跑後 md5 與改動前一字不差）
- [ ] 隱私權政策頁面隨網頁版部署上線，有一個穩定可貼進 App Store Connect 的網址
      → 網址將是 `https://brad0924.github.io/va-practice/privacy.html`
      **這一條還沒過**：站台根目錄現況已 200，但這一頁現在是 404，要等本分支合併進 `main`
      觸發 `deploy.yml` 才會上線。頁面本身已完成、`dist` 產出已驗，剩下的純粹是部署。
      貼進 App Store Connect 前請先開一次確認。
- [x] 頁面涵蓋雲端備份的端對端加密與「密碼遺失無法復原」（後者獨立成一個 callout 區塊）
- [x] 頁面涵蓋 Gemini 金鑰只存本機、功能預設關閉
- [x] 頁面說明不收集分析數據、不含第三方追蹤
- [x] 加了這一頁之後，網頁版 app 本身的行為零變化
      （`dist/index.html`、`manifest.webmanifest`、JS／CSS 產物均無變動；362 條測試全過、typecheck 乾淨。）

### 兩件順帶查證的產物細節

- **`privacy.html` 會進 service worker 的 precache**（7 → 8 筆，+4 KB），因此離線也開得起來。
  順序上 `precacheAndRoute` 註冊在 `NavigationRoute` 之前，所以不會被 `index.html` 的
  navigation fallback 攔走——這頁會拿到自己的內容，不是 app 的殼。
- **`icon-1024.png` 不進 precache。** `vite.config.ts` 的 `includeAssets` 只列了 192 與 512，
  1024 純粹是給 App Store Connect 的素材，不必讓網頁版使用者多下載。無需改設定。
