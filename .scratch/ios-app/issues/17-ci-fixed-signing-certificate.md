# 17 — CI 簽章改用固定憑證，別再每跑一趟就燒一張

Status: done
Type: bug
Blocked by: 無，可立即開始

沒有對應的 spec 決定——這是票 09 真機驗收途中撞出來的基礎設施問題，`spec.md` 從頭到尾沒有討論過 CI 怎麼簽章（票 01 只寫了「走 `-allowProvisioningUpdates` 自動簽章」這一句）。

## 要做什麼

讓 `Build iOS and upload to TestFlight` **不要每跑一趟就去 Apple 後台新建一張憑證**。

現在每一趟都建一張。額度滿了就整個 workflow 倒掉，而且倒的位置與訊息會讓人以為是程式壞了。

## 症狀長什麼樣

2026-08-11 那一趟（run 9）：

```
error: Choose a certificate to revoke. Your account has reached the
       maximum number of certificates.
error: No profiles for 'io.github.brad0924.vapractice' were found:
       Xcode couldn't find any iOS App Development provisioning profiles
```

倒在 `GatherProvisioningInputs`，**一個 Swift 檔都還沒編譯**。當下正在驗票 09 的新插件，因此第一直覺是「新加的原生程式有問題」，實際上完全無關。這個誤導本身就是修它的理由之一。

## 為什麼會一直建新的

三件事湊在一起：

1. `xcodebuild` 走 `-allowProvisioningUpdates` 自動簽章
2. 簽章需要憑證的**私鑰**，而私鑰只存在於當初產生 CSR 的那台機器上，Apple 後台也沒有
3. 每一趟 GitHub Actions 都是一台全新的 macOS runner，鑰匙圈是空的

所以 Xcode 每趟都只能去建一張新的。**後台累積的那些憑證全是空殼**——它們的私鑰隨著 runner 一起銷毀了，誰也用不了，只是佔著額度。

順帶一提，錯誤訊息說的是 **iOS App Development** profile 而不是 Distribution。原因在 `ios/App/App.xcodeproj/project.pbxproj` 的**專案層** build configuration：

```
CODE_SIGN_IDENTITY = "iPhone Developer";
```

那是 Capacitor 範本留下的預設值，Release 也繼承到了。所以 archive 那一步是用**開發**憑證簽的，之後 `exportArchive` 再用 `app-store-connect` 重簽成發佈版。前八趟就是這樣過的，直到開發憑證額度用完。

## 決定

### 改成自己握一張固定的憑證，存進 GitHub secrets

CI 不再有權、也不再需要建立任何憑證。`-allowProvisioningUpdates` 從 `archive` 與 `exportArchive` 兩處拿掉，改成先把 `.p12` 與 provisioning profile 匯進一個臨時鑰匙圈，再走手動簽章。

### 憑證類型是 `Apple Distribution`，不是 Development

上架用的 build 本來就該用發佈憑證簽。這順帶把上面那個 `CODE_SIGN_IDENTITY = "iPhone Developer"` 的錯誤設定一起修掉——**Release 要覆寫成 `Apple Distribution`**。

發佈憑證的上限是 3 張，動工當下用掉 2 張（`iOS Distribution` 與 `Distribution Managed`），還空一格，不必先撤任何東西就能建。

### 私鑰在維護者自己的機器上產生，不需要 Mac

憑證請求本質上就是一組金鑰對，用 OpenSSL 在 Windows 上做得完：本機產私鑰與 CSR → CSR 上傳 Apple 後台換 `.cer` → OpenSSL 把 `.cer` 與私鑰合成 `.p12`。私鑰從頭到尾不離開那台機器。

**後台現有的憑證一張都不能拿來做這件事**——能下載的只有公開那半，簽不了章。

### 不引入 fastlane match

match 是這個問題的業界標準解，但它要多一個工具、多一個私有 repo、多一組 passphrase。這個專案只有一支 app、一個 target、一個維護者，`.p12` 存進 secrets 已經夠了。日後真的多人協作再說。

### App Store Connect API 金鑰留著不動

