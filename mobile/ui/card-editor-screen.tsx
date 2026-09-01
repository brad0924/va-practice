/**
 * 新增／編輯卡片。改寫的第三頁正式程式碼，對照的是網頁版 `src/ui/editor-view.ts`（429 行）。
 *
 * **這一頁是四頁裡最難的一頁**，spec 把它排第二就是要讓最大的風險早點曝出來（票 `16`）。
 *
 * ## 判斷不在這裡
 *
 * 三台機器的規則整份住在 `core/`，兩個平台共用：
 *
 * - 讀音格什麼時候該重畫、提示字什麼時候該生該死、AI 預填的五條守門 →
 *   `core/lib/reading-editor.ts`（票 `16` 從 `src/ui/` 搬過來的，連同 516 行測試）。
 * - 「還空著就還沒填完」與兩條順序（換欄、儲存）→ `core/lib/required-fields.ts`。
 * - 讀音標記怎麼拆怎麼組、AI 的回覆收不收 → `core/lib/reading.ts`。
 *
 * 這一頁只做三件事：把它們的結果畫出來、把觸控翻成指令、把它們回的「變更單」翻成重畫。
 *
 * ## 版面：由上而下
 *
 * 單字本 → 詞條 → 讀音區（提示字在它上面）→ 預覽 → 釋義 → 按鈕。
 * **單字本排在詞條之前是刻意的**：先決定這張卡放哪裡，再打內容。順序與網頁版一致。
 *
 * ## 輸入框一律「不受控」
 *
 * 三種輸入框都用 `defaultValue` 而不是 `value`，字由狀態機（或一支 ref）自己記著。
 *
 * **這是照著網頁版的行為做的，不是偷懶。** 那邊的 `<input>` 也是瀏覽器自己記著字，
 * 程式只在「變更單說要改寫」的那一刻才回頭寫它。改成受控的話，每打一個字都要
 * 重畫一次那個輸入框——iOS 的日文與中文輸入法正在組字時被重畫，組到一半的字會被吃掉。
 *
 * 要重新灌值的時候換 `key`，讓那個輸入框整個重生。詞條與讀音區各有各的號碼牌（`seed`），
 * 因為它們重生的時機不一樣：打詞條打出一個新漢字時只有讀音格要重來，
 * 詞條那一格不能跟著重生——重生就會失焦，字打到一半鍵盤就沒了。
 *
 * **重生不是唯一的清空手段。** 「儲存並繼續」要的是「清空但焦點留在詞條」，重生給不了
 * 那個，那一下走的是 `TextInput` 的 `clear()`——不換節點，焦點因此不會掉。見 `reset()`。
 */
import { Stack } from 'expo-router';
import { useReducer, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInput as TextInputType,
} from 'react-native';
import { t } from '@core/i18n';
import { toMessage } from '@core/lib/app-error';
import {
  createReadingEditor,
  type Ask,
  type Change,
  type Note,
  type ReadingEditor,
} from '@core/lib/reading-editor';
import { toMarkup, toPlainText, type KanjiRun, type ReadingCell } from '@core/lib/reading';
import { createRequiredFields, type FieldRef } from '@core/lib/required-fields';
import { newCard } from '@core/lib/review';
import { assertTermAvailable } from '@core/lib/storage';
import type { Book, Card } from '@core/lib/types';
import type { ReviewSession } from '../lib/review-session';
import { Term } from './term';
import { Toast } from './toast';
import { color, fontSize, SCREEN_INSET, TAP_SIZE, weight } from './theme';

/**
 * 這次開 app 期間上一張卡選的那本，新增卡片時的預設值。
 *
 * 只活在記憶體：不進 MMKV、也不進備份——它是連續加字時的手感，不是使用者的資料。
 * 位置與網頁版 `src/ui/editor-view.ts` 的同名變數一致。
 */
let lastBookId: string | null = null;

export interface CardEditorScreenProps {
  session: ReviewSession;
  /** 要編的那一張。**null 代表新增**。零本時進不來——那時候列表上根本沒有新增的入口。 */
  card: Card | null;
  /**
   * 去問 AI（Artificial Intelligence，人工智慧）讀音的那支函式。
   *
   * 由路由那一層遞進來而不是這裡自己 import，理由與觸覺、當前時間同一條：
   * `../lib/gemini-reading-native.ts` 底下是原生模組，在 Node 裡一沾上這一頁就整支測不動。
   * null 代表沒有人可問，讀音預填全程靜默。
   */
  ask: Ask | null;
  /** 存好了、取消了、或刪掉了。回列表。 */
  onDone(): void;
}

