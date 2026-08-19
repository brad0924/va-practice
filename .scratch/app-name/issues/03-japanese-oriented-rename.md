# 03 — 名字改成日文導向

Status: ready-for-agent
Type: enhancement
Blocked by: 無

不擋任何票。但會推翻票 `.scratch/ios-app/issues/20` 兩條已勾選的驗收，見「連帶要改的東西」。

## 為什麼卡在 needs-info

**新名字能不能用，不是 repo 裡決定得了的事**——理由與票 `02` 相同，但範圍變大了。

票 `20` 在 2026-08-18 學到一件事實：**App Store 的名稱唯一性是按語系各查各的，不是全球一把抓**。同一個字串在繁中那格存得進去、在韓國那格被別的開發者佔著（票 `20` 的 `## Comments`）。

所以這張票的第一步是維護者去 App Store Connect，在**繁體中文、日本語、English 三個 localization 各填一次** `Japanese Vocabulary Cards`。結果補進本檔的 `## Comments`，這張票才轉 `ready-for-agent`。

**三格都能存檔才算通過。** 任一格被佔就整張票退回舊名字，一個字都不改——見下面「決定」的最後一條。

## 要做什麼

把 app 的顯示名稱從 `VocabCard`／`Vocabulary Card Practice` 換成 `JP Vocab`／`Japanese Vocabulary Cards`，並把 `vite.config.ts` 的 PWA description 補上「日文」。

程式碼的工作量跟票 `02` 一樣小：改 `src/lib/app-name.ts` 兩行、改 `vite.config.ts` 一行，其餘由 `ADR-0012` 的守門測試逼出來。真正的工作在 App Store Connect 那三格。

## 為什麼要換

**圖示已經是日文導向，名字不是。** 票 `ios-app 22`（2026-08-19）把圖示換成鉄紺底加「単語」，頭上標讀音「たんご」。使用者在主畫面看到的是一張日文圖，配一個看不出在學什麼語言的名字 `VocabCard`。

**而且票 `02` 那兩個「不提日文」的決定，前提已經失效。** 票 `02` 選拉丁字母的名字、並把 description 裡的「日文」拿掉，理由都寫成「之後要支援英文與韓文，最遠是使用者自選」。票 `02` 自己在 `## Comments` 就點出這個前提在 repo 裡沒有落腳處。

後來 `ADR-0013` 給了答案，而且是相反的答案：**那是介面語言，不是學習內容的語言**。卡片永遠是「日文詞條與中文釋義的配對」，讀音（振假名）是日文獨有的機制，`CONTEXT.md` 的領域定義維持日文專用是對的。

前提沒了，那兩個決定就該回頭修。這張票修的是那兩個。

## 決定

以下每一條都是 2026-08-19 那輪 `/grill-with-docs` 談定的，不是實作時的自由選擇。

### 名字

| 值 | 現在 | 改成 | 字數 |
| --- | --- | --- | --- |
| `APP_NAME.short` | `VocabCard` | `JP Vocab` | 8 字元，主畫面圖示底下不截斷（上限約 12） |
| `APP_NAME.full` | `Vocabulary Card Practice` | `Japanese Vocabulary Cards` | 25 字元 |
| App Store `Name`（三個語系同值） | `Vocabulary Card Practice` | `Japanese Vocabulary Cards` | 25／30，留 5 字元餘裕 |

### 為什麼是描述性英文，不是羅馬字轉寫

**被否決的是 `Tangocho`（単語帳）、`Kotoba`（言葉）、`Goi`（語彙）三個羅馬字候選。**

業界的日文學習 app 幾乎都走羅馬字轉寫——Anki（暗記）、Bunpro（文法 pro）、WaniKani（鰐蟹）。`Tangocho` 還有一個額外優勢：`単語帳` 正是 `docs/glossary.md` 第一列，「單字本」在日文介面的正名，而圖示上的「単語」就念作 tango。

**否決的理由是它答不到這輪要解的問題。** 羅馬字名字只有懂日文的人看得懂；不懂日文的人看到 `Tangocho`，跟看到 `VocabCard` 一樣不知道這是學什麼的。這輪要修的正是「看不出在學什麼語言」，描述性英文直接命中。

**代價寫清楚：`Japanese Vocabulary Cards` 沒有記憶點，而且是很多人會取的名字。** 撞名機率不低，這就是本票卡在 `needs-info` 的原因。

