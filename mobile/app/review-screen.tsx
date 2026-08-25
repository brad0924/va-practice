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
import { ScrollView, StyleSheet, Text, View } from 'react-native';
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
import { color, fontSize, SCREEN_INSET, weight } from './theme';

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

export function ReviewScreen({ session, onOpenProbe }: ReviewScreenProps) {
  const { data, queue, revealed } = session.snapshot();
  const insets = useSafeAreaInsets();
  const [voice, setVoice] = useState<VoiceLike | null>(null);

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

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          // 捲動區本身鋪滿整頁，內容靠內距讓開那兩條浮著的控制列。這樣捲到底時
          // 卡片會從控制列底下經過，而不是在它上方就停住（HIG `L-02`）。
          { paddingTop: insets.top + BAR_LANE, paddingBottom: insets.bottom + BAR_LANE },
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

      <GlassGroup style={[styles.bar, styles.header, { top: insets.top + SCREEN_INSET }]}>
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
        <GlassGroup style={[styles.bar, styles.footer, { bottom: insets.bottom + SCREEN_INSET }]}>
          {revealed ? (
            RATINGS.map(({ rating, label }) => (
              <GlassPill key={rating} onPress={() => session.rate(rating)} style={styles.ratingPill}>
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

/**
 * 控制列連同它與內容之間的呼吸空間佔掉的高度。捲動內容靠它讓開，
 * 數字是「膠囊 44 ＋ 上下各留一段」，不是量出來的精確值——內容捲得過去就夠了。
 */
const BAR_LANE = 44 + SCREEN_INSET * 2;

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
    gap: 12,
  },
  header: {
    justifyContent: 'flex-start',
  },
  footer: {
    justifyContent: 'center',
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
    paddingHorizontal: 4,
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
