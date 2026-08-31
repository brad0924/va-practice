/**
 * 卡片列表。改寫的第二頁正式程式碼，對照的是網頁版 `src/ui/list-view.ts`。
 *
 * 分桶、搜尋比對、範圍標籤三支邏輯**不住在這裡**，它們在 `core/lib/card-list.ts` 與
 * `core/lib/book-scope.ts`，兩個平台共用一份（票 `15`）。這一頁只負責把它們的結果畫出來。
 *
 * ## 版面（2026-08-31 拍板，圖版一·甲；同日真機第二輪修正，圖版五·甲）
 *
 * 上面三層：置中的標題、系統的搜尋列、自己畫的一條工具列（「共 N 張」／單字本／排序）。
 * 前兩層都是 `expo-router` 的 `Stack` 直接交給 `UINavigationController` 畫的——**搜尋列
 * 不自己做一個**，聚焦時跟著鍵盤上滑那類行為系統本來就會。
 *
 * > 第一層原本是**大標題**。真機上看過之後拿掉了：大標題一律靠左、又佔一整段高度，
 * > 而「卡片」那兩個字在底下的 tab bar 上已經有一份。中間試過完全不放標題，
 * > 那會讓導覽列變成一條空白（見 `cardsHeader()` 與底下 `placement` 那兩段），
 * > 最後落在「標準高度、標題置中」。
 *
 * > **票的〈已知風險〉標的就是這一層。** 加上底部的 tab bar，這一頁一次有三層 chrome。
 * > 並排目測那一關要特別看它，過不了的話砍的是自己畫的那條工具列——
 * > 那時候排序與單字本改成導覽列右邊兩顆圖示鈕（圖版一·乙，也就是圖版五·丁）。
 *
 * ## 單字本管理併在這一頁（圖版二·甲）
 *
 * 它本來排在資料頁，提前搬過來是因為零本時這一頁沒東西可看，而手機上原本唯一建得出本的
 * 地方是探針。做法是「選哪幾本」與「管理哪幾本」共用同一張 sheet，見 `./book-scope-sheet.tsx`。
 */
import { File } from 'expo-file-system';
import { Stack } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { ScrollViewMarker } from 'react-native-screens/experimental';
import { t } from '@core/i18n';
import { toMessage } from '@core/lib/app-error';
import { BUCKETS, filterCards, groupByBucket, type BucketKey } from '@core/lib/card-list';
import { toPlainText } from '@core/lib/reading';
import type { SortDirection } from '@core/lib/review';
import { addBook, cardsInBooks, deleteBook, renameBook, setScope } from '@core/lib/storage';
import type { Card } from '@core/lib/types';
import type { ReviewSession } from '../lib/review-session';
import { BookScopeSheet, type ImportOutcome } from './book-scope-sheet';
import { GlassGroup, GlassPill } from './glass-pill';
import { Notice } from './notice';
import { Term } from './term';
import { color, fontSize, SCREEN_INSET, TAP_SIZE, weight } from './theme';

export interface CardsScreenProps {
  session: ReviewSession;
  /** 現在幾點。分桶要用，與 `core/` 那一層同一個規矩：時間由外面遞進來。 */
  now(): Date;
  /** 點了一列。目的地是編輯畫面（票 `16`），這一頁只負責把卡片交出去。 */
  onOpenCard(card: Card): void;
}