### 為什麼全名沒有把短名採進去

談的途中一度採用 `JP Vocab — Japanese Vocabulary Cards`，用意是降低撞名機率、並讓主畫面那行 `JP Vocab` 看得出是從全名切出來的。

**那個字串是 36 字元，超過 App Store `Name` 的 30 字元上限，填不進去。** 縮到塞得下的寫法只剩兩個，`JP Vocab — Japanese Vocabulary`（30）與 `JP Vocab: Japanese Vocab Cards`（30），兩個都剛好貼著上限、零餘裕——真撞名時連一個後綴都加不上。

最後選乾淨的 `Japanese Vocabulary Cards`（25），留下的 5 個字元餘裕比「短名看得出從全名切出來」更值錢。何況 `JP Vocab` 本來就是 `Japanese Vocabulary` 的縮寫，關聯性沒有真的消失。

### PWA description

`vite.config.ts:48` 現值是 `'Build your own vocabulary books, review at spaced intervals, works offline'`。

改為：

```
'Japanese vocabulary flashcards. Build your own books, review at spaced intervals, works offline'
```

**只補「Japanese」，其餘照舊。** 這句在 `ADR-0013` 之後已經是英文（PWA manifest 從此是英文的），所以補的是 `Japanese` 不是「日文」。用詞照 `docs/glossary.md` 的英文避用欄：`vocabulary books` 是正名，沒有用到 `word`、`deck`、`folder`。

### 副標題三組都不動

票 `20` 已經寫好三組副標題，而且**每一組都已經提到日文**：

| 語系 | 現值 |
| --- | --- |
| 繁體中文 | `自建日文單字本，到期才複習` |
| 日本語 | `自分でつくる日本語の単語帳、期日に復習` |
| English | `Japanese cards, spaced review` |

名字改完之後「日文」會在名稱與副標題出現兩次，這是可接受的重複——Apple 把名稱與副標題一併索引，而三組副標題的其餘部分講的都是差異點（自建、到期才複習）。**不動它們，這輪不重開票 `20` 的文案。**

### 圖示不動

`scripts/icon.svg` 上的「単語」與新名字是翻譯關係，不衝突：圖說日文、名字說「這是日文單字卡」，兩者講同一件事的兩個面向。票 `22` 那輪剛談定的設計不必重開。

### 商店改名：三格都可用才改，否則整組退回

繁體中文、日本語、English 三個 localization 各填一次 `Japanese Vocabulary Cards`。

- **三格都能存檔** → 整套改，舊名字 `Vocabulary Card Practice` 同時釋出
- **任一格被佔** → 這張票整個退回，`src/lib/app-name.ts` 一個字不改，`Vocabulary Card Practice` 繼續佔著

**被否決的是票 `02` 預埋的處方「撞名時只在那一格補後綴」。** 那條路名字一定換得成，但會讓各語系的商店名稱不一致——而維護者在 8/18 面對韓國區撞名時，寧可放棄整個韓國市場也不接受名稱不一致。同一個判準在這裡的結論是：撞一次就白做，也不接受三格各不相同。

**這條決定有一個已知代價，要講明白。** 存檔新名字的那一刻，`Vocabulary Card Practice` 就被釋出，可能被別人拿走、要不回來。票 `20` 的 `## Comments` 正是拿這個風險當作否決「三格統一換新名字」的理由之一。**這張票明知並接受它**——理由是那個名字本來就要淘汰，留著它的唯一價值是後悔時的退路，而這輪的動機（圖示與名字對不上）不是會後悔的那種。

### 不碰識別碼，一個字都不碰

沿用票 `02`：Bundle ID `io.github.brad0924.vapractice`（App Store Connect 建記錄時就綁死，**永遠不能改**）、GitHub repo 名、`package.json` 的 `name`、`/va-practice/` base path（改了線上網址整個斷掉）。

顯示名稱與識別碼是兩種東西，換名字時不該互相牽動。

## 這張票不做的事

