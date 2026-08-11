# 17 — CI 簽章改用固定憑證，別再每跑一趟就燒一張

Status: ready-for-human
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

1. **撤掉後台那些空殼的 `Apple Development` 憑證**（私鑰早就沒了，撤掉零損失）。
2. **用 OpenSSL 產私鑰與 CSR**，把 CSR 上傳到 Certificates → ＋ → **Apple Distribution**，下載 `.cer`。
3. **合成 `.p12`**，設一個密碼。
4. **下載對應的 provisioning profile**（App Store 用途，綁 `io.github.brad0924.vapractice`，要含 App Groups）。
5. **把三樣東西加進 GitHub secrets**：`.p12`（base64）、`.p12` 的密碼、provisioning profile（base64）。
6. 完成後回報 secret 的名字，agent 才改得動 workflow。

具體指令等動工時再給——先確定要走這條路。

## 驗收

- [ ] `ios-testflight.yml` 不再帶 `-allowProvisioningUpdates`
- [ ] archive 與 exportArchive 都用固定憑證簽章，且是 `Apple Distribution`
- [ ] `project.pbxproj` 的 Release 不再繼承 `CODE_SIGN_IDENTITY = "iPhone Developer"`
- [ ] 臨時鑰匙圈在 job 結束時被清掉，不留在 runner 上
- [ ] **連跑兩趟 workflow 都成功，且 Apple 後台的憑證張數一張都沒增加**（這是本票唯一真正的驗收，其餘都是它的前提）
- [ ] 上傳到 TestFlight 的 build 仍然可以指派給 Internal Testing 並安裝
- [ ] 網頁版部署（`deploy.yml`）不受影響
- [ ] `src/` 零改動，測試零改動

## 已知的坑（動工時要查證，不要照抄）

- **provisioning profile 要放哪個目錄，Xcode 16 之後換過位置**（舊的 `~/Library/MobileDevice/Provisioning Profiles/` 與新的 `~/Library/Developer/Xcode/UserData/Provisioning Profiles/`）。CI 用的是 Xcode 26，動工時先確認。
- **`ExportOptions.plist` 在手動簽章下要多帶 `signingStyle` 與 `provisioningProfiles` 對應**，現在那份只有 `method`／`teamID`／`uploadSymbols`。
- **開發機是 Windows，這份 workflow 沒有辦法在本機驗證。** 與票 01 同樣的處境——第一趟很可能要來回幾次，倒了就把 Actions 的 log 貼回來。