export function CardsScreen({ session, now, onOpenCard }: CardsScreenProps) {
  const { data } = session.snapshot();

  const [query, setQuery] = useState('');
  const [direction, setDirection] = useState<SortDirection>('asc');
  /**
   * 哪幾個桶展開著。
   *
   * **這份狀態不進 `AppData`。** 那份資料整份會被備份到別台裝置，而「我把哪個桶點開了」
   * 是這台裝置這一刻的事。網頁版把它放在畫面的閉包裡，同一個立場。
   *
   * > 與網頁版有一處刻意的不同：那邊離開卡片頁再回來會回到「正序、六桶全收合」，
   * > 因為畫面整個重建了。這裡是 tab，切走只是被蓋住，狀態留著——iOS 上切回一個 tab
   * > 本來就該看到離開時的樣子（票 `09` 那條「探針填到一半的欄位還在」是同一個立場）。
   */
  const [expanded, setExpanded] = useState<ReadonlySet<BucketKey>>(new Set());
  /** 剛結束的那次匯入。畫在那一本底下，換一本或關掉 sheet 就消失。 */
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);

  /**
   * 搜尋前的收合狀態，清空搜尋框之後還原。
   *
   * 用 `ref` 不用 `state`：它只在「搜尋框由空變有字」那個轉折被寫一次、由有字變空時讀一次，
   * 從來不需要因為它變了而重畫。
   */
  const beforeSearch = useRef<ReadonlySet<BucketKey>>(new Set());
  const searching = query.trim() !== '';

  /**
   * 搜尋的意圖就是看到結果，把結果留在收合的桶裡等於搜尋壞掉。因此由空變有字時六桶全展開，
   * 並把當時的收合狀態存一份；清空搜尋框後還原——搜尋期間的展開與收合不帶回去。
   * 與網頁版 `list-view.ts` 的 `input` 監聽器同一段邏輯。
   */
  function changeQuery(next: string): void {
    const wasSearching = searching;
    const nowSearching = next.trim() !== '';
    if (nowSearching !== wasSearching) {
      if (nowSearching) {
        beforeSearch.current = expanded;
        setExpanded(new Set(ALL_BUCKETS));
      } else {
        setExpanded(beforeSearch.current);
      }
    }
    setQuery(next);
  }

  function toggleBucket(key: BucketKey): void {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  /**
   * 選一個備份檔，把裡面的卡加進那一本。
   *
   * 選檔走 `expo-file-system` 內建的那一支，**不另外裝 `expo-document-picker`**
   * （2026-08-31 拍板）：兩者底下都是 iOS 的 `UIDocumentPickerViewController`，
   * 而這個套件票 `05` 就裝了、已經在包裡，換它等於不必為了這張票重新出包。
   * 選回來的東西本身就是一個 `File`，`text()` 直接讀得出內容，中間不必再接一次讀檔。
   */
  async function pickAndImport(bookId: string): Promise<void> {
    let picked;
    try {
      picked = await File.pickFileAsync({ mimeTypes: 'application/json' });
    } catch (error) {
      setOutcome({ bookId, message: t('books.importFailed', { reason: toMessage(error) }), failed: true, skipped: [] });
      return;
    }
    // 使用者按了取消。那不是失敗，一個字都不必說。
    if (picked.canceled) return;

    try {
      const result = session.importWords(await picked.result.text(), bookId);
      setOutcome({ bookId, message: t('books.imported', { count: result.imported }), failed: false, skipped: result.skipped });
    } catch (error) {
      // 帶 key 的錯要查表才變成字（`ADR-0013`），畫面層一律走 toMessage()。
      setOutcome({ bookId, message: t('books.importFailed', { reason: toMessage(error) }), failed: true, skipped: [] });
    }
  }

  /**
   * 單字本管理那一組。**判斷一律來自 `core/lib/storage.ts`**：名字合不合法、範圍會不會被
   * 清空、匯入跳過了哪些詞全在那裡，這裡只負責把它說的話翻成畫面上看得到的字。
   *
   * 四支動作都走 `session.applyData()` 而不是自己 `store.save()`——那台機器手上握著資料，
   * 繞過它寫檔的話它就停在舊快照，下一次評分會把這裡的改動整批蓋掉。
   */
  const manage = {
    cardCount: (bookId: string) => cardsInBooks(data.cards, [bookId]).length,
    add: (name: string) => session.applyData(addBook(data, name)),
    rename: (bookId: string, name: string) => session.applyData(renameBook(data, bookId, name)),
    remove: (bookId: string) => session.applyData(deleteBook(data, bookId)),
    importWords: (bookId: string) => void pickAndImport(bookId),
    outcome,
    clearOutcome: () => setOutcome(null),
  };

  // 零本是另一套畫面。範圍開關與六個桶那時候都是空的，放上去只是幾顆什麼都不做的鈕。
  if (data.books.length === 0) {
    return (
      <View style={styles.root}>
        {/* 零本時沒有搜尋框，導覽列上就只有標題那一列。建了第一本之後底下會多一條搜尋框，
            標題那一列不動——兩個狀態因此長得一樣，不會在建完本的那一瞬間跳一下。 */}
        <Stack.Screen options={cardsHeader()} />
        <View style={styles.empty}>
          <Notice mark="📚" title={t('list.noBooksTitle')} note={t('list.noBooks')} />
          {/* **這顆不是死按鈕**：它開的是這一頁自己的新增入口，不是叫人去別頁找
              （票 `15` 驗收第 9 條）。網頁版那顆「去建立單字本」會跳去資料頁，
              因為那邊的建立介面住在那一頁；手機上建立就在這一頁。

              **第一本建好的那一瞬間，這張 sheet 會自己收起來**：資料變了，這支元件改走
              底下那條正常的路，零本這一棵樹連同開著的 sheet 一起被換掉。那不是意外，
              是對的結果——使用者要的就是「建好了，讓我看列表」。要連建第二本的話，
              按工具列上那顆「全部 ▾」。 */}
          <BookScopeSheet
            books={data.books}
            selected={data.scopes.list}
            onChange={() => {}}
            manage={manage}
            triggerLabel={t('books.addButton')}
            openInAdd
          />
        </View>
      </View>
    );
  }

  // 列表範圍先套用，才輪到搜尋與分桶，因此「共 N 張」的 N 是範圍內的張數，不是全 app 的。
  const scoped = cardsInBooks(data.cards, data.scopes.list);
  const matches = filterCards(scoped, query);
  const buckets = groupByBucket(matches, now(), direction);

  // 空桶平時顯示並標 0（「明天 0」本身是資訊），搜尋中則藏起來，
  // 免得幾行「0」把結果擠下去。
  const sections = (searching ? buckets.filter((bucket) => bucket.cards.length > 0) : buckets).map(
    (bucket) => ({
      key: bucket.key,
      label: bucket.label,
      total: bucket.cards.length,
      // 收合的桶交出空陣列而不是整段拿掉——標頭要留著，那正是「明天 0」講的話。
      data: expanded.has(bucket.key) ? bucket.cards : [],
    }),
  );

  return (
    <View style={styles.root}>
      <Stack.Screen options={cardsHeader()} />
      {/**
       * 系統的搜尋列。
       *
       * **`hideWhenScrolling` 關掉，搜尋框常駐。** 票原本寫「往下捲收起、往上捲帶回來」，
       * 2026-08-31 拍板改掉——當時標題是拿掉的，收起來的終點是一條完全空白的玻璃條。
       * 標題後來又放回去了（圖版五·甲），那個理由因此不再成立，但**維護者選的是常駐**，
       * 沿用。要換回票原本寫的行為，把這一行改成 `hideWhenScrolling` 即可，
       * 現在收起來之後導覽列上還留著「卡片」兩個字，不會是空的。
       *
       * 搜尋範圍當場看得出來（HIG `N-20`）：提示文字說了比對哪幾個欄位，
       * 底下工具列那顆膠囊說了現在在哪幾本裡面找。
       */}
      <Stack.SearchBar
        placeholder={t('list.searchPlaceholder')}
        autoCapitalize="none"
        hideWhenScrolling={false}
        /**
         * **搜尋框自成一列，滿版。**
         *
         * 這是 UIKit 兩種擺法裡的一種，另一種（`integrated`）是擠進導覽列那一列。
         * **兩種各有一個拿不掉的代價，不能兼得**（2026-08-31 真機第二輪，圖版五）：
         *
         * - `stacked`：搜尋框滿版，但它上面那條導覽列一定存在。
         * - `integrated`：沒有多的那一列，但它的定義是「放在導覽列的**尾端**」——
         *   左邊那塊是留給標題與返回鈕的位置，把標題拿掉它也不會讓出來，搜尋框因此靠右。
         *
         * 維護者兩種都在真機上看過，選了 `stacked` 並把標題放回去（圖版五·甲）：
         * 那一列有東西了，搜尋框也維持滿版。
         *
         * > 寫明 `stacked` 而不是留預設的 `automatic`：那個值是「看版面自己決定」，
         * > 也就是同一支程式在不同機型上可能給出上面兩種不同的樣子。
         * > 順帶一提，`react-native-screens` 在 `stacked` 底下會自己把
         * > `allowToolbarIntegration` 壓成 `false`——那是繞開一個 UIKit 的 bug
         * > （搜尋框在根畫面上不出現），因此這裡不必自己設。
         */
        placement="stacked"
        onChangeText={(event) => changeQuery(event.nativeEvent.text)}
      />

      {/**
       * **這層 `ScrollViewMarker` 是 tab bar 會不會捲動縮小的唯一開關**，理由的正本在
       * `./probe-screen.tsx`。它不畫任何東西，只告訴原生那一端「這一頁要盯的捲動區是這個」。
       *
       * 兩條規矩不能破：只能有一個孩子（原生那邊有 assert），而且那個孩子要解析得出捲動區。
       * `SectionList` 底下就是一個 `ScrollView`，解析得出。
       */}
      <ScrollViewMarker style={styles.fill}>
        <SectionList
          style={styles.fill}
          sections={sections}
          keyExtractor={(card) => card.id}
          // 大標題要能隨捲動縮成標準標題（HIG `N-11`），捲動區得讓系統自己算內距。
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.listContent}
          // 桶標頭黏在頂端。捲過一長串卡片時仍看得出自己在哪一桶。
          stickySectionHeadersEnabled
          /**
           * **六個桶的標頭第一幀就要全部畫出來。**
           *
           * `SectionList` 預設只先畫 10 格，而它算格子的方式是「每一個桶佔 2 格
           * （標頭與頁尾），再加上桶裡的卡片」——六個桶光是標頭與頁尾就 12 格，
           * 預設值因此畫不完，第六桶（六桶全收合時就是「未來」）會缺席一幀才補上。
           *
           * 那一幀在真機上很短，但**空桶標頭正是這一頁要講的話**（「明天 0」本身是資訊），
           * 缺一個就是講錯。把下限提到 24：六個桶的 12 格，加上第一個展開的桶裡先畫十來張。
           */
          initialNumToRender={FIRST_RENDER_ROWS}
          ListHeaderComponent={
            <Toolbar
              count={
                searching
                  ? t('list.countMatched', { matched: matches.length, total: scoped.length })
                  : t('list.countAll', { total: scoped.length })
              }
              direction={direction}
              onToggleDirection={() => setDirection((current) => (current === 'asc' ? 'desc' : 'asc'))}
              books={
                <BookScopeSheet
                  books={data.books}
                  selected={data.scopes.list}
                  // 改的是 `scopes.list` 這一組，複習與統計那兩組不受影響。
                  onChange={(ids) => session.applyData(setScope(data, 'list', ids))}
                  manage={manage}
                />
              }
            />
          }
          renderSectionHeader={({ section }) => (
            <BucketHeader
              label={section.label}
              total={section.total}
              tint={BUCKET_TINTS[section.key]}
              open={expanded.has(section.key)}
              onPress={() => toggleBucket(section.key)}
            />
          )}
          renderItem={({ item }) => (
            <CardRow
              card={item}
              bookName={data.books.find((book) => book.id === item.bookId)?.name}
              onPress={() => onOpenCard(item)}
            />
          )}
        />
      </ScrollViewMarker>
    </View>
  );
}