它現在承擔兩件事：自動簽章（要拿掉的那件），以及 `altool` 上傳（還要用）。三個 secret（`APP_STORE_CONNECT_KEY_ID`、`_ISSUER_ID`、`_PRIVATE_KEY`）保持原樣。

票 01 記錄的「API Key 角色必須是 Admin」在改完之後理論上可以降成 App Manager（不再需要建憑證的權限），但**不要順手改**——那是另一件事，改壞了會倒在上傳那一步。

## 這張票不做的事

- 不改 app 的任何功能，不動 `src/` 一個字
- 不引入 fastlane 或任何新的 CI 工具
- 不碰 `deploy.yml`（網頁版部署與簽章完全無關）
- 不調整 App Store Connect API 金鑰的角色

## 維護者要先做的（agent 做不到，也不該做）

**這張票是 `ready-for-human` 而不是 `ready-for-agent`，因為第一步只有你做得到。** 憑證與密碼不會、也不應該經過 agent 的手；下面每一步都是你自己執行、自己貼進 GitHub。

> **底下每一步都實際走過了**（2026-08-12 結案）。OpenSSL 指令在維護者這台 Windows 上
> 兩種殼都實跑驗證過（OpenSSL 3.2.4），Apple 後台那幾步與 macOS 端的匯入也在 CI 上驗證完畢。

### 開始之前：openssl 在哪

`openssl` 不在系統 PATH 上，它是 Git for Windows 附帶的。兩種跑法都行，**每一步底下都同時給了兩個版本，挑一個從頭用到尾**：

- **PowerShell**：打全路徑。這台機器上是
  `C:\Users\P10394584\AppData\Local\Atlassian\SourceTree\git_local\mingw64\bin\openssl.exe`，
  先設成變數 `$ssl` 再用 `& $ssl ...` 呼叫。
- **Git Bash**：在檔案總管空白處按右鍵 → Open Git Bash here，`openssl` 直接就有。

兩邊產出的檔案完全一樣。

找一個**你自己記得住、而且不在這個 repo 裡**的資料夾來做（產出的私鑰絕對不能進版控）。下面 PowerShell 版本都用 `$cert` 指這個資料夾：

```powershell
$cert = "C:\Users\P10394584\Documents\Brad\ios-cert"
$ssl  = "C:\Users\P10394584\AppData\Local\Atlassian\SourceTree\git_local\mingw64\bin\openssl.exe"
```

### 1. 撤掉後台那些空殼的 `Apple Development` 憑證

