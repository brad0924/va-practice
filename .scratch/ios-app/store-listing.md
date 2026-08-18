# App Store 頁面素材（票 20 的產出）

三組 localization 的文案：**繁體中文、日本語、English**。

> **2026-08-18 更新**：韓國 storefront 暫不上架——`Vocabulary Card Practice` 與 `VocabCard`
> 在該區都已被別的開發者佔用，經過見票 20 的 `## Comments`。**英文那組仍然要做**，
> 因為 App Store 素材是跟著使用者裝置的語言走，不跟國家走：台灣區有人把 iPhone 設成英文，
> 看到的就是英文那組。發行地區只有台、日兩區。

領域用詞照 `docs/glossary.md`，**連「英文避用」那一欄一起遵守**（規則與 `src/i18n/en.ts`
檔頭一致）。因此英文那份全檔沒有 `sync`、`deck`、`folder`、`filter`、`pronunciation`、
`notification`、`account`，`word` 只出現在功能名 `Import words` 裡。

字元數是照 App Store Connect 的上限標的：名稱 30、副標題 30、關鍵字 100、描述 4000。
中日文一個字算一個字元。

---

## 1. App 名稱

**這裡有兩個長得像、但管不同東西的欄位。** 票 02 的 Comments 寫明兩者可以不一樣：

| 欄位 | 值 | 唯一性 |
| --- | --- | --- |
| App Store Connect 的 `Name`（商店頁面上的商品名） | `Vocabulary Card Practice` | **按 storefront 各查各的**。台、日兩區可用；韓國區已被別人佔走 |
| 裝置主畫面圖示底下（`Info.plist` / `APP_NAME.short`） | `VocabCard` | 無唯一性限制 |

**三個語系都填同一個值，不翻。** 理由見 `.scratch/app-name/issues/02-rename.md`
與 `.scratch/i18n/spec.md` 決定九：拉丁字母的名字各語系都認得。

> **撞名的處方票 02 已經想過**：「撞名時只要在商店那格補後綴即可，`src/lib/app-name.ts`
> 不受影響」。也就是說商店那格撞到別人，改的是商店那格，不是程式碼。
>
> 這次韓國區撞名沒有動用這個處方——維護者選擇該區暫不上架，理由是不想為了一個市場
> 讓三個語系的商店名稱各不相同。台、日兩區三格都填 `Vocabulary Card Practice`。

---

## 2. 繁體中文（台灣 storefront）

### 副標題（13／30）

```
自建日文單字本，到期才複習
```

### 關鍵字（63／100）

```
日文,日語,單字,單字卡,閃卡,背單字,JLPT,N1,N2,N3,複習,間隔複習,振假名,讀音,日檢,假名,漢字,離線,備份
```

> 逗號後**不要加空格**，空格會吃掉額度。

### 描述

```
把你自己遇到的日文詞收進單字本，到期那天再拿出來複習。

【自己的單字本】
單字本由你自取名字、自己決定裝什麼。一張卡只屬於一本，要換一本就是把卡搬過去。同一個詞條在整個 app 裡只會有一張卡，不會不小心收兩次。

【只出到期的卡】
看完答案後你自評「再次／困難／好／簡單」，程式據此算出這張卡下次的到期日。只有已到期的卡會進入當天的複習佇列，其餘完全不出現——打開就知道今天還剩幾張，清空就是今天做完了。

【讀音標在漢字上】
詞條裡的漢字都能標上讀音，以振假名的形式顯示在漢字上方。編輯時一段連續漢字一個讀音格，相鄰的格可以合併、合併的可以切開，由你決定假名分配到哪幾個漢字上。

【原生日文語音】
點一下，就用 iOS 內建的日文語音把詞條唸出來。

【每天提醒】
時間你自己指定。只在複習範圍內真的有卡到期的日子才出現，並寫明張數；當天複習完就不再出現。

【讀音預填（選用）】
你若自備 Gemini 的 API 金鑰，可以讓它先把讀音格填成草稿，你確認過再存。這個功能預設關閉，金鑰只留在這台裝置上，不開也不影響其他任何功能。

【備份與雲端備份】
整份資料可以匯出成一個備份檔帶走。也可以開啟雲端備份，讓進度在你自己的多台裝置之間搬運。雲端備份採端對端加密，只有你的密碼解得開，伺服器存到的是密文。不必註冊，不留電子郵件。

【不追蹤】
不收集分析數據，沒有第三方追蹤。
```

