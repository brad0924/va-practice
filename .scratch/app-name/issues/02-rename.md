# 02 — 換一個新名字

Status: done
Type: enhancement
Blocked by: 01

本功能沒有 spec.md——決策背景見票 01 的「決定」一節。

## 為什麼卡在 needs-info

> **已解除**（2026-08-12）。新名字定案為 `VocabCard`／`Vocabulary Card Practice`，維護者已在 App Store Connect 確認可用，經過見 `## Comments`。本節保留為當時的決策紀錄。實際狀態路徑是 `needs-info → done`，未經過 `ready-for-agent`——查證與實作在同一輪完成，中間狀態沒有存在過。

**新名字還沒決定，而且它不是一個能在 repo 裡決定的事。**

這張票的第一步不是寫程式，是維護者去 App Store Connect 把候選名字查一次——App Store 上的商品名稱全球唯一，別人用掉了就不能用。查完把結果補進本檔的 `## Comments`，這張票才轉 `ready-for-agent`。

## 要做什麼

把 app 的顯示名稱從「JLPT 單字」／「JLPT 單字複習」換成新名字。

票 01 收斂完之後，**程式碼部分縮到「改 `src/lib/app-name.ts` 兩行 + 跟著守門測試的紅燈修 `Info.plist` 與 `privacy.html`」**。這張票真正的工作量在下面那串判斷題，不在程式碼。

## 為什麼要換

`ADR-0008` 讓內建牌組退場之後，這個 app 跟 JLPT 已經沒有關係了——`CONTEXT.md` 寫得很明白，卡片全部由使用者自建或匯入。「JLPT 單字」是歷史遺留的名字。

## 待決的判斷題

新名字定案時要一併回答，答案寫進本檔再動工：

1. **短名與全名各是什麼。** 短名要塞得進 iOS 主畫面圖示底下（約 11–12 個全形字就截斷）。若新名字夠短，兩個值可以填一樣的字串——票 01 保留兩欄是為了留這個彈性，不是強制它們不同
2. **`vite.config.ts:26` 的 `description`**（現為 `'JLPT N2 日文單字閃卡，離線可用'`）。這句要整句重寫，不是替換一個詞：那副 N2 牌組已經退場，「JLPT N2」四個字現在是錯的
3. **App Store Connect 的商品名稱。** 這是 repo 外的第八處，單一來源永遠管不到它。票 11（送審）目前仍是 `ready-for-agent`，所以現在改跟送審前一刻改，要做的事不一樣——需要決定改名與送審的先後
4. **icon 要不要跟著換。** `scripts/generate-icons.mjs` 產出的圖案若含舊品牌元素就得重畫；不含就不動
5. **`CONTEXT.md:1`、`CLAUDE.md:3`、`docs/spec.md:1` 的標題要不要跟著改。** 這是「給開發者看的專案名」，與 app 顯示名稱是兩件事，可以刻意不一致

## 這張票不做的事

- **不碰識別碼，一個字都不碰。** Bundle ID `io.github.brad0924.vapractice`（在 App Store Connect 建記錄時就綁死、**永遠不能改**）、GitHub repo 名、`package.json` 的 `name`、`/va-practice/` base path（改了線上網址整個斷掉）。改名時一定會有人問「那這些要不要也改」，答案是不要
- **不改單一來源的機制。** 若實作時覺得「Info.plist 跟 privacy.html 還要手動改，很煩，乾脆寫支 script 自動化」——先讀 `docs/adr/0012-display-name-single-source.md`，那條路已經評估過並否決
- **不與票 11 的送審步驟合併**

## 驗收

- [x] 新名字已在 App Store Connect 確認可用，結果記在 `## Comments`
- [x] 上述五個判斷題都有答案，寫在本檔
- [x] `src/lib/app-name.ts` 已改為新名字
- [x] `npm run test` 全綠（守門測試逼出 `Info.plist` 與 `privacy.html` 的修改）
- [x] `npm run build` 與 `npm run build:ios` 的產出都顯示新名字
- [x] App Store Connect 的商品名稱已同步（或已明確決定延到送審時再改，理由記在本檔）
- [x] 收斂與改名分兩個 commit：先結構、後內容，讓 diff 看得出哪行是哪件事造成的

## Comments

### 新名字：VocabCard／Vocabulary Card Practice

| 值 | 內容 |
| --- | --- |
| `APP_NAME.short` | `VocabCard` |
| `APP_NAME.full` | `Vocabulary Card Practice` |
| App Store `Name` | `Vocabulary Card Practice` — **已在 App Store Connect 確認可用並存檔**（存檔成功本身即完成佔用） |
| App Store `Subtitle` | `自建單字本．間隔複習` |

**為什麼是英文名。** 決定支援英文與韓文之後，中文名字會在多語言化時出事：`src/lib/app-name.ts` 只存一個字串，沒有按語言切換的機制，英文使用者的主畫面上會出現一行他看不懂的中文，而那個檔案沒地方放第二種語言。拉丁字母的名字讓這個問題不存在。

