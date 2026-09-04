# iOS 簽章憑證續期

`Build iOS and upload to TestFlight` 用一張固定的 `Apple Distribution` 憑證簽章，憑證存在 GitHub secrets 裡。**憑證有效期一年**，到期就要換一張。

憑證是 2026-08-12 建的，所以**大約 2027 年 8 月**要做這件事。背景與當初為什麼這樣設計，見 `.scratch/ios-app/issues/17-ci-fixed-signing-certificate.md`。

> **你可能不是來續期的。** 如果你只是在 App ID 上多勾了一個 capability，憑證好好的，不必走下面整套——跳到最後那節「[另一種情況：App ID 的 capability 改了](#另一種情況app-id-的-capability-改了)」。

## 怎麼知道該做了

兩個訊號，先到哪個算哪個：

- Apple 會在到期前寄信提醒。
- CI 在簽章那一步倒掉。不會靜默出錯，也不會傳出壞的 build。

## 開始之前

確認這三樣東西還在（當初收在 repo 外的資料夾，預設是 `C:\Users\P10394584\Documents\Brad\ios-cert`）：

| 東西 | 用途 |
| --- | --- |
| `ios_distribution.key` | **私鑰。最重要的一個。** 有它就能跳過重新產金鑰那步 |
| `ios_distribution.p12` | 舊的憑證包，續期後會被新的取代 |
| `.p12` 的密碼 | 沿用的話 `IOS_DIST_CERT_PASSWORD` 這個 secret 就不用動 |

私鑰弄丟的話，改走「私鑰弄丟了」那節。

`openssl` 不在系統 PATH 上，是 Git for Windows 附帶的。下面用 PowerShell，先設兩個變數：

```powershell
$cert = "C:\Users\P10394584\Documents\Brad\ios-cert"
$ssl  = "C:\Users\P10394584\AppData\Local\Atlassian\SourceTree\git_local\mingw64\bin\openssl.exe"
```

## 1. 用舊私鑰產新的 CSR

Apple 不介意 CSR 用的是舊金鑰對，所以**不必重新產私鑰**：

```powershell
& $ssl req -new -key "$cert\ios_distribution.key" -out "$cert\ios_distribution.csr" -subj "/emailAddress=giliguala@gmail.com/CN=Brad/C=TW"

# 確認 subject 長對了
& $ssl req -in "$cert\ios_distribution.csr" -noout -subject
```

## 2. 拿 CSR 去 Apple 換新憑證

[Certificates](https://developer.apple.com/account/resources/certificates/list) → ＋ → 選 **Apple Distribution** → 上傳 `ios_distribution.csr` → Continue → Download，覆蓋掉 `ios_distribution.cer`。

發佈憑證上限 3 張。**舊的那張到期後撤掉**就不佔額度；額度滿了建不了新的，先撤再建。

## 3. 合成新的 `.p12`

```powershell
& $ssl x509 -inform DER -in "$cert\ios_distribution.cer" -out "$cert\ios_distribution.pem"

# -legacy 不能省，見下方說明
& $ssl pkcs12 -export -legacy -inkey "$cert\ios_distribution.key" -in "$cert\ios_distribution.pem" -name "Apple Distribution" -out "$cert\ios_distribution.p12"

Test-Path "$cert\ios_distribution.p12"
```

密碼**沿用舊的那組**，這樣 `IOS_DIST_CERT_PASSWORD` 就不用動。只有 `pkcs12 -export` 那行會問密碼，前面 `x509` 那行不會（它只是換編碼格式，沒有加密），沒被問不代表出錯。

> **`-legacy` 為什麼不能省**：OpenSSL 3.x 預設用比較新的加密方式打包 PKCS12，macOS 的 `security import` 對它的支援時好時壞。加上 `-legacy` 產出舊式（MAC 為 SHA-1）封裝，那是 macOS 一定讀得懂的。

## 4. 重新下載 provisioning profile

**profile 跟憑證綁在一起，憑證換了 profile 一定要跟著換。**

[Profiles](https://developer.apple.com/account/resources/profiles/list) → ＋ → Distribution 底下選 **App Store Connect** → App ID 選 `io.github.brad0924.vapractice` → **憑證選第 2 步剛建的那張** → 取個名字 → Download。

名字隨你取，只要帳號內不重複、且只用英數與空格連字號。CI 會自己從檔案裡把名字讀出來。

## 5. 更新兩個 secret

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("$cert\ios_distribution.p12")) | Set-Content "$cert\p12.b64" -NoNewline -Encoding ascii
[Convert]::ToBase64String([IO.File]::ReadAllBytes("$cert\<你的檔名>.mobileprovision")) | Set-Content "$cert\profile.b64" -NoNewline -Encoding ascii
```

三個旗標一個都不能省：

- **`-NoNewline`**：多一個換行會讓 CI 那端解不開。
- **`-Encoding ascii`**：Windows PowerShell 5.1 預設寫 UTF-16 帶 BOM，CI 的 `base64 -D` 會直接解爆。
- **完整路徑（`$cert\...`，不要用 `.\`）**：`[IO.File]::ReadAllBytes` 是 .NET 方法，看的是行程層級的目前目錄，PowerShell 的 `cd` 不會同步過去。用相對路徑會變成從 A 讀、往 B 寫（`Set-Content` 是 cmdlet，它認得 `cd`）。實跑踩過。

到 Settings → Secrets and variables → Actions 更新：

| Secret | 這次要不要動 |
| --- | --- |
| `IOS_DIST_CERT_P12` | **要**，貼 `p12.b64` 全部內容 |
| `IOS_PROVISIONING_PROFILE` | **要**，貼 `profile.b64` 全部內容 |
| `IOS_DIST_CERT_PASSWORD` | 沿用舊密碼的話不用動 |

## 6. 收尾

- **`.b64` 那兩個檔貼完就刪掉**，那是明文的憑證。
- `ios_distribution.key` 繼續留好，明年還要用。
- **一個字都不要貼進這個 repo 或任何對話。**
- 手動觸發一趟 `Build iOS and upload to TestFlight` 確認過得了。

## workflow 不用改

`ios-testflight.yml` 一個字都不用動。profile 的名稱、UUID 與 bundle id 都是 CI 當下從 `.mobileprovision` 讀出來的，沒有寫死在檔案裡——當初就是為了這一天才刻意這樣寫。

## 私鑰弄丟了

`ios_distribution.key` 不見的話，上面第 1 步改成先產一把新的：

```powershell
& $ssl genrsa -out "$cert\ios_distribution.key" 2048
```

然後照第 1 步產 CSR，其餘完全一樣。**後台現有的憑證一張都救不回來**——能下載的只有公開那半，簽不了章。

## 另一種情況：App ID 的 capability 改了

**這不是續期。** 憑證沒到期、也沒換，變的只有 App ID 的能力——例如 2026-08-19 為了 App Attest 勾了一個新的 capability（`.scratch/fixed-gemini-key/issues/01`）。

會扯上這份文件是因為：**provisioning profile 是產生的那一刻對 App ID 能力拍下的快照。** App ID 一改，Apple 立刻把既有的 profile 標成 Invalid，CI 那張就過期了。

**憑證完全不用碰。** 上面第 1 到第 3 步（CSR、換憑證、合成 `.p12`）整段跳過，`IOS_DIST_CERT_P12` 與 `IOS_DIST_CERT_PASSWORD` 一個字都不要動。要做的只有第 4 步與半個第 5 步：

### 1. 先在 App ID 上勾那個 capability

[Identifiers](https://developer.apple.com/account/resources/identifiers/list) → `io.github.brad0924.vapractice` → 勾起來 → Save。

**順序不能顛倒。** 先產 profile 再開 capability 的話，快照裡不會有它，而且畫面上看不出哪裡不對。

### 2. 重新產生 profile

[Profiles](https://developer.apple.com/account/resources/profiles/list) → 找到 `va-practice App Store`（此時應顯示 Invalid）→ Edit → **憑證選原本那張 Apple Distribution，不要建新的** → Save → Download，覆蓋掉 `$cert\vapractice_App_Store.mobileprovision`。

### 3. 貼進 secret 之前先驗一次

profile 是二進位的 CMS 封裝，裡面那份 plist 用 openssl 攤得開。**這一步能在推 secret 之前擋掉錯誤，省一趟 CI**：

```powershell
& $ssl smime -inform DER -verify -noverify -in "$cert\vapractice_App_Store.mobileprovision" 2>$null | Select-String <capability 的 entitlement 名稱>
```

App Attest 那次查的是 `appattest`，要印出這一段才算對：

```
<key>com.apple.developer.devicecheck.appattest-environment</key>
<array>
        <string>development</string>
        <string>production</string>
</array>
```

**`production` 必須在清單裡**，因為 `mobile/app.json` 的 `ios.entitlements` 寫死了 `production`（`expo prebuild` 每趟把它寫進產生出來的 `App.entitlements`）。profile 給的值涵蓋不了 entitlements 要的值，`codesign` 就會倒。

印出空的代表你抓到的還是舊那張，回第 2 步。

### 4. 只更新一個 secret

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("$cert\vapractice_App_Store.mobileprovision")) | Set-Content "$cert\profile.b64" -NoNewline -Encoding ascii
```

三個旗標的理由見上面第 5 步，一個都不能省。然後到 Settings → Secrets and variables → Actions 只更新 **`IOS_PROVISIONING_PROFILE`**。

貼完把 `profile.b64` 刪掉。

### 5. 收尾

手動觸發一趟 `Build iOS and upload to TestFlight`。profile 若少了 capability，會倒在簽章那一步而不是安靜地出一個壞 build——這是刻意的，`App.entitlements` 明寫 entitlement 就是為了讓它早點倒。
