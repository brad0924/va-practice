# 標答表與加解密測試改用 `bradtest` / `ブラッドテスト`，不再拿維護者的名字當測試暱稱；密碼不動

雲端備份的標答表 `core/lib/cloud-crypto-vectors.json` 六列，暱稱從 `brad` 與 `ブラッド`
換成 `bradtest` 與 `ブラッドテスト`。`core/lib/cloud-crypto.test.ts` 與
`core/lib/cloud-backup.test.ts` 裡直接呼叫 `deriveKeys()` 的那些也一起換。
**密碼一個字都沒動**，仍然是 `hunter2` 與 `合言葉は「山」`。

`scripts/generate-crypto-vectors.mjs` 因此重跑了一次，標答表整份重算。那支腳本的檔頭
要求「重跑前先寫 ADR」，這份就是。決策的完整經過見
`.scratch/rn-rewrite/issues/14-vector-nicknames-are-squatting.md`。

## 為什麼非換不可：佔位的是暱稱，而且徵狀會說謊

`core/lib/cloud-crypto.ts` 的 `deriveKeys()` 算三樣東西，分工是不對稱的：

- **路徑** ＝ `sha256(暱稱)`。**只有暱稱決定這份備份放在雲端哪個格子。**
- **指紋**、**金鑰** ＝ 由密碼派生（暱稱當 salt）。決定誰能覆寫、內容怎麼解。

暱稱公開在版控裡，格子的位址就是公開的。任何看過這個 repo 的人都能往那個格子寫東西
佔住它，**不需要知道密碼**。

之後有人想用 `brad` 當自己的雲端備份暱稱，`core/lib/cloud-backup.ts` 的 `signIn()`
會判斷本機這份較新而推上去，撞到雲端存的別人的指紋，被安全規則擋成 401，
畫面顯示**「密碼不對」**——但密碼其實是對的。

`brad` 是維護者的名字。這件事撞上的機率不低，而且撞上之後**查不出原因**。
要修的是這個，不是佔用本身。

## 這不是資料外洩

`scripts/generate-crypto-vectors.mjs` 整支沒有一行網路呼叫，只在本機算完寫成 JSON；
`core/lib/cloud-crypto-vectors.ts` 的 `checkVector()` 也只在記憶體裡加密比對。
**這兩組帳密從來沒有被推上過雲端**，那兩個格子目前很可能是空的。

## 這不牴觸 `ADR-0003` 與票 `05` 的「不改 `cloud-crypto.ts`」

票 `05` 那條規矩擋的是**演算法、參數或格式**的改動——那種改動會讓已經存在雲端的備份
解不開。標答表是 `cloud-crypto.ts` 的**輸出**，不是輸入；換掉餵進去的暱稱，
`cloud-crypto.ts` 一個字都沒動，它的行為也沒變。

**沒有任何既有備份會因為這次重跑而解不開。** 這是那支腳本檔頭涵蓋到的最輕的一種重跑。

## Considered Options

- **只換密碼，暱稱留著**：否決。決定格子在哪的是暱稱，換密碼不會讓 `brad`
  那個格子變得不可寫；佔用照樣成立，「密碼不對」那個假徵狀也照樣會出現。

- **暱稱密碼兩個都換**：多做的那一半沒有買到東西。密碼單獨拿在手上算不出任何格子——
  沒有暱稱就沒有位址。而且動到密碼要重新交代六列各自在驗什麼，徒增讀者的負擔。

- **`ブラッドテスト` 改成 ASCII**：否決。`japanese-credentials` 那一列的測試目的
  就是「暱稱與密碼本身是日文」——暱稱當 salt、密碼是金鑰原料，兩者都要先過 UTF-8 編碼，
  而那一步在瀏覽器與 React Native 兩個執行環境上未必一致。換成 ASCII 等於把那一列
  驗的東西弄丟。

- **去雲端把那兩個格子刪掉或先佔住**：否決。它們現在很可能是空的；就算不是，
  那也是別人的寫入，不該用「這台不要接」當理由去動雲端上的東西。

## Consequences

**表裡四個欄位整份重算**：`path`、`fingerprint`、`payload`、`payloadSha256`。
`plaintext`、`repeat`、`iv`、`plaintextBytes`、`payloadChars` 一格未動——
初始向量由 `name` 決定，明文由配方決定，兩者都與暱稱無關。六列各自在驗什麼，完全不變。

**舊的那兩個格子留在原地，永遠不會有人去清。**
`backups/322f965a…` 與 `backups/fcd73a3b…` 從此沒有任何程式碼指得到它們。
若哪天真的被佔住，這份 ADR 是唯一查得回「那兩個位址是怎麼來的」的地方。

**`bradtest` 這個格子現在換成公開可佔的那一個。** 這份 ADR 沒有讓「暱稱公開就會被佔」
這件事消失，只是把被佔的目標從一個真人會用的名字，換成一個沒有人會挑的測試字串。
真正的防線仍然是「別挑一個別人猜得到的暱稱」，那是使用者端的事。

**`brad` 這個暱稱本身仍然猜得到。** 它是維護者的名字，也出現在
`.github/workflows/mobile-crypto.yml` 的 bundle id `io.github.brad0924.vapractice` 裡。
這次買到的是「repo 不再主動送上一組能用的帳密」，不是「`brad` 從此安全」。

**`core/lib/cloud-consent.test.ts` 與 `core/lib/keychain.test.ts` 裡的 `brad` 沒有換。**
那兩支不呼叫 `deriveKeys()`，`brad` 在裡面只是一個顯示用的名字字串，
密碼那格寫的是 `'密碼'`。它們算不出路徑也算不出指紋，換了不會買到任何東西。
