# 09 — privacy.html 出英文版，守門測試改成抓屬性

Status: ready-for-agent
Type: enhancement
Blocked by: 無，可立即開始

決策背景見 `../spec.md` 決定八。**與 i18n 主線平行，不擋任何人也不被任何人擋。**

## 要做什麼

兩件事，順序有先後：

1. **先**把 `app-name.test.ts` 那四條比對規則改成抓屬性
2. **再**新增 `public/privacy-en.html`

順序不能反。先加英文版的話，那支守門測試會立刻紅燈，而且是用一種很難懂的方式紅（regex 抓不到，訊息會說「該處格式可能改過了」）。

## 為什麼守門測試非改不可

`app-name.test.ts:56-59` 那四條 regex 全都嵌著中文上下文：

```js
/<title>隱私權政策 — (.*?)<\/title>/
/<p class="updated">(.*?) · 最後更新/
/^\s*(.*?)（以下稱「本 app」）/m
/← 回到 (.*?)<\/a>/
```

英文版裡 `隱私權政策 —` 會變成 `Privacy Policy —`、`最後更新` 會變成 `Last updated`，這四條全部抓不到。每多一個語言版本就要多寫四條 regex。

## 決定

### 改成 `data-app-name` 屬性標記

```html
<title data-app-name>隱私權政策 — Vocabulary Card Practice</title>
<p class="updated"><span data-app-name>Vocabulary Card Practice</span> · 最後更新 …</p>
```

測試改成：**掃出所有帶 `data-app-name` 的元素，每一個的文字都要含 `APP_NAME.full`。**

三個好處：

- 語言無關，同一支測試管得到所有翻譯版本
- 順手解掉現在「改個換行、改個標點就紅燈」的脆弱——`app-name.test.ts:19` 的註解自己就承認了這個問題（「該處格式可能改過了，請一併更新這支測試的比對規則」）
- 「多寫一次名字就紅燈」那道次數檢查（`:69`）仍然成立，只是改成數屬性

**這不是換做法，是讓 `ADR-0012` 既有的守門也管得到翻譯版。** `Info.plist` 那半段不受影響，維持原樣（XML 沒有這個問題）。

### 英文版的網址與掛法

`public/privacy-en.html`，跟中文版同樣不參與打包、原封複製進 `dist`。網址是 `https://brad0924.github.io/va-practice/privacy-en.html`。

中文版的網址**一個字都不改**（`https://brad0924.github.io/va-practice/privacy.html`，票 `ios-app 04` 已定案並上線）。

`<html lang="en">`，頁尾的返回連結一樣連回 app。

### 內容必須跟中文版逐句對應

票 `ios-app 04` 花了大半力氣在「把七處與程式碼對不上的地方改掉」。**英文版是翻譯，不是重寫**——不要趁機補充或簡化，任何內容差異都會變成兩份文件互相打臉。

尤其這幾條是當初特地改對的，翻譯時務必逐條核對：

- **沒有刪除雲端備份的功能**（`signOut()` 只清本機憑證，伺服器上那段密文會留著）
- **密碼是明文存在本機的**（`va-practice:cloud`）
- **「沒設定金鑰時一個請求都不發」只限 Gemini**，雲端備份與金鑰無關，登入時照樣打 Firebase
- **送給 Gemini 的不只詞條**，還有一段固定的作業指示
- **不經過任何第三方伺服器**
- **暱稱本身也不上雲**（路徑是 `sha256(暱稱)`）
- **網頁版托管本身會讓 GitHub 看到 IP 位址**

### 兩份檔的同步問題沒有機器解法

改了雲端備份或 Gemini 的行為之後，兩份都要跟著改，**沒有任何測試會抓到其中一份過期**（守門測試只管 app 名字）。這在 `../spec.md` 決定八已經當成收下的代價載明。

在兩份檔的開頭註解裡互相指名對方，是目前唯一的提醒手段。

## 這張票不做的事

- **不做日文、韓文版**。決定八明文只出中英兩份
- **不改中文版的內容或網址**
- **不改 `Info.plist` 那半段守門**
- **不去 App Store Connect 填任何欄位**（那是 `ios-app 11` 與 `ios-app 20`）

## 驗收

- [ ] `app-name.test.ts` 改成抓 `data-app-name` 屬性，四條中文上下文的 regex 已移除
- [ ] 中文版的四處都加上 `data-app-name`，且**測試在只有中文版時就先跑綠**
- [ ] 故意把其中一處的名字改錯 → 紅燈，且訊息指得出是哪個檔的哪一處
- [ ] 故意在檔案裡多寫一次全名 → 次數檢查紅燈
- [ ] `public/privacy-en.html` 存在，`<html lang="en">`，四處都有 `data-app-name`
- [ ] 英文版與中文版**逐句對應**，上面列的七條特別核對過
- [ ] 部署後 `https://brad0924.github.io/va-practice/privacy-en.html` 回 200
- [ ] 中文版網址仍然回 200，內容未變
- [ ] `npm run test` 與 `npm run typecheck` 全綠