[Certificates](https://developer.apple.com/account/resources/certificates/list) → 把 `Apple Development` 那些全撤掉。它們的私鑰隨著歷次 CI runner 銷毀了，誰也用不了，**撤掉零損失**，也不影響已上傳的 TestFlight build（那些是 distribution 簽的）。

`iOS Distribution` 與 `Distribution Managed` 兩張**不要動**。

### 2. 產私鑰與憑證請求（CSR）

PowerShell：

```powershell
& $ssl genrsa -out "$cert\ios_distribution.key" 2048
& $ssl req -new -key "$cert\ios_distribution.key" -out "$cert\ios_distribution.csr" -subj "/emailAddress=giliguala@gmail.com/CN=Brad/C=TW"

# 確認 subject 長對了
& $ssl req -in "$cert\ios_distribution.csr" -noout -subject
```

Git Bash：

```bash
# -subj 開頭那個斜線會被 Git Bash 當成路徑轉換掉，這一行不能省
export MSYS_NO_PATHCONV=1

openssl genrsa -out ios_distribution.key 2048
openssl req -new -key ios_distribution.key -out ios_distribution.csr \
  -subj "/emailAddress=giliguala@gmail.com/CN=Brad/C=TW"

# 確認 subject 長對了
openssl req -in ios_distribution.csr -noout -subject
```

> **PowerShell 不需要 `MSYS_NO_PATHCONV`。** 那個斜線問題是 Git Bash 的 MSYS 層在轉路徑造成的；PowerShell 直接呼叫原生執行檔，參數原封不動送過去。實跑驗證過 subject 出來是對的。
>
> 反過來 PowerShell 有自己的兩個坑：續行符號是反引號 `` ` `` 不是 `\`（所以上面全部寫成一行），而且 `export` 不存在。

`ios_distribution.key` 就是**私鑰**，這整件事的重點。它一旦弄丟，就得從第 2 步重來一次。

### 3. 拿 CSR 去 Apple 換憑證

Certificates → ＋ → 選 **Apple Distribution**（不是 Development、也不是 Developer ID）→ 上傳 `ios_distribution.csr` → Continue → Download，得到 `ios_distribution.cer`。

### 4. 把 `.cer` 與私鑰合成 `.p12`

Apple 給的 `.cer` 是 DER 格式，要先轉成 PEM 才能跟私鑰打包。

PowerShell：

```powershell
& $ssl x509 -inform DER -in "$cert\ios_distribution.cer" -out "$cert\ios_distribution.pem"

# -legacy 不能省，見下方說明
& $ssl pkcs12 -export -legacy -inkey "$cert\ios_distribution.key" -in "$cert\ios_distribution.pem" -name "Apple Distribution" -out "$cert\ios_distribution.p12"

# 確認真的產出來了再往下
Test-Path "$cert\ios_distribution.p12"
```

Git Bash：

```bash
openssl x509 -inform DER -in ios_distribution.cer -out ios_distribution.pem

# -legacy 不能省，見下方說明
openssl pkcs12 -export -legacy \
  -inkey ios_distribution.key \
  -in ios_distribution.pem \
  -name "Apple Distribution" \
  -out ios_distribution.p12
```

**只有 `pkcs12 -export` 那行會問密碼**，會問兩次（`Enter Export Password:` 與 `Verifying -`），**自己設一組並記下來**，第 6 步要用。打字時畫面不會有任何反應，連星號都沒有，這是正常的。

前面 `x509` 那行**不會**問密碼——它只是把憑證從 DER 換成 PEM，換的是編碼格式不是加密，而且憑證本身是公開那半，沒有東西要保護。沒被問密碼不代表出錯。

> **`-legacy` 為什麼不能省**：OpenSSL 3.x 預設用比較新的加密方式打包 PKCS12，而 macOS 的 `security import` 對它的支援時好時壞。加上 `-legacy` 產出的是舊式（MAC 為 SHA-1）的封裝，那是 macOS 一定讀得懂的。實跑驗證過確實會產出 `MAC: sha1`。

驗一下讀得回來（會再問一次密碼）：

```powershell
& $ssl pkcs12 -legacy -in "$cert\ios_distribution.p12" -info -nodes | Select-Object -First 5
```

```bash
openssl pkcs12 -legacy -in ios_distribution.p12 -info -nodes | head -5
```

### 5. 下載 provisioning profile

[Profiles](https://developer.apple.com/account/resources/profiles/list) → ＋ → Distribution 底下選 **App Store Connect** → App ID 選 `io.github.brad0924.vapractice` → 憑證選**第 3 步剛建的那張** → 取個名字 → Download，得到 `.mobileprovision`。

**憑證一定要選對那張。** 選到 `Distribution Managed` 那張的話，CI 手上的私鑰對不上 profile，簽章會失敗。

### 6. 轉成 base64 貼進 GitHub secrets

GitHub secrets 只收文字，二進位檔要先編碼。**這兩行在 PowerShell 執行**：

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("$cert\ios_distribution.p12")) | Set-Content "$cert\p12.b64" -NoNewline -Encoding ascii
[Convert]::ToBase64String([IO.File]::ReadAllBytes("$cert\<你的檔名>.mobileprovision")) | Set-Content "$cert\profile.b64" -NoNewline -Encoding ascii
```

三個旗標一個都不能省：

- **`-NoNewline`**：多一個換行會讓 CI 那端解不開。
- **`-Encoding ascii`**：Windows PowerShell 5.1 預設寫 UTF-16 帶 BOM，CI 的 `base64 -D` 會直接解爆。PowerShell 7 預設是 UTF-8 無 BOM 本來就沒事，明講就不必管跑在哪個版本。
- **完整路徑（`$cert\...`，不要用 `.\`）**：`[IO.File]::ReadAllBytes` 是 .NET 方法，看的是**行程層級**的目前目錄，而 PowerShell 的 `cd` 只動自己那份、不會同步過去。用相對路徑會變成「從你開視窗的那個資料夾讀、往 `cd` 之後的資料夾寫」——同一行的 `Set-Content` 是 cmdlet，它認得 `cd`。實跑踩過這個坑。（`openssl` 那幾步沒事：PowerShell 啟動原生執行檔時會把工作目錄設成 `cd` 之後的位置。）

到 repo 的 Settings → Secrets and variables → Actions → New repository secret，建三個：

| Secret 名稱 | 內容 |
| --- | --- |
| `IOS_DIST_CERT_P12` | `p12.b64` 的全部內容 |
| `IOS_DIST_CERT_PASSWORD` | 第 4 步你自己設的那組密碼 |
| `IOS_PROVISIONING_PROFILE` | `profile.b64` 的全部內容 |

### 7. 收尾

- **`ios_distribution.key` 與 `.p12` 自己留好**（憑證有效期一年，到期或換電腦要重來；到期時要重做哪幾步見 Comments）。
- **`.b64` 那兩個檔貼完就刪掉**，那是明文的憑證。
- **一個字都不要貼進這個對話或這個 repo。**

做完回報一聲，agent 才改得動 workflow——secret 的名字用上表那三個就好，改了要一起講。

## 驗收

- [x] `ios-testflight.yml` 不再帶 `-allowProvisioningUpdates`
- [x] archive 與 exportArchive 都用固定憑證簽章，且是 `Apple Distribution`
- [x] `project.pbxproj` 的 Release 不再繼承 `CODE_SIGN_IDENTITY = "iPhone Developer"`
- [x] 臨時鑰匙圈在 job 結束時被清掉，不留在 runner 上
- [x] **連跑兩趟 workflow 都成功，且 Apple 後台的憑證張數一張都沒增加**（這是本票唯一真正的驗收，其餘都是它的前提）
- [ ] 上傳到 TestFlight 的 build 仍然可以指派給 Internal Testing 並安裝（**未回報**，見 Comments）
- [x] 網頁版部署（`deploy.yml`）不受影響
- [x] `src/` 零改動，測試零改動

## 已知的坑（動工時要查證，不要照抄）

- **provisioning profile 要放哪個目錄，Xcode 16 之後換過位置**（舊的 `~/Library/MobileDevice/Provisioning Profiles/` 與新的 `~/Library/Developer/Xcode/UserData/Provisioning Profiles/`）。CI 用的是 Xcode 26，動工時先確認。
- **`ExportOptions.plist` 在手動簽章下要多帶 `signingStyle` 與 `provisioningProfiles` 對應**，現在那份只有 `method`／`teamID`／`uploadSymbols`。
- **開發機是 Windows，這份 workflow 沒有辦法在本機驗證。** 與票 01 同樣的處境——第一趟很可能要來回幾次，倒了就把 Actions 的 log 貼回來。

## Comments

### 2026-08-12：實作決定

**「已知的坑」查證結果：**

1. **profile 目錄**：Xcode 16 起改成 `~/Library/Developer/Xcode/UserData/Provisioning Profiles/`，舊路徑仍有工具鏈在讀。兩個目錄都複製一份，多一次 `cp` 成本趨近於零。
2. **`ExportOptions.plist`**：已補 `signingStyle=manual`、`provisioningProfiles` 對應，另加 `signingCertificate=Apple Distribution`。最後這個票上沒列，是刻意加的——手動簽章下明講憑證比讓 Xcode 自己猜安全，而票的原文是「要多帶」不是窮舉。
3. **無法本機驗證**：改以能在 Windows 上做的方式代替——YAML 解析、每段 `run` 的 `bash -n`、實跑 heredoc 產出 `ExportOptions.plist` 檢查變數展開。真正的簽章行為仍然只能上 CI 才知道。

**bundle id、profile 名稱、UUID 三個值都不寫死**，全部在 CI 當下從 `.mobileprovision` 讀出來（bundle id 取自 `Entitlements:application-identifier` 剝掉 team 前綴）。重產 profile 時 workflow 不必跟著改。

`PROVISIONING_PROFILE_SPECIFIER` 餵的是 profile **名稱**而非 UUID——那個變數的語意就是名稱，UUID 只拿來當安裝的檔名。

**Code review 抓到並修掉的：** `KEYCHAIN_PATH` 原本在匯入步驟的最後一行才寫進 `GITHUB_ENV`，但鑰匙圈在中段就建好了；中途倒掉的話收尾那步拿不到路徑，鑰匙圈會留在 runner 上。已改成建立之前就先寫入。

**維護者實跑踩到、已回頭修進上面步驟的兩個坑：** 第 2／4 步原本只有 Git Bash 版本（`export` 與 `\` 續行在 PowerShell 都不通）；第 6 步原本用相對路徑，`[IO.File]` 那個 .NET 方法不認 `cd`，變成從 A 讀往 B 寫。兩者現在都寫在步驟裡。

### 2026-08-12：驗收結果

`ios-testflight.yml` run 18、19 連續兩趟成功，**Apple 後台憑證張數兩次都沒有增加**——本票唯一真正的驗收成立。

Run 17 倒過一次，但**與簽章無關**：簽章整條路都通了（`1 identity imported.`、archive 用 `Apple Distribution` 簽、`** EXPORT SUCCEEDED **`、鑰匙圈清乾淨），倒在最後上傳時 App Store Connect 回 409 `previousBundleVersion: 17`，也就是 build number 撞號。

**撞號的成因沒有查明。** 維護者回報 run 1–16 全數成功（build 1–16 都上去了），照理 17 號應該是空的。這與 `github.run_number` 的行為對不起來，目前沒有能自圓其說的解釋，先誠實記著。Run 18 沒再撞，實務上已經過去。

底層問題仍在，但**不屬於本票**（本票明文「不改 app 的任何功能」，build number 算法也不在範圍內）：`github.run_number` 與 App Store Connect 的 build number 是兩套獨立計數器，沒有任何機制保證對得齊，而且 re-run 時 `run_number` 不會 +1。值得另開一張票。

**尚未回報：**「上傳到 TestFlight 的 build 可以指派給 Internal Testing 並安裝」這條驗收沒有回報過。前八趟的 build 本來就是 distribution 簽的、裝得起來，簽章方式沒變，風險低，但確實沒實測。

### 2026-08-12：憑證到期怎麼辦（約 2027-08）

**憑證有效期一年，明年這時候會需要重做，但不必從頭走一遍。**

到期時 CI 會倒在簽章那一步，Apple 也會先寄信提醒。屆時要重做的是**第 3～6 步**：

1. **第 2 步可以跳過**——`ios_distribution.key` 留著的話，直接拿它產新的 CSR 就好（`openssl req -new -key ios_distribution.key ...`）。Apple 不介意 CSR 用的是舊金鑰對。
2. **第 3 步**：拿新 CSR 去換一張新的 `Apple Distribution` 憑證。舊的那張到期後撤掉，不佔額度。
3. **第 4 步**：新 `.cer` 跟同一把私鑰重新合成 `.p12`。密碼可以沿用舊的，那樣 `IOS_DIST_CERT_PASSWORD` 就不用動。
4. **第 5 步**：profile 跟憑證綁在一起，憑證換了 profile 也要重下載一張。
5. **第 6 步**：更新 `IOS_DIST_CERT_P12` 與 `IOS_PROVISIONING_PROFILE` 兩個 secret。

**workflow 一個字都不用改**——名稱、UUID、bundle id 都是 CI 當下從 `.mobileprovision` 讀出來的。

前提是 `ios_distribution.key` 還在。弄丟就得從第 2 步整套重來（也還是做得完，只是多一步）。