/**
 * 六個桶的 key，順序無所謂——只拿來做「全部展開」。
 * 從 `core/` 那份正本導出，不自己再抄一列：抄的話哪天多一個桶，這裡會安靜地少展開一個。
 */
const ALL_BUCKETS: readonly BucketKey[] = BUCKETS.map((bucket) => bucket.key);

/**
 * 導覽列那一列。**零本畫面與列表頁共用同一份**，兩個狀態因此長得一樣。
 *
 * `headerLargeTitle` 關掉：大標題在 iOS 上一律靠左、而且會佔掉一整段高度，
 * 而這一頁上面本來就擠（票的〈已知風險〉）。關掉之後是標準高度的那一列，
 * 標題在正中間。
 *
 * `headerTitleAlign` 寫出來是因為**置中是維護者明確要求的**（2026-08-31，圖版五·甲），
 * 不是順手撿到的預設值——iOS 上它本來就是 `center`，但寫出來這件事就有主人了。
 *
 * > 玻璃不在這裡，在 `../app/cards/_layout.tsx` 的 `headerTransparent`；
 * > 深色不在這裡，在 `../app/_layout.tsx` 的主題。三個各管一段，少一個就少一半。
 *
 * **它是一支函式，不是一個常數。** 寫成常數的話 `t('nav.cards')` 會在模組載入的那一刻
 * 就算完，而那比 `initI18n()` 還早——不是拿到舊語言，是當場丟例外「i18n 還沒啟動」，
 * 整支檔案載不進來。這個 repo 已經為同一件事在 `BUCKETS` 與 `RATINGS` 上各留過一段註解，
 * 那兩處的解法是「存 key 不存字」；這裡存不了 key（要交出去的是一整組設定），
 * 因此改成延後到畫的那一刻才算。
 */
