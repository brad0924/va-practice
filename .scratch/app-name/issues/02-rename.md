# 02 — 換一個新名字

Status: needs-info
Type: enhancement
Blocked by: 01

本功能沒有 spec.md——決策背景見票 01 的「決定」一節。

## 為什麼卡在 needs-info

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

- [ ] 新名字已在 App Store Connect 確認可用，結果記在 `## Comments`
- [ ] 上述五個判斷題都有答案，寫在本檔
- [ ] `src/lib/app-name.ts` 已改為新名字
- [ ] `npm run test` 全綠（守門測試逼出 `Info.plist` 與 `privacy.html` 的修改）
- [ ] `npm run build` 與 `npm run build:ios` 的產出都顯示新名字
- [ ] App Store Connect 的商品名稱已同步（或已明確決定延到送審時再改，理由記在本檔）
- [ ] 收斂與改名分兩個 commit：先結構、後內容，讓 diff 看得出哪行是哪件事造成的

## Comments
