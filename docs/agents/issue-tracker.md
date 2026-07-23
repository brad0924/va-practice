# Issue tracker：本機 markdown

本 repo 的 issue 與 spec（你可能習慣稱之為 PRD）以 markdown 檔案存放在 `.scratch/`。

## 慣例

- 一個功能一個目錄：`.scratch/<feature-slug>/`
- Spec 放在 `.scratch/<feature-slug>/spec.md`
- 實作用的 issue 一張一個檔案，位於 `.scratch/<feature-slug>/issues/<NN>-<slug>.md`，編號從 `01` 起算——絕不合併成單一檔案
- Triage 狀態以檔案上方的 `Status:` 一行記錄（角色字串見 `triage-labels.md`）
- 類別以緊接其後的 `Type:` 一行記錄，值為 `bug` 或 `enhancement`
- 實作完成後把 `Status:` 改成 `done`，檔案保留不刪——決策紀錄與 commit 訊息互為對照
- 留言與討論紀錄追加在檔案底部的 `## Comments` 標題之下

## 當某個 skill 說「發佈到 issue tracker」

在 `.scratch/<feature-slug>/` 底下建立新檔案（目錄不存在就一併建立）。

## 當某個 skill 說「取得對應的 ticket」

讀取所引用路徑的檔案。使用者通常會直接給你路徑或 issue 編號。

## Wayfinding 操作

供 `/wayfinder` 使用。**地圖**是一個檔案，每張 ticket 各有一個**子檔案**。

- **地圖**：`.scratch/<effort>/map.md`——內容為 Notes／Decisions-so-far／Fog 三段。
- **子 ticket**：`.scratch/<effort>/issues/NN-<slug>.md`，編號從 `01` 起算，問題寫在內文。`Type:` 一行記錄 ticket 類型（`research`／`prototype`／`grilling`／`task`）；`Status:` 一行記錄 `claimed`／`resolved`。
- **阻擋關係**：檔案上方的 `Blocked by: NN, NN` 一行。當它列出的每個檔案都是 `resolved` 時，該 ticket 即解除阻擋。
- **前線**：掃描 `.scratch/<effort>/issues/`，找出未關閉、未被阻擋、且未被認領的檔案；編號小的優先。
- **認領**：動工前先把 `Status:` 設為 `claimed` 並存檔。
- **解決**：把答案追加在 `## Answer` 標題之下，將 `Status:` 設為 `resolved`，然後在 `map.md` 的 Decisions-so-far 追加一條脈絡指標（摘要加連結）。
