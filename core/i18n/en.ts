/**
 * English. 型別釘住要跟 `zh-Hant.ts` 一致——少一條、多一條都編譯錯，
 * 而 `build` 與 `typecheck` 都會跑 `tsc --noEmit`，因此漏譯在建置時就擋下來。
 *
 * 刻意不寫成 `{ ...zhHant, ... }`：那樣漏填一條會靜靜掉回中文，
 * 「少一條就編譯錯」的守門就失效了。
 *
 * 領域概念照 `docs/glossary.md` 的英文欄，**連「英文避用」那一欄一起遵守**（票 06）。
 * 有三個地方因此繞開了最順口的字，覺得不自然想改回去之前先讀這裡：
 *
 * - 停止同步那顆鈕寫 `Stop backing up`，不是 `Stop syncing`——`Sync` 是雲端備份的
 *   避用詞（會讓人誤以為逐張合併）。全檔一個 sync 都沒有。
 * - 讀音格的合併與拆開寫 `Join`／`Separate`，不是 `Merge`／`Split`——那兩個字分別是
 *   匯入單字與讀音格的避用詞。
 * - 詞條一律 `entry`，含匯入時被跳過的那幾條（中文那份寫的是「詞」）——`Word` 是避用詞，
 *   理由是詞條可能是文法句型。唯一的例外是 `Import words`，那是詞彙表自己定的功能名。
 *
 * 但避的是**概念**，不是字。有三個避用字仍然留著，因為它們指的是別的東西，照字面稽核
 * 之前先看這裡：`storage.*` 的 `the {field} field` 指的是備份檔裡的 JSON 欄位，不是讀音格；
 * `Average interval (days)` 的 `days` 是單位，概念本身照詞彙表叫 `interval`；而 `key`
 * 指的是 Gemini 的 API 金鑰，不是密碼（`data.geminiLabel` 因此寫全 `API key`）。
 *
 * 帶數量的字串一律「名詞在前、數字在後」（`Cards: 12`、`Due today: 3`），不寫
 * `12 cards`：查表沒有單複數機制（票 02），寫成後者時 `1 cards` 會直接漏到畫面上。
 */
import type zhHant from './zh-Hant';