### 隱私政策網址

`public/privacy.html` 上線後的網址。

---

## 3. 日本語（日本 storefront）

### 副標題（19／30）

```
自分でつくる日本語の単語帳、期日に復習
```

### 關鍵字（68／100）

```
日本語,単語帳,単語カード,フラッシュカード,暗記,JLPT,N1,N2,N3,復習,間隔反復,ふりがな,読み,オフライン,バックアップ
```

### 描述

```
自分で出会った日本語の見出し語を単語帳に集めて、期日が来た日に復習します。

■ 自分だけの単語帳
単語帳の名前も中身も自分で決められます。1枚のカードはちょうど1冊に属し、別の冊に入れたいときはカードごと移します。同じ見出し語はアプリ全体で1枚だけなので、うっかり二重に集めることはありません。

■ 期日のカードだけ
答えを見たあと「もう一度／難しい／普通／簡単」で自己評価すると、そのカードの次の期日が決まります。期日のカードだけがその日の復習キューに入り、それ以外は表示されません。開けば今日の残りがすぐ分かり、キューが空になればその日は終わりです。

■ 漢字の上に読み
見出し語の漢字には読みを振り、漢字の上に表示します。編集中は連続した漢字ごとに読みセルが並び、隣のセルを結合したり、結合したセルを分けたりして、どの仮名をどの漢字に当てるかを自分で決められます。

■ ネイティブの日本語読み上げ
タップすると、iOSに入っている日本語音声が見出し語を読み上げます。

■ 毎日のリマインド
時刻は自分で指定します。復習範囲の中に本当に期日のカードがある日だけ、枚数つきで届きます。その日の復習を終えると、もう出てきません。

■ 読みの下書き入力（任意）
自分のGemini APIキーがあれば、読みセルの下書きを入れてもらえます。保存する前に必ず自分で確かめます。初期状態ではオフで、キーはこの端末にだけ残り、使わなくても他の機能には一切影響しません。

■ バックアップとクラウドバックアップ
すべてを1つのバックアップファイルに書き出して持ち運べます。クラウドバックアップをオンにすれば、自分の複数の端末の間で進捗が行き来します。クラウドバックアップはエンドツーエンド暗号化で、開けるのは自分のパスワードだけ、サーバーに残るのは暗号文です。登録もメールアドレスも要りません。

■ 追跡しません
分析データは集めず、第三者の追跡も入っていません。
```

### 隱私政策網址

`public/privacy-en.html` 上線後的網址（**日文不另出一份**，`.scratch/i18n/spec.md` 決定八）。

---

## 4. English（裝置語言設成英文的使用者）

### 副標題（29／30）

```
Japanese cards, spaced review
```

> 備選是 `Your Japanese vocabulary books`，正好卡在 30 字元。用了 glossary 的正名
> `Vocabulary Book`，但一格餘裕都沒有，App Store Connect 若把某個字元算成兩格就會被擋。
> 描述裡本來就會用到正名，所以主選走 29 字元那條。

### 關鍵字（93／100）

```
Japanese,JLPT,N1,N2,N3,vocabulary,flashcards,kanji,furigana,reading,repetition,offline,backup
```

> 沒放 `spaced`——副標題已經有了，Apple 會把名稱與副標題一併索引，重複等於浪費額度。

### 描述

