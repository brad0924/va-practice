# 11 — 隱私政策漏改的兩道 hook：先鋒與最後堡壘

Status: ready-for-agent
Type: enhancement
Blocked by: 無（票 09 已 done，本票不改兩份 privacy 的內容）

決策背景見 `../spec.md` 決定八，以及票 `09-privacy-english.md` 的 `## Comments`。內容偏差的修正是另一張票（`12-privacy-keychain-drift.md`），本票只裝機制。

## 要做什麼

`public/privacy.html` 與 `public/privacy-en.html` 兩份檔的內容，每一句都綁在程式的實際行為上。行為改了、兩份沒跟，隱私權政策就開始說謊，而**現在沒有任何東西會抓到**。

裝兩道 hook：

| 道 | 什麼時候跳 | 看什麼 | 守誰 | 態度 |
| --- | --- | --- | --- | --- |
| **先鋒**：Claude Code hook | agent 用 Edit／Write 改完任何檔 | 這次改動的內容 | 只有 agent | 提醒，不擋 |
| **最後堡壘**：git pre-commit hook | 任何 commit | 這次 commit 的完整 diff | 人與 agent | 擋下來 |

先鋒跳得早，但只管得到 agent。最後堡壘管人也管 agent，但要等到東西準備進版控。**兩道之間有一段真空**：人自己改 code、還沒 commit 的那段時間，什麼都沒有。那段只能靠最後堡壘補。

## 為什麼不用檔案清單

**初版寫的是「盯死四支檔」，那個做法已經被現實推翻了。**

盯的四支是 `cloud-backup.ts`、`cloud-crypto.ts`、`gemini-key.ts`、`gemini-reading.ts`——兩份 privacy 檔頭列的就是這四支。

但 `src/lib/` 有 20 支檔，而 commit `2b96a9a`（`ios-app 06`，密碼改存 iOS Keychain）新增了 `keychain.ts` 與 `keychain-native.ts` 兩支**不在清單裡**的檔，直接讓政策裡三句話失準（詳見票 12）。**清單漏了，而且在我們裝任何東西之前就已經漏了。**

清單的病是遞迴的：要靠人記得維護清單，而「記得維護清單」本身也要靠人記得。原本那句「改了其中一份就要改另一份」是同一種東西。

### 改成掃改動的內容

不看檔名，看這次改了什麼。隱私相關的本質是兩件事：**資料離開裝置**，或**資料落地保存**。這兩件事在程式碼裡都留得下痕跡。

初版訊號清單（實作時可調，但要有理由）：

| 訊號 | 它代表什麼 |
| --- | --- |
| `fetch(` | 資料送出去 |
| `localStorage`、`sessionStorage` | 資料落地 |
| `Keychain`、`Filesystem`、`Preferences` | 原生那一側落地 |
| `crypto.subtle` | 加解密，政策整節在講這個 |
| `firebasedatabase`、`generativelanguage` | 兩個實際的外送目標 |

**這個做法通得過現成的考題。** `2b96a9a` 的 diff 裡有 `localStorage.removeItem`、`Keychain`、`registerPlugin`——按內容掃會跳。按檔名清單不會，因為那時候清單裡沒有那兩支檔。

**涵蓋範圍因此從四支檔變成整個 repo。** 改 `main.ts`、改 `src/ui/` 底下任何一支、或新增一個全新的檔，只要碰到訊號就一樣會跳。

## 決定

### 一、訊號清單只有一份，兩道 hook 都讀它

放 `scripts/hooks/privacy-signals.mjs`，export 一個陣列。git hook 與 Claude Code hook 的腳本都 import 它。

**寫兩份就一定會漂移**——那正是這整張票在對付的病，不能自己先犯一次。

### 二、git hook 擋下來，commit message 寫理由才放行

diff 命中訊號、但兩份 privacy 都沒動時，**commit 不成立**。過關只有兩條路：

1. 去改那兩份 privacy
2. 在 commit message 裡寫一行標記，說明為什麼不用改

標記格式定為：

```
Privacy-checked: <一句話理由>
```

例如 `Privacy-checked: 只是把 localStorage 的讀取搬到另一個函式，行為沒變`。

**被否決的是「只能 `--no-verify`」。** 那條路腳本最短，但繞過不留任何痕跡，而且 `--no-verify` 是全有全無——日後裝了別的 pre-commit 檢查，會被一併跳過。

**被否決的是「只印提醒不擋」。** commit 成功的訊息會把提醒推上去，很容易滑掉，而這是最後一道關卡。而且維護者自己改 code 時，這是**唯一**一道（先鋒只管 agent），不能軟。

用 commit message 當出口的代價是腳本要多讀一次 message。`pre-commit` 階段讀得到暫存的 message 檔。業界有同類前例：DCO 的 `Signed-off-by`、CI 的 `[skip ci]`。

### 三、Claude Code hook 只提醒，不擋

它跳的時機是「agent 剛改完那支檔」。**那時候擋沒有意義**——agent 還在做事，該做的是把這件事記下來稍後處理，不是當場被踢出去。

而且擋住 `Edit` 會讓 agent 卡在一個它解不開的狀態：它得先改 privacy 才能改 code，但它可能還沒想清楚 privacy 要怎麼改。

### 四、Claude Code hook 的設定進版控

