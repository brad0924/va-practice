# 04 — PWA description 那一行的用詞與守門

Status: needs-triage
Type: enhancement
Blocked by: 無

不擋任何票。兩件事都只動 `vite.config.ts:48` 那一行，談的時候會互相牽動，所以收在同一張票。

## 這張票怎麼來的

票 `03` 實作完之後跑 `/code-review`（2026-08-19），Standards 軸在同一行上抓到兩件事。**兩件都不是票 03 做錯**——第一件是票 03 逐字指定的字串，第二件從票 02 那輪就存在。兩件都超出票 03 的範圍，因此另開一張。

那一行現在長這樣：

```ts
description: 'Japanese vocabulary flashcards. Build your own books, review at spaced intervals, works offline',
```

它是 PWA（Progressive Web App，漸進式網頁應用）manifest 的說明欄，build 出來是 `dist/manifest.webmanifest` 的 `"description"`。

**看得到它的地方只有一處**：瀏覽器問「要不要把這個網站安裝成 app」時，那個對話框把它印在名字底下。安裝完就不再出現。

**iOS 版完全用不到它。** `vite.config.ts` 的 VitePWA 掛在 `isIOS ? [] : [...]` 裡，`build:ios` 不產生 manifest。

**但它是這個專案唯一一句對外的說明文字。** `index.html` 沒有 `<meta name="description">`，只有 `<title>` 與 `apple-mobile-web-app-*` 那幾個。

## 第一件：`books` 不是 glossary 釘的正名

`docs/glossary.md` 第一列釘的英文正名是 `Vocabulary Book`，避用欄是 ~~Deck~~、~~Folder~~。

那一行寫的是 `Build your own books`。**它沒有踩到避用欄**，但也不是正名。實際的影響是使用者在安裝提示看到 `books`，打開 app 之後英文介面說的是 `Vocabulary Book`——同一個東西在門口跟屋裡兩個叫法。

`docs/glossary.md` 檔頭寫明：條目清單有 `src/lib/glossary.test.ts` 釘住，**但譯名寫得對不對測不出來，那要人看**。所以這種漂移只能靠人抓，這次就是 review 抓到的。

**要決定的是改不改。** 改成 `Build your own vocabulary books` 會讓那一行變長；不改則接受門口與屋裡兩個叫法。

**這條字串是票 `03` 的 `## 決定` 逐字寫死的**，改它等於推翻票 03 談定的一條，不是實作時的自由選擇。這也是為什麼它沒有在票 03 那輪順手改掉。

## 第二件：這一行是第七處名字，但沒人守它

`ADR-0012` 把顯示名稱抵達的位置分成兩套：打包流程內的用 `import`，流程外的靠 `src/lib/app-name.test.ts` 守門。

`vite.config.ts` 同一個檔案裡，上方的 `name` 與 `short_name` 都吃 `APP_NAME` 常數。**只有 description 這一行是手打的字面值**，而它開頭的 `Japanese vocabulary` 跟 `APP_NAME.full`（`Japanese Vocabulary Cards`）內容重疊。

下次改名時，那兩欄自動跟上，這一行會靜默停在舊字——**而且沒有任何東西會抓到**。這正是 `ADR-0012` 否決「寫 script 自動改寫」時描述的那種破口，只是位置不同。

**要決定的第一個問題是：這算不算票 `03` 說的「不改單一來源的機制」。** 票 03 的「這張票不做的事」寫著：

> **不改單一來源的機制。** 若實作時覺得「`Info.plist` 跟兩份 `privacy.html` 還要手動改很煩，寫支 script 自動化」——先讀 `docs/adr/0012-display-name-single-source.md`，那條路已經評估過並否決

那一條擋的是「寫 script 自動化」。**加一條守門測試是不是同一件事，這張票要先答**。`ADR-0012` 自己的立場是「全面自動化若要安全，最後還是得長出守門測試；那不如直接只做守門測試」——照這句讀，加守門是順著 ADR 走，不是推翻它。但那句講的是 `Info.plist` 與 `privacy.html`，沒講到這一行。

**答完之後才輪到怎麼做。** 幾個方向都還沒評估過，也還沒排除彼此：

- 讓 description 也吃常數，用模板串起來（例如 `` `${APP_NAME.full} flashcards. …` ``）
- 維持字面值，在 `app-name.test.ts` 加一條「description 要包含 `APP_NAME.full`」
- 什麼都不做，理由是這一行只在安裝提示出現一次，過期的代價很小

第三條要算清楚代價再收下，不是預設答案。

## 這張票不做的事

- **不改 `APP_NAME` 的兩個值。** 票 `03` 剛談定並實作，商店三格也已存檔
- **不改 `lang: 'en'`。** 那是 `.scratch/i18n/spec.md` 決定九的產出，與本票無關
- **不碰 `Info.plist` 與兩份 `privacy.html` 的守門方式。** `ADR-0012` 那套照設計運作，票 03 那輪紅 12 項、指出 9 個位置，一處都沒漏
- **不補 `index.html` 的 `<meta name="description">`。** 上面只是把「這是唯一一句對外說明」講清楚，要不要補是另一件事，要開就另開票

## 待決

- [ ] `books` 改不改成 `vocabulary books`（推翻票 `03` 的一條決定）
- [ ] 加守門算不算票 `03` 擋的「改單一來源的機制」
- [ ] 若要守，用模板吃常數還是加測試釘住

## Comments
