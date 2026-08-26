/**
 * 複習畫面。改寫的第一頁正式程式碼，對照的是網頁版 `src/ui/review-view.ts`。
 *
 * 三種狀態同一支函式畫：**複習中**、**今日份完成**（佇列清空）、**零本**。
 * 零本是另一套畫面，因為那時候單字本開關的選單是空的，放上去就是顆死按鈕。
 *
 * 版面是「一張四邊都看得見的卡片，上下各浮一條控制列」。玻璃只出現在那兩條控制列上，
 * 卡片本體是內容層、走標準材質（`M-01`、`M-02`）。
 *
 * > **這一頁因此放棄了玻璃的折射。** 卡片曾經鋪滿整頁、從控制列底下透出去（`L-02`），
 * > 那是為了讓玻璃有東西可折。維護者看過兩種之後選了「卡片要有明確的邊」，並知情接受
 * > 兩條列底下是純黑、玻璃會看起來像扁平的深灰塊（2026-08-26）。票 `09` 加上導覽列與
 * > 真正有內容的三頁之後，這一區會重新長回來，那時候再回頭看。
 *
 * **通往其他畫面的按鈕這一版都沒有**：網頁版這一頁上的「卡片」「編輯」，以及零本畫面的
 * 「去建立單字本」，目的地都排在後面的票。放上去就是三顆死鈕，因此不放。
 * 標題列上那顆「探針」是暫時的後門（見 `./probe-screen.tsx`）。票 `09` 會把它搬進
 * 「資料」那個 tab 並拆掉這一顆——在那之前不能先拆，它是探針目前唯一的入口。
 */
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t, type Key } from '@core/i18n';
import { currentCard, isComplete } from '@core/lib/review';
import type { Rating } from '@core/lib/types';
import { loadJapaneseVoice, speakTerm, type VoiceLike } from '../lib/japanese-voice';
import type { ReviewSession } from '../lib/review-session';
import { BookScopeSheet } from './book-scope-sheet';
import { CopyButton } from './copy-button';
import { ContentPill, GlassGroup, GlassPill, PILL_PADDING_H } from './glass-pill';
import { Term } from './term';
import { color, fontSize, SCREEN_INSET, TAP_SIZE, weight } from './theme';

/**
 * 四個評分。`label` 存的是翻譯檔的 key 而不是字——寫成字的話在模組載入的那一刻就算完了，
 * 那比 `initI18n()` 還早。與網頁版 `review-view.ts` 的 `RATING_BUTTONS` 同一種寫法。
 *
 * **沒有快捷鍵那一欄。** 那是電腦端鍵盤的事，手機上沒有對應物。
 *
 * `tint` 是那顆鈕上文字的顏色，**四個值直接抄網頁版 `src/styles.css` 的
 * `--again`／`--hard`／`--good`／`--easy`**。這是票 `06` 定案 1a 指定的，
 * 理由是維護者兩邊都在用，換一台裝置不該重新學哪一顆是哪一顆。
 *
 * > **這四格是寫死的色碼，違反 `./theme.ts` 那條「顏色一律走 `PlatformColor`」。**
 * > 沒有別的走法：iOS 的語意色裡沒有任何一個等於這四個值，換成 `systemRed` 那一組
 * > 就不是同一個顏色了，而這條規定要的正是兩邊對得起來。代價是「提高對比」打開時
 * > 這四個顏色不會跟著調整——已知並接受，見票 `06` 那筆 `M-09` 的偏離說明。
 */
const RATINGS: { rating: Rating; label: Key; tint: string }[] = [
  { rating: 'again', label: 'review.ratingAgain', tint: '#d9534f' },
  { rating: 'hard', label: 'review.ratingHard', tint: '#d9843f' },
  { rating: 'good', label: 'review.ratingGood', tint: '#46a758' },
  { rating: 'easy', label: 'review.ratingEasy', tint: '#4a90d9' },
];