```
Collect the Japanese entries you actually run into, and review each one on the day it comes due.

YOUR OWN VOCABULARY BOOKS
You name every vocabulary book and decide what goes in it. A card belongs to exactly one book, so putting it somewhere else means moving the card itself. Each entry exists as a single card across the whole app, which means you never collect the same one twice.

ONLY WHAT IS DUE
After you look at the answer you rate yourself - Again, Hard, Good, Easy - and the app works out that card's next due date from it. Only cards that are already due enter the day's review queue; the rest do not appear at all. Open the app and you can see how many are left today, and an empty queue means you are finished.

READINGS ABOVE THE KANJI
Every kanji in an entry can carry its reading, shown above the character. While you edit, each run of kanji gets its own reading cell; you can join neighboring cells or separate joined ones, so you decide which kana belong to which characters.

NATIVE JAPANESE SPEECH
One tap reads the entry aloud with the Japanese voice built into iOS.

A DAILY REMINDER
You pick the time. It arrives only on days that really do have cards due inside your review scope, and it tells you how many. Once you have finished for the day, it stays quiet.

READING PREFILL (OPTIONAL)
If you bring your own Gemini API key, the app can draft the reading cells for you to check before saving. It is off until you turn it on, the key stays on this device, and nothing else depends on it.

BACKUP AND CLOUD BACKUP
Write everything out to a single backup file and carry it away. Or turn on cloud backup and let your progress travel between your own devices. Cloud backup is end-to-end encrypted: only your password opens it, and the server only ever holds ciphertext. No registration, no email address.

NO TRACKING
No analytics, no third-party trackers.
```

### 隱私政策網址

`public/privacy-en.html` 上線後的網址。

---

## 5. 截圖說明（caption）

**假設：五張截圖，對應底部五個分頁。** 票 20 明寫截圖數量與尺寸沿用票 11 送審時的規格，
而票 11 還沒送審、規格未定。張數若不是五張，照下表增減即可，順序不影響語意。

| # | 畫面 | 繁體中文 | 日本語 | English |
| --- | --- | --- | --- | --- |
| 1 | 複習 | 只出今天到期的卡 | 期日のカードだけ | Only the cards that are due |
| 2 | 卡片列表 | 依到期遠近分組，一眼看完進度 | 期日の近さでまとめて一覧 | Grouped by how soon they are due |
| 3 | 新增／編輯 | 讀音標在漢字上，假名分給誰由你決定 | 読みは漢字の上に、割り当ては自分で | Readings sit above the kanji |
| 4 | 統計 | 到期與成長倍數的分布 | 期日と易しさの分布 | Where your due dates and ease sit |
| 5 | 資料 | 端對端加密的雲端備份，不必註冊 | 登録不要のクラウドバックアップ | Cloud backup, encrypted, no registration |

**截圖裡的介面語言必須與該語系的素材語言相符**——日文那組要用日文介面拍，
英文那組要用英文介面拍。這是票 20 的驗收項目之一。

---

## 6. 截圖怎麼拍（Mac + iOS 模擬器）

**為什麼非得用 Mac。** Apple 必填 6.9 吋那格（1260 × 2736、1290 × 2796 或 1320 × 2868），
而維護者手上的 iPhone 12 mini 是 1080 × 2340、iPhone 14 Pro 是 1179 × 2556，兩台都截不出來。
借不到 6.9 吋的實機時，**iOS 模擬器是唯一能截出原生尺寸的辦法**——模擬器截出來就是該機型的
真實像素，不需要放大。

> 模擬器截圖 Apple 完全接受，它不驗這張圖是不是真的來自實機，只驗像素尺寸與格式。

### 前置

- macOS + Xcode（App Store 下載，含 iOS 模擬器）
- Node.js。版本由 nvm 管，見 `.claude/CLAUDE.md`

### 步驟

```bash
# 1. 取得專案並安裝相依
git clone <repo> && cd va-practice
npm install

# 2. build 網頁內容並同步進 iOS 專案
npm run sync:ios          # 等同 build:ios + cap sync ios

# 3. 開啟 Xcode 專案
npx cap open ios
```

在 Xcode 上方的裝置選單挑一台 **6.9 吋**的模擬器，然後按 Run（⌘R）：

| 模擬器機型 | 截出來的尺寸 | 落在哪一格 |
| --- | --- | --- |
| iPhone 16 Pro Max | 1320 × 2868 | 6.9"（必填） |
| iPhone 15 Pro Max | 1290 × 2796 | 6.9"（必填） |
| iPhone 14 Pro Max | 1290 × 2796 | 6.9"（必填） |

三台都在必填那格，挑 Xcode 裡有的那台就好。

### 切介面語言：在 app 裡切，不要動模擬器的系統設定