export function CardEditorScreen({ session, card, ask, onDone }: CardEditorScreenProps) {
  const { data } = session.snapshot();

  /**
   * 讀音格那台狀態機。**它不是 React 狀態**——它自己記著詞條與讀音格，
   * React 這一側只要知道「有東西變了」，與 `../lib/app-context.tsx` 對複習流程的
   * 態度相同（票 `02`：不引入 signal／store／observer）。
   *
   * 放在 ref 裡而不是 `useState`：詞條失焦去問 AI 的那條路要在回覆到達時比對
   * 「這份回覆還屬於同一台嗎」，而那一刻手上的閉包抓到的是舊的那個 state。
   */
  const editorRef = useRef<ReadingEditor | null>(null);
  editorRef.current ??= createReadingEditor({ markup: card?.text, ask });
  const editor = editorRef.current;

  /** 讓這個元件重畫一次。提示字與預覽沒有自己的號碼牌，靠它。 */
  const [, redraw] = useReducer((count: number) => count + 1, 0);

  /**
   * 兩處輸入框各自的號碼牌。號碼一變，那一格就整個重生、重新灌值。
   * 為什麼要分成兩格而不是一個，見檔頭〈輸入框一律「不受控」〉。
   *
   * **重生會失焦**，所以只有真的非重灌不可時才動它：詞條那一格是「貼上帶讀音標記的
   * 字串」（括號要被攤回格子，框裡只留純文字），讀音區那一邊是格子的數目或切法變了。
   * 「儲存並繼續」的清空**不走這裡**——那一下的要求正好相反，焦點要留在詞條上（見 `reset`）。
   */
  const [seed, setSeed] = useState({ term: 0, runs: 0 });
  const reseed = (which: keyof typeof seed) =>
    setSeed((current) => ({ ...current, [which]: current[which] + 1 }));

  /** 釋義。它不歸狀態機管，自己一格。用 ref 的理由與輸入框不受控是同一條。 */
  const meaningRef = useRef(card?.meaning ?? '');

  /**
   * 這張卡放哪一本。
   *
   * 上一張選的那本若已經被刪掉，`find` 找不到，退回清單第一本——與第一次進來同一個結果。
   */
  const [bookId, setBookId] = useState(
    card
      ? card.bookId
      : (data.books.find((book) => book.id === lastBookId)?.id ?? data.books[0]?.id ?? ''),
  );

  /** 按下儲存才會出現的那一行紅字。換欄鍵不出（ADR-0006）。 */
  const [error, setError] = useState('');

  /**
   * 剛存完那一則。`seq` 是給 `<Toast>` 當 `key` 用的——連著存兩張時整支重生，
   * 計時器跟著重來，不會被上一則的三秒接手收掉。
   */
  const [saved, setSaved] = useState<{ text: string; seq: number } | null>(null);

  /** 單字本選單開著沒。 */
  const [picking, setPicking] = useState(false);

  const termRef = useRef<TextInputType | null>(null);
  const meaningInputRef = useRef<TextInputType | null>(null);
  /**
   * 讀音格的輸入框，攤平後由左到右——序號與 `editor.runs` 一致，必填格數的也是這個。
   *
   * 讀音格重畫時舊的那幾支會被同一組序號覆蓋掉。數量變少時尾巴那幾筆會留著，
   * 那沒有關係：查的序號永遠小於現在的格數，取不到過期的那幾支。
   */
  const readingRefs = useRef(new Map<number, TextInputType | null>());

  /**
   * 照單辦事。預覽由 `term` 與 `runs` 組出來，任何改動都要刷，因此不進變更單——
   * 這裡一律 `redraw()`，與網頁版每次都叫 `refreshPreview()` 是同一件事。
   */
  const apply = (change: Change) => {
    if (change.term) reseed('term');
    if (change.runs) reseed('runs');
    redraw();
  };

  // ── 必填格：畫面只負責把輸入框翻成序號，再把它回的序號翻回輸入框 ──────────

  /**
   * 目前每一格讀音的字。
   *
   * **值取自狀態機而不是輸入框。** 網頁版那邊取的是 DOM 上的 `value`，因為那些字只有
   * 瀏覽器記著；這裡每打一個字都會經過 `editor.setReading()`，狀態機手上那份就是最新的。
   */
  const readingValues = () => editor.runs.flatMap((run) => run.cells.map((cell) => cell.reading));

  const fields = createRequiredFields({
    term: () => editor.term,
    readings: readingValues,
    meaning: () => meaningRef.current,
    prefilling: () => editor.prefilling,
  });

  /** 必填格 → 輸入框。序號是必填格剛從 `runs` 數出來的，一定找得到。 */
  const focusField = (ref: FieldRef): void => {
    switch (ref.kind) {
      case 'term':
        termRef.current?.focus();
        return;
      case 'meaning':
        meaningInputRef.current?.focus();
        return;
      case 'reading':
        readingRefs.current.get(ref.index)?.focus();
    }
  };

  /**
   * 換欄鍵（iOS 鍵盤右下角那顆 return）。
   *
   * 還有空格時只把游標送過去，不出紅字也不儲存；全部有值才放行去存（ADR-0006）。
   * `submitBehavior="submit"` 讓這一下不收鍵盤——跳過去可以直接接著打。
   *
   * > **網頁版還有第二條路：失焦也換欄。** 那一條是為了 iPhone Safari 鍵盤上方那條橫條
   * > 右端的「完了」——它是純系統 UI，按下去網頁只收到 `blur`、沒有任何按鍵事件，
   * > 那件事因此只能掛在失焦上。**React Native 的 `TextInput` 沒有那條橫條**，
   * > 收鍵盤的入口不存在，也就沒有那個只發 blur 的按鍵。這裡因此只做 return 這一條，
   * > 不把一段補丁連同它的兩條前提一起搬過來（票 `16` 明講不照抄那類 DOM 補丁）。
   *
   * > **網頁版第一行的 `event.isComposing` 這裡也沒有對應的一句。** 那一條擋的是「輸入法
   * > 正在組字，這一下 Enter 是在確定候選字，不是要往下走」。React Native 上不必自己擋：
   * > 組字期間那顆鍵被 UIKit 的輸入法收走，`onSubmitEditing` 根本不會發——瀏覽器那邊
   * > 是因為 `keydown` 一律送到頁面上才需要自己分辨。**這一條列在真機驗收裡**，
   * > 日文九宮格打到一半按 return 若真的跳了欄，就是這個推論不成立。
   */
  const jumpOnSubmit = (from: FieldRef): void => {
    const jump = fields.nextEmpty(from);
    // stay 是「離開的那一格還空著」，什麼都不該發生——送出去反而會冒出一行
    // 「我要存」才該有的紅字。
    if (jump.kind === 'stay') return;
    if (jump.kind === 'move') {
      focusField(jump.to);
      return;
    }
    // done：全部有值，放行。新增模式的送出是「儲存並繼續」，編輯模式是唯一那顆「儲存」。
    submit();
  };

  // ── 儲存 ────────────────────────────────────────────────────────

  /** 兩顆按鈕共用的驗證與儲存。存好回這張卡的讀音標記，驗證沒過回 null 並留下錯誤那行。 */
  const saveCard = (): string | null => {
    // 三處「沒填」合成同一句紅字，游標落在第一個該填的地方。順序由必填格決定（ADR-0009）：
    // 詞條 → 釋義 → 讀音格，刻意與畫面由上而下不同。
    const blocking = fields.firstBlocking();
    if (blocking !== null) {
      // 不指名是哪一格——游標已經指路。
      setError(t('editor.blankFields'));
      focusField(blocking);
      return null;
    }
    const result = editor.commit();
    // 讀音「填了但不是假名」不同路：列出每一條，游標不動——錯可能一次好幾個（ADR-0006）。
    if (!result.ok) {
      setError(result.errors.join(t('editor.errorSeparator')));
      return null;
    }
    const text = result.text;
    // 詞條全域唯一：撞到已經有卡的詞時擋在這裡，與空欄同一個時機、同一行紅字。
    // 訊息由資料存取模組給，它說得出那個詞現在在哪一本。
    try {
      assertTermAvailable(session.snapshot().data, text, card?.id);
    } catch (reason) {
      // 帶 key 的錯要查表才變成字（`ADR-0013`），畫面層一律走 toMessage()。
      setError(toMessage(reason));
      return null;
    }
    // 存進去的釋義去掉頭尾空白；「還空著」那條已經由必填格擋過，這裡只是不留空白進資料。
    const meaning = meaningRef.current.trim();
    // 存成功才記住，下一張新卡就預設同一本——連續往同一本加字時不必每次重選。
    lastBookId = bookId;
    /**
     * **改單字本等於搬家，`interval`／`ease`／`due` 一律不動**：整張卡展開之後只覆蓋
     * 三格（`bookId`、`text`、`meaning`），排程那三格原封不動地跟著過去。
     *
     * 走 `session.upsertCard()` 而不是自己 `store.save()`——那台機器手上握著資料，
     * 繞過它寫檔的話它就停在舊快照，下一次評分會把這裡的改動整批蓋掉。
     */
    session.upsertCard(
      card
        ? { ...card, bookId, text, meaning }
        : newCard(crypto.randomUUID(), bookId, text, meaning),
    );
    return text;
  };

  /**
   * 清回剛進新增頁的樣子：草稿、提示字、錯誤那行全部帶走，焦點回到詞條。
   *
   * **詞條與釋義是用 `clear()` 清的，不是換 `key` 重生。** 這一條是被逼出來的：換 `key`
   * 等於把那個輸入框卸下來、裝一個新的，而新的那個沒有焦點——「焦點回到詞條」當場跳票。
   * （更糟的是連 `focus()` 都打不中：那一下同步跑，而重生要等 React 把狀態換上去之後才發生，
   * 焦點於是打在一個馬上要被丟掉的輸入框上。）
   *
   * `clear()` 不換節點，所以焦點留得住，`focus()` 也對得到人。它不會觸發 `onChangeText`，
   * 但那不要緊——上一行已經換了一台空的狀態機，兩邊講的是同一件事。
   *
   * 讀音區沒有這個顧慮，照舊換號碼牌整區重生：那一區本來就沒有焦點（詞條清空之後
   * 一格都不剩）。
   */
  const reset = () => {
    editorRef.current = createReadingEditor({ ask });
    meaningRef.current = '';
    setError('');
    termRef.current?.clear();
    meaningInputRef.current?.clear();
    reseed('runs');
    termRef.current?.focus();
  };

  /**
   * 送出。新增模式是「儲存並繼續」，編輯模式是唯一那顆「儲存」——與網頁版 `form` 的
   * `submit` 對應同一件事，換欄鍵放行時走的也是這一支。
   */
  const submit = () => {
    const text = saveCard();
    if (text === null) return;
    if (card) {
      onDone();
      return;
    }
    // 留在原地又被清空，是唯一分不出「存進去了」還是「白打一場」的時刻。
    // 措辭只講本機那一份：推雲端失敗與否不歸這一行講。
    setSaved((current) => ({
      text: t('editor.saved', { term: toPlainText(text) }),
      seq: (current?.seq ?? 0) + 1,
    }));
    reset();
  };

  /** 只存不繼續。新增模式那顆次要的「儲存」走這條。 */
  const saveAndLeave = () => {
    if (saveCard() !== null) onDone();
  };

  /**
   * 刪除。**React Native 上沒有 `confirm()`**，改用 `Alert.alert()`——那是原生的警示窗，
   * 而且是非同步的：按鈕的處理器在使用者選完之後才跑，不像網頁版那一行
   * `if (!confirm(...)) return;` 當場擋住。做法與 `./book-scope-sheet.tsx` 刪單字本一致。
   *
   * 「刪除」那顆走 `destructive` 樣式，而且**不是預設選項**（HIG `B-06`）。
   */
  const confirmDelete = () => {
    if (card === null) return;
    Alert.alert(t('editor.deleteCard'), t('editor.deleteConfirm', { meaning: card.meaning }), [
      { text: t('editor.cancel'), style: 'cancel' },
      {
        text: t('editor.deleteCard'),
        style: 'destructive',
        onPress: () => {
          session.removeCard(card.id);
          onDone();
        },
      },
    ]);
  };

  // ── 讀音區 ──────────────────────────────────────────────────────

  /**
   * 一整串連續漢字。格與格之間是合併的接縫，一格裡的字與字之間是切割的接縫。
   *
   * **`flexWrap` 換行是必要的。** 每個接縫的觸控目標是 44 點見方（HIG `B-01`），
   * 五、六個漢字的長串橫著排一定超出螢幕寬度——不換行的話右邊那幾格會被擠出去，
   * 不是難看而已，是按不到。票 `16` 的〈已知風險〉標的就是這件事：
   * 「44pt 的觸控方塊塞在字與字之間，會把詞條撐得很開」，維護者已知並選擇先做出來。
   */
  const renderRun = (run: KanjiRun, ri: number, offset: number) => (
    <View key={ri} style={styles.run}>
      {run.cells.map((cell, ci) => (
        // 同一串漢字可能重複出現，key 因此帶位置。
        <View key={`${ci}-${cell.kanji}`} style={styles.cellGroup}>
          {ci > 0 && (
            <Seam
              mark="⊕"
              label={t('editor.mergeLabel', {
                left: run.cells[ci - 1]!.kanji,
                right: cell.kanji,
              })}
              onPress={() => apply(editor.mergeAt(ri, ci - 1))}
            />
          )}
          {renderCell(cell, ri, ci, offset + ci)}
        </View>
      ))}
    </View>
  );

  /** 一格：上面是漢字（字與字之間夾著切割的接縫），下面是那一格的讀音。 */
  const renderCell = (cell: ReadingCell, ri: number, ci: number, flatIndex: number) => (
    <View style={styles.cell}>
      <View style={styles.kanjiRow}>
        {[...cell.kanji].map((char, k) => (
          <View key={`${k}-${char}`} style={styles.charGroup}>
            {k > 0 && (
              // 第 k 個字前的縫：只把這格從第 k 字切成左右兩格，其餘不動。
              <Seam
                mark="·"
                label={t('editor.splitLabel', {
                  left: cell.kanji.slice(0, k),
                  right: cell.kanji.slice(k),
                })}
                onPress={() => apply(editor.splitAt(ri, ci, k))}
              />
            )}
            <Text style={styles.char}>{char}</Text>
          </View>
        ))}
      </View>
      <TextInput
        // 號碼牌一變就重生、重新灌值。理由見檔頭〈輸入框一律「不受控」〉。
        key={`${seed.runs}-${flatIndex}`}
        ref={(node) => {
          readingRefs.current.set(flatIndex, node);
        }}
        defaultValue={cell.reading}
        onChangeText={(value) => apply(editor.setReading(ri, ci, value))}
        onSubmitEditing={() => jumpOnSubmit({ kind: 'reading', index: flatIndex })}
        submitBehavior="submit"
        returnKeyType="next"
        autoCapitalize="none"
        autoCorrect={false}
        // 整區五格都唸「讀音」的話聽起來一模一樣，帶上這一格管的是哪幾個漢字。
        accessibilityLabel={t('editor.readingOf', { kanji: cell.kanji })}
        style={styles.readingInput}
      />
    </View>
  );

  /**
   * 每一串的第一格在攤平序號裡排第幾。第二串的第一格接在第一串最後一格之後。
   *
   * 先算好一份而不是邊畫邊累加：畫的過程中改一個外面的變數，React 只要重跑一次
   * render（它隨時可以）數字就會翻倍。
   */
  const runOffsets = editor.runs.map((_, index) =>
    editor.runs.slice(0, index).reduce((total, run) => total + run.cells.length, 0),
  );

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          title: card ? t('editor.titleEdit') : t('editor.titleNew'),
          headerTitleAlign: 'center',
          /**
           * 「取消」頂掉系統的返回鍵。
           *
           * **這一頁是表單，不是往下一層看東西**——iOS 上表單的左上角是「取消」，
           * 不是返回箭頭（`HIG N-10` 要的是「用系統的按鈕，不要自己畫」，
           * 而不是「一律用箭頭」）。往回滑那個手勢仍然在，沒有被拿掉。
           *
           * 它掛在導覽列上、不在捲動區裡，因此**鍵盤開著時按得到**：
           * 底下那條 `keyboardShouldPersistTaps` 管的是捲動區內的按鈕，跟它無關。
           */
          headerLeft: () => (
            <Pressable onPress={onDone} accessibilityRole="button" hitSlop={12}>
              {({ pressed }) => (
                <Text style={[styles.headerAction, pressed && styles.pressed]}>
                  {t('editor.cancel')}
                </Text>
              )}
            </Pressable>
          ),
        }}
      />

      <ScrollView
        contentContainerStyle={styles.form}
        // 導覽列是玻璃的（見 `../app/cards/_layout.tsx`），內容從它底下穿過去，
        // 讓系統自己算要讓開多少。
        contentInsetAdjustmentBehavior="automatic"
        /**
         * **鍵盤開著時，按鈕第一下就按得到。**
         *
         * 這是票 `16` 要求「在 React Native 上重新確認一次」的那件事。預設值是
         * `'never'`：鍵盤開著時第一下觸控只用來收鍵盤，按鈕收不到那一下，
         * 使用者得按第二次——與網頁版那個 `pointerdown` 補丁擋的是同一種白按，
         * 只是這裡不必自己立旗子，換一個值就好。
         */
        keyboardShouldPersistTaps="handled"
        // 鍵盤升起來時捲動區自己讓開，正在打的那一格不會被蓋住。
        automaticallyAdjustKeyboardInsets
      >
        {/* 單字本排在詞條之前：先決定這張卡放哪裡，再打內容。 */}
        <Labelled text={t('editor.labelBook')}>
          <Pressable
            onPress={() => setPicking(true)}
            accessibilityRole="button"
            accessibilityLabel={t('editor.labelBook')}
            accessibilityValue={{ text: bookName(data.books, bookId) }}
          >
            {({ pressed }) => (
              <View style={[styles.field, styles.pickerRow, pressed && styles.pressed]}>
                <Text style={styles.fieldText}>{bookName(data.books, bookId)}</Text>
                {/* 按下去會開一張選單，右邊因此要有那個 chevron——iOS 上它就是這個意思。 */}
                <Text style={styles.chevron} accessible={false}>
                  {'›'}
                </Text>
              </View>
            )}
          </Pressable>
        </Labelled>

        <Labelled text={t('editor.labelTerm')}>
          <TextInput
            key={seed.term}
            ref={termRef}
            defaultValue={editor.term}
            placeholder={t('editor.termPlaceholder')}
            placeholderTextColor={color.tertiaryLabel}
            onChangeText={(value) => apply(editor.setTerm(value))}
            /**
             * 詞條打完離開輸入框時去問一次 AI。守門沒過的話兩張單子都是空的，
             * 什麼都不會動。
             */
            onBlur={() => {
              // 這一輪問話屬於哪一台狀態機。中途按了「儲存並繼續」的話，回來的那兩份單子
              // 對的是上一張：內容不會被抄過來（`apply` 讀的是新的那台），但重畫讀音區
              // 會讓正在打的下一張失焦。重試回報與最後那份回覆走同一道守門，
              // 兩邊漂移的下場一樣。
              const mine = editor;
              const stillMine = () => mine === editorRef.current;
              const { now, later } = mine.prefill((change) => {
                if (stillMine()) apply(change);
              });
              apply(now);
              void later.then((change) => {
                if (stillMine()) apply(change);
              });
            }}
            onSubmitEditing={() => jumpOnSubmit({ kind: 'term' })}
            submitBehavior="submit"
            returnKeyType="next"
            autoCapitalize="none"
            autoCorrect={false}
            // 尾端那顆清除鈕（HIG `F-09`）：整串重打時不必按著刪除鍵不放。
            // 讀音格不給——那幾格只放一兩個假名，一顆鈕塞進去反而擠掉了字。
            clearButtonMode="while-editing"
            style={[styles.field, styles.fieldText]}
          />
        </Labelled>

        <View style={styles.labelled}>
          <Text style={styles.labelText}>{t('editor.labelReading')}</Text>
          {/* 提示字：詢問中、AI 填好了、或失敗的原因。**沒話講時整行不留空隙**——
              這裡是條件渲染而不是畫一個空的 `<Text>`，否則 `gap` 會留下一道縫。 */}
          {editor.note !== null && <NoteLine note={editor.note} />}
          {editor.runs.length === 0 ? (
            <Text style={styles.hint}>{t('editor.noKanji')}</Text>
          ) : (
            editor.runs.map((run, ri) => renderRun(run, ri, runOffsets[ri]!))
          )}
        </View>

        <View style={styles.labelled}>
          <Text style={styles.labelText}>{t('editor.labelPreview')}</Text>
          {/* 預覽一律看「組出來的標記字串」，行為與網頁版一致。 */}
          <View style={styles.preview}>
            <Term text={toMarkup({ term: editor.term, runs: editor.runs })} showReading />
          </View>
        </View>

        <Labelled text={t('editor.labelMeaning')}>
          <TextInput
            // 這一格沒有號碼牌：它從頭到尾只被兩件事改過——使用者自己打，以及
            // 「儲存並繼續」的清空，而後者走的是 `clear()`（見 `reset`）。
            ref={meaningInputRef}
            defaultValue={meaningRef.current}
            placeholder={t('editor.meaningPlaceholder')}
            placeholderTextColor={color.tertiaryLabel}
            onChangeText={(value) => {
              meaningRef.current = value;
            }}
            onSubmitEditing={() => jumpOnSubmit({ kind: 'meaning' })}
            submitBehavior="submit"
            returnKeyType="next"
            clearButtonMode="while-editing"
            style={[styles.field, styles.fieldText]}
          />
        </Labelled>

        {/* 錯誤那行只在按下儲存之後才有字。沒話講時同樣整行不留。 */}
        {error !== '' && <Text style={styles.error}>{error}</Text>}

        {card === null ? (
          <View style={styles.actions}>
            {/* 兩顆同尺寸，用樣式而不是尺寸分主次（HIG `B-05`）。 */}
            <FormButton kind="secondary" label={t('editor.save')} onPress={saveAndLeave} />
            <FormButton kind="primary" label={t('editor.saveAndContinue')} onPress={submit} />
          </View>
        ) : (
          <View style={styles.actions}>
            <FormButton kind="primary" label={t('editor.save')} onPress={submit} />
          </View>
        )}

        {/* 刪除離其他按鈕遠一點，不會順手按到。 */}
        {card !== null && (
          <View style={styles.danger}>
            <FormButton kind="danger" label={t('editor.deleteCard')} onPress={confirmDelete} />
          </View>
        )}
      </ScrollView>

      <BookPicker
        visible={picking}
        books={data.books}
        selectedId={bookId}
        onPick={(next) => {
          setBookId(next);
          setPicking(false);
        }}
        onClose={() => setPicking(false)}
      />

      {saved !== null && (
        // `key` 換了整支重生，計時器跟著重來。理由見 `./toast.tsx`。
        <Toast key={saved.seq} message={saved.text} onHide={() => setSaved(null)} />
      )}

    </View>
  );
}