/** 後門那顆鈕上的字。理由見底下它出現的地方。 */
const PROBE_LABEL = '探針';

export interface ReviewScreenProps {
  session: ReviewSession;
  /** 暫時的後門，通往票 `03`–`05` 的探針畫面。 */
  onOpenProbe(): void;
}

/**
 * 四顆評分鈕還排得下同一列嗎。排不下就改成上下堆疊——**橫向空間不足時文字在上、
 * 次要資訊在下**（HIG `T-09`），Apple 自己的做法也是這樣，不是把字截斷。
 *
 * 算的不是一個拍腦袋的字級門檻，而是真的量：最長的那個標籤（「困難」「簡單」都是兩個字）
 * 乘上這台裝置目前的字級，加上膠囊左右內距與四顆之間的間距，看螢幕寬度夠不夠。
 * 這樣換不換行會跟著機型與字級自己調整，不必為每一支手機各記一個數字。
 */
export function ratingsFitOneRow(width: number, fontScale: number): boolean {
  const LONGEST_LABEL_CHARS = 2;
  const label = LONGEST_LABEL_CHARS * fontSize.subheadline * fontScale;
  const pill = label + PILL_PADDING_H * 2;
  return pill * RATINGS.length + BAR_GAP * (RATINGS.length - 1) + SCREEN_INSET * 2 <= width;
}

