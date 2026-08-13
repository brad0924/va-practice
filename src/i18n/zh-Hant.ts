/**
 * 繁體中文。**這一份是唯一的來源**，`en.ts` 與 `ja.ts` 照它的型別走，
 * 少一條就編譯錯（見 ADR-0013）。
 *
 * key 用語意命名（`books.addButton`），不用中文原文——中文改字時不必動 code，
 * 而且同一句中文在不同語境可以翻成不同的字。
 *
 * 分區沿用檔案：`nav.*` 是四個畫面共用的導覽字，其餘各自對應一支檔案。
 *
 * 刻意不加 `as const`：加了之後值也會變成字面型別，`en.ts` 那句
 * `const en: typeof zhHant` 就會要求填一模一樣的中文，守門反而失效。
 * key 本身在物件字面值上本來就是字面型別，`Key` 不受影響。
 *
 * 沒有搬進來的中文只有三類，見票 03：註解、`gemini-reading.ts` 的 `INSTRUCTIONS`
 * （那是給 Gemini 讀的作業指示，翻了會改變它的行為），以及 `HOME_BOOK_NAME`
 * （那是寫進使用者資料的字串，只留著認舊資料用；新產生的那本走 `books.homeName`）。
 */
export default {
  // ── 導覽：四個畫面互相跳的那幾顆鈕，也是各自的標題 ──────────────
  'nav.review': '複習',
  'nav.cards': '卡片',
  'nav.data': '資料',
  'nav.stats': '統計',
  'nav.add': '新增',

  // ── 單字本：資料畫面最上面那一區，加上 storage.ts 的三道約束 ──────
  'books.sectionTitle': '單字本',
  'books.addButton': '＋ 新增單字本',
  'books.goCreate': '去建立單字本',
  'books.empty': '還沒有單字本。',
  'books.cardCount': '{count} 張',
  'books.scopeCheckLabel': '複習「{name}」',
  'books.rename': '改名',
  // 「匯入」是 CONTEXT.md 這一則的 _Avoid_ 項（會與備份的匯入混淆），改用詞彙表的正名。
  'books.importWords': '匯入單字',
  'books.delete': '刪除',
  'books.deleteConfirm': '確定刪除「{name}」？將一併刪除 {count} 張卡片與它們的複習進度，無法復原。',
  'books.imported': '已匯入 {count} 張',
  'books.importFailed': '匯入失敗：{reason}',
  'books.skippedHeading': '以下 {count} 個詞已存在，已跳過：',
  'books.skippedItem': '・{term}（{book}）',
  'books.unknownBook': '未知的單字本',
  'books.namePlaceholder': '例如：工作用日文',
  'books.confirmAdd': '新增',
  'books.cancel': '取消',
  'books.nameBlank': '單字本的名字不能是空白',
  'books.nameTaken': '已經有一本叫「{name}」了',
  'books.scopeEmpty': '至少要選一本單字本',
  'books.importTargetGone': '要匯進去的那本單字本已經不在了',
  // 詞條全域唯一撞到時的兩句。說得出在哪一本就講哪一本，講不出來才用下面那句；
  // 刻意不把「在哪一本」拼成一段插進去——其他語言的語序不同，拼起來會不通。
  'books.termTakenIn': '「{term}」已經在「{book}」裡了',
  'books.termTaken': '「{term}」已經在別的單字本裡了',
  // 收攏沒有歸屬的舊卡時，那一本的名字。產生的當下用當下的介面語言，
  // 之後它就是使用者資料，切語言不會跟著變（spec 決定十二）。
  'books.homeName': '我的單字',

  // ── 單字本範圍的開關（三個畫面共用那顆） ────────────────────────
  'filter.all': '全部',
  'filter.bookCount': '{count} 本',
  // 自成一列的那顆鈕上是一整句，不是「前綴 ＋ 範圍」兩段拼起來——
  // 其他語言的語序不同，拼起來會不通（票 03）。
  'filter.blockLabel': '單字本：{scope}',

  // ── 複習畫面 ────────────────────────────────────────────────
  'review.remaining': '剩餘 {count} 張',
  'review.ratingAgain': '再次',
  'review.ratingHard': '困難',
  'review.ratingGood': '好',
  'review.ratingEasy': '簡單',
  'review.showAnswer': '顯示答案',
  'review.edit': '編輯',
  'review.speak': '🔊 朗讀',
  'review.speakLabel': '朗讀這個詞條',
  'review.doneTitle': '今日份完成',
  'review.doneNote': '到期的卡片都複習過了，明天再來。',
  'review.browseAll': '瀏覽全部卡片',
  'review.noBooksTitle': '還沒有單字本',
  'review.noBooksNote': '先建一本並加幾張卡，就可以開始複習。',
  'review.queueEmpty': '複習佇列已清空，沒有可評分的卡片',

  // ── 卡片列表 ────────────────────────────────────────────────
  'list.noBooks': '還沒有任何單字本。卡片要先有一本才放得進去。',
  'list.searchPlaceholder': '搜尋詞條、讀音或釋義',
  'list.countMatched': '符合 {matched} 張，共 {total} 張',
  'list.countAll': '共 {total} 張',
  'list.sortAsc': '到期 ↑',
  'list.sortDesc': '到期 ↓',
  'list.sortLabelAsc': '切換到期排序方向，目前最急的在前',
  'list.sortLabelDesc': '切換到期排序方向，目前最不急的在前',
  // 六個時間桶的標籤。`key`（'new'、'now'…）不是介面文字，留在 list-view.ts。
  'list.bucketNew': '新',
  'list.bucketNow': '現在',
  'list.bucketToday': '<24小時',
  'list.bucketTomorrow': '明天',
  'list.bucketWeek': '<1週',
  'list.bucketFuture': '未來',

  // ── 統計畫面 ────────────────────────────────────────────────
  'stats.noBooks': '還沒有任何單字本，沒有東西可以統計。',
  'stats.overview': '現況',
  'stats.totalCards': '卡片總數',
  'stats.reviewed': '已複習過',
  'stats.avgInterval': '平均間隔（天）',
  'stats.dueDistribution': '到期分佈',
  'stats.easeDistribution': '熟練度分佈',
  'stats.newCard': '新卡',
  'stats.easeTag': '倍數 {ease}',
  'stats.modalTitle': '{title}，共 {count} 張',
  // 熟練度六段。中間四段是數字區間，各語言長一樣，仍然列進來讓六段寫法一致。
  'stats.easeFloor': '下限',
  'stats.easeLow': '1.31–1.7',
  'stats.easeMidLow': '1.7–2.1',
  'stats.easeMidHigh': '2.1–2.5',
  'stats.easeSteady': '2.5 附近',
  'stats.easeHigh': '2.5 以上',

  // ── 編輯卡片 ────────────────────────────────────────────────
  'editor.cancel': '取消',
  'editor.titleNew': '新增卡片',
  'editor.titleEdit': '編輯卡片',
  'editor.labelBook': '單字本',
  'editor.labelTerm': '詞條',
  'editor.labelReading': '讀音',
  'editor.labelPreview': '預覽',
  'editor.labelMeaning': '釋義',
  'editor.termPlaceholder': '焦がす',
  'editor.meaningPlaceholder': '燒焦',
  'editor.noKanji': '這個詞沒有漢字',
  'editor.mergeLabel': '把{left}和{right}合併',
  'editor.splitLabel': '把{left}和{right}拆開',
  'editor.blankFields': '詞條、讀音與釋義都要填。',
  // 讀音的錯可能一次好幾條，串成一行時的分隔符。標點跟著語言走。
  'editor.errorSeparator': '；',
  'editor.saved': '已加入『{term}』',
  'editor.save': '儲存',
  'editor.saveAndContinue': '儲存並繼續',
  'editor.deleteCard': '刪除這張卡',
  'editor.deleteConfirm': '確定刪除「{meaning}」這張卡？此動作無法復原。',
  'editor.noteAsking': '詢問中…',
  'editor.noteFilled': '讀音由 AI 填入，請確認',
  'editor.noteFailed': '自動填讀音失敗：{reason}',

  // ── 資料畫面：介面語言那一區 ──────────────────────────────────
  'data.langTitle': '介面語言',
  // 四個選項裡唯一進翻譯檔的一條：「系統預設」沒有自稱，只能跟著當前介面語言變。
  // 其餘三個是各自語言的自稱（繁體中文／English／日本語），**刻意不隨介面語言變**，
  // 寫死在 data-view.ts 裡（spec 決定十）。
  'data.langSystem': '系統預設',
  // 立場與每日提醒那句一模一樣（語言同樣不進雲端、不進備份檔），措辭照抄不另外發明。
  'data.langHint': '這個選擇只影響這台裝置，不會上傳雲端，也不會出現在匯出的備份檔裡。',

  // ── 資料畫面：雲端備份那一區 ──────────────────────────────────
  'data.cloudTitle': '雲端備份',
  'data.cloudHint':
    '輸入自取的暱稱與密碼，進度就會自動備份到雲端；換裝置輸入同一組就接得回來。' +
    '密碼同時用來加密內容，沒有人能幫你重設，遺失後雲端那份就再也讀不出來。' +
    '請用下面的「手動備份」另外匯出一份檔案，那是唯一不需要密碼就打得開的後路。',
  'data.signedInAs': '已登入：{nickname}。複習進度會自動備份，換裝置輸入同一組暱稱與密碼就接得回來。',
  'data.changePasswordTitle': '換密碼',
  'data.changeHint': '換密碼後，其他還在用舊密碼的裝置會被擋下來，需要各自重新輸入新密碼才能繼續同步。',
  'data.stopSync': '停止同步',
  'data.stopConfirm': '停止後不再備份到雲端，卡片與進度會完整留在這台裝置。確定要停止？',
  'data.nickname': '暱稱',
  'data.password': '密碼',
  'data.newPassword': '新密碼',
  'data.signIn': '登入',
  'data.connecting': '連線中…',
  'data.updatePassword': '更新密碼',
  'data.passwordUpdated': '密碼已更新。其他裝置要重新輸入新密碼才能繼續同步。',

  // ── 資料畫面：Gemini 金鑰那一區 ───────────────────────────────
  'data.geminiTitle': 'Gemini API 金鑰',
  'data.geminiHint':
    '到 Google AI Studio（aistudio.google.com/apikey）建立金鑰，' +
    '並確認該專案沒有啟用計費——一旦啟用，免費額度就會消失，之後每次呼叫都從第一個字開始計費。' +
    '金鑰只留在這台裝置，不會上傳雲端，也不會出現在匯出的備份檔裡。',
  'data.geminiSet': '已設定。要換一把金鑰的話，先按清除再貼上新的。',
  'data.geminiClear': '清除金鑰',
  'data.geminiLabel': '金鑰',
  'data.geminiSave': '儲存金鑰',

  // ── 資料畫面：每日提醒那一區 ──────────────────────────────────
  'data.reminderTitle': '每日提醒',
  'data.reminderToggle': '每天提醒我，',
  'data.reminderTime': '提醒時間',
  'data.reminderHint':
    '有卡到期的日子才會叫你，一張都沒有就不吵；當天複習完之後，那天剩下的提醒也不會再出現。' +
    '這個開關只影響這台裝置，不會上傳雲端，也不會出現在匯出的備份檔裡。',
  // `{app}` 是 iOS 設定 app 裡的項目名，也就是主畫面圖示底下那行字（短名）。
  'data.reminderDenied': '通知權限是關的，提醒送不出來。請到「設定 → {app} → 通知」允許通知後，再回來打開這個開關。',

  // ── 資料畫面：手動備份那一區 ──────────────────────────────────
  'data.fileTitle': '手動備份',
  'data.fileHint': '匯出後可在另一台裝置匯入，用來備份或搬家。',
  'data.exportButton': '匯出備份',
  'data.importButton': '匯入備份',
  'data.importConfirm': '匯入會整份覆蓋目前的卡片與進度，且無法復原。確定要繼續？',
  'data.exportFailed': '匯出失敗：{reason}',
  'data.importFailed': '匯入失敗：{reason}',

  // ── 雲端備份模組自己說的話 ────────────────────────────────────
  'cloud.wrongPassword': '暱稱或密碼不對',
  'cloud.tooLarge':
    '卡片數量已超過雲端備份的上限，這次沒有上傳。請到「資料」的手動備份匯出成檔案保存。本機的卡片與進度完全不受影響。',
  'cloud.offlineNote': '進度還沒上傳，恢復連線後會自動補上',
  'cloud.readFailed': '讀取雲端失敗（{status}）',
  'cloud.writeFailed': '寫入雲端失敗（{status}）',
  'cloud.noTimestamp': '雲端沒有回覆時間戳',
  'cloud.credentialsRequired': '暱稱與密碼都要填。',
  'cloud.newPasswordRequired': '新密碼要填。',
  'cloud.notSignedIn': '尚未登入，無法換密碼。',

  // ── 資料存取：格式壞掉時說得出壞在哪 ─────────────────────────
  'storage.invalidJson': '這不是有效的 JSON 檔：{reason}',
  'storage.corrupted': '本機儲存的資料已毀損，無法讀取：{reason}',
  'storage.notObject': '內容不是一個物件',
  'storage.noCards': '找不到卡片清單',
  'storage.bookNotObject': '第 {index} 本單字本不是一個物件',
  'storage.bookMissingField': '第 {index} 本單字本缺少 {field} 欄位',
  'storage.cardNotObject': '第 {index} 張卡不是一個物件',
  'storage.cardMissingField': '第 {index} 張卡缺少 {field} 欄位',

  // ── 讀音：儲存前的檢查與預填收不收 ───────────────────────────
  'reading.cellsRequired': '{kanji} 這串漢字的讀音每一格都要填',
  'reading.kanaRequired': '{kanji} 的讀音要填假名',
  'reading.prefillMismatch': 'AI 給的讀音對不上這個詞條',
  'reading.unknownReason': '未知原因',

  // ── 問 Gemini 讀音時的各種失敗 ───────────────────────────────
  'gemini.timeout': '等超過 {seconds} 秒沒有回覆',
  'gemini.offline': '連不上 Gemini',
  'gemini.httpError': 'Gemini 回了 {status}：{reason}',
  'gemini.noReason': '沒有附原因',
  'gemini.unreadable': '讀不懂 Gemini 的回覆',
  'gemini.emptyReply': 'Gemini 沒有回覆內容',
  'gemini.notJson': 'Gemini 回的不是 JSON',

  // ── 每日提醒推到鎖定畫面上的那一則 ───────────────────────────
  'reminder.title': '該複習了',
  'reminder.body': '今天有 {count} 張到期',

  // ── 存完留在原地時那一則回饋 ──────────────────────────────────
  'toast.close': '關閉',
};
