/**
 * 複習畫面。改寫的第一頁正式程式碼，對照的是網頁版 `src/ui/review-view.ts`。
 *
 * 三種狀態同一支函式畫：**複習中**、**今日份完成**（佇列清空）、**零本**。
 * 零本是另一套畫面，因為那時候單字本開關的選單是空的，放上去就是顆死按鈕。
 *
 * 版面是「內容鋪滿整頁，兩條控制列浮在上面」：捲動區一路捲到螢幕最底與最邊，
 * 內容從控制層底下透出來（HIG `L-01`、`L-02`）。玻璃只出現在那兩條控制列上，
 * 卡片本體是內容層、走標準材質（`M-01`、`M-02`）。
 *
 * **通往其他畫面的按鈕這一版都沒有**：網頁版這一頁上的「卡片」「編輯」，以及零本畫面的
 * 「去建立單字本」，目的地都排在後面的票。放上去就是三顆死鈕，因此不放。
 * 標題列上那顆「探針」是暫時的後門，資料頁做好之後整顆拆掉，見 `./probe-screen.tsx`。
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
import { ContentPill, GlassGroup, GlassPill } from './glass-pill';
import { Term } from './term';
import { color, fontSize, SCREEN_INSET, TAP_SIZE, weight } from './theme';

/**
 * 四個評分。`label` 存的是翻譯檔的 key 而不是字——寫成字的話在模組載入的那一刻就算完了，
 * 那比 `initI18n()` 還早。與網頁版 `review-view.ts` 的 `RATING_BUTTONS` 同一種寫法。
 *
 * **沒有快捷鍵那一欄。** 那是電腦端鍵盤的事，手機上沒有對應物。
 */
const RATINGS: { rating: Rating; label: Key }[] = [
  { rating: 'again', label: 'review.ratingAgain' },
  { rating: 'hard', label: 'review.ratingHard' },
  { rating: 'good', label: 'review.ratingGood' },
  { rating: 'easy', label: 'review.ratingEasy' },
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
  const pill = label + RATING_PILL_PADDING * 2;
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
          // 捲動區本身鋪滿整頁，內容靠內距讓開那兩條浮著的控制列。這樣捲到底時
          // 卡片會從控制列底下經過，而不是在它上方就停住（HIG `L-02`）。
          // 讓開多少是量出來的，見上面的 headerHeight／footerHeight。
          {
            paddingTop: insets.top + headerHeight + SCREEN_INSET * 2,
            paddingBottom: insets.bottom + footerHeight + SCREEN_INSET * 2,
          },
        ]}
      >
        {noBooks ? (
          <Notice mark="📚" title={t('review.noBooksTitle')} note={t('review.noBooksNote')} />
        ) : complete ? (
          <Notice mark="✓" title={t('review.doneTitle')} note={t('review.doneNote')} />
        ) : (
          <View style={styles.card}>
            <View style={styles.face}>
              <Term text={card!.text} showReading={revealed} />
              {/* `key` 帶卡片編號：換下一張時整顆重建，上一張按出來的「已複製」才不會
                  留在新的那顆按鈕上（它會停留一秒多，那段時間內評分是來得及的）。 */}
              <CopyButton key={card!.id} text={card!.text} />
            </View>

            {revealed && (
              <View style={styles.answer}>
                {/* 釋義沒有振假名、是完整一段文字，因此長按選得起來——
                    這是詞條做不到、只有這裡補得回來的那一半。 */}
                <Text style={styles.meaning} selectable>
                  {card!.meaning}
                </Text>
                {voice !== null && (
                  <ContentPill
                    onPress={() => speakTerm(card!.text, voice)}
                    accessibilityLabel={t('review.speakLabel')}
                  >
                    <Text style={styles.speakText}>{t('review.speak')}</Text>
                  </ContentPill>
                )}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      <GlassGroup
        style={[styles.bar, styles.header, { top: insets.top + SCREEN_INSET }]}
        onLayout={measure(setHeaderHeight)}
      >
        <GlassPill>
          <Text style={styles.remaining}>{t('review.remaining', { count: queue.length })}</Text>
        </GlassPill>
        {!noBooks && (
          <BookScopeSheet
            books={data.books}
            selected={data.scopes.review}
            onChange={(ids) => session.setReviewScope(ids)}
          />
        )}
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
          onLayout={measure(setFooterHeight)}
        >
          {revealed ? (
            RATINGS.map(({ rating, label }) => (
              <GlassPill
                key={rating}
                onPress={() => session.rate(rating)}
                // 橫排時四顆平分寬度，直排時四顆各佔滿一行——兩種排法下四顆都一樣大，
                // 用樣式而不是尺寸區分主次（HIG `B-05`）。
                style={stackRatings ? styles.ratingPillStacked : styles.ratingPill}
              >
                <Text style={styles.ratingText}>{t(label)}</Text>
              </GlassPill>
            ))
          ) : (
            <GlassPill onPress={() => session.reveal()} tinted style={styles.primaryPill}>
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

/** 評分鈕左右各留多少。橫排時四顆要擠在一列裡，因此比其他膠囊窄。 */
const RATING_PILL_PADDING = 4;

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
    justifyContent: 'center',
    paddingHorizontal: SCREEN_INSET,
  },
  /**
   * 卡片是**內容層**，因此不套玻璃（HIG `M-01`）。要與頁面底分層時走標準材質那一組，
   * 顏色見 `./theme.ts`。圓角比膠囊小，因為它是大面積元件（`B-13`）。
   */
  card: {
    backgroundColor: color.card,
    borderRadius: 24,
    paddingVertical: 32,
    paddingHorizontal: 20,
    gap: 24,
  },
  face: {
    alignItems: 'center',
    gap: 20,
  },
  answer: {
    alignItems: 'center',
    gap: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.separator,
    paddingTop: 24,
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
  /** 四顆評分鈕排不下同一列時，整條列改成直的。 */
  footerStacked: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  remaining: {
    color: color.label,
    fontSize: fontSize.subheadline,
    fontWeight: weight.semibold,
  },
  probe: {
    color: color.secondaryLabel,
    fontSize: fontSize.footnote,
  },
  /** 四顆評分鈕同尺寸、平分整條列——同一組選項用同尺寸，不用大小區分主次（HIG `B-05`）。 */
  ratingPill: {
    flex: 1,
    paddingHorizontal: RATING_PILL_PADDING,
  },
  /** 直排時四顆各佔滿一行，彼此仍然一樣大。 */
  ratingPillStacked: {
    alignSelf: 'stretch',
  },
  /**
   * 評分鈕上的文字走單色，不套色（HIG `M-09`）。網頁版那四個顏色刻意沒有跟過來——
   * 這一頁只有「顯示答案」那一顆的**背景**上色（`M-10`），而且它與評分鈕不會同時在場。
   */
  ratingText: {
    color: color.label,
    fontSize: fontSize.subheadline,
    fontWeight: weight.medium,
  },
  primaryPill: {
    flex: 1,
  },
  primaryText: {
    color: color.onAccent,
    fontSize: fontSize.headline,
    fontWeight: weight.semibold,
  },
});