export function ReviewScreen({ session, onOpenProbe }: ReviewScreenProps) {
  const { data, queue, revealed } = session.snapshot();
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const [voice, setVoice] = useState<VoiceLike | null>(null);

  /**
   * 上下那兩條列各自實際佔了多高。**量出來的，不是寫死的**——大字級下膠囊會長到
   * 一百多，寫死 44 的話卡片會被壓在標題列底下（真機踩到，2026-08-26）。
   * 兩條列都浮在內容之上，捲動內容靠這兩個數字讓開。
   */
  const [headerHeight, setHeaderHeight] = useState(TAP_SIZE);
  const [footerHeight, setFooterHeight] = useState(TAP_SIZE);
  const measure = (set: (value: number) => void) => (event: LayoutChangeEvent) =>
    set(event.nativeEvent.layout.height);

  // 語音清單問一次就好，開機時問。問不到的話朗讀按鈕就不出現——按了聽到外語腔調念日文，
  // 不如不要有這顆按鈕（與網頁版 `src/ui/speech.ts` 的 `hasJapaneseVoice()` 同一個立場）。
  useEffect(() => {
    let alive = true;
    void loadJapaneseVoice().then((found) => {
      if (alive) setVoice(found);
    });
    return () => {
      alive = false;
    };
  }, []);

  const noBooks = data.books.length === 0;
  const complete = isComplete(queue);
  const card = currentCard(queue);
  const stackRatings = !ratingsFitOneRow(width, fontScale);

  return (
    // `key` 帶字級：使用者在 app 開著的時候到設定裡改字級，原生那一端不會自己重新量，
    // 膠囊會停在舊尺寸、字被擠出去（真機踩到，2026-08-26——當時要把 app 滑掉重開才正常）。
    // 換掉 key 等於整頁重建，那一下就重新量了。字級只有在使用者去改設定時才會變，不是熱路徑。
    <View style={styles.root} key={fontScale}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          // 卡片**讓開上下那兩條列**，四個邊因此都看得到。量出來的兩個高度加上與列之間的
          // 一段距離：`insets.top + SCREEN_INSET` 是列的上緣，`+ headerHeight` 到列的下緣，
          // 再 `+ SCREEN_INSET` 才輪到卡片。底下同理。
          {
            paddingTop: insets.top + headerHeight + SCREEN_INSET * 2,
            paddingBottom: insets.bottom + footerHeight + SCREEN_INSET * 2,
          },
        ]}
      >
        <View style={styles.card}>
          {noBooks ? (
            <Notice mark="📚" title={t('review.noBooksTitle')} note={t('review.noBooksNote')} />
          ) : complete ? (
            <Notice mark="✓" title={t('review.doneTitle')} note={t('review.doneNote')} />
          ) : (
            /**
             * 詞條、分隔線、釋義、動作鈕**一疊由上而下**，每一段之間的距離都照同一個節奏。
             *
             * 原本是兩塊：詞條與「複製」一塊，釋義與「朗讀」另一塊，中間一條撐滿整張卡的
             * 分隔線。改成一疊是票 `06` 定案 1a——兩顆鈕合成一排落到最下面，
             * 分隔線縮短置中，整張卡因此只剩一條中軸線。
             */
            <View style={styles.face}>
              <Term text={card!.text} showReading={revealed} />
              {revealed && (
                <>
                  {/* 分隔線不撐滿，置中一小段。撐滿的話它會把一張卡切成上下兩張，
                      而詞條與釋義本來就是同一件事的兩面。 */}
                  <View style={styles.divider} />
                  {/* 釋義沒有振假名、是完整一段文字，因此長按選得起來——
                      這是詞條做不到、只有這裡補得回來的那一半。 */}
                  <Text style={styles.meaning} selectable>
                    {card!.meaning}
                  </Text>
                </>
              )}
              {/* 「複製」與「朗讀」並排在最底下。它們是輔助動作，因此讓開一段再出現，
                  而那一段刻意等於詞條到釋義的距離——一疊東西只用同一個節奏。 */}
              <View style={styles.actions}>
                {/* `key` 帶卡片編號：換下一張時整顆重建，上一張按出來的「已複製」才不會
                    留在新的那顆按鈕上（它會停留一秒多，那段時間內評分是來得及的）。 */}
                <CopyButton key={card!.id} text={card!.text} />
                {revealed && voice !== null && (
                  <ContentPill
                    onPress={() => speakTerm(card!.text, voice)}
                    accessibilityLabel={t('review.speakLabel')}
                  >
                    <Text style={styles.speakText}>{t('review.speak')}</Text>
                  </ContentPill>
                )}
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      <GlassGroup
        style={[styles.bar, styles.header, { top: insets.top + SCREEN_INSET }]}
        onLayout={measure(setHeaderHeight)}
      >
        {/* **剩餘張數是一行字，不是一顆膠囊。** 它不能按，套上玻璃只會讓人以為按得下去；
            標題列因此也從三顆等寬的膠囊變成「一行標題、右邊兩顆控制項」，看得出主從。 */}
        <Text style={styles.remaining}>{t('review.remaining', { count: queue.length })}</Text>
        {/* 左、中、右三段——真的導覽列就是這個結構（HIG `N-19`）。兩格彈簧把單字本推到中間。
            塞不下換行時兩格都會收成 0，不會多出空隙。

            **中間那顆只是「差不多」置中**：兩格彈簧一樣長，因此單字本的中心會落在
            左右兩邊寬度的平均處，不是螢幕正中心。這一頁上兩邊差不到幾點，看不出來；
            要真的對準螢幕中心得改用絕對定位，那會讓大字級下的換行整個失效。 */}
        <View style={styles.headerSpacer} />
        {!noBooks && (
          <BookScopeSheet
            books={data.books}
            selected={data.scopes.review}
            onChange={(ids) => session.setReviewScope(ids)}
          />
        )}
        <View style={styles.headerSpacer} />
        {/* **只有這一顆的字沒查表**，刻意的：`ADR-0013` 管的是介面文字，而這顆鈕不是
            介面的一部分——它是通往探針畫面的暫時後門，而探針畫面整支的字本來就寫死中文
            （票 `03`–`05`）。為一顆要刪掉的鈕往三份翻譯檔各加一條，留下的是三條孤兒。 */}
        <GlassPill onPress={onOpenProbe} accessibilityLabel={PROBE_LABEL}>
          <Text style={styles.probe}>{PROBE_LABEL}</Text>
        </GlassPill>
      </GlassGroup>

      {/* 完成與零本兩種狀態底下沒有可按的東西，整條控制列就不出現——
          留一條空玻璃在那裡只是把「沒事可做」畫成一塊裝飾（HIG `L-13`）。 */}
      {!noBooks && !complete && (
        <GlassGroup
          style={[
            styles.bar,
            styles.footer,
            // 四顆排不下就上下堆疊。整條列改成直的，每一顆自己撐滿一整行。
            stackRatings && revealed && styles.footerStacked,
            { bottom: insets.bottom + SCREEN_INSET },
          ]}
          // 底部這幾顆各自獨立，不融形——理由見 `GlassGroupProps.spacing`。
          spacing={0}
          onLayout={measure(setFooterHeight)}
        >
          {revealed ? (
            RATINGS.map(({ rating, label, tint }) => (
              <GlassPill
                key={rating}
                block
                onPress={() => session.rate(rating)}
                // 橫排時四顆平分寬度，直排時四顆各佔滿一行——兩種排法下四顆都一樣大，
                // 用樣式而不是尺寸區分主次（HIG `B-05`）。
                style={stackRatings ? styles.ratingPillStacked : styles.ratingPill}
              >
                <Text style={[styles.ratingText, { color: tint }]}>{t(label)}</Text>
              </GlassPill>
            ))
          ) : (
            <GlassPill block onPress={() => session.reveal()} style={styles.primaryPill}>
              <Text style={styles.primaryText}>{t('review.showAnswer')}</Text>
            </GlassPill>
          )}
        </GlassGroup>
      )}
    </View>
  );
}