專案的 `.claude/` 目前**整個沒進版控**——只有一個 `settings.local.json`，被 `.gitignore` 的 `*.local` 忽略掉了。

新增 `.claude/settings.json` 就會進版控（`.gitignore` 沒有擋它）。這是刻意的：這道提醒屬於這個專案，不屬於某一台電腦的個人設定。

### 五、git hook 的安裝方式

`.git/hooks/` 不進版控，所以 hook 本體要放在 repo 裡再複製過去：

- hook 本體：`scripts/hooks/pre-commit`
- 共用訊號：`scripts/hooks/privacy-signals.mjs`
- 安裝腳本：`scripts/install-hooks.mjs`
- `package.json` 加一個 script（例如 `"hooks": "node scripts/install-hooks.mjs"`）

前例是 `scripts/generate-icons.mjs`（`package.json:15` 的 `icons`），一次性腳本在這個 repo 不是新東西。

安裝腳本要能重複跑，且**不覆寫使用者自己寫的 hook**——`.git/hooks/pre-commit` 已經存在且內容不是我們產生的時候，要說清楚而不是蓋掉。

### 六、不加檔頂註解

初版計畫在那四支程式檔的檔頂各加一句「改這裡要回頭改兩份 privacy」。**拿掉。**

按內容掃之後，「那四支檔」這個概念不存在了，註解沒有對應的清單可以掛。它剩下的唯一價值是「在你動手之前出現」，但先鋒 hook 在你動手後幾秒就跳，這點差距不值得多養一份要維護的文字。

反方向的路標已經有了：兩份 privacy 的檔頭本來就點名了那幾支程式（`privacy.html:13`、`privacy-en.html:13`）。正方向的工作交給 hook。

## 這張票不做的事

- **不改兩份 privacy 的內容或網址**。keychain 造成的三句話失準是票 12
- **不加 `CLAUDE.md` 那一行**。討論時列過，維護者沒選
- **不做骨架測試**（比對兩份的節數、段落數、清單條數）。討論時列過，維護者沒選
- **不改任何程式的行為**
- **不動 `app-name.test.ts`**。那支守的是 app 名字，與本票無關

## 一併要改的

`../spec.md` 決定八有一段小標題叫「**兩份檔的同步問題沒有機器解法**」，寫著這是收下的代價。本票推翻其中一半，那段要改寫：說明補到什麼程度，以及為什麼不補滿（見下面的已知缺口）。

兩份 privacy 開頭那句「沒有任何測試會抓到其中一份過期」也要跟著修，否則它會變成過期的敘述——正是它自己在警告的那種病。

## 已知缺口，兩道 hook 都補不到

**一、改動不含訊號就抓不到。** 例如在 `cloud-backup.ts` 裡把送出的欄位多加一個，那一行可能長得很平凡，一個關鍵字都沒有。**這是這個做法最大的洞**，而且沒有便宜的補法——要補就得追整條呼叫鏈做靜態分析，成本跟這件事的份量完全不成比例。

**二、誤報會有。** 這個 repo 的語言設定、每日提醒、Gemini 金鑰都用 `localStorage`，改那些也會跳。誤報的代價只是「多看一眼」，漏報的代價是政策說謊，所以這個方向是刻意選的。

**三、git hook 忘了裝，沒有東西會提醒你。** 換電腦、或重新 clone 之後，最後堡壘靜靜地不存在，而且你不會發現。這是 git hook 的天性。

**四、兩道之間有真空。** 人自己改 code、還沒 commit 的那段時間，先鋒不管人、堡壘還沒到。

**五、兩道都不判斷政策寫得對不對。** 它們只提醒「你可能該去看一眼」。政策內容本身就寫錯了的話，兩道全部綠燈。

**六、`Privacy-checked:` 可以隨便寫一句過關。** 它逼的是「當下停下來想一秒」，不是「真的檢查過」。這是刻意的——擋得更死會養出繞過的習慣，那時整道防護等於零且無人察覺。

## 驗收

- [ ] 訊號清單只有一份（`scripts/hooks/privacy-signals.mjs`），兩道 hook 都 import 它
- [ ] **考題**：把 `2b96a9a`（`ios-app 06`，密碼改存 Keychain）的變更重放一次 → git hook **要擋下來**。這一次是真的漏過的，抓不到就代表這張票沒解決問題
- [ ] 改動命中訊號、不改 privacy、message 不寫標記 → **commit 被擋**，訊息列得出命中了哪個訊號、在哪個檔
- [ ] 同上但 message 寫了 `Privacy-checked:` → **放行**
- [ ] 改動命中訊號且同時改了任一份 privacy → **放行**，完全不出聲
- [ ] 改動完全不含訊號（例如只改 `src/ui/list-view.ts` 的一段文案）→ **完全不觸發**
- [ ] 砍掉 `.git/hooks/pre-commit` 後跑安裝腳本 → 裝得回來
- [ ] `.git/hooks/pre-commit` 已存在且不是我們產生的 → 安裝腳本說清楚，不覆寫
- [ ] `.claude/settings.json` 存在且進得了版控；agent 改出含訊號的內容時，提醒真的出現
- [ ] `../spec.md` 決定八那段已改寫；兩份 privacy 開頭「沒有任何測試會抓到」那句已修
- [ ] `npm run test` 與 `npm run typecheck` 全綠
