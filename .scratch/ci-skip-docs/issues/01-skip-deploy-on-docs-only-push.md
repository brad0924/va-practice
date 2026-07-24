# 純文件的 push 不該觸發部署

Status: done
Type: enhancement

## 問題

`.github/workflows/deploy.yml` 的觸發條件是 `on: push: branches: [main]`，沒有任何路徑限制。只要推上 `main`，就會跑完整的 `npm ci` → `npm test` → `npm run build` → 部署到 GitHub Pages。

但這個 repo 有相當比例的 commit 完全不影響建置產出。最近 20 個 commit 裡有 5 個是純文件——`e832a22`、`d36aa98`、`de42a58`、`6cbd266`、`4f86f49`——這些都白跑了一次完整建置與部署，產出的 `dist` 與上一次一模一樣。

版控中與 app 無關的檔案只有幾類：`.scratch/**`（issue 與 spec，含一個 `firebase-rules.json` 參考副本）、`docs/**`（ADR 與 agent 說明）、根目錄的 `CLAUDE.md` 與 `CONTEXT.md`。確認過 `src/`、`index.html`、`vite.config.ts` 都沒有引用任何 `.md`，這些檔案對建置產出零影響。

## 決定

1. **在 `on: push` 加 `paths-ignore`，而不是在 `deploy` job 加條件。** 掛在觸發條件上，整個 workflow 連測試都不啟動，改動最小（只加 4 行，`jobs:` 完全不動）。若改成保留 workflow、只擋 `deploy` job，得多引進一個偵測變更路徑的 action，而且改文件照樣要等 `npm ci` 與 `npm test` 跑完、照樣消耗額度。代價是那些 commit 在 GitHub 上不會有打勾記號，Actions 列表裡也完全看不到那一筆——純文件變更本來就沒有測試結果可看，接受。

2. **用黑名單（`paths-ignore`）而非白名單（`paths`）。** 兩者長度差不多，真正的差別在寫錯時的失敗方向。黑名單漏列一個文件檔，後果是多跑一次部署，網站內容不變，無害；白名單漏列一個 app 檔，後果是改了程式卻不會上線，而且沒有任何錯誤提示，只能自己發現。日後新增任何 app 檔案也不必回頭維護這份清單。

3. **清單為 `**.md`、`.scratch/**`、`docs/**`、`.claude/**`。** `**.md` 涵蓋根目錄的 `CLAUDE.md`、`CONTEXT.md` 與各目錄下的 md；兩個目錄整包納入是為了蓋掉 `.scratch/cloud-backup/firebase-rules.json` 這種非 md 的參考檔。`.claude/**` 目前沒進版控，屬預先防周全——那是 agent 設定，性質上與 app 無關。

4. **不改 `workflow_dispatch`。** 手動觸發不受路徑過濾影響，任何時候都能到 Actions 頁面強制部署一次，當作逃生門。

5. **不寫 ADR、不動 `CONTEXT.md`。** `CONTEXT.md` 記的是「到期」「成長倍數」這類領域詞彙，部署觸發條件不屬於那一層；現有三份 ADR 都是 app 架構決策，這條規則分量差太多。取捨記在本檔即可。

## 驗收

- 改動 `deploy.yml` 的那個 commit **會**照常部署——`deploy.yml` 本身不在忽略清單內。這是預期行為，不是失敗。
- 之後任何只動 md／`.scratch/`／`docs/`／`.claude/` 的 push，Actions 不會出現新的執行紀錄（不是顯示「已略過」，是根本不存在）。
- 同時動到 `src/` 與 `.scratch/` 的 push 照常部署——GitHub 的規則是只要有一個檔案不在忽略清單內就啟動。
- 到 Actions 頁面手動 Run workflow 仍可強制部署。

## Comments

- 已推上 `main`（`8f65d57`）。該 commit 動到 `deploy.yml`，Actions 照常觸發了一次部署，符合驗收條件第一項——設定生效與否要看下一筆純文件的 push。
- 本則留言即是驗收條件第二項的測試：這次 commit 只動到本檔案（`.scratch/**`），推上去後 Actions 若沒有出現新的執行紀錄，即代表 `paths-ignore` 生效。
- 驗證結果：`8f65d57` 的部署跑完是綠的，`5b89712` 推上後 Actions 未出現新的執行紀錄。驗收條件前兩項通過，`paths-ignore` 確認生效。
- 驗收條件第三、四項（混合 push、`workflow_dispatch` 手動觸發）未實測。前者是 GitHub 明文定義的行為，下次任何功能 commit 自然會驗到；後者那一行從頭到尾未改動。兩者皆依既定行為判斷，非實測結論。