const cardsHeader = () =>
  ({
    headerLargeTitle: false,
    title: t('nav.cards'),
    headerTitleAlign: 'center',
  }) as const;

/** 第一幀先畫幾格。理由見底下 `initialNumToRender` 那一段——六個桶的標頭不能缺。 */
const FIRST_RENDER_ROWS = 24;

/**
 * 六個桶各一色。**六個值直接抄網頁版 `src/styles.css` 的 `.bucket-head.*`**
 * （`--new`／`--danger`／`--hard`／`--soon`／`--easy`／`--good`）。
 *
 * 2026-08-31 維護者在真機上看過白色版之後指定改成這樣，理由與票 `06` 那四顆評分鈕相同：
 * 兩邊都在用，換一台裝置不該重新學哪個顏色是哪一桶。
 *
 * > **這六格是寫死的色碼，違反 `./theme.ts` 那條「顏色一律走 `PlatformColor`」。**
 * > 代價與那四顆一樣：「提高對比」打開時它們不會跟著調整。已知並接受。
 * >
 * > **顏色不是唯一的訊號**（HIG `T-14`）：每個桶名本身就是一句話（「明天」「未來」），
 * > 展開與否另有箭頭，轉成灰階全部讀得出來。
 */
const BUCKET_TINTS: Record<BucketKey, string> = {
  new: '#9a7fe0',
  now: '#e0574f',
  today: '#d9843f',
  tomorrow: '#d9c14f',
  week: '#4a90d9',
  future: '#46a758',
};

