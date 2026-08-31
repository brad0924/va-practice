/**
 * 單字本那顆膠囊，與它點開的那張 sheet。**兩個畫面共用這一支。**
 *
 * 對照的是網頁版 `src/ui/book-filter.ts` 的 `pill` 版。**行為照抄，做法不抄**：
 * 那邊是自己畫的下拉選單，加上「點外面收起來」「Esc 收起來」「空白鍵讓路」三段接線；
 * 這裡交給系統的 sheet，那三件事系統自己會做（往下滑收起來、點外面收起來）。
 *
 * 兩條規則與網頁版一字不差：
 * - 已經全勾時「全部」那一列鎖起來——它沒有事情可做。
 * - 取消它會讓範圍空掉的那一本鎖起來，含「只剩一本單字本」那個情況。
 *   最後一道守門在 `core/lib/storage.ts` 的 `setScope()`，那裡會直接丟例外。
 *
 * ## 兩種模式，差別只在 `manage`
 *
 * 不給 `manage` 就只有勾選——複習畫面走這條，那一頁只決定「複習哪幾本」。
 * 給了 `manage` 就多長出維護鈕與「＋ 新增單字本」，卡片列表走這條（票 `15`）。
 *
 * **管理併進同一張 sheet 是 2026-08-31 拍板的**（圖版二·甲）：使用者心裡「單字本」
 * 是一件事，拆成兩個入口就要記兩個地方。網頁版資料頁那一區也是同一個結構——
 * 一列一本，左邊勾選框管範圍，展開才有維護鈕。
 */
import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { t } from '@core/i18n';
import { toMessage } from '@core/lib/app-error';
import { scopeLabel } from '@core/lib/book-scope';
import type { ImportSkip } from '@core/lib/storage';
import type { Book } from '@core/lib/types';
import { GlassPill } from './glass-pill';
import { color, fontSize, SCREEN_INSET, TAP_SIZE, weight } from './theme';

/** 剛結束的那一次匯入，畫在那一本底下。失敗時 `skipped` 必為空。 */
export interface ImportOutcome {
  bookId: string;
  message: string;
  failed: boolean;
  skipped: ImportSkip[];
}

/**
 * 管理那一半。給了這一組，sheet 每一列才點得開、底下才有「新增單字本」。
 *
 * **四支動作都可以丟例外。** 名字空白、名字重複、匯入的檔壞掉，判斷全在
 * `core/lib/storage.ts`，這裡只負責把它說的話翻成畫面上看得到的紅字
 * （走 `toMessage()` 查表，`ADR-0013`）。
 */
export interface BookManage {
  /** 這一本有幾張卡。畫在本名後面，也是刪除確認裡那個數字。 */
  cardCount(bookId: string): number;
  add(name: string): void;
  rename(bookId: string, name: string): void;
  /** 確認對話由這支元件負責（`Alert.alert()`），走到這裡就是真的要刪。 */
  remove(bookId: string): void;
  /** 選檔與讀檔由呼叫端做，結果透過 `outcome` 傳回來。 */
  importWords(bookId: string): void;
  outcome: ImportOutcome | null;
  /** 匯入結果只屬於剛才那一次操作，換一本或關掉 sheet 就該消失。 */
  clearOutcome(): void;
}

export interface BookScopeSheetProps {
  books: readonly Book[];
  selected: readonly string[];
  onChange(bookIds: string[]): void;
  manage?: BookManage;
  /**
   * 觸發鈕上的字。不給就是目前的範圍（`全部 ▾`）。
   *
   * 卡片列表零本時傳的是「＋ 新增單字本」——那時候沒有範圍可講，而那顆鈕唯一的用途
   * 就是建第一本。搭配 `openInAdd` 一起用。
   */
  triggerLabel?: string;
  /** 點開時直接進入新增單字本。零本畫面那顆鈕用它——按下去就是要建一本。 */
  openInAdd?: boolean;
}