### 五個判斷題的答案

**1. 短名與全名各是什麼** — 見上表，兩者不同。`Vocabulary Card Practice` 是 24 個字元，塞不進主畫面圖示底下那一行（約 12 個字元寬），會被截成 `Vocabular…`；短名因此另取 `VocabCard`（9 字元）。短名從全名裡切出來，兩者看得出是同一個產品。這正是票 01 保留兩欄的用途。

**2. `vite.config.ts` 的 `description`** — 改為 `'自建單字本，間隔複習，離線可用'`。整句重寫：拿掉已退場的「JLPT N2」（`ADR-0008`），也拿掉「日文」。留中文是對的——manifest 的 `lang` 是 `zh-Hant`、介面目前仍是繁中。
（票的內文寫 `vite.config.ts:26`，票 01 收斂後實際行號是 `:48`。）

**拿掉「日文」是刻意的，而且它超出本票原本的要求**——票只說「JLPT N2」四個字是錯的。維護者在 review 時被問到後仍選擇不寫日文，理由是不想為了同一件事改兩次。**代價要講清楚：這個 app 今天仍然是日文專用的**（`CONTEXT.md:22` 定義卡片是「一個日文詞條與其中文釋義的配對」、讀音必填、iOS 有日文語音朗讀），所以這句 description 描述的是預期中的樣子，不是現況。

### 遺留：多語言的前提沒有落腳處

本票的兩個決定——改用拉丁字母的名字、description 不寫日文——**都建立在「之後要支援英文與韓文，最遠是使用者自選」這個前提上，而這個前提在 repo 裡沒有任何地方記著**：沒有 ADR，`CONTEXT.md` 的領域定義仍是日文專用。依 `docs/agents/domain.md`「與既有決策牴觸要明確點出來，不要默默覆蓋」，在此點出，不在本票處理。

建議另開票處理三件事（彼此相關但都不屬於改名）：
1. 多語言方向寫成 ADR，並釐清它對 `CONTEXT.md` 中「卡片」「詞條」「讀音」定義的衝擊——讀音（振假名）是日文獨有的，英韓文卡片長什麼樣是未解問題
2. `APP_NAME` 目前只存一份字串，介面真的多語言化時需要決定顯示名稱要不要跟著切換
3. `.scratch/ios-app/spec.md:267` 的現況描述「主畫面顯示名稱 `JLPT 單字`」已過時

**3. App Store 商品名稱的先後** — **現在就改，不等送審。** 理由：在 App Store Connect 存下名字這個動作本身就是佔用，早存早鎖住。而且過程中確認了一件寫票時沒考慮到的事——**App Store 的 `Name` 與 code 裡的 `APP_NAME` 可以不一樣**，所以查名字這件事其實擋不住寫程式，撞名時只要在商店那格補後綴即可，`src/lib/app-name.ts` 不受影響。這次沒撞名，未用到後綴。

**4. icon 不動。** `scripts/generate-icons.mjs:20-26` 畫的是純幾何圖案（藍底、一疊白色圓角卡片、卡面兩條線），不含任何 JLPT 字樣或舊品牌元素，改名不影響它。

**5. `CONTEXT.md:1`、`CLAUDE.md:3`、`docs/spec.md:1` 的標題不動。** 沿用票 01 的理由：那是給開發者看的專案名，與使用者看到的 app 顯示名稱是兩件事，刻意不一致是可接受的。改完後在 `.scratch/` 以外的追蹤檔案中，`git grep "JLPT 單字"` 只剩這三處，符合預期。`.scratch/` 底下另有四處（本功能兩張票，以及 `.scratch/ios-app/spec.md:39`、`:267` 與 `.scratch/ios-app/issues/01-capacitor-spike-build.md:99`）——票是決策紀錄，本來就該留著當時的字；但 `.scratch/ios-app/spec.md:267` 那句「主畫面顯示名稱 `JLPT 單字`」是**現況描述**，已經過時，不在本票範圍內，待另開票處理。

### 實作紀錄

守門測試如設計般發揮作用：只改 `src/lib/app-name.ts` 兩行就紅燈 7 項，訊息逐項指出是 `ios/App/App/Info.plist` 的 `CFBundleDisplayName`、還是 `public/privacy.html` 的哪一處，照著修完即綠。

`ios/App/App/capacitor.config.json`、`ios/App/App/public/`、`dist/` 裡也有舊名字，但三者都未進版控（build 產物），重新 build 即帶新名，不需手動處理。

驗證：`npm run typecheck` 乾淨；`npm run test` 449 項全綠；`npm run build` 的 `dist/index.html` 分頁標題為 `Vocabulary Card Practice`、`apple-mobile-web-app-title` 為 `VocabCard`，manifest 的 `name`／`short_name`／`description` 三項皆正確；`npm run build:ios` 產出同樣正確，且無 `{{APP_NAME_*}}` 佔位符殘留。

「收斂與改名分兩個 commit」這項由兩張票各自的 commit 達成：收斂是票 01 的 `b23349a`，改名是本票的 commit。