function bookName(books: readonly Book[], id: string): string {
  return books.find((book) => book.id === id)?.name ?? t('books.unknownBook');
}

interface LabelledProps {
  text: string;
  children: React.ReactNode;
}

/** 一格：上面一行標籤，下面那個控制項。 */
function Labelled({ text, children }: LabelledProps) {
  return (
    <View style={styles.labelled}>
      <Text style={styles.labelText}>{text}</Text>
      {children}
    </View>
  );
}

/**
 * 讀音區上方那一行。**狀態代號翻成使用者看到的那一行字與樣式**——措辭與樣式屬於畫面，
 * 不進讀音編輯器（那一層只吐狀態代號，中文一個字都沒有）。
 */
function NoteLine({ note }: { note: Note }) {
  switch (note.kind) {
    case 'asking':
      return <Text style={styles.hint}>{t('editor.noteAsking')}</Text>;
    case 'retrying':
      return <Text style={styles.hint}>{t('editor.noteRetrying', { attempt: note.attempt })}</Text>;
    case 'filled':
      return <Text style={styles.hint}>{t('editor.noteFilled')}</Text>;
    case 'failed':
      return <Text style={styles.error}>{t('editor.noteFailed', { reason: note.reason })}</Text>;
  }
}

interface SeamProps {
  /** 看得到的那個符號。⊕ 是合併，· 是切割。 */
  mark: string;
  /** 唸出來的那句話。鈕面上只有一個符號，少了它 VoiceOver 只會唸「按鈕」。 */
  label: string;
  onPress(): void;
}