export function BookScopeSheet({
  books,
  selected,
  onChange,
  manage,
  triggerLabel,
  openInAdd,
}: BookScopeSheetProps) {
  const [open, setOpen] = useState(false);
  /** 目前展開維護鈕的那一本。同時只展開一列，與網頁版相同。 */
  const [expandedId, setExpandedId] = useState<string | null>(null);
  /** 正在取名的對象：null 代表沒在取名，`{ id: null }` 是新增，帶 id 是改名。 */
  const [naming, setNaming] = useState<{ id: string | null } | null>(null);
  const all = selected.length === books.length;

  /** 一律照 books 的順序存回去，勾選的先後不影響存下來的樣子。 */
  function choose(wanted: Set<string>): void {
    onChange(books.filter((book) => wanted.has(book.id)).map((book) => book.id));
  }

  /** 收 sheet 時把展開、取名、匯入結果一起收乾淨——下次點開是新的一次操作。 */
  function close(): void {
    setOpen(false);
    setExpandedId(null);
    setNaming(null);
    manage?.clearOutcome();
  }

  function toggleRow(bookId: string): void {
    setNaming(null);
    manage?.clearOutcome();
    setExpandedId((current) => (current === bookId ? null : bookId));
  }

  const label = scopeLabel(books, selected);

  function show(): void {
    if (openInAdd === true) setNaming({ id: null });
    setOpen(true);
  }

  return (
    <>
      {/* 鈕面上是「全部 ▾」，唸出來要是「單字本：全部」——那個箭頭是給眼睛看的，
          而光唸「全部」講不出它管的是什麼。零本時鈕面換成一句完整的話，那時候
          沒有範圍可講，也就不需要那個箭頭。 */}
      <GlassPill
        onPress={show}
        accessibilityLabel={triggerLabel ?? t('filter.blockLabel', { scope: label })}
      >
        <Text style={styles.pillText}>{triggerLabel ?? `${label} ▾`}</Text>
      </GlassPill>

      {/* `presentationStyle="pageSheet"` 拿的是 UIKit 自己那張卡片式的 sheet：
          頂端的把手、往下滑收起來、圓角，全部由系統畫，不是自己模仿的。 */}
      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
        <View style={styles.sheet}>
          <View style={styles.sheetHead}>
            <View style={styles.sheetHeadText}>
              <Text style={styles.sheetTitle}>
                {manage ? t('books.sectionTitle') : t('filter.blockLabel', { scope: label })}
              </Text>
              {manage !== undefined && <Text style={styles.sheetHint}>{t('books.sheetHint')}</Text>}
            </View>
            {/* 管理模式下才有「完成」。這張 sheet 上會開鍵盤（取名），鍵盤蓋著時
                往下滑那條路不好走，得留一顆按得到的出口。純選擇模式沒有輸入框，
                維持與複習畫面一致、只靠下滑。 */}
            {manage !== undefined && (
              <Pressable onPress={close} accessibilityRole="button" hitSlop={12}>
                <Text style={styles.doneText}>{t('books.done')}</Text>
              </Pressable>
            )}
          </View>

          <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
            {/* 零本時不畫「全部」——它勾的是一個空的集合，是一列什麼都不管的勾。 */}
            {books.length > 0 && (
              <ScopeRow
                name={t('filter.all')}
                checked={all}
                locked={all}
                onToggle={() => choose(new Set(books.map((book) => book.id)))}
              />
            )}
            {books.map((book) => {
              const checked = selected.includes(book.id);
              const wanted = new Set(selected);
              if (checked) wanted.delete(book.id);
              else wanted.add(book.id);
              const expanded = manage !== undefined && expandedId === book.id;

              return (
                <View key={book.id}>
                  <ScopeRow
                    name={book.name}
                    checked={checked}
                    // 取消它會讓範圍空掉時就鎖起來，含「只剩一本單字本」那個情況。
                    locked={checked && selected.length === 1}
                    onToggle={() => choose(wanted)}
                    count={manage?.cardCount(book.id)}
                    expanded={manage === undefined ? undefined : expanded}
                    onExpand={manage === undefined ? undefined : () => toggleRow(book.id)}
                  />
                  {expanded && naming?.id === book.id && manage !== undefined && (
                    <NameForm
                      initial={book.name}
                      submitLabel={t('books.rename')}
                      onCancel={() => setNaming(null)}
                      onSubmit={(name) => {
                        manage.rename(book.id, name);
                        setNaming(null);
                      }}
                    />
                  )}
                  {expanded && naming?.id !== book.id && manage !== undefined && (
                    <BookTools
                      book={book}
                      count={manage.cardCount(book.id)}
                      onRename={() => setNaming({ id: book.id })}
                      onImport={() => manage.importWords(book.id)}
                      onDelete={() => {
                        setExpandedId(null);
                        manage.remove(book.id);
                      }}
                    />
                  )}
                  {expanded && manage?.outcome?.bookId === book.id && (
                    <Outcome outcome={manage.outcome} books={books} />
                  )}
                </View>
              );
            })}

            {manage !== undefined &&
              (naming?.id === null ? (
                <NameForm
                  initial=""
                  submitLabel={t('books.confirmAdd')}
                  onCancel={() => setNaming(null)}
                  onSubmit={(name) => {
                    manage.add(name);
                    setNaming(null);
                  }}
                />
              ) : (
                <Pressable
                  onPress={() => {
                    setExpandedId(null);
                    manage.clearOutcome();
                    setNaming({ id: null });
                  }}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.addRow, pressed && styles.rowPressed]}
                >
                  <Text style={styles.addText}>{t('books.addButton')}</Text>
                </Pressable>
              ))}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