這個 app 有自己的語言選單，在**「資料」分頁最上面**（`src/ui/data-view.ts`）。四個選項是
「系統預設／繁體中文／English／日本語」，**選項文字不隨介面語言變**，所以切到日文之後
還找得回來。換完畫面立刻重畫，不必重開 app。

拍三組截圖就是切三次語言，各拍一輪：

1. 切「繁體中文」→ 拍五張 → 收進 `zh-Hant/`
2. 切「English」→ 拍同樣五張 → 收進 `en/`
3. 切「日本語」→ 拍同樣五張 → 收進 `ja/`

**不要改模擬器的系統語言**（設定 → 一般 → 語言與地區）。那條路要等模擬器重開、慢得多，
而且這個 app 的語言選擇存在 `va-practice:lang`，本來就不跟系統走。

### 截圖指令

用命令列截，不要用選單的 Save Screen Shot——命令列這條一定是原生像素，而且可以照順序命名：

```bash
# 先把三個語言的資料夾建好，simctl 不會自己建
mkdir -p ~/Desktop/shots/zh-Hant ~/Desktop/shots/en ~/Desktop/shots/ja

# booted 指的是目前開著的那台模擬器
xcrun simctl io booted screenshot ~/Desktop/shots/zh-Hant/1-review.png
xcrun simctl io booted screenshot ~/Desktop/shots/zh-Hant/2-cards.png
# ...以此類推，五張對應第 5 節那張表的五個畫面
```

### 送上去之前先拿掉 alpha channel

**Apple 不收帶透明資訊的圖**（"Screenshots can't include alpha channels or transparencies"）。
模擬器存出來的 PNG 可能帶著 alpha，直接傳會被擋。轉成 JPEG 最省事——JPEG 格式本身就沒有
透明度：

```bash
# 整個資料夾一次轉，sips 是 macOS 內建，不用另外裝
cd ~/Desktop/shots
for f in */*.png; do
  sips -s format jpeg "$f" --out "${f%.png}.jpg"
done
```

### 驗一次尺寸再上傳

```bash
sips -g pixelWidth -g pixelHeight ~/Desktop/shots/zh-Hant/*.jpg
```

每一張都要是 1320 × 2868（或 1290 × 2796，看你挑了哪台模擬器）。**同一組裡的尺寸必須一致**，
混著兩種尺寸 App Store Connect 會擋。

### 如果日後借得到 6.9 吋實機

實機截圖更真實（有真的電量、訊號、時間），流程更短：用 Mac 的「照片」app 或 Finder 從
iPhone 匯入，那條路不壓縮。

---


## 檢查過的事

- 領域用詞逐條對過 `docs/glossary.md`：單字本／Vocabulary Book／単語帳、詞條／entry／見出し語、
  釋義、讀音、讀音格／reading cell／読みセル、到期／due／期日、複習佇列／review queue／復習キュー、
  複習範圍／review scope／復習範囲、評分四級、提醒／reminder／リマインド、
  備份／backup／バックアップ、雲端備份／cloud backup／クラウドバックアップ、
  讀音預填／reading prefill／読みの下書き入力。
- 避用詞：英文那份不含 `sync`、`deck`、`folder`、`filter`、`word`（功能名除外）、
  `pronunciation`、`translation`、`notification`、`account`、`difficulty`。
  中文那份不含「同步」「篩選」「分類」「標籤」「資料夾」「發音」「推播」「帳號」「自動產生」。
- 日文標點照 `src/i18n/ja.ts` 的規則：讀點「、」句點「。」括號「（）」「」，
  沒有全形逗號；量詞カードは「枚」、単語帳は「冊」。
- 描述裡對 Gemini 讀音預填的說法與票 11「預設關閉、自備金鑰、不影響核心功能」一致。

## 沒有做的事

- 沒有寫 Promotional Text（170 字元那欄）。票 20 的清單裡沒有它，首版也非必填。
- 沒有寫 What's New。首版不需要。
- 沒有決定截圖的**張數**，仍是第 5 節假設的五張（票 20 明寫不重新決定，沿用票 11）。
  **尺寸則不是決定，是 Apple 訂死的**——必填 6.9 吋那格，作法見第 6 節。