interface ToolbarProps {
  count: string;
  direction: SortDirection;
  onToggleDirection(): void;
  books: React.ReactNode;
}

/**
 * 自己畫的那一條工具列：「共 N 張」、單字本、排序。順序與網頁版一致。
 *
 * 「共 N 張」是一行字不是一顆膠囊——它不能按，套上玻璃只會讓人以為按得下去
 * （與複習畫面的「剩餘 N 張」同一個處理）。兩顆按得下去的放在同一個玻璃容器裡，
 * 靠得夠近才會正確融形（HIG `M-14`）。
 */
function Toolbar({ count, direction, onToggleDirection, books }: ToolbarProps) {
  const asc = direction === 'asc';
  return (
    <View style={styles.toolbar}>
      <Text style={styles.count}>{count}</Text>
      <View style={styles.spring} />
      <GlassGroup style={styles.toolbarActions}>
        {books}
        <GlassPill
          onPress={onToggleDirection}
          accessibilityLabel={asc ? t('list.sortLabelAsc') : t('list.sortLabelDesc')}
        >
          <Text style={styles.sortText}>{asc ? t('list.sortAsc') : t('list.sortDesc')}</Text>
        </GlassPill>
      </GlassGroup>
    </View>
  );
}

interface BucketHeaderProps {
  label: string;
  total: number;
  /** 這一桶的顏色。見 `BUCKET_TINTS`。 */
  tint: string;
  open: boolean;
  onPress(): void;
}

