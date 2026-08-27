# 14 — 標答表的測試暱稱換掉，別佔著真人會用的名字

Status: done
Type: bug

決策背景見 `core/lib/cloud-crypto-vectors.json` 與 `scripts/generate-crypto-vectors.mjs` 的配方清單。

## 為什麼有這張票

**標答表把兩組能用的暱稱與密碼公開在版控裡，而其中一個是維護者的名字。**

| 暱稱 | 密碼 | 用在哪幾列 |
| --- | --- | --- |
| `brad` | `hunter2` | 六列裡的五列 |
| `ブラッド` | `合言葉は「山」` | `japanese-credentials` |

雲端備份的三樣東西全部由這兩格算出來（見 `core/lib/cloud-crypto.ts` 的 `deriveKeys()`）：

- **路徑** ＝ `sha256(暱稱)`，決定這份備份放在雲端哪個格子
- **指紋** ＝ 由密碼派生，安全規則靠它決定誰能覆寫
- **金鑰** ＝ 由密碼派生，決定內容怎麼加密

兩格都公開，三樣就都算得出來：

```
brad      → backups/322f965a2919f46725dece842eb487fc569656d59bf3e1d35cc33cf8a9dcdfec
ブラッド   → backups/fcd73a3b569a6ba47a4e3b1161c9396aee39dc9003090ea01bcc831cacff6b92
```

## 先講它**不是**什麼

**那兩個格子目前很可能是空的，裡面沒有任何真實資料。**

`scripts/generate-crypto-vectors.mjs` 整支沒有一行網路呼叫，只在本機算完寫成 JSON；
`checkVector()` 也只在記憶體裡加密比對。**這兩組帳密從來沒有被推上過雲端。**

所以這不是資料外洩。寫在最前面是為了不要把它當成緊急事故。

## 真正的風險：暱稱被佔走，而且徵狀會說謊

任何看過這個 repo 的人，都能往那兩個格子寫東西佔住它。

之後有人想用 `brad` 當自己的雲端備份暱稱，`signIn()` 會走這一條
（`core/lib/cloud-backup.ts`）：

```ts
// 本機這份比較新（含全新暱稱）：推上去。指紋不對會被規則擋在 401，雲端不動。
const updatedAt = await write(keys, local);
```

雲端存的是別人的指紋 → 對不上 → 401 → `RejectedByCloud` → 畫面顯示**「密碼不對」**。

密碼其實是對的。**這是這張票要修的東西**——不是佔用本身，是佔用之後查不出原因。
`brad` 是維護者的名字，這件事撞上的機率不低。

## 要做什麼

改 `scripts/generate-crypto-vectors.mjs` 配方清單裡的暱稱，重跑腳本產生新的標答表。

| 原本 | 改成 |
| --- | --- |
| `brad` | `bradtest` |
| `ブラッド` | `ブラッドテスト` |

**密碼不必動。** 佔位的是暱稱（它單獨決定格子在哪），密碼只決定誰能寫進去。

**`ブラッドテスト` 必須繼續是日文。** 那一列的測試目的就是「暱稱與密碼本身是日文」，
換成 ASCII 等於把那一列驗的東西弄丟（配方清單的 `why` 欄記著理由）。

## 這不違反「不改 cloud-crypto.ts」

票 `05` 那條規矩是「不改演算法、參數或格式」。標答表是那支檔的**輸出**，不是輸入。
換掉輸入的暱稱不會動到 `cloud-crypto.ts` 一個字，也不會改變它的行為。

會變的是表裡的 `path`、`fingerprint`、`payload`、`payloadSha256`——整份重算，這是預期的。

## 這張票不做的事

- **不改密碼。** 理由見上。
- **不改明文、`repeat`、初始向量。** 六列各自驗什麼不變。
- **不去雲端刪掉或佔住那兩個格子。** 現在很可能是空的；就算不是，那也是別人的寫入，
  不該用「這台不要接」當理由去動雲端上的東西。
- **不動 `mobile-crypto.yml` 的機制。** 那是票 `13`。這張票只換資料。

## 驗收

- [x] `scripts/generate-crypto-vectors.mjs` 的六筆配方，暱稱換成 `bradtest` / `ブラッドテスト`
- [x] 重跑腳本，`core/lib/cloud-crypto-vectors.json` 整份更新
- [x] repo 根的 `npm test` 綠燈（`cloud-crypto-vectors.test.ts` 用新表跑得過）
- [x] `mobile/` 的 `npm test` 綠燈
- [ ] `mobile-crypto.yml` 在 iOS 模擬器上跑出 `PASS 6/6`
- [x] `japanese-credentials` 那一列的暱稱與密碼仍然都是日文

**最後一條還沒驗。** 這台是 Windows，跑不了 iOS 模擬器。`mobile-crypto.yml` 的觸發條件
含 `core/**`，本次改動有動到，所以 push 之後那支 workflow 會自動跑一趟。**綠燈之前這張票
不算全驗完。**

## Comments

### 2026-08-27 — 收票，順帶多換了兩支測試與補了一份 ADR

實作範圍比票上寫的多兩件，兩件都經維護者當場拍板：

- **`core/lib/cloud-crypto.test.ts` 與 `core/lib/cloud-backup.test.ts` 的 `brad` 也換成
  `bradtest`。** 那兩支直接呼叫 `deriveKeys('brad', 'hunter2')`，同一組帳密照樣公開在
  版控裡，路徑與指紋照樣算得出來——本票只換標答表的話，這張票想解的風險只解了一半。
  `cloud-consent.test.ts` 與 `keychain.test.ts` 裡的 `brad` **沒換**：那兩支不呼叫
  `deriveKeys()`，只把它當顯示用的名字字串，算不出任何東西。

- **補了 `docs/adr/0018-test-nicknames-must-not-be-real-ones.md`。**
  `scripts/generate-crypto-vectors.mjs` 的檔頭要求重跑標答表之前先寫 ADR。
  這次重跑不動演算法、不會讓任何既有備份解不開，是那條規矩涵蓋到的最輕的一種情況，
  但規矩沒有例外條款，照走。
