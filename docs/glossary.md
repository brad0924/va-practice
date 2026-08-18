# 領域詞彙三語對照

`CONTEXT.md` 每一則詞彙條目在中／英／日三種介面語言下的叫法。定義只寫在 `CONTEXT.md`，這裡只管譯名。

「英文避用」欄是**不要用的**譯法，多半是踩到 `CONTEXT.md` 各則 `_Avoid_` 的詞，或會讓人誤會功能做了什麼。

條目清單與 `CONTEXT.md` 由 `src/lib/glossary.test.ts` 釘住：多一條、少一條、順序不同都紅燈。譯名寫得對不對測不出來，那要人看。

表裡有幾則是**刻意選成這樣**的，看起來不一致或想「修正」之前，先讀 `.scratch/i18n/issues/01-glossary.md` 的裁決紀錄——理由的正本只有那一份。

| 中文 | English | 日本語 | 英文避用 |
| --- | --- | --- | --- |
| 單字本 | Vocabulary Book | 単語帳 | ~~Deck~~（＝已退場的「牌組」）、~~Folder~~ |
| 詞條全域唯一 | Globally Unique Entries | 見出し語の全体一意 | ~~Deduplication~~ |
| 複習範圍／列表範圍／統計範圍 | Review Scope / List Scope / Stats Scope | 復習範囲／一覧範囲／統計範囲 | ~~Filter~~（會讓人以為只是暫時的視圖） |
| 卡片 | Card | カード | ~~Question~~ |
| 詞條 | Entry | 見出し語 | ~~Word~~（詞條可能是文法句型） |
| 釋義 | Meaning | 意味 | ~~Translation~~、~~Definition~~ |
| 讀音 | Reading | 読み | ~~Pronunciation~~、~~Phonetics~~ |
| 讀音標記 | Reading Notation | 読み表記 | ~~Furigana syntax~~、~~Ruby syntax~~ |
| 讀音格 | Reading Cell | 読みセル | ~~Field~~、~~Input~~（太泛）、~~Split~~（聽起來像破壞資料） |
| 必填格 | Required Cells | 必須セル | ~~Validator~~、~~Required Field~~（太泛） |
| 讀音預填 | Reading Prefill | 読みの下書き入力 | ~~Auto-generate~~、~~AI Furigana~~（都會讓人以為程式對結果負責） |
| 讀音編輯器 | Reading Editor | 読みエディタ | ~~State machine~~、~~Controller~~ |
| 到期 | Due | 期日 | ~~Frequency~~、~~Weight~~ |
| 逾期 | Overdue | 期限切れ | ~~Expired~~、~~Late~~ |
| 間隔 | Interval | 間隔 | ~~Cycle~~、~~Days~~ |
| 成長倍數 | Ease | 易しさ | ~~Difficulty~~、~~Ease factor~~、~~EF~~ |
| 評分 | Rating | 評価 | ~~Score~~、~~Quality~~、~~q~~ |
| 複習佇列 | Review Queue | 復習キュー | ~~To-do~~、~~Schedule~~ |
| 新卡 | New Card | 新規カード | ~~Unlearned~~ |
| 複習卡 | Review Card | 復習カード | ~~Old card~~、~~Learned~~ |
| 抖動 | Fuzz | ゆらぎ | ~~Random~~、~~Jitter~~、~~Offset~~ |
| 到期排序 | Due Sort | 期日ソート | ~~Priority~~、~~Queue order~~（會讓人誤以為影響複習誰先出現） |
| 時間桶 | Time Bucket | 期日グループ | ~~Category~~、~~Status~~、~~Tag~~、~~Page~~ |
| 提醒 | Reminder | リマインド | ~~Push notification~~（把手段寫進名字）、~~Notification~~（太泛）、~~Alarm~~ |
| 提醒排程 | Reminder Schedule | リマインド予定 | ~~Forecast~~、~~Queue~~（會與複習佇列混淆）、~~Calendar~~ |
| 備份 | Backup | バックアップ | ~~Snapshot~~、~~Sync~~、~~Export file~~ |
| 雲端備份 | Cloud Backup | クラウドバックアップ | ~~Sync~~（會讓人誤以為逐張合併）、~~Cloud Drive~~、~~Account~~ |
| 保險副本 | Safety Copy | セーフティコピー | ~~Sync~~、~~Cache~~、~~Backup~~（會與雲端備份及匯出檔混淆）、~~Second source~~ |
| 匯入單字 | Import Words | 単語の取り込み | ~~Import~~（會與備份的匯入混淆）、~~Merge~~ |
| 暱稱 | Nickname | ニックネーム | ~~Account~~、~~Username~~、~~User ID~~ |
| 密碼 | Password | パスワード | ~~Passphrase~~、~~Key~~ |
| 指紋 | Fingerprint | フィンガープリント | ~~Hash~~、~~Token~~、~~Credential~~ |