/**
 * 格與格、字與字之間那個接縫。
 *
 * **觸控目標 44 點見方**（票 `16` 定死：照網頁版的做法，把觸控區撐到 HIG `B-01` 的下限）。
 * 這裡是真的佔掉 44 點寬，不是用 `hitSlop` 偷偷擴大——兩顆相鄰的接縫用 `hitSlop`
 * 會互相重疊，按下去分不出是哪一顆。
 *
 * 代價寫在票的〈已知風險〉裡：長詞會被撐得很開。維護者已知並選擇先做出來。
 *
 * > 票面原本還寫著「視覺上的符號維持小顆」。**2026-09-01 真機看過之後改掉了**：
 * > 灰色的小符號在螢幕上看不清楚，維護者指定上藍色、字級對齊網頁版。
 * > 44 那一格沒有跟著動——那是觸控區的下限，與符號多大是兩件事。
 * > 顏色與字級的細節見底下 `styles.seamMark`。
 */
function Seam({ mark, label, onPress }: SeamProps) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      {({ pressed }) => (
        <View style={[styles.seam, pressed && styles.seamPressed]}>
          <Text style={styles.seamMark}>{mark}</Text>
        </View>
      )}
    </Pressable>
  );
}

interface FormButtonProps {
  kind: 'primary' | 'secondary' | 'danger';
  label: string;
  onPress(): void;
}