interface ScopeRowProps {
  name: string;
  checked: boolean;
  locked: boolean;
  onToggle(): void;
  /** 這一本有幾張卡。純選擇模式不顯示。 */
  count?: number;
  /** 有值代表這一列展得開。`undefined` 就是純選擇模式，整列只有打勾。 */
  expanded?: boolean;
  onExpand?(): void;
}

/**
 * 一列一本。打勾用符號而不是只用顏色，轉成灰階仍讀得出來（HIG `T-14`）。
 *
 * 管理模式下這一列有**兩個獨立的觸控區**：左邊那塊切換打勾，右邊那塊展開維護鈕。
 * 兩塊各自撐滿 44pt 高（`B-01`），因此左邊那塊不必再另外給高度。
 */
function ScopeRow({ name, checked, locked, onToggle, count, expanded, onExpand }: ScopeRowProps) {
  const tick = (
    <Text style={[styles.rowMark, locked && styles.rowLocked]} accessible={false}>
      {checked ? '✓' : ''}
    </Text>
  );

  if (onExpand === undefined) {
    return (
      <Pressable
        onPress={onToggle}
        disabled={locked}
        accessibilityRole="checkbox"
        accessibilityState={{ checked, disabled: locked }}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      >
        <Text style={[styles.rowName, locked && styles.rowLocked]} numberOfLines={1}>
          {name}
        </Text>
        {tick}
      </Pressable>
    );
  }

  return (
    <View style={styles.row}>
      <Pressable
        onPress={onToggle}
        disabled={locked}
        accessibilityRole="checkbox"
        accessibilityState={{ checked, disabled: locked }}
        accessibilityLabel={t('books.listScopeCheckLabel', { name })}
        hitSlop={{ top: 8, bottom: 8 }}
        style={({ pressed }) => [styles.tick, pressed && styles.rowPressed]}
      >
        {tick}
      </Pressable>
      <Pressable
        onPress={onExpand}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        style={({ pressed }) => [styles.rowMain, pressed && styles.rowPressed]}
      >
        <Text style={styles.rowName} numberOfLines={1}>
          {name}
        </Text>
        {count !== undefined && <Text style={styles.rowCount}>{t('books.cardCount', { count })}</Text>}
        <Text style={styles.rowChevron}>{expanded ? '▾' : '▸'}</Text>
      </Pressable>
    </View>
  );
}

interface BookToolsProps {
  book: Book;
  count: number;
  onRename(): void;
  onImport(): void;
  onDelete(): void;
}