/** 完成與零本共用的一塊。差的只有符號與兩行字。 */
function Notice({ mark, title, note }: { mark: string; title: string; note: string }) {
  return (
    <View style={styles.notice}>
      <Text style={styles.noticeMark}>{mark}</Text>
      <Text style={styles.noticeTitle}>{title}</Text>
      <Text style={styles.noticeNote}>{note}</Text>
    </View>
  );
}

/** 相鄰控制項之間的距離。有邊框的元件約 12pt（HIG `L-11`），也讓兩塊玻璃靠得夠近會融形。 */
const BAR_GAP = 12;

/** 卡片裡上下相鄰兩塊的距離。詞條、分隔線、釋義都照這個節奏排。 */
const STACK_GAP = 20;

/** 分隔線多長。整張卡多寬都一樣，就是這一段——置中，不撐滿。 */
const DIVIDER_WIDTH = 140;


const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: color.background,
  },
  /** 背景要延伸到螢幕實體邊緣，四邊不留白條（HIG `L-01`）。 */
  scroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: SCREEN_INSET,
  },
  /**
   * 卡片是**內容層**，因此不套玻璃（HIG `M-01`）。要與頁面底分層時走標準材質那一組，
   * 顏色見 `./theme.ts`。圓角比膠囊小，因為它是大面積元件（`B-13`）。
   *
   * `flexGrow` 讓它把兩條列之間剩下的空間吃滿——上下左右四個邊因此都在螢幕上看得到。
   * 讓開那兩條列的距離由捲動區的內距給，因為那兩個數字要量出來（見那裡的說明）。
   */
  card: {
    flexGrow: 1,
    backgroundColor: color.card,
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 28,
    justifyContent: 'center',
  },
  /** 卡片裡那一疊：詞條、分隔線、釋義、動作鈕，全部對齊同一條中軸。 */
  face: {
    alignItems: 'center',
    gap: STACK_GAP,
  },
  divider: {
    width: DIVIDER_WIDTH,
    height: StyleSheet.hairlineWidth,
    backgroundColor: color.separator,
  },
  /**
   * 「複製」與「朗讀」那一排。`marginTop` 疊在 `face` 的 `gap` 上，因此它離釋義的距離
   * 是兩個 `STACK_GAP`——剛好等於詞條到釋義的距離（那一段中間隔了分隔線，也是兩個）。
   */
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: BAR_GAP,
    marginTop: STACK_GAP,
  },
  meaning: {
    color: color.secondaryLabel,
    fontSize: fontSize.title3,
    textAlign: 'center',
  },
  speakText: {
    color: color.label,
    fontSize: fontSize.subheadline,
    fontWeight: weight.medium,
  },
  notice: {
    alignItems: 'center',
    gap: 12,
  },
  noticeMark: {
    fontSize: 44,
  },
  noticeTitle: {
    color: color.label,
    fontSize: fontSize.title2,
    fontWeight: weight.semibold,
    textAlign: 'center',
  },
  noticeNote: {
    color: color.secondaryLabel,
    fontSize: fontSize.body,
    textAlign: 'center',
  },
  /**
   * 兩條控制列都浮在內容之上，左右內縮到系統邊距內——按鈕不貼齊螢幕邊（HIG `L-05`）。
   * `gap` 12 是有邊框元件之間該留的距離（`L-11`），也讓相鄰的兩塊玻璃靠得夠近會融形。
   */
  bar: {
    position: 'absolute',
    left: SCREEN_INSET,
    right: SCREEN_INSET,
    flexDirection: 'row',
    alignItems: 'center',
    gap: BAR_GAP,
  },
  /**
   * 標題列塞不下就換行。少了這一行，大字級下單字本開關與探針會被擠出螢幕右邊——
   * 不是難看而已，是**按不到**，改不了複習範圍（真機踩到，2026-08-26）。
   */
  header: {
    justifyContent: 'flex-start',
    flexWrap: 'wrap',
  },
  footer: {
    justifyContent: 'center',
  },
  /** 標題列的彈簧。用兩格把中間那顆推到中央；換行時它們收成 0，不會多出空隙。 */
  headerSpacer: {
    flexGrow: 1,
  },
  /** 四顆評分鈕排不下同一列時，整條列改成直的。 */
  footerStacked: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  /** 標題列左邊那一行字。字距是樣版 1a 上就有的，讓它讀起來像標籤而不是句子。 */
  remaining: {
    color: color.secondaryLabel,
    fontSize: fontSize.footnote,
    fontWeight: weight.semibold,
    letterSpacing: 1.4,
  },
  probe: {
    color: color.secondaryLabel,
    fontSize: fontSize.footnote,
  },
  /** 四顆評分鈕同尺寸、平分整條列——同一組選項用同尺寸，不用大小區分主次（HIG `B-05`）。 */
  ratingPill: {
    flex: 1,
  },
  /** 直排時四顆各佔滿一行，彼此仍然一樣大。 */
  ratingPillStacked: {
    alignSelf: 'stretch',
  },
  /**
   * 評分鈕的字級與字重。**顏色不在這裡**，四顆各自帶自己的那一個，見 `RATINGS`。
   *
   * > **一筆知情的偏離：`M-09` 說玻璃上的文字與符號走單色、不套色。** 上色是票 `06`
   * > 定案 1a 指定的，為的是與 Capacitor 版對得起來。折衷有兩層：只有標籤上色，鈕本身不動；
   * > 四顆的位置固定，轉成灰階仍然分得出來（`T-14` 因此不受影響）。
   */
  ratingText: {
    fontSize: fontSize.subheadline,
    fontWeight: weight.medium,
  },
  primaryPill: {
    flex: 1,
  },
  /**
   * 「顯示答案」與四顆評分鈕是同一種做法：玻璃底、文字上色。整條底部因此只有一套語言。
   *
   * > **另一筆知情的偏離：`M-10` 說要強調主要動作時色彩加在背景，一頁給一個。** 改成藍字
   * > 之後這一頁不再有任何上色的背景。理由是蓋著答案的那個狀態下它是畫面上唯一的動作，
   * > 沒有第二顆跟它搶注意，不必再靠底色喊一次。
   */
  primaryText: {
    color: color.accent,
    fontSize: fontSize.headline,
    fontWeight: weight.semibold,
  },
});