/**
 * 一個時間桶的標頭。整條可按，展開收合各自獨立。
 *
 * 它黏在捲動區頂端，因此**底色必須是不透明的**——半透明的話底下的卡片會從字後面
 * 穿過去。它是內容層的東西，走標準材質那一組（HIG `M-02`），不是玻璃。
 */
function BucketHeader({ label, total, tint, open, onPress }: BucketHeaderProps) {
  return (
    <Text
      style={styles.bucket}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={`${label} ${total}`}
      suppressHighlighting
    >
      {/* 展開與否用符號講，不只靠顏色或位置（HIG `T-14`）。箭頭跟著桶色走，
          與網頁版相同——那邊是整條 `.bucket-head` 上色，箭頭與桶名一起吃到。 */}
      <Text style={[styles.bucketMark, { color: tint }]}>{open ? '▾ ' : '▸ '}</Text>
      <Text style={[styles.bucketLabel, { color: tint }]}>{label}</Text>
      {/* 張數不上色，維持灰。網頁版的 `.bucket-count` 也另外設了 `--muted` 蓋掉桶色——
          它是次要資訊，跟著上色會跟桶名搶注意。 */}
      <Text style={styles.bucketCount}>{`　${total}`}</Text>
    </Text>
  );
}

interface CardRowProps {
  card: Card;
  bookName: string | undefined;
  onPress(): void;
}

/**
 * 一張卡一列。左邊詞條與釋義，右邊所屬的本與到期日。
 *
 * 詞條帶振假名（`showReading` 恆為真）——這一頁是在找卡片不是在測驗，讀音要看得到。
 * 本名只顯示不可點，搬家在編輯畫面裡做。
 *
 * 桶名由標頭承擔，列上因此改印**實際到期日**。新卡沒有到期日，那一格不長出來也不填
 * 佔位字元。用完整的 `YYYY-MM-DD`：間隔沒有上限，「未來」桶必然含跨年的卡，
 * 省掉年份會分不出哪一年。三段規則全部照網頁版。
 */