/** 展開那一列之後跟出來的三顆維護鈕。 */
function BookTools({ book, count, onRename, onImport, onDelete }: BookToolsProps) {
  /**
   * 刪除的確認。**React Native 上沒有 `confirm()`**，改用 `Alert.alert()`——
   * 那是原生的警示窗，而且是非同步的：按鈕的處理器在使用者選完之後才跑，
   * 不像網頁版那一行 `if (!confirm(...)) return;` 當場擋住。
   *
   * 「刪除」那顆走 `destructive` 樣式，而且**不是預設選項**（HIG `B-06`：破壞性動作
   * 不指定 primary role，即使它是最可能被選的那顆）——`cancelButtonIndex` 給的是取消。
   */
  const confirmDelete = () =>
    Alert.alert(t('books.delete'), t('books.deleteConfirm', { name: book.name, count }), [
      { text: t('books.cancel'), style: 'cancel' },
      { text: t('books.delete'), style: 'destructive', onPress: onDelete },
    ]);

  return (
    <View style={styles.tools}>
      <ToolButton label={t('books.rename')} onPress={onRename} />
      <ToolButton label={t('books.importWords')} onPress={onImport} />
      <ToolButton label={t('books.delete')} onPress={confirmDelete} danger />
    </View>
  );
}

function ToolButton({ label, onPress, danger }: { label: string; onPress(): void; danger?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.tool, pressed && styles.rowPressed]}
    >
      <Text style={[styles.toolText, danger === true && styles.toolDanger]}>{label}</Text>
    </Pressable>
  );
}

interface NameFormProps {
  initial: string;
  submitLabel: string;
  onCancel(): void;
  /** 名字不合法時直接丟例外，這支元件接住並就地寫紅字。 */
  onSubmit(name: string): void;
}

/**
 * 新增與改名共用的輸入介面。
 *
 * 名字違規的原因在按下確定才說，不邊打字邊提示——沿用網頁版 `books-section.ts` 的做法。
 * 就地寫紅字而不關掉表單，使用者打的字才留得住。
 */
function NameForm({ initial, submitLabel, onCancel, onSubmit }: NameFormProps) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState('');

  const submit = () => {
    try {
      onSubmit(value);
    } catch (reason) {
      // 帶 key 的錯要查表才變成字（`ADR-0013`），畫面層一律走 toMessage()。
      setError(toMessage(reason));
    }
  };

  return (
    <View style={styles.form}>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={setValue}
        placeholder={t('books.namePlaceholder')}
        placeholderTextColor={styles.placeholder.color}
        autoCapitalize="none"
        autoCorrect={false}
        // 按了「新增」就是要打字，游標自己落進去，手機上少點一下。
        autoFocus
        // 鍵盤上那顆換行鍵直接送出，與網頁版按 Enter 送出表單是同一件事。
        returnKeyType="done"
        onSubmitEditing={submit}
      />
      {error !== '' && <Text style={styles.error}>{error}</Text>}
      <View style={styles.formActions}>
        <ToolButton label={t('books.cancel')} onPress={onCancel} />
        <ToolButton label={submitLabel} onPress={submit} />
      </View>
    </View>
  );
}

/**
 * 一次匯入的結果，畫在那一本底下。
 *
 * 跳過的清單可能有上百筆。整張 sheet 本來就在捲，這裡不再包一層捲動區——
 * 巢狀的捲動區不要與外層同方向（HIG `L-15`）。網頁版那邊自己捲是因為它怕把
 * 「新增單字本」頂出容器外，這裡頂不出去。
 */