/**
 * 表單底下那幾顆。**它們是內容層的按鈕，不套玻璃**（HIG `M-01`）——玻璃只給控制與導覽
 * 那一層，這一頁上屬於那一層的是導覽列。底色走標準材質那一組（`M-02`），
 * 與 `./icon-button.tsx` 同一個立場。
 *
 * 主要動作**只有一顆**，而且顏色上在文字不上在背景（`M-10`、`B-04`），
 * 與複習畫面的「顯示答案」同一個處理。
 *
 * > **`secondary` 底下沒有任何一行樣式，那不是漏掉的。** 三顆鈕形狀、底色、尺寸都一樣
 * > （`B-05`：同一組用樣式而不是尺寸分主次），差別只在字的顏色，而 `secondary` 要的
 * > 正是預設那個色。`M-10` 說一頁只給一個強調，所以「沒有顏色」本身就是這一顆的樣子——
 * > 替它補一格空樣式只會讓下一個人以為那裡還缺東西。
 */
function FormButton({ kind, label, onPress }: FormButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      // 同一組選項同尺寸，用樣式而不是尺寸區分主次（HIG `B-05`）。
      style={styles.buttonSlot}
    >
      {({ pressed }) => (
        <View style={[styles.button, pressed && styles.pressed]}>
          <Text
            style={[
              styles.buttonLabel,
              kind === 'primary' && styles.primaryLabel,
              kind === 'danger' && styles.dangerLabel,
            ]}
          >
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

interface BookPickerProps {
  visible: boolean;
  books: readonly Book[];
  selectedId: string;
  onPick(bookId: string): void;
  onClose(): void;
}

/**
 * 選一本。**單選，與 `./book-scope-sheet.tsx` 那張多選的不是同一件事**——
 * 那一張管的是「列表要顯示哪幾本」，這一張問的是「這張卡放哪一本」，
 * 而一張卡只住在一本裡。硬要共用會讓那支元件多長出一個模式開關。
 *
 * `presentationStyle="pageSheet"` 拿的是 UIKit 自己那張卡片式的 sheet：頂端的把手、
 * 往下滑收起來、圓角，全部由系統畫。
 */
function BookPicker({ visible, books, selectedId, onPick, onClose }: BookPickerProps) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.sheet}>
        <Text style={styles.sheetTitle}>{t('editor.labelBook')}</Text>
        <ScrollView>
          {books.map((book) => {
            const chosen = book.id === selectedId;
            return (
              <Pressable
                key={book.id}
                onPress={() => onPick(book.id)}
                accessibilityRole="button"
                // 選項式的列要留下一個符號，不能只閃一下（HIG `LT-02`）。
                accessibilityState={{ selected: chosen }}
                style={({ pressed }) => [styles.sheetRow, pressed && styles.pressed]}
              >
                <Text style={styles.sheetRowText}>{book.name}</Text>
                {chosen && (
                  <Text style={styles.check} accessible={false}>
                    ✓
                  </Text>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: color.background,
  },
  form: {
    gap: 20,
    paddingHorizontal: SCREEN_INSET,
    paddingTop: 12,
    // 底部留白：tab bar 浮在內容之上，捲到底時最後那顆鈕要能露出來（HIG `L-02`）。
    paddingBottom: 120,
  },
  labelled: {
    gap: 8,
  },
  labelText: {
    color: color.secondaryLabel,
    fontSize: fontSize.footnote,
    fontWeight: weight.semibold,
  },
  /**
   * 一格輸入框。底色走標準材質那一組（HIG `M-02`），不是玻璃——它是內容層的東西。
   *
   * `minHeight` 是 44（`B-01`、`B-02`），字級變大時由內距把它撐開。
   */
  field: {
    minHeight: TAP_SIZE,
    backgroundColor: color.card,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  fieldText: {
    color: color.label,
    fontSize: fontSize.body,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chevron: {
    color: color.tertiaryLabel,
    fontSize: fontSize.body,
    fontWeight: weight.semibold,
  },
  /** 一整串連續漢字。塞不下就換行，理由見 `renderRun()`。 */
  run: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
  },
  /** 一個接縫加它右邊那一格，綁在一起才不會被換行拆散。 */
  cellGroup: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  cell: {
    alignItems: 'center',
    gap: 4,
  },
  kanjiRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  charGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  char: {
    color: color.label,
    fontSize: fontSize.title3,
    fontWeight: weight.medium,
  },
  /**
   * 那一格的讀音。寬度至少放得下三個假名，比漢字窄的話那一欄看起來會歪。
   * 高度仍然是 44（`B-01`）。
   */
  readingInput: {
    minWidth: 64,
    minHeight: TAP_SIZE,
    backgroundColor: color.card,
    borderRadius: 10,
    paddingHorizontal: 8,
    color: color.label,
    fontSize: fontSize.subheadline,
    textAlign: 'center',
  },
  /** 接縫的觸控目標。44 見方是硬性下限（HIG `B-01`）。 */
  seam: {
    width: TAP_SIZE,
    height: TAP_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /**
   * 那個符號。**上藍色，而且與網頁版同一個字級**（2026-09-01 維護者在真機上看過灰色的
   * 小符號之後指定改的：不夠清楚）。
   *
   * 字級對照網頁版 `src/styles.css` 的 `.reading-seam`（`1.1rem`，也就是 17.6）。
   * 這裡取 `fontSize.headline`（17）——差的那 0.6 看不出來，而走字級表這件事讓它
   * 跟著 Dynamic Type 一起長（`T-02`、`T-06`）。原本是 `footnote`（13）。
   *
   * **顏色走 `systemBlue` 而不是網頁版那個 `#6ea8ff`**（2026-09-01 拍板）。理由是這一顆
   * **按得下去**，而 `color.accent` 在這個 codebase 裡管的就是那件事——`./term.tsx` 的
   * 振假名刻意不用它，正是因為振假名按不下去。網頁版兩者同色，手機上刻意分開。
   * 附帶好處是「提高對比」打開時它跟著調（`T-11`），寫死的色碼做不到。
   *
   * > **撐大的仍然只有符號，觸控區沒動**：那一格是 44 見方（見底下 `seam`），
   * > 票 `16` 定死的那個下限一個點都沒少。
   */
  seamMark: {
    color: color.accent,
    fontSize: fontSize.headline,
  },
  /**
   * 按下去的樣子（HIG `B-03`）。接縫太小，縮放看不出來，改成整個亮起來。
   *
   * 圓角抄網頁版 `.reading-seam` 的 `0.5rem`（8）——那邊是圓角方塊不是圓形。
   * 原本這裡取 `TAP_SIZE / 2` 畫成正圓，換過來讓兩邊按起來長得一樣。
   */
  seamPressed: {
    backgroundColor: color.fill,
    borderRadius: 8,
  },
  preview: {
    alignItems: 'flex-start',
    minHeight: TAP_SIZE,
    justifyContent: 'center',
  },
  hint: {
    color: color.secondaryLabel,
    fontSize: fontSize.footnote,
  },
  error: {
    color: color.danger,
    fontSize: fontSize.footnote,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  /**
   * 刪除離其他按鈕遠一點，不會順手按到。加上 `form` 那 20 的 gap，實際間距是 32——
   * 沒有邊框的控制項之間至少留 24（HIG `L-11`），這一顆是破壞性的，再多給一點。
   */
  danger: {
    marginTop: 12,
  },
  buttonSlot: {
    flex: 1,
  },
  button: {
    minHeight: TAP_SIZE,
    backgroundColor: color.card,
    // 大面積的元件用圓角矩形，不是膠囊（HIG `B-13`）。值抄網頁版 `src/styles.css`
    // 的 `.actions > button`（`0.75rem`），兩邊因此長得一樣。
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  buttonLabel: {
    color: color.label,
    fontSize: fontSize.headline,
    fontWeight: weight.medium,
    textAlign: 'center',
  },
  /** 主要動作。一頁只有一顆（HIG `M-10`、`B-04`）。 */
  primaryLabel: {
    color: color.accent,
    fontWeight: weight.semibold,
  },
  /**
   * 破壞性動作。**顏色不是唯一的訊號**（HIG `T-14`）：按下去還有一張講明後果的警示窗，
   * 鈕面上那句話本身也講清楚了是哪一張卡，轉成灰階仍然讀得出來。
   */
  dangerLabel: {
    color: color.danger,
  },
  headerAction: {
    color: color.accent,
    fontSize: fontSize.body,
  },
  /** 按下去的樣子（HIG `B-03`）。與 `./glass-pill.tsx` 用同一組數字。 */
  pressed: {
    opacity: 0.8,
  },
  sheet: {
    flex: 1,
    backgroundColor: color.background,
    paddingTop: 20,
  },
  sheetTitle: {
    color: color.label,
    fontSize: fontSize.title3,
    fontWeight: weight.semibold,
    paddingHorizontal: SCREEN_INSET,
    paddingBottom: 12,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: TAP_SIZE,
    paddingHorizontal: SCREEN_INSET,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.separator,
  },
  sheetRowText: {
    flex: 1,
    color: color.label,
    fontSize: fontSize.body,
  },
  check: {
    color: color.accent,
    fontSize: fontSize.body,
    fontWeight: weight.semibold,
  },
});