function CardRow({ card, bookName, onPress }: CardRowProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      // 唸出來要是「詞條，釋義」而不是把振假名一欄一欄拆著唸。詞條那一塊自己也掛了
      // 一個標籤（見 `./term.tsx`），但整列可按時 VoiceOver 讀的是這一層。
      accessibilityLabel={`${toPlainText(card.text)}，${card.meaning}`}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.rowLead}>
        <Term text={card.text} showReading />
        <Text style={styles.rowMeaning} numberOfLines={1}>
          {card.meaning}
        </Text>
      </View>
      <View style={styles.rowTrail}>
        {bookName !== undefined && (
          <Text style={styles.rowBook} numberOfLines={1}>
            {bookName}
          </Text>
        )}
        {card.due !== null && <Text style={styles.rowDue}>{card.due}</Text>}
      </View>
      {/* 這一列按下去會推出一頁，右邊因此要有那個 chevron——iOS 上它就是「按得下去」的意思。
          它是整列的裝飾不是獨立的按鈕，所以不自己接觸控，也不進輔助使用的朗讀。 */}
      <Text style={styles.rowChevron} accessible={false}>
        {'›'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: color.background,
  },
  /**
   * 同一格套在兩層上：捲動區本身，以及外面那層 `ScrollViewMarker`。marker 是一個真的
   * view、沒有預設的伸縮，只套在裡面那層的話它會被壓成內容高度。
   * 與 `./review-screen.tsx` 那筆是同一種坑。
   */
  fill: {
    flex: 1,
  },
  /**
   * 底部留白：tab bar 浮在內容之上，捲到底時最後幾列要能露出來。
   *
   * `L-02` 要的正是「內容從控制層底下透出來」，因此不是把捲動區縮短，而是多給一段內距——
   * 卡片仍然會從那條膠囊底下經過。
   */
  listContent: {
    paddingBottom: 96,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    paddingHorizontal: SCREEN_INSET * 2,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    // 塞不下就換行。大字級下不換行的話右邊那兩顆會被擠出螢幕——不是難看而已，是按不到
    // （複習畫面的標題列真機踩過，2026-08-26）。
    flexWrap: 'wrap',
    gap: 12,
    paddingHorizontal: SCREEN_INSET,
    paddingBottom: 12,
  },
  toolbarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  spring: {
    flexGrow: 1,
  },
  /** 「共 N 張」。字距讓它讀起來像標籤而不是句子，與複習畫面的「剩餘 N 張」同一組值。 */
  count: {
    color: color.secondaryLabel,
    fontSize: fontSize.footnote,
    fontWeight: weight.semibold,
    letterSpacing: 1.4,
  },
  sortText: {
    color: color.label,
    fontSize: fontSize.subheadline,
    fontWeight: weight.medium,
  },
  /**
   * 桶標頭。黏在頂端因此底色不透明，走標準材質那一組（HIG `M-02`）。
   *
   * 整條是一個 `<Text>` 而不是一排 `<View>`：這樣字級變大時三段會自己一起換行，
   * 不會變成「標籤換行、數字留在原地」（HIG `T-07`）。高度靠內距給到 44（`B-01`）。
   */
  bucket: {
    backgroundColor: color.card,
    paddingHorizontal: SCREEN_INSET,
    /**
     * 上下各 15，加上 22 的行高，整條剛好 52 ——**網頁版 `.bucket-head` 的
     * `min-height: var(--tap)` 就是這個數字**（`3.25rem`）。原本是 11（總高 44），
     * 真機上看起來太擠（2026-08-31）。
     *
     * > 44 是**觸控區的下限**（HIG `B-01`），不是這一條該有的高度。桶標頭是這一頁的
     * > 骨架，六條連在一起時它得比一般的列更有份量，不然整頁看起來只是一長串灰線。
     */
    paddingVertical: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.separator,
    lineHeight: 22,
  },
  /** 顏色不在這裡，跟著桶走——見 `BUCKET_TINTS`。 */
  bucketMark: {
    fontSize: fontSize.footnote,
  },
  bucketLabel: {
    fontSize: fontSize.subheadline,
    // 網頁版的 `.bucket-label` 是 700。這裡取 semibold（600），因為 iOS 的字重階梯
    // 到 bold 就會比網頁版那一級重（HIG `T-05` 只禁最細的三級，粗的這一端是質感問題）。
    fontWeight: weight.semibold,
  },
  bucketCount: {
    color: color.secondaryLabel,
    fontSize: fontSize.subheadline,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: TAP_SIZE,
    paddingHorizontal: SCREEN_INSET,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.separator,
  },
  rowLead: {
    flex: 1,
    alignItems: 'flex-start',
    gap: 2,
  },
  rowMeaning: {
    color: color.secondaryLabel,
    fontSize: fontSize.footnote,
  },
  /** 右欄由上而下：所屬的本、實際到期日。與網頁版同一個順序。 */
  rowTrail: {
    alignItems: 'flex-end',
    gap: 2,
    maxWidth: '38%',
  },
  rowBook: {
    color: color.tertiaryLabel,
    fontSize: fontSize.footnote,
  },
  rowDue: {
    color: color.secondaryLabel,
    fontSize: fontSize.footnote,
    // 日期上下對齊，掃一整排時看得出哪一天比較早。
    fontVariant: ['tabular-nums'],
  },
  /** 只是裝飾，不自己接觸控——整列都按得下去，觸控區由 `row` 的 `minHeight` 給（HIG `B-01`）。 */
  rowChevron: {
    color: color.tertiaryLabel,
    fontSize: fontSize.body,
    fontWeight: weight.semibold,
  },
  /** 按下去的樣子（HIG `B-03`）。清單列變淡就夠，不必像按鈕那樣再縮一下。 */
  rowPressed: {
    opacity: 0.55,
  },
});