function Outcome({ outcome, books }: { outcome: ImportOutcome; books: readonly Book[] }) {
  const nameOf = (bookId: string) =>
    books.find((book) => book.id === bookId)?.name ?? t('books.unknownBook');

  return (
    <View style={styles.outcome}>
      <Text style={outcome.failed ? styles.error : styles.status}>{outcome.message}</Text>
      {outcome.skipped.length > 0 && (
        <>
          <Text style={styles.hint}>{t('books.skippedHeading', { count: outcome.skipped.length })}</Text>
          {outcome.skipped.map((skip) => (
            <Text key={skip.term} style={styles.hint}>
              {t('books.skippedItem', { term: skip.term, book: nameOf(skip.bookId) })}
            </Text>
          ))}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pillText: {
    color: color.label,
    fontSize: fontSize.subheadline,
    fontWeight: weight.medium,
  },
  sheet: {
    flex: 1,
    backgroundColor: color.background,
    paddingTop: 24,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: SCREEN_INSET + 4,
    paddingBottom: 12,
  },
  sheetHeadText: {
    flex: 1,
    gap: 2,
  },
  sheetTitle: {
    color: color.label,
    fontSize: fontSize.title3,
    fontWeight: weight.semibold,
  },
  sheetHint: {
    color: color.secondaryLabel,
    fontSize: fontSize.footnote,
  },
  doneText: {
    color: color.accent,
    fontSize: fontSize.body,
    fontWeight: weight.semibold,
  },
  list: {
    paddingHorizontal: SCREEN_INSET,
    paddingBottom: 32,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: TAP_SIZE,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.separator,
  },
  /** 管理模式下左邊那塊只管打勾。撐滿整列高度，觸控區因此是 44pt（HIG `B-01`）。 */
  tick: {
    minWidth: 28,
    alignSelf: 'stretch',
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  /** 右邊那塊管展開。吃掉這一列剩下的寬度，本名很長時由 `numberOfLines` 截。 */
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'stretch',
  },
  rowPressed: {
    opacity: 0.55,
  },
  rowName: {
    flexShrink: 1,
    flexGrow: 1,
    color: color.label,
    fontSize: fontSize.body,
  },
  rowCount: {
    color: color.secondaryLabel,
    fontSize: fontSize.footnote,
  },
  rowChevron: {
    color: color.tertiaryLabel,
    fontSize: fontSize.footnote,
  },
  rowMark: {
    color: color.accent,
    fontSize: fontSize.body,
    fontWeight: weight.semibold,
  },
  /** 點不動的那幾列要看得出來，不然人會以為 app 當掉了。 */
  rowLocked: {
    color: color.tertiaryLabel,
  },
  tools: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingVertical: 8,
    paddingLeft: 36,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.separator,
  },
  /**
   * 一顆維護鈕。內容層的按鈕，因此走標準材質那一組底色而不是玻璃（HIG `M-01`、`M-02`）。
   * 高度給下限 44（`B-01`），字級變大時由內距把它撐開。
   */
  tool: {
    minHeight: TAP_SIZE,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: color.fill,
  },
  toolText: {
    color: color.label,
    fontSize: fontSize.subheadline,
    fontWeight: weight.medium,
  },
  /** 刪除那顆。**顏色不是唯一的訊號**——按下去還有一張講明後果的警示窗（HIG `T-14`）。 */
  toolDanger: {
    color: color.danger,
  },
  addRow: {
    minHeight: TAP_SIZE,
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingTop: 4,
  },
  addText: {
    color: color.accent,
    fontSize: fontSize.body,
    fontWeight: weight.medium,
  },
  form: {
    gap: 10,
    paddingVertical: 12,
    paddingLeft: 36,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.separator,
  },
  input: {
    minHeight: TAP_SIZE,
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: color.fill,
    color: color.label,
    fontSize: fontSize.body,
  },
  /** `placeholderTextColor` 吃的是一個值不是樣式，借這一格把它跟其他顏色放在一起。 */
  placeholder: {
    color: color.tertiaryLabel,
  },
  formActions: {
    flexDirection: 'row',
    gap: 8,
  },
  outcome: {
    gap: 4,
    paddingVertical: 10,
    paddingLeft: 36,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.separator,
  },
  status: {
    color: color.label,
    fontSize: fontSize.subheadline,
  },
  error: {
    color: color.danger,
    fontSize: fontSize.subheadline,
  },
  hint: {
    color: color.secondaryLabel,
    fontSize: fontSize.footnote,
  },
});
