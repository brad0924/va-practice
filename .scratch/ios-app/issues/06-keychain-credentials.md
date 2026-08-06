# 06 — 雲端備份的密碼改存 Keychain，換裝置自動帶走

Status: ready-for-agent
Type: enhancement
Blocked by: 01, 05

決策背景見 `../spec.md`，本票對應決定十、十一、十二、十三。

## 要做什麼

讓使用者換新 iPhone 時，**雲端備份的密碼自動跟著走**，不必記住一組可能一年沒輸入過的字串。

## 決定

### 密碼存進 iOS Keychain 並開啟 iCloud 同步

iCloud 鑰匙圈是端對端加密的，Apple 自己讀不到內容。使用者未啟用 iCloud 鑰匙圈時退化為僅存本機，功能不受影響、不報錯。

### `cloud-backup.ts` 一行不改——走既有的注入接縫

`CloudBackupHooks.storage` 本來就是外部遞進來的 `StorageLike`，`app.ts` 目前遞的是 `localStorage`。iOS 版改遞一個由 Keychain 支撐的實作即可。**這是本工程沒有開新接縫的關鍵，不要為了 Keychain 去改 `cloud-backup.ts`。**

### 以「啟動時預載」化解同步／非同步的衝突

Keychain API 是非同步的，`StorageLike` 是同步的。解法：啟動流程中先非同步讀出憑證，填進一個實作 `StorageLike` 的記憶體物件；此後 `getItem` 由記憶體同步回答，`setItem` 同步更新記憶體、並非同步寫回 Keychain。

憑證只有**登入、換密碼、登出**三個時機會變動，頻率極低，這個模型足夠。

擋在 05 後面的理由：兩者共用同一個非同步啟動前置步驟，先後做才不會蓋掉彼此。

### `ADR-0003` 的「密碼遺失即無法復原」不變

Keychain 降低了忘記密碼的機率，但沒有消除它——使用者可能沒開 iCloud 鑰匙圈，或整個換掉 Apple ID。因此設定雲端備份的畫面必須明說後果，並指向手動匯出備份這條後路。

## 這張票不做的事

- 不改變雲端備份的加解密、指紋、路徑或新舊比較邏輯
- 不改 `cloud-backup.ts`
- 不做密碼救援或重設流程——機制上不可能，`ADR-0003` 已定案

## 驗收

- [ ] iOS 上登入雲端備份後，憑證存進 Keychain 而非 localStorage
- [ ] Keychain 項目標記為可同步到 iCloud 鑰匙圈
- [ ] 關掉 app 再開，仍是登入狀態，會自動拉雲端資料
- [ ] 「停止同步」後，Keychain 裡的憑證確實被清掉，重開仍是未登入
- [ ] 換密碼後，新憑證正確寫回 Keychain
- [ ] 未啟用 iCloud 鑰匙圈的裝置上，功能正常運作，只是不同步
- [ ] `src/lib/cloud-backup.ts` 一行未改
- [ ] 網頁版的憑證仍存 localStorage，行為零變化
- [ ] 設定雲端備份的畫面明說「密碼遺失無法復原」，並指向匯出備份
- [ ] 既有測試全數通過，且一個既有測試檔都沒被修改