- **不改單一來源的機制。** 若實作時覺得「`Info.plist` 跟兩份 `privacy.html` 還要手動改很煩，寫支 script 自動化」——先讀 `docs/adr/0012-display-name-single-source.md`，那條路已經評估過並否決
- **不改 `CONTEXT.md:1`、`CLAUDE.md:3`、`docs/spec.md:1` 的專案標題。** 那是給開發者看的專案名，與使用者看到的顯示名稱是兩件事，刻意不一致是可接受的（票 `01`、`02` 的先例）
- **不動 `docs/glossary.md`。** app 名稱不是領域詞彙，那張表管的是 `CONTEXT.md` 的條目
- **不重寫票 `20` 的商店描述與關鍵字。** 那三份描述本來就通篇在講日文，改名不影響它們
- **不重畫圖示**
- **不與票 `ios-app 11`（送審）合併。** 票 11 目前被票 20 擋著、尚未送審，所以現在改名不影響任何已上架的東西

## 要改的檔案

**程式碼（`ADR-0012` 的七處）**

| 檔案 | 怎麼改 |
| --- | --- |
| `src/lib/app-name.ts` | 手改兩行，這是唯一來源 |
| `vite.config.ts` | 名稱自動跟上（`import`）；description 那行要手改 |
| `src/ui/data-view.ts`、`capacitor.config.ts`、`index.html` | 自動跟上，不必動 |
| `ios/App/App/Info.plist` | 守門測試逼出來，手改 |
| `public/privacy.html`、`public/privacy-en.html` | 守門測試逼出來，手改 |

**連帶要改的東西**

| 位置 | 怎麼改 |
| --- | --- |
| App Store Connect | 三個 localization 的 `Name` 欄位 |
| `.scratch/ios-app/store-listing.md` 第 1 節 | 那張「兩個長得像但管不同東西的欄位」表，兩個值都過期 |
| `.scratch/ios-app/issues/20` 的「名稱不翻」一節 | 引用了 `APP_NAME.short` 是 `VocabCard` |
| `.scratch/ios-app/issues/20` 的兩條驗收 | 「三個語系的 `Name` 都是 `Vocabulary Card Practice`」與「主畫面顯示名稱維持 `VocabCard`」 |

**刻意不改的**：`.scratch/app-name/issues/02-rename.md`、`.scratch/i18n/spec.md:187`、`.scratch/i18n/handoff.md`、票 `20` 的 `## Comments`。這些是決策紀錄，本來就該留著當時的字。

## 驗收

- [x] `Japanese Vocabulary Cards` 已在 App Store Connect 的繁中、日文、English 三格各試過，結果記在 `## Comments`
- [x] 三格都可用 → 繼續；任一格被佔 → 整張票轉 `wontfix`，理由記在 `## Comments`，程式碼不動
- [ ] `src/lib/app-name.ts` 改為 `JP Vocab`／`Japanese Vocabulary Cards`
- [ ] `vite.config.ts` 的 description 改為補上 `Japanese` 的版本
- [ ] `npm run test` 全綠（守門測試會逼出 `Info.plist` 與兩份 `privacy.html` 的修改）
- [ ] `npm run typecheck` 乾淨
- [ ] `npm run build` 的 `dist/index.html` 分頁標題是 `Japanese Vocabulary Cards`、`apple-mobile-web-app-title` 是 `JP Vocab`，manifest 的 `name`／`short_name`／`description` 三項都正確
- [ ] `npm run build:ios` 產出同樣正確，無 `{{APP_NAME_*}}` 佔位符殘留
- [x] App Store Connect 三個語系的 `Name` 都已改為新名字
- [ ] `.scratch/ios-app/store-listing.md` 第 1 節那張表已更新
- [ ] 票 `20` 的「名稱不翻」一節與兩條驗收已更新
- [ ] `git grep "VocabCard\|Vocabulary Card Practice"` 在 `.scratch/` 以外沒有殘留

## Comments

### 2026-08-19：三個語系的名稱都可用

維護者在 App Store Connect 試過 `Japanese Vocabulary Cards`，**繁體中文、English (US)、日本語三格都沒有被擋**。

依「決定」一節的規則，三格全通過即繼續，本票由 `needs-info` 轉 `ready-for-agent`。

**三格都已按下存檔成功**，因此 `Japanese Vocabulary Cards` 已完成佔用（票 `02` 記過：存檔成功本身即完成佔用）。

**連帶：舊名字 `Vocabulary Card Practice` 已經釋出，要不回來了。** 這是「決定」一節寫明並接受的單向門，現在它已經關上。此後這張票若要退回舊名字，等於要重新去搶一個已經公開的名字，不保證搶得到。

商店那一格的驗收因此提前完成，程式碼部分尚未開工——**維護者選擇先不動程式碼**（2026-08-19）。