// 領域概念照 `docs/glossary.md` 的英文欄：單字本是 Vocabulary Book，不是 Book。
const en: typeof zhHant = {
  'nav.review': 'Review',
  'nav.cards': 'Cards',
  'nav.data': 'Data',
  'nav.stats': 'Stats',
  'nav.add': 'Add',
  'books.sectionTitle': 'Vocabulary books',
  'books.addButton': '+ Add vocabulary book',
  'books.goCreate': 'Create a vocabulary book',
  'books.empty': 'No vocabulary books yet.',
  'books.cardCount': 'Cards: {count}',
  'books.scopeCheckLabel': 'Review "{name}"',
  'books.listScopeCheckLabel': 'Show "{name}" in the card list',
  'books.rename': 'Rename',
  'books.importWords': 'Import words',
  'books.delete': 'Delete',
  'books.deleteConfirm':
    'Delete "{name}"? The cards it holds ({count}) and their review progress are deleted as well, and this cannot be undone.',
  'books.imported': 'Imported: {count}',
  'books.importFailed': 'Importing words failed: {reason}',
  'books.skippedHeading': 'These entries already exist and were skipped ({count}):',
  'books.skippedItem': '· {term} ({book})',
  'books.unknownBook': 'Unknown vocabulary book',
  'books.namePlaceholder': 'e.g. Japanese for work',
  'books.confirmAdd': 'Add',
  'books.cancel': 'Cancel',
  'books.done': 'Done',
  'books.sheetHint': 'Only checked books appear in the card list',
  'books.nameBlank': 'A vocabulary book needs a name',
  'books.nameTaken': 'A vocabulary book named "{name}" already exists',
  'books.scopeEmpty': 'Choose at least one vocabulary book',
  'books.importTargetGone': 'The vocabulary book you were importing into is gone',
  'books.termTakenIn': '"{term}" is already in "{book}"',
  'books.termTaken': '"{term}" is already in another vocabulary book',
  'books.homeName': 'My vocabulary',
  'filter.all': 'All',
  // 這一條會被 `filter.blockLabel` 當成 `{scope}` 嵌進去（`book-filter.ts:35`），
  // 所以不能像其他數量字串那樣寫成 `Books: 3`——嵌起來會變成 `Vocabulary book: Books: 3`。
  'filter.bookCount': '{count} selected',
  'filter.blockLabel': 'Vocabulary book: {scope}',
  'review.remaining': '{count} left',
  'review.ratingAgain': 'Again',
  'review.ratingHard': 'Hard',
  'review.ratingGood': 'Good',
  'review.ratingEasy': 'Easy',
  'review.showAnswer': 'Show answer',
  'review.edit': 'Edit',
  'review.copy': 'Copy',
  'review.copied': 'Copied',
  'review.speak': '🔊 Speak',
  'review.speakLabel': 'Read this entry aloud',
  'review.doneTitle': 'Done for today',
  'review.doneNote': 'Every due card has been reviewed. Come back tomorrow.',
  'review.browseAll': 'Browse all cards',
  'review.noBooksTitle': 'No vocabulary books yet',
  'review.noBooksNote': 'Create one, add a few cards, and you can start reviewing.',
  'review.queueEmpty': 'The review queue is empty, there is no card left to rate',
  'list.noBooksTitle': 'No vocabulary books yet',
  'list.noBooks': 'No vocabulary books yet. A card needs a book to go into.',
  'list.searchPlaceholder': 'Search entries, readings, meanings',
  'list.countMatched': 'Cards: {matched} of {total}',
  'list.countAll': 'Cards: {total}',
  'list.sortAsc': 'Due ↑',
  'list.sortDesc': 'Due ↓',
  'list.sortLabelAsc': 'Switch due sort direction, the most urgent are first right now',
  'list.sortLabelDesc': 'Switch due sort direction, the least urgent are first right now',
  'list.bucketNew': 'New',
  'list.bucketNow': 'Now',
  'list.bucketToday': '<24h',
  'list.bucketTomorrow': 'Tomorrow',
  'list.bucketWeek': '<1 week',
  'list.bucketFuture': 'Future',
  'stats.noBooks': 'No vocabulary books yet, so there is nothing to count.',
  'stats.overview': 'Where things stand',
  'stats.totalCards': 'Total cards',
  'stats.reviewed': 'Reviewed',
  'stats.avgInterval': 'Average interval (days)',
  'stats.dueDistribution': 'Due distribution',
  'stats.easeDistribution': 'Ease distribution',
  'stats.newCard': 'New card',
  'stats.easeTag': 'Ease {ease}',
  'stats.modalTitle': '{title} ({count})',
  'stats.easeFloor': 'Floor',
  'stats.easeLow': '1.31–1.7',
  'stats.easeMidLow': '1.7–2.1',
  'stats.easeMidHigh': '2.1–2.5',
  'stats.easeSteady': 'Around 2.5',
  'stats.easeHigh': 'Above 2.5',
  'editor.cancel': 'Cancel',
  'editor.titleNew': 'Add card',
  'editor.titleEdit': 'Edit card',
  'editor.labelBook': 'Vocabulary book',
  'editor.labelTerm': 'Entry',
  'editor.labelReading': 'Reading',
  'editor.readingOf': 'Reading for {kanji}',
  'editor.labelPreview': 'Preview',
  'editor.labelMeaning': 'Meaning',
  'editor.termPlaceholder': '焦がす',
  'editor.meaningPlaceholder': 'to scorch',
  'editor.noKanji': 'This entry has no kanji',
  'editor.cardGoneTitle': 'Card not found',
  'editor.cardGone': 'It may have been deleted.',
  'editor.mergeLabel': 'Join {left} and {right}',
  'editor.splitLabel': 'Separate {left} and {right}',
  'editor.blankFields': 'Entry, reading and meaning all have to be filled in.',
  'editor.errorSeparator': '; ',
  'editor.saved': 'Added "{term}"',
  'editor.save': 'Save',
  'editor.saveAndContinue': 'Save and continue',
  'editor.deleteCard': 'Delete this card',
  'editor.deleteConfirm': 'Delete the card "{meaning}"? This cannot be undone.',
  'editor.noteAsking': 'Asking…',
  'editor.noteRetrying': 'Retrying (attempt {attempt})…',
  'editor.noteFilled': 'The reading was filled in by AI, please check it',
  'editor.noteFailed': 'Reading prefill failed: {reason}',
  'data.langTitle': 'Interface language',
  'data.langSystem': 'System default',
  'data.langHint':
    'This choice applies to this device only. It is not uploaded to the cloud and does not appear in exported backup files.',
  'data.cloudTitle': 'Cloud backup',
  'data.cloudHint':
    'Enter a nickname and password of your own choosing and your progress is backed up to the cloud automatically; ' +
    'enter the same pair on another device to pick it up again. ' +
    'The password also encrypts the contents, nobody can reset it for you, and once it is lost the copy in the cloud can never be read again. ' +
    'Please also export a file with "Manual backup" below, it is the only way back in that does not need the password.',
  'data.signedInAs':
    'Signed in as {nickname}. Review progress is backed up automatically; enter the same nickname and password on another device to pick it up again.',
  'data.declinedHint':
    'This device remembers the nickname for your cloud backup, but you chose not to pick it up here, so nothing is being backed up. ' +
    'Press the button below to pick it up after all, no password needed.',
  'data.pullNow': 'Pick up cloud backup ({nickname})',
  'data.changePasswordTitle': 'Change password',
  'data.changeHint':
    'Once the password changes, other devices still on the old one are turned away, and each of them has to enter the new password before it can back up again.',
  'data.stopSync': 'Stop backing up',
  'data.stopConfirm':
    'Nothing is backed up to the cloud after this, and your cards and progress stay on this device in full. Stop backing up?',
  'data.nickname': 'Nickname',
  'data.password': 'Password',
  'data.newPassword': 'New password',
  'data.signIn': 'Sign in',
  'data.connecting': 'Connecting…',
  'data.updatePassword': 'Update password',
  'data.passwordUpdated':
    'Password updated. Other devices have to enter the new password before they can back up again.',
  'data.geminiTitle': 'Gemini API key',
  'data.geminiHint':
    'Create a key at Google AI Studio (aistudio.google.com/apikey), ' +
    'and make sure billing is not enabled on that project — once it is, the free quota is gone and every call is charged from the very first character. ' +
    'The key stays on this device only. It is not uploaded to the cloud and does not appear in exported backup files.',
  'data.geminiSet': 'A key is set. To use a different one, clear it first and then paste the new key.',
  'data.geminiClear': 'Clear key',
  // 同一個畫面上另有一個 `Password`，而詞彙表把 `Key` 列為密碼的避用詞。
  // 這一格寫全 `API key` 而不是 `Key`，兩者就分得開。
  'data.geminiLabel': 'API key',
  'data.geminiSave': 'Save key',
  'data.reminderTitle': 'Daily reminder',
  'data.reminderToggle': 'Remind me every day',
  'data.reminderTime': 'at',
  'data.reminderHint':
    'You are only nudged on days that have cards due, days with none stay quiet; and once you have finished reviewing, the rest of that day stays quiet too. ' +
    'This switch applies to this device only. It is not uploaded to the cloud and does not appear in exported backup files.',
  'data.reminderDenied':
    'Notifications are turned off, so reminders cannot get through. Allow them in Settings → {app} → Notifications, then come back and turn this switch on.',
  'data.fileTitle': 'Manual backup',
  'data.fileHint': 'Export a file and import it on another device, to keep a backup or to move over.',
  'data.exportButton': 'Export backup',
  'data.importButton': 'Import backup',
  'data.importConfirm':
    'Importing overwrites all of your current cards and progress, and cannot be undone. Continue?',
  'data.exportFailed': 'Export failed: {reason}',
  'data.importFailed': 'Import failed: {reason}',
  'cloud.pullConfirm':
    'This device remembers the nickname {nickname} from your cloud backup.\n\n' +
    'Pick up the cards and review progress from the cloud on this device now?\n' +
    'Choose Cancel and this device starts out empty. The copy in the cloud is left alone, and you can pick it up later on the Data screen.',
  'cloud.wrongPassword': 'Wrong nickname or password',
  'cloud.tooLarge':
    'The number of cards is over the limit for cloud backup, so nothing was uploaded this time. Please export a file from Manual backup on the Data screen and keep it. The cards and progress on this device are completely unaffected.',
  'cloud.offlineNote': 'Progress is not uploaded yet, it goes up on its own once you are back online',
  'cloud.readFailed': 'Could not read from the cloud ({status})',
  'cloud.writeFailed': 'Could not write to the cloud ({status})',
  'cloud.noTimestamp': 'The cloud did not return a timestamp',
  'cloud.credentialsRequired': 'Both nickname and password have to be filled in.',
  'cloud.newPasswordRequired': 'The new password has to be filled in.',
  'cloud.notSignedIn': 'Not signed in, so the password cannot be changed.',
  'storage.invalidJson': 'This is not a valid JSON file: {reason}',
  'storage.corrupted': 'The data stored on this device is damaged and cannot be read: {reason}',
  'storage.notObject': 'The contents are not an object',
  'storage.noCards': 'The card list is missing',
  'storage.bookNotObject': 'Vocabulary book {index} is not an object',
  'storage.bookMissingField': 'Vocabulary book {index} is missing the {field} field',
  'storage.cardNotObject': 'Card {index} is not an object',
  'storage.cardMissingField': 'Card {index} is missing the {field} field',
  'reading.cellsRequired': 'Every reading cell of {kanji} has to be filled in',
  'reading.kanaRequired': 'The reading of {kanji} has to be written in kana',
  'reading.prefillMismatch': 'The reading from the AI does not match this entry',
  'reading.unknownReason': 'Unknown reason',
  'gemini.timeout': 'No reply after waiting more than {seconds} seconds',
  'gemini.offline': 'Cannot reach Gemini',
  'gemini.quotaExhausted': 'Temporarily unavailable, please try again later',
  'gemini.httpError': 'Gemini returned {status}: {reason}',
  'gemini.httpErrorNoReason': 'Gemini returned {status}: no reason given',
  'gemini.unreadable': 'Gemini replied with something we cannot read',
  'gemini.emptyReply': 'Gemini replied with no content',
  'gemini.notJson': 'What Gemini replied is not JSON',
  'reminder.title': 'Time to review',
  'reminder.body': 'Due today: {count}',
  'toast.close': 'Close',
};

export default en;
